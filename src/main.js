(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  let settings = null;

  function run() {
    if (!settings?.enabled) return;

    if (ns.hideAllSteamReviewCounts) {
      ns.hideAllSteamReviewCounts();
    }

    if (ns.isUnavailableRegionPage && ns.isUnavailableRegionPage()) {
      ns.installNextGameButtonOnOops &&
        ns.installNextGameButtonOnOops();
      return;
    }

    ns.installNextGameButton && ns.installNextGameButton();
    ns.injectSteamGuessingGame && ns.injectSteamGuessingGame();
  }

  async function start() {
    settings = ns.getSettings
      ? await ns.getSettings()
      : { enabled: true, mode: "typed" };
    ns.settings = settings;
    document.documentElement.classList.toggle(
      "ext-review-guesser-active",
      settings.enabled
    );
    document.documentElement.dataset.extSpoiler =
      settings.spoilerLevel || "standard";
    run();
  }

  // Initial run after persisted settings are available.
  start();

  // React to DOM mutations (SPA / dynamic content)
  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      run();
      scheduled = false;
    });
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Popup changes apply immediately and a reload cleanly restores Steam UI
  // when the extension is disabled or the game mode changes.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) location.reload();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "start-session") return false;
    if (!ns.startSession) {
      sendResponse({ ok: false, error: "Session tools are not available." });
      return false;
    }
    ns.startSession(message.sessionType, message.roundCount)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  // History hook for SPA navigation
  (function hookHistory() {
    if (window.__extHistoryHooked) return;
    window.__extHistoryHooked = true;

    const dispatch = () =>
      window.dispatchEvent(new Event("ext:locationchange"));

    const origPush = history.pushState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      dispatch();
    };

    const origReplace = history.replaceState;
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      dispatch();
    };

    window.addEventListener("popstate", dispatch);
    window.addEventListener("ext:locationchange", () =>
      setTimeout(() => run(), 50)
    );
  })();
})(window);
