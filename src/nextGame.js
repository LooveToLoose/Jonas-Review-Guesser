(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const BATCH_FILES = [
    "data/Batch_1.csv",
    "data/Batch_2.csv",
    "data/Batch_3.csv",
    "data/Batch_4.csv",
    "data/Batch_5.csv",
    "data/Batch_6.csv"
  ];

  const CSV_CACHE = Object.create(null);

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

  async function getReleasedAppIds() {
    return loadCsvIds("data/released_appids.csv");
  }

  function pickRandomId(ids) {
    if (!ids || !ids.length) return null;
    const idx = Math.floor(Math.random() * ids.length);
    return ids[idx];
  }

  async function getPureRandomAppId() {
    const ids = await getReleasedAppIds();
    return pickRandomId(ids);
  }

  async function getSmartRandomAppId() {
    if (!BATCH_FILES.length) return getPureRandomAppId();

    const file =
        BATCH_FILES[Math.floor(Math.random() * BATCH_FILES.length)];
    const ids = await loadCsvIds(file);
    const id = pickRandomId(ids);

    if (id != null) return id;
    return getPureRandomAppId();
  }

  const STREAK_KEY = "reviewGuesserCurrentStreak";
  const MODE_KEY = "reviewGuesserNextMode";
  const RELEASE_KEY = "reviewGuesserReleaseYears";
  const GUESS_LAYOUT_KEY = "reviewGuesserGuessLayout";
  const DEFAULT_RELEASE_YEARS = 3;

  function getCurrentStreak() {
    try {
      const raw = sessionStorage.getItem(STREAK_KEY);
      const n = parseInt(raw || "0", 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function setCurrentStreak(value) {
    const v = Math.max(0, Math.trunc(Number(value) || 0));
    try {
      sessionStorage.setItem(STREAK_KEY, String(v));
    } catch {}
    return v;
  }

  function ensureStreakLabel(container) {
    if (!container) return null;

    let label = container.querySelector(".ext-streak-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "ext-streak-label";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.marginRight = "8px";
      label.style.padding = "4px 8px";
      label.style.borderRadius = "4px";
      label.style.background = "rgba(0,0,0,.25)";
      label.style.fontSize = "12px";
      label.style.color = "#fff";
      container.appendChild(label);
    }

    label.textContent = "Current Streak: " + getCurrentStreak();
    return label;
  }

  function updateStreak(isCorrect) {
    const current = getCurrentStreak();
    const next = isCorrect ? current + 1 : 0;
    setCurrentStreak(next);

    const container = document.querySelector(
        ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (container) {
      ensureStreakLabel(container);
    }
  }

  function getPreferredMode() {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      if (stored === "pure" || stored === "smart") {
        return stored;
      }
    } catch {}
    return "smart";
  }

  function setPreferredMode(mode) {
    const value = mode === "pure" ? "pure" : "smart";
    try {
      localStorage.setItem(MODE_KEY, value);
    } catch {}
    return value;
  }

  function getReleaseFilterYears() {
    try {
      const raw = localStorage.getItem(RELEASE_KEY);
      const n = parseInt(raw || "", 10);
      if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
    } catch {}
    return DEFAULT_RELEASE_YEARS;
  }

  function setReleaseFilterYears(years) {
    const v = Math.max(1, Math.min(20, Math.trunc(Number(years) || 0)));
    try {
      localStorage.setItem(RELEASE_KEY, String(v));
    } catch {}
    return v;
  }

  function getGuessLayout() {
    try {
      const raw = localStorage.getItem(GUESS_LAYOUT_KEY);
      if (raw === "ranges" || raw === "exact") return raw;
    } catch {}
    return "ranges";
  }

  function setGuessLayout(mode) {
    const value = mode === "exact" ? "exact" : "ranges";
    try {
      localStorage.setItem(GUESS_LAYOUT_KEY, value);
    } catch {}
    return value;
  }

  function ensureModeSelector(container) {
    if (!container) return null;

    let wrap = container.querySelector(".ext-mode-select");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-mode-select";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.marginRight = "8px";
      wrap.style.gap = "4px";

      const label = document.createElement("span");
      label.textContent = "Next mode:";
      label.style.fontSize = "12px";
      label.style.color = "#fff";

      const select = document.createElement("select");
      select.className = "ext-mode-select-input";
      select.style.fontSize = "12px";
      select.style.padding = "2px 4px";

      const optBalanced = document.createElement("option");
      optBalanced.value = "smart";
      optBalanced.textContent = "Balanced";

      const optRaw = document.createElement("option");
      optRaw.value = "pure";
      optRaw.textContent = "Raw";

      select.appendChild(optBalanced);
      select.appendChild(optRaw);

      wrap.appendChild(label);
      wrap.appendChild(select);
      container.appendChild(wrap);
    }

    const selectEl = wrap.querySelector("select");
    if (selectEl) {
      const currentMode = getPreferredMode();
      selectEl.value = currentMode;
      selectEl.onchange = function () {
        setPreferredMode(selectEl.value);
      };
    }

    return wrap;
  }

  function ensureReleaseFilterSelector(container) {
    if (!container) return null;

    let wrap = container.querySelector(".ext-release-select");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-release-select";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.marginRight = "8px";
      wrap.style.gap = "4px";

      const label = document.createElement("span");
      label.textContent = "Released Within:";
      label.style.fontSize = "12px";
      label.style.color = "#fff";

      const select = document.createElement("select");
      select.className = "ext-release-select-input";
      select.style.fontSize = "12px";
      select.style.padding = "2px 4px";

      for (let years = 1; years <= 20; years++) {
        const opt = document.createElement("option");
        opt.value = String(years);
        opt.textContent = years === 1 ? "1 year" : years + " years";
        select.appendChild(opt);
      }

      wrap.appendChild(label);
      wrap.appendChild(select);
      container.appendChild(wrap);
    }

    const selectEl = wrap.querySelector("select");
    if (selectEl) {
      const current = getReleaseFilterYears();
      selectEl.value = String(current);
      selectEl.onchange = function () {
        setReleaseFilterYears(
            parseInt(selectEl.value, 10) || DEFAULT_RELEASE_YEARS
        );
      };
    }

    return wrap;
  }

  function ensureGuessLayoutSelector(container) {
    if (!container) return null;

    let wrap = container.querySelector(".ext-layout-select");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-layout-select";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.marginRight = "8px";
      wrap.style.gap = "4px";

      const label = document.createElement("span");
      label.textContent = "Guess Style:";
      label.style.fontSize = "12px";
      label.style.color = "#fff";

      const select = document.createElement("select");
      select.className = "ext-layout-select-input";
      select.style.fontSize = "12px";
      select.style.padding = "2px 4px";

      const optRanges = document.createElement("option");
      optRanges.value = "ranges";
      optRanges.textContent = "Ranges";

      const optExact = document.createElement("option");
      optExact.value = "exact";
      optExact.textContent = "Exact";

      select.appendChild(optRanges);
      select.appendChild(optExact);

      wrap.appendChild(label);
      wrap.appendChild(select);
      container.appendChild(wrap);
    }

    const selectEl = wrap.querySelector("select");
    if (selectEl) {
      const current = getGuessLayout();
      selectEl.value = current;
      selectEl.onchange = function () {
        setGuessLayout(selectEl.value);
      };
    }

    return wrap;
  }

  async function fetchReleaseDate(appid) {
    try {
      const url =
          "https://store.steampowered.com/api/appdetails?appids=" +
          appid +
          "&filters=release_date";
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("status " + resp.status);
      const json = await resp.json();
      const entry = json && json[appid];
      if (!entry || !entry.success || !entry.data || !entry.data.release_date) {
        return null;
      }
      const text = entry.data.release_date.date || "";
      const d = new Date(text);
      if (!isNaN(d.getTime())) return d;

      const m = text.match(/(\d{4})/);
      if (!m) return null;
      const year = parseInt(m[1], 10);
      if (!Number.isFinite(year)) return null;
      return new Date(year, 0, 1);
    } catch (e) {
      console.warn("[ext] fetchReleaseDate failed", appid, e);
      return null;
    }
  }

  function isWithinYears(date, years) {
    if (!date) return false;
    const now = new Date();
    const cutoff = new Date(
        now.getFullYear() - years,
        now.getMonth(),
        now.getDate()
    );
    return date >= cutoff;
  }

  async function navigateToRandomApp(mode) {
    const yearsFilter = getReleaseFilterYears();
    const maxTries = 20;
    let chosen = null;

    for (let i = 0; i < maxTries; i++) {
      const appid =
          mode === "pure"
              ? await getPureRandomAppId()
              : await getSmartRandomAppId();

      if (!appid) continue;
      chosen = appid;

      const relDate = await fetchReleaseDate(appid);
      if (relDate && isWithinYears(relDate, yearsFilter)) {
        chosen = appid;
        break;
      }
    }

    const appidToUse = chosen || 570;
    window.location.assign(
        "https://store.steampowered.com/app/" + appidToUse + "/"
    );
  }

  function makeNextGameButton() {
    const a = document.createElement("a");
    a.className = "btnv6_blue_hoverfade btn_medium ext-next-game";
    a.href = "#";

    const span = document.createElement("span");
    span.textContent = "Next";
    a.appendChild(span);

    a.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          const mode = getPreferredMode();
          navigateToRandomApp(mode);
        },
        { passive: false }
    );

    return a;
  }

  function installNextGameButtonOnOops() {
    const header = document.querySelector(
        ".page_header_ctn .page_content"
    );
    if (!header) return;

    if (header.querySelector(".ext-next-game")) return;

    const target =
        header.querySelector("h2.pageheader") || header;

    const row = document.createElement("div");
    row.style.marginTop = "10px";
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "center";

    ensureModeSelector(row);
    ensureReleaseFilterSelector(row);
    ensureGuessLayoutSelector(row);

    const nextBtn = makeNextGameButton();
    row.appendChild(nextBtn);

    if (target && target.parentElement) {
      target.insertAdjacentElement("afterend", row);
    } else {
      header.appendChild(row);
    }
  }

  function installNextGameButton() {
    const container = document.querySelector(
        ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (!container) return;

    if (container.querySelector(".ext-next-game")) return;

    const hubBtn = container.querySelector(
        "a.btnv6_blue_hoverfade.btn_medium"
    );
    if (hubBtn) hubBtn.remove();

    ensureStreakLabel(container);
    ensureModeSelector(container);
    ensureReleaseFilterSelector(container);
    ensureGuessLayoutSelector(container);

    const nextBtn = makeNextGameButton();
    container.appendChild(nextBtn);
  }

  ns.getReleasedAppIds = getReleasedAppIds;
  ns.installNextGameButtonOnOops = installNextGameButtonOnOops;
  ns.installNextGameButton = installNextGameButton;
  ns.updateStreak = updateStreak;
  ns.getGuessLayout = getGuessLayout;
})(window);
