(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  // ---------------------------------------------------------------------------
  // CSV loading + caching
  // ---------------------------------------------------------------------------

  // All batch files used for "Smart Random"
  const BATCH_FILES = [
    "data/Batch_1.csv",
    "data/Batch_2.csv",
    "data/Batch_3.csv",
    "data/Batch_4.csv",
    "data/Batch_5.csv",
    "data/Batch_6.csv"
  ];

  // Simple in-memory cache: path -> Promise<number[]>
  const CSV_CACHE = Object.create(null);
  
  // NEW: Tag system caches
  let TAGS_INDEX = null;
  let SELECTED_TAGS = new Set();
  const STORAGE_KEY = 'ext-selected-tags';

  // NEW: Load persisted tags on initialization
  (function loadSelectedTags() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const tags = JSON.parse(saved);
        SELECTED_TAGS = new Set(tags);
        console.log("[ext] Loaded saved tags:", Array.from(SELECTED_TAGS));
      }
    } catch (e) {
      console.warn("[ext] Failed to load saved tags:", e);
    }
  })();

  // NEW: Save tags to sessionStorage
  function saveSelectedTags() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(SELECTED_TAGS)));
    } catch (e) {
      console.warn("[ext] Failed to save tags:", e);
    }
  }

  /**
   * Load a CSV file and parse it into an array of app IDs (numbers).
   * Results are cached per-path so each file is only fetched once.
   *
   * @param {string} relativePath - e.g. "data/released_appids.csv"
   * @returns {Promise<number[]>}
   */
  function loadCsvIds(relativePath) {
    if (CSV_CACHE[relativePath]) {
      return CSV_CACHE[relativePath];
    }

    const url =
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.getURL
        ? chrome.runtime.getURL(relativePath)
        : relativePath;

    CSV_CACHE[relativePath] = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("CSV fetch failed: " + r.status);
        return r.text();
      })
      .then((text) => {
        return text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => /^\d+$/.test(s))
          .map((s) => parseInt(s, 10));
      })
      .catch((err) => {
        console.warn("[ext] failed to load CSV", relativePath, err);
        return [];
      });

    return CSV_CACHE[relativePath];
  }

  /**
   * Existing behavior: full released app id list (for Pure Random).
   *
   * @returns {Promise<number[]>}
   */
  async function getReleasedAppIds() {
    // NOTE: we assume you placed this file at data/released_appids.csv
    return loadCsvIds("data/released_appids.csv");
  }

  // NEW: Load tags index JSON
  async function loadTagsIndex() {
    if (TAGS_INDEX) return TAGS_INDEX;

    const url = chrome.runtime.getURL("data/tags_index.json");
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Tags index fetch failed");
      TAGS_INDEX = await response.json();
      console.log("[ext] Loaded tags index:", Object.keys(TAGS_INDEX).length, "tags");
      return TAGS_INDEX;
    } catch (err) {
      console.warn("[ext] failed to load tags index", err);
      return {};
    }
  }

  // NEW: Filter app IDs by selected tags (AND logic)
  async function filterByTags(appIds) {
    if (SELECTED_TAGS.size === 0) return appIds;

    const tagsIndex = await loadTagsIndex();
    const tagSets = Array.from(SELECTED_TAGS).map(tag => {
      const tagAppIds = tagsIndex[tag] || [];
      return new Set(tagAppIds);
    });
    
    if (tagSets.length === 0) return appIds;
    
    const filtered = appIds.filter(appId => {
      return tagSets.every(tagSet => tagSet.has(appId));
    });
    
    console.log(`[ext] Filtered ${appIds.length} apps → ${filtered.length} apps with tags:`, Array.from(SELECTED_TAGS));
    return filtered;
  }

  /**
   * Helper to pick a random element from an array of app IDs.
   *
   * @param {number[]} ids
   * @returns {number|null}
   */
  function pickRandomId(ids) {
    if (!ids || !ids.length) return null;
    const idx = Math.floor(Math.random() * ids.length);
    return ids[idx];
  }

  /**
   * "Pure Random" strategy: pick from the global released_appids list.
   * MODIFIED: Now applies tag filtering
   *
   * @returns {Promise<number|null>}
   */
  async function getPureRandomAppId() {
    const ids = await getReleasedAppIds();
    const filtered = await filterByTags(ids); // NEW: Apply tag filter
    
    if (filtered.length === 0) {
      console.warn("[ext] No games found with selected tags, using unfiltered");
      return pickRandomId(ids);
    }
    
    return pickRandomId(filtered);
  }

  /**
   * "Smart Random" strategy:
   *   - pick a random batch CSV (Batch_1..Batch_6)
   *   - load IDs from that file
   *   - pick a random app id from that batch
   *   - if anything goes wrong / empty → fall back to Pure Random
   * MODIFIED: Now applies tag filtering
   *
   * @returns {Promise<number|null>}
   */
  async function getSmartRandomAppId() {
    if (!BATCH_FILES.length) return getPureRandomAppId();

    const file =
      BATCH_FILES[Math.floor(Math.random() * BATCH_FILES.length)];
    const ids = await loadCsvIds(file);
    const filtered = await filterByTags(ids); // NEW: Apply tag filter

    if (filtered.length > 0) {
      console.log(`[ext] Smart random from ${file}: ${filtered.length} matches`);
      return pickRandomId(filtered);
    }

    // Fallback to Pure Random if this batch is empty or failed
    console.log(`[ext] No matches in batch, falling back to Pure Random`);
    return getPureRandomAppId();
  }

  /**
   * Resolve a random app id based on mode ("pure" | "smart"),
   * and navigate to that app on the Steam store.
   *
   * @param {"pure"|"smart"} mode
   */
  async function navigateToRandomApp(mode) {
    let appid = null;

    if (mode === "smart") {
      appid = await getSmartRandomAppId();
    } else {
      appid = await getPureRandomAppId();
    }

    if (!appid) {
      // Fallback: Dota 2, in case everything fails
      appid = 570;
    }

    window.location.assign(
      `https://store.steampowered.com/app/${appid}/`
    );
  }

  /**
   * Create a "Next Game" button with the given label and strategy.
   *
   * @param {string} label - Button text ("Pure Random" / "Smart Random")
   * @param {"pure"|"smart"} mode
   * @returns {HTMLAnchorElement}
   */
  function makeNextGameButton(label, mode) {
    const a = document.createElement("a");
    a.className = "btnv6_blue_hoverfade btn_medium ext-next-game";
    a.href = "#";

    const span = document.createElement("span");
    span.textContent = label;
    a.appendChild(span);

    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        navigateToRandomApp(mode);
      },
      { passive: false }
    );

    return a;
  }

  // NEW: Create tag filter UI
  function createTagFilterUI() {
    const container = document.createElement("div");
    container.className = "ext-tag-filter";
    container.style.cssText = `
      margin: 10px 0;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
    `;

    const label = document.createElement("label");
    label.textContent = "Filter by tags (comma-separated): ";
    label.style.cssText = `
      font-size: 12px;
      color: #c6d4df;
      margin-right: 8px;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "e.g. Action, RPG, Indie";
    input.className = "ext-tag-input";
    input.style.cssText = `
      padding: 6px 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.5);
      color: #c6d4df;
      font-size: 12px;
      width: 250px;
      font-family: Arial, sans-serif;
    `;

    // Restore saved tags
    if (SELECTED_TAGS.size > 0) {
      input.value = Array.from(SELECTED_TAGS).join(', ');
    }

    // Update tags on input
    input.addEventListener("input", (e) => {
      const value = e.target.value.trim();
      SELECTED_TAGS.clear();
      
      if (value) {
        const tags = value.split(',').map(t => t.trim()).filter(t => t);
        tags.forEach(tag => SELECTED_TAGS.add(tag));
      }
      
      saveSelectedTags();
      console.log("[ext] Selected tags:", Array.from(SELECTED_TAGS));
    });

    container.appendChild(label);
    container.appendChild(input);

    const hint = document.createElement("div");
    hint.textContent = "Common tags: Action, Adventure, RPG, Strategy, Indie, Horror, Multiplayer";
    hint.style.cssText = `
      font-size: 10px;
      color: #8f98a0;
      margin-top: 4px;
    `;
    container.appendChild(hint);

    return container;
  }

  // ---------------------------------------------------------------------------
  // Oops / region-locked page: header button(s)
  // ---------------------------------------------------------------------------

  function installNextGameButtonOnOops() {
    const header = document.querySelector(
      ".page_header_ctn .page_content"
    );
    if (!header) return;

    // Avoid duplicates – if we already placed any ext-next-game, stop.
    if (header.querySelector(".ext-next-game")) return;

    const target =
      header.querySelector("h2.pageheader") || header;

    // Wrap both buttons in a simple row
    const pureBtn = makeNextGameButton("Next (Raw)", "pure");
    const smartBtn = makeNextGameButton("Next (Balanced)", "smart");

    const row = document.createElement("div");
    row.style.marginTop = "10px";
    row.style.display = "flex";
    row.style.gap = "8px";
    row.appendChild(pureBtn);
    row.appendChild(smartBtn);

    if (target && target.parentElement) {
      target.insertAdjacentElement("afterend", row);
    } else {
      header.appendChild(row);
    }

    // NEW: Add tag filter UI below buttons
    const tagUI = createTagFilterUI();
    if (target && target.parentElement) {
      row.insertAdjacentElement("afterend", tagUI);
    } else {
      header.appendChild(tagUI);
    }
  }

  // ---------------------------------------------------------------------------
  // Normal app page: replace Community Hub with two buttons
  // ---------------------------------------------------------------------------

  function installNextGameButton() {
    const container = document.querySelector(
      ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (!container) return;

    // Avoid duplicates
    if (container.querySelector(".ext-next-game")) return;

    // Remove the original Community Hub button, if present
    const hubBtn = container.querySelector(
      "a.btnv6_blue_hoverfade.btn_medium"
    );
    if (hubBtn) hubBtn.remove();

    const pureBtn = makeNextGameButton("Next (Raw)", "pure");
    const smartBtn = makeNextGameButton("Next (Balanced)", "smart");

    // Let Steam's layout handle positioning; just drop them in order
    container.appendChild(pureBtn);
    container.appendChild(smartBtn);

    // NEW: Add tag filter UI below buttons
    const tagUI = createTagFilterUI();
    container.appendChild(tagUI);
  }

  // Expose on namespace
  ns.getReleasedAppIds = getReleasedAppIds;
  ns.installNextGameButtonOnOops = installNextGameButtonOnOops;
  ns.installNextGameButton = installNextGameButton;
})(window);
