(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  function run() {
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

  // Initial run
  run();

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
