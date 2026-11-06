(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const BATCH_FILES = [
    "data/Batch_1.csv",
    "data/Batch_2.csv",
    "data/Batch_3.csv",
    "data/Batch_4.csv",
    "data/Batch_5.csv",
    "data/Batch_6.csv",
  ];
  const CSV_CACHE = Object.create(null);
  const DETAILS_CACHE = new Map();
  const REVIEW_CACHE = new Map();

  function loadCsvIds(relativePath) {
    if (CSV_CACHE[relativePath]) return CSV_CACHE[relativePath];
    const url = chrome.runtime?.getURL
      ? chrome.runtime.getURL(relativePath)
      : relativePath;
    CSV_CACHE[relativePath] = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`CSV fetch failed: ${response.status}`);
        return response.text();
      })
      .then((value) => value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line))
        .map(Number))
      .catch((error) => {
        console.warn("[Review Guesser] CSV load failed", relativePath, error);
        return [];
      });
    return CSV_CACHE[relativePath];
  }

  async function getReleasedAppIds() {
    return loadCsvIds("data/released_appids.csv");
  }

  async function getBalancedAppIds() {
    const batches = await Promise.all(BATCH_FILES.map(loadCsvIds));
    return [...new Set(batches.flat())];
  }

  function pickRandomId(ids, exclude = new Set()) {
    if (!ids?.length) return null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (!exclude.has(String(id))) return id;
    }
    return ids.find((id) => !exclude.has(String(id))) || null;
  }

  async function fetchAppDetails(appId) {
    if (DETAILS_CACHE.has(appId)) return DETAILS_CACHE.get(appId);
    const promise = fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
    )
      .then((response) => response.json())
      .then((json) => json?.[appId]?.success ? json[appId].data : null)
      .catch(() => null);
    DETAILS_CACHE.set(appId, promise);
    return promise;
  }

  async function fetchReviewSummary(appId) {
    if (REVIEW_CACHE.has(appId)) return REVIEW_CACHE.get(appId);
    const promise = fetch(
      `https://store.steampowered.com/app/${appId}/?l=english`
    )
      .then((response) => response.text())
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const mount = doc.querySelector(
          '[data-featuretarget="appreviews"][data-props]'
        );
        if (!mount) return null;
        const props = JSON.parse(mount.getAttribute("data-props") || "{}");
        const filters = props.filter_options || props.summary_options?.filter_options;
        const positive = Number(filters?.nReviewsPositive);
        const negative = Number(filters?.nReviewsNegative);
        if (!Number.isFinite(positive) || !Number.isFinite(negative)) return null;
        const count = positive + negative;
        return { count, rating: count ? (positive / count) * 100 : 0 };
      })
      .catch(() => null);
    REVIEW_CACHE.set(appId, promise);
    return promise;
  }

  function matchesFilters(data, filters = {}) {
    if (!data || data.type !== "game") return false;

    if (filters.genre && filters.genre !== "any") {
      const genres = (data.genres || []).map((item) =>
        String(item.description || "").toLowerCase()
      );
      if (!genres.some((genre) => genre.includes(filters.genre))) return false;
    }

    if (filters.price === "free" && !data.is_free) return false;
    if (filters.price === "paid" && data.is_free) return false;

    const yearMatch = String(data.release_date?.date || "").match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : null;
    const currentYear = new Date().getFullYear();
    if (filters.release === "recent" && (!year || year < currentYear - 2)) {
      return false;
    }
    if (filters.release === "modern" && (!year || year < 2015)) return false;
    if (filters.release === "classic" && (!year || year >= 2015)) return false;

    return true;
  }

  function matchesReviewFilters(summary, filters = {}) {
    if (filters.reviews === "any" && filters.rating === "any") return true;
    if (!summary) return false;
    const count = summary.count;
    if (filters.reviews === "under100" && count >= 100) return false;
    if (filters.reviews === "100to999" && (count < 100 || count >= 1000)) return false;
    if (filters.reviews === "1kto10k" && (count < 1000 || count >= 10000)) return false;
    if (filters.reviews === "over10k" && count < 10000) return false;
    if (filters.rating !== "any" && summary.rating < Number(filters.rating)) return false;
    return true;
  }

  function filtersAreActive(filters = {}) {
    return [
      filters.genre,
      filters.release,
      filters.price,
      filters.reviews,
      filters.rating,
    ]
      .some((value) => value && value !== "any");
  }

  async function getCandidatePool(mode) {
    return mode === "pure" ? getReleasedAppIds() : getBalancedAppIds();
  }

  async function pickFilteredAppId(mode, filters, excludedIds = []) {
    const pool = await getCandidatePool(mode);
    const excluded = new Set(excludedIds.map(String));
    if (!filtersAreActive(filters)) return pickRandomId(pool, excluded);

    const candidates = [];
    while (candidates.length < 96) {
      const id = pickRandomId(pool, excluded);
      if (!id) break;
      excluded.add(String(id));
      candidates.push(id);
    }

    for (let offset = 0; offset < candidates.length; offset += 8) {
      const chunk = candidates.slice(offset, offset + 8);
      const details = await Promise.all(chunk.map(fetchAppDetails));
      const checks = await Promise.all(details.map(async (data, index) => {
        if (!matchesFilters(data, filters)) return false;
        if (filters.reviews === "any" && filters.rating === "any") return true;
        const summary = await fetchReviewSummary(chunk[index]);
        return matchesReviewFilters(summary, filters);
      }));
      const matchIndex = checks.findIndex(Boolean);
      if (matchIndex >= 0) return chunk[matchIndex];
    }
    return null;
  }

  async function getFilteredAppIds(count, filters, mode = "smart") {
    const ids = [];
    while (ids.length < count) {
      const id = await pickFilteredAppId(mode, filters, ids);
      if (!id || ids.includes(id)) break;
      ids.push(id);
    }
    return ids;
  }

  function localDateKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let next = value;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function getDailyAppIds(dateKey = localDateKey()) {
    const pool = await getBalancedAppIds();
    const random = seededRandom(hashString(`jonas-review-guesser:${dateKey}`));
    const picks = [];
    while (picks.length < 5 && picks.length < pool.length) {
      const id = pool[Math.floor(random() * pool.length)];
      if (!picks.includes(id)) picks.push(id);
    }
    return picks;
  }

  function navigateToApp(appId) {
    window.location.assign(`https://store.steampowered.com/app/${appId}/`);
  }

  async function navigateToRandomApp(mode) {
    const settings = ns.getSettings ? await ns.getSettings() : { filters: {} };
    const appId = await pickFilteredAppId(mode, settings.filters);
    navigateToApp(appId || 570);
  }

  async function startSession(type, requestedCount = 5) {
    const date = localDateKey();
    const settings = ns.getSettings ? await ns.getSettings() : { filters: {} };
    const count = type === "daily"
      ? 5
      : ([3, 5, 10].includes(Number(requestedCount)) ? Number(requestedCount) : 5);
    const appIds = type === "daily"
      ? await getDailyAppIds(date)
      : await getFilteredAppIds(
        count,
        settings.filters,
        settings.pool === "raw" ? "pure" : "smart"
      );
    if (appIds.length < count) {
      throw new Error(`Only ${appIds.length} games matched the selected filters.`);
    }

    const session = {
      id: `${type}:${type === "daily" ? date : Date.now()}`,
      type,
      date,
      pool: type === "daily" ? "balanced" : (settings.pool || "balanced"),
      roundCount: count,
      appIds: appIds.map(String),
      index: 0,
      results: [],
      complete: false,
      startedAt: Date.now(),
    };
    await ns.saveSession?.(session);
    setTimeout(() => navigateToApp(session.appIds[0]), 50);
    return session;
  }

  function continueSession(session) {
    if (!session || session.complete) return false;
    const appId = session.appIds?.[session.index];
    if (!appId) return false;
    navigateToApp(appId);
    return true;
  }

  function paintSessionScore(score, session) {
    if (!session) {
      score.hidden = true;
      score.replaceChildren();
      return;
    }
    const total = (session.results || []).reduce(
      (sum, result) => sum + (Number(result.score) || 0),
      0
    );
    const label = document.createElement("span");
    label.textContent = session.type === "daily" ? "Daily" : "Run";
    const value = document.createElement("strong");
    value.textContent = `${total} pts`;
    score.replaceChildren(label, value);
    score.hidden = false;
  }

  function makeSessionScore() {
    const score = document.createElement("div");
    score.className = "ext-session-total";
    score.hidden = true;
    ns.getSession?.().then((session) => paintSessionScore(score, session));
    return score;
  }

  function showLeaveConfirmation(wrapper, session, mode) {
    const row = wrapper.closest(".ext-next-row");
    row?.querySelector(".ext-leave-confirm")?.remove();
    const box = document.createElement("div");
    box.className = "ext-leave-confirm";
    const title = document.createElement("strong");
    title.textContent = session && !session.complete
      ? "Quit the current run?"
      : "Leave this round?";
    const body = document.createElement("span");
    body.textContent = session && !session.complete
      ? `Progress through ${session.appIds.length} games will be cleared.`
      : "You have not answered this game yet.";
    const actions = document.createElement("div");
    const stay = document.createElement("button");
    stay.type = "button";
    stay.textContent = "Stay";
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "is-danger";
    leave.textContent = "Leave game";
    stay.addEventListener("click", () => box.remove());
    leave.addEventListener("click", async () => {
      leave.disabled = true;
      if (session && !session.complete) await ns.clearSession?.();
      navigateToRandomApp(mode);
    });
    actions.append(stay, leave);
    box.append(title, body, actions);
    wrapper.appendChild(box);
  }

  function makeNextGameButton(label, mode) {
    const wrapper = document.createElement("div");
    wrapper.className = "ext-nav-action";
    const link = document.createElement("a");
    link.className = "btnv6_blue_hoverfade btn_medium ext-next-game";
    link.href = "#";
    const span = document.createElement("span");
    span.textContent = label;
    link.appendChild(span);
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const session = ns.getSession ? await ns.getSession() : null;
      const activeRound = Array.from(document.querySelectorAll(".ext-steam-guess"))
        .some((game) => game.dataset.state === "ready" && game.dataset.locked !== "1");
      if ((session && !session.complete) || activeRound) {
        showLeaveConfirmation(wrapper, session, mode);
        return;
      }
      navigateToRandomApp(mode);
    });
    wrapper.appendChild(link);
    return wrapper;
  }

  function makeMenuButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ext-menu-button";
    button.title = "Open Jonas Review Guesser";
    button.setAttribute("aria-label", "Open Jonas Review Guesser menu");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    ["M4 5h12", "M4 10h12", "M4 15h12"].forEach((data) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", data);
      svg.appendChild(path);
    });
    [[7, 5], [13, 10], [8, 15]].forEach(([cx, cy]) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", "1.5");
      svg.appendChild(circle);
    });
    button.appendChild(svg);
    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-popup" }).catch(() => {});
    });
    return button;
  }

  function installButtons(container, target = null) {
    if (!container || container.querySelector(".ext-next-game")) return;
    const row = document.createElement("div");
    row.className = "ext-next-row";
    const score = makeSessionScore();
    row.append(
      score,
      makeNextGameButton("Next raw", "pure"),
      makeNextGameButton("Next balanced", "smart"),
      makeMenuButton()
    );
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.session) {
        paintSessionScore(score, changes.session.newValue);
      }
    });
    if (target?.parentElement) target.insertAdjacentElement("afterend", row);
    else container.appendChild(row);
  }

  function installNextGameButtonOnOops() {
    const header = document.querySelector(".page_header_ctn .page_content");
    installButtons(header, header?.querySelector("h2.pageheader"));
  }

  function installNextGameButton() {
    const container = document.querySelector(
      ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (!container || container.querySelector(".ext-next-game")) return;
    container.querySelector("a.btnv6_blue_hoverfade.btn_medium")?.remove();
    installButtons(container);
  }

  ns.getReleasedAppIds = getReleasedAppIds;
  ns.getDailyAppIds = getDailyAppIds;
  ns.pickFilteredAppId = pickFilteredAppId;
  ns.navigateToRandomApp = navigateToRandomApp;
  ns.startSession = startSession;
  ns.continueSession = continueSession;
  ns.installNextGameButtonOnOops = installNextGameButtonOnOops;
  ns.installNextGameButton = installNextGameButton;
})(window);
