(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  /**
   * Best-effort detection of the current Steam app id.
   * Uses URL path, og:url and common data-* attributes.
   *
   * @returns {string|null} Steam app id or null when not found.
   */
  function getCurrentSteamAppId() {
    const m = location.pathname.match(
      /^\/(?:agecheck\/)?app\/(\d+)(?:\/|$)/
    );
    if (m) return m[1];

    const og =
      document.querySelector('meta[property="og:url"]')?.content || "";
    const m2 = og.match(
      /store\.steampowered\.com\/(?:agecheck\/)?app\/(\d+)(?:\/|$)/i
    );
    if (m2) return m2[1];

    const attr =
      document
        .querySelector("[data-appid]")
        ?.getAttribute("data-appid") ||
      document
        .querySelector("[data-ds-appid]")
        ?.getAttribute("data-ds-appid");

    if (attr && /^\d+$/.test(attr)) return attr;

    return null;
  }

  /**
   * Treat any Steam store host as an "app page" context.
   * This intentionally stays permissive for SPA navigation.
   *
   * @returns {boolean}
   */
  function isSteamAppPage() {
    return /store\.steampowered\.com$/.test(location.host);
  }

  /**
   * Try to find a stable container near the user review section.
   *
   * @returns {HTMLElement|null}
   */
  function getSteamReviewsContainer() {
    return (
      document.getElementById("userReviews") ||
      document.querySelector(".user_reviews") ||
      document.querySelector(".review_ctn") ||
      document.querySelector("[data-panel='reviews']") ||
      document.querySelector(".glance_ctn_responsive_left") ||
      null
    );
  }

  /**
   * Detect the classic "Oops, sorry!" region-unavailable page on Steam.
   *
   * @returns {boolean}
   */
  function isUnavailableRegionPage() {
    // Quick checks for the classic "Oops, sorry!" page
    const header = document.querySelector(
      ".page_header_ctn .page_content"
    );
    if (!header) return false;

    const h2 = header.querySelector("h2.pageheader");
    const crumbs = header.querySelector(".breadcrumbs .blockbg");
    const headerText = (h2?.textContent || "").trim().toLowerCase();
    const crumbsText = (crumbs?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    // Examples:
    // h2 => "Oops, sorry!"
    // breadcrumbs blockbg => "Home > Oops"
    const hasOopsHeader = /oops[,! ]/.test(headerText);
    const hasOopsCrumbs = /\boops\b/.test(crumbsText);

    // Additionally, the main body often contains a message like
    // "This item is currently unavailable in your region"
    const bodyText =
      (document.body?.textContent || "").toLowerCase();
    const hasRegionMsg = /unavailable in your region|not available in your region/.test(
      bodyText
    );

    return (hasOopsHeader && hasOopsCrumbs) || (hasOopsHeader && hasRegionMsg);
  }

  // Expose
  ns.getCurrentSteamAppId = getCurrentSteamAppId;
  ns.isSteamAppPage = isSteamAppPage;
  ns.getSteamReviewsContainer = getSteamReviewsContainer;
  ns.isUnavailableRegionPage = isUnavailableRegionPage;
})(window);
