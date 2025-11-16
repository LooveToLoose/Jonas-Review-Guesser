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

  const META_CACHE = Object.create(null);

  function normalizeTag(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
  }

  function parseMetaCsv(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      if (i === 0 && /appid/i.test(line) && /year/i.test(line)) {
        continue;
      }

      const parts = line.split(",");
      if (!parts[0]) continue;

      const id = parseInt(parts[0].trim(), 10);
      if (!Number.isFinite(id)) continue;

      let year = null;
      if (parts.length > 1 && parts[1].trim() !== "") {
        const y = parseInt(parts[1].trim(), 10);
        if (Number.isFinite(y)) year = y;
      }

      let tags = [];
      if (parts.length > 2 && parts[2].trim() !== "") {
        tags = parts[2]
            .split(";")
            .map((t) => normalizeTag(t))
            .filter((t) => t.length > 0);
      }

      result.push({ id, year, tags });
    }
    return result;
  }

  function loadMeta(relativePath) {
    if (META_CACHE[relativePath]) {
      return META_CACHE[relativePath];
    }

    const url =
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.getURL
            ? chrome.runtime.getURL(relativePath)
            : relativePath;

    META_CACHE[relativePath] = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error("CSV fetch failed: " + r.status);
          return r.text();
        })
        .then((text) => parseMetaCsv(text))
        .catch((err) => {
          console.warn("[ReviewGuesser] failed to load CSV meta", relativePath, err);
          return [];
        });

    return META_CACHE[relativePath];
  }

  async function getReleasedMeta() {
    return loadMeta("data/released_appids.csv");
  }

  async function getBatchMetaRandomFile() {
    if (!BATCH_FILES.length) return [];
    const file =
        BATCH_FILES[Math.floor(Math.random() * BATCH_FILES.length)];
    return loadMeta(file);
  }

  function pickRandomArrayItem(arr) {
    if (!arr || !arr.length) return null;
    const idx = Math.floor(Math.random() * arr.length);
    return arr[idx];
  }

  const STREAK_KEY = "reviewGuesserCurrentStreak";
  const MODE_KEY = "reviewGuesserNextMode";
  const GUESS_LAYOUT_KEY = "reviewGuesserGuessLayout";
  const LIFETIME_TOTAL_KEY = "reviewGuesserLifetimeTotal";
  const LIFETIME_CORRECT_KEY = "reviewGuesserLifetimeCorrect";

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

  function getLifetimeStats() {
    try {
      const rawTotal = localStorage.getItem(LIFETIME_TOTAL_KEY);
      const rawCorrect = localStorage.getItem(LIFETIME_CORRECT_KEY);
      const total = parseInt(rawTotal || "0", 10);
      const correct = parseInt(rawCorrect || "0", 10);
      return {
        total: Number.isFinite(total) && total >= 0 ? total : 0,
        correct: Number.isFinite(correct) && correct >= 0 ? correct : 0
      };
    } catch {
      return { total: 0, correct: 0 };
    }
  }

  function setLifetimeStats(correct, total) {
    const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
    const safeCorrect = Math.max(0, Math.min(safeTotal, Math.trunc(Number(correct) || 0)));
    try {
      localStorage.setItem(LIFETIME_TOTAL_KEY, String(safeTotal));
      localStorage.setItem(LIFETIME_CORRECT_KEY, String(safeCorrect));
    } catch {}
    return { correct: safeCorrect, total: safeTotal };
  }

  function clearLifetimeStats() {
    try {
      localStorage.removeItem(LIFETIME_TOTAL_KEY);
      localStorage.removeItem(LIFETIME_CORRECT_KEY);
    } catch {}
    const container = document.querySelector(
        ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (container) {
      ensureLifetimeLabel(container);
    }
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

  function ensureLifetimeLabel(container) {
    if (!container) return null;

    let wrap = container.querySelector(".ext-lifetime-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-lifetime-wrap";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.marginRight = "8px";
      wrap.style.padding = "4px 8px";
      wrap.style.borderRadius = "4px";
      wrap.style.background = "rgba(0,0,0,.25)";
      wrap.style.fontSize = "12px";
      wrap.style.color = "#fff";
      wrap.style.gap = "6px";

      const label = document.createElement("span");
      label.className = "ext-lifetime-label-text";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ext-lifetime-clear";
      btn.textContent = "Clear stats";
      btn.style.fontSize = "11px";
      btn.style.padding = "2px 6px";
      btn.style.cursor = "pointer";

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        clearLifetimeStats();
      });

      wrap.appendChild(label);
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }

    const labelEl = wrap.querySelector(".ext-lifetime-label-text");
    const stats = getLifetimeStats();
    labelEl.textContent = "Lifetime: " + stats.correct + "/" + stats.total;

    return wrap;
  }

  function updateStreak(isCorrect) {
    const current = getCurrentStreak();
    const next = isCorrect ? current + 1 : 0;
    setCurrentStreak(next);

    const stats = getLifetimeStats();
    const newTotal = stats.total + 1;
    const newCorrect = stats.correct + (isCorrect ? 1 : 0);
    setLifetimeStats(newCorrect, newTotal);

    const container = document.querySelector(
        ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (container) {
      ensureStreakLabel(container);
      ensureLifetimeLabel(container);
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

  async function navigateToRandomApp(mode) {
    let pool = [];
    if (mode === "pure") {
      pool = await getReleasedMeta();
    } else {
      pool = await getBatchMetaRandomFile();
      if (!pool || !pool.length) {
        pool = await getReleasedMeta();
      }
    }

    if (!pool || !pool.length) {
      window.location.assign("https://store.steampowered.com/app/570/");
      return;
    }

    const chosenMeta = pickRandomArrayItem(pool);

    if (!chosenMeta) {
      window.location.assign("https://store.steampowered.com/app/570/");
      return;
    }

    console.log("[ReviewGuesser] navigating to", {
      appid: chosenMeta.id,
      year: chosenMeta.year,
      tags: chosenMeta.tags
    });

    window.location.assign(
        "https://store.steampowered.com/app/" + chosenMeta.id + "/"
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
    ensureLifetimeLabel(container);
    ensureModeSelector(container);
    ensureGuessLayoutSelector(container);

    const nextBtn = makeNextGameButton();
    container.appendChild(nextBtn);
  }

  ns.getReleasedAppIds = async function () {
    const meta = await getReleasedMeta();
    return meta.map((m) => m.id);
  };
  ns.installNextGameButtonOnOops = installNextGameButtonOnOops;
  ns.installNextGameButton = installNextGameButton;
  ns.updateStreak = updateStreak;
  ns.getGuessLayout = getGuessLayout;
})(window);
