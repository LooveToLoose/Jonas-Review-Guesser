const DEFAULT_SETTINGS = {
  enabled: true,
  mode: "typed",
  pool: "balanced",
  spoilerLevel: "standard",
  filters: {
    genre: "any", release: "any", price: "any", reviews: "any", rating: "any",
  },
};
const DEFAULT_STATS = {
  rounds: 0,
  hits: 0,
  streak: 0,
  bestStreak: 0,
  totalScore: 0,
  totalPercentError: 0,
  biasLogSum: 0,
  calibrationRounds: 0,
};

const byId = (id) => document.getElementById(id);
const status = byId("status");

const SELECT_ICONS = {
  mode: {
    typed: [["path", { d: "M4 16l3.2-.7L15.5 8a1.8 1.8 0 0 0-2.5-2.5L4.7 12.8 4 16Z" }]],
    quick: [["path", { d: "m11 2-7 10h6l-1 6 7-10h-6l1-6Z" }]],
    choice: [["path", { d: "M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z" }]],
    expert: [
      ["circle", { cx: "10", cy: "10", r: "7" }],
      ["circle", { cx: "10", cy: "10", r: "3" }],
      ["path", { d: "M10 1v3M10 16v3M1 10h3M16 10h3" }],
    ],
  },
  pool: {
    balanced: [
      ["path", { d: "M3 6h14M5 10h10M7 14h6" }],
      ["circle", { cx: "10", cy: "6", r: "1.3" }],
      ["circle", { cx: "8", cy: "10", r: "1.3" }],
      ["circle", { cx: "12", cy: "14", r: "1.3" }],
    ],
    raw: [
      ["path", { d: "M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5ZM3 6l7 3.5L17 6M10 9.5v8" }],
      ["circle", { cx: "10", cy: "5.5", r: ".8" }],
      ["circle", { cx: "6", cy: "12", r: ".8" }],
      ["circle", { cx: "14", cy: "12", r: ".8" }],
    ],
  },
  spoiler: {
    standard: [
      ["path", { d: "M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" }],
      ["circle", { cx: "10", cy: "10", r: "2.3" }],
    ],
    strict: [
      ["path", { d: "M10 2.5 16 5v4.3c0 3.8-2.4 6.7-6 8.2-3.6-1.5-6-4.4-6-8.2V5l6-2.5Z" }],
      ["path", { d: "m7.3 10 1.8 1.8 3.7-4" }],
    ],
    brutal: [
      ["rect", { x: "4", y: "8", width: "12", height: "9", rx: "1.5" }],
      ["path", { d: "M6.5 8V6a3.5 3.5 0 0 1 7 0v2M10 11v3" }],
    ],
  },
};

function makeSelectIcon(selectId, value) {
  const shapes = SELECT_ICONS[selectId]?.[value];
  if (!shapes) return null;
  const icon = document.createElement("span");
  icon.className = "select-icon";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  shapes.forEach(([tag, attributes]) => {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, item]) => shape.setAttribute(name, item));
    svg.appendChild(shape);
  });
  icon.appendChild(svg);
  return icon;
}

function closeCustomSelects(except = null) {
  document.querySelectorAll(".custom-select.is-open").forEach((shell) => {
    if (shell === except) return;
    shell.classList.remove("is-open");
    shell.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
    const menu = shell.querySelector(".custom-select-menu");
    if (menu) menu.hidden = true;
  });
}

function upgradeSelect(select) {
  const shell = document.createElement("div");
  shell.className = "custom-select";
  if (SELECT_ICONS[select.id]) shell.classList.add("has-icons");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const fieldLabel = select.closest(".filter-field")?.querySelector(":scope > span")?.textContent;
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") ||
      ({ mode: "Guess mode", spoiler: "Spoilers", pool: "Game pool" }[select.id]) ||
      fieldLabel ||
      select.id
  );

  const current = document.createElement("span");
  current.className = "custom-select-value";
  const chevron = document.createElement("span");
  chevron.className = "select-chevron";
  chevron.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>';
  trigger.append(current, chevron);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  Array.from(select.options).forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "custom-select-option";
    item.dataset.value = option.value;
    item.setAttribute("role", "option");
    const icon = makeSelectIcon(select.id, option.value);
    if (icon) item.appendChild(icon);
    const text = document.createElement("span");
    text.textContent = option.textContent;
    item.appendChild(text);
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelects();
      trigger.focus();
    });
    item.addEventListener("keydown", (event) => {
      const items = Array.from(menu.querySelectorAll(".custom-select-option"));
      const index = items.indexOf(item);
      if (event.key === "ArrowDown") items[(index + 1) % items.length].focus();
      else if (event.key === "ArrowUp") items[(index - 1 + items.length) % items.length].focus();
      else if (event.key === "Home") items[0].focus();
      else if (event.key === "End") items.at(-1).focus();
      else if (event.key === "Escape") {
        closeCustomSelects();
        trigger.focus();
      } else return;
      event.preventDefault();
    });
    menu.appendChild(item);
  });

  const sync = () => {
    const option = select.selectedOptions[0] || select.options[0];
    current.replaceChildren();
    const icon = makeSelectIcon(select.id, option.value);
    if (icon) current.appendChild(icon);
    const text = document.createElement("span");
    text.textContent = option.textContent;
    current.appendChild(text);
    menu.querySelectorAll(".custom-select-option").forEach((item) => {
      const selected = item.dataset.value === option.value;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = menu.hidden;
    closeCustomSelects(opening ? shell : null);
    menu.hidden = !opening;
    shell.classList.toggle("is-open", opening);
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) menu.querySelector(".is-selected")?.focus();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (menu.hidden) trigger.click();
  });

  select.classList.add("native-select");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.insertAdjacentElement("afterend", shell);
  shell.append(trigger, menu);
  select.customSync = sync;
  select.addEventListener("change", sync);
  sync();
}

function upgradeSelects() {
  document.querySelectorAll("select").forEach(upgradeSelect);
  document.addEventListener("click", () => closeCustomSelects());
}

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (value) => resolve(value || {}));
  });
}

function setLocal(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function paintStats(stats) {
  const value = { ...DEFAULT_STATS, ...(stats || {}) };
  const calibration = byId("calibration");
  byId("rounds").textContent = value.rounds;
  byId("average").textContent = value.rounds
    ? Math.round(value.totalScore / value.rounds)
    : 0;
  byId("streak").textContent = value.streak;
  byId("best").textContent = value.bestStreak;

  if (!value.calibrationRounds) {
    calibration.hidden = true;
    calibration.textContent = "";
    return;
  }
  calibration.hidden = false;
  const ratio = Math.exp(value.biasLogSum / value.calibrationRounds);
  if (ratio > 1.08) {
    calibration.textContent = `Guesses trend ${ratio.toFixed(1)}× high.`;
  } else if (ratio < 0.92) {
    calibration.textContent = `Guesses trend ${(1 / ratio).toFixed(1)}× low.`;
  } else {
    calibration.textContent = "Guesses are centered.";
  }
}

function paintHistory(history = []) {
  const list = byId("history");
  list.innerHTML = "";
  history.slice(0, 6).forEach((item) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item.name;
    const score = document.createElement("strong");
    score.textContent = item.score;
    row.append(name, score);
    list.appendChild(row);
  });
  byId("history-panel").hidden = history.length === 0;
}

function paintSession(session) {
  const target = byId("session-state");
  if (!session) {
    target.textContent = "";
  } else if (session.complete) {
    const total = (session.results || []).reduce((sum, item) => sum + item.score, 0);
    target.textContent = `Last ${session.type === "daily" ? "daily challenge" : "run"}: ${total} points.`;
  } else {
    target.textContent = `${session.type === "daily" ? "Daily challenge" : "Run"} in progress · ${session.index + 1}/${session.appIds.length}`;
  }
}

function currentSettings() {
  return {
    enabled: byId("enabled").checked,
    mode: byId("mode").value,
    pool: byId("pool").value,
    spoilerLevel: byId("spoiler").value,
    filters: {
      genre: byId("genre").value,
      release: byId("release").value,
      price: byId("price").value,
      reviews: byId("reviews").value,
      rating: byId("rating").value,
    },
  };
}

async function saveSettings() {
  await setLocal({ settings: currentSettings() });
  status.textContent = "Saved. Steam pages are refreshing.";
}

async function startSession(sessionType) {
  const roundCount = sessionType === "daily"
    ? 5
    : Number(byId("round-count").value);
  status.textContent = `Finding ${roundCount} games…`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const onSteam = /^https?:\/\/store\.steampowered\.com\/app\/\d+/i.test(tab?.url || "");
    const response = onSteam && tab?.id
      ? await chrome.tabs.sendMessage(tab.id, {
        type: "start-session",
        sessionType,
        roundCount,
      })
      : await chrome.runtime.sendMessage({
        type: "start-session-on-steam",
        sessionType,
        roundCount,
      });
    if (!response?.ok) throw new Error(response?.error || "Could not start.");
  } catch (error) {
    status.textContent = "Could not open a Steam game. Try again.";
  }
}

async function init() {
  const stored = await getLocal(["settings", "stats", "history", "session", "roundCount"]);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(stored.settings || {}),
    filters: { ...DEFAULT_SETTINGS.filters, ...(stored.settings?.filters || {}) },
  };
  byId("enabled").checked = settings.enabled;
  byId("mode").value = settings.mode;
  byId("pool").value = settings.pool;
  byId("spoiler").value = settings.spoilerLevel;
  byId("genre").value = settings.filters.genre;
  byId("release").value = settings.filters.release;
  byId("price").value = settings.filters.price;
  byId("reviews").value = settings.filters.reviews;
  byId("rating").value = settings.filters.rating;
  byId("round-count").value = [3, 5, 10].includes(Number(stored.roundCount))
    ? String(stored.roundCount)
    : "5";
  document.querySelectorAll("select").forEach((select) => select.customSync?.());
  paintStats(stored.stats);
  paintHistory(stored.history);
  paintSession(stored.session);
}

upgradeSelects();

["enabled", "mode", "pool", "spoiler", "genre", "release", "price", "reviews", "rating"].forEach((id) => {
  byId(id).addEventListener("change", saveSettings);
});
byId("daily").addEventListener("click", () => startSession("daily"));
byId("run").addEventListener("click", () => startSession("run"));
byId("round-count").addEventListener("change", () => {
  setLocal({ roundCount: Number(byId("round-count").value) });
});
byId("reset").addEventListener("click", async () => {
  await setLocal({ stats: { ...DEFAULT_STATS }, history: [], session: null });
  paintStats(DEFAULT_STATS);
  paintHistory([]);
  paintSession(null);
  status.textContent = "Stats and history reset.";
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.stats) paintStats(changes.stats.newValue);
  if (changes.history) paintHistory(changes.history.newValue);
  if (changes.session) paintSession(changes.session.newValue);
});

init();
