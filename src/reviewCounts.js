(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});
  const parseReviewCountRaw = ns.parseReviewCountRaw;

  /**
   * Hide *all* review counts across the Steam page (to avoid spoilers),
   * while keeping the "Overall Reviews" block structurally visible.
   */
  function hideAllSteamReviewCounts() {
    // When running at document_start, body may not exist yet.
    if (!document.body) return;

    const isInOverallSummary = (el) =>
      !!el.closest(".review_summary_ctn.overall_summary_ctn");

    // Unhide the Overall Reviews block if we hid it earlier
    document
      .querySelectorAll(`
        .review_summary_ctn.overall_summary_ctn .summary_text,
        .review_summary_ctn.overall_summary_ctn .game_review_summary,
        .review_summary_ctn.overall_summary_ctn .app_reviews_count
      `)
      .forEach((el) => el.classList.remove("ext-hide"));

    const selectors = [
      ".review_summary_count",
      ".user_reviews_summary_row",
      ".rating_summary",
      ".responsive_reviewdesc",
      ".game_review_summary",
      ".user_reviews_count",
      ".newmodal_reviews_header",
      ".apphub_ReviewsHeader",
      ".user_reviews_filter_section",
      ".viewer_bar",
      ".app_reviews_count",
    ];

    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (isInOverallSummary(el)) return;
        if (!el.closest(".ext-steam-guess")) el.classList.add("ext-hide");
      });
    });

    // ⬇️ this is where the crash happened before
    const rx =
      /\b(All|Alle|Toutes|Todas|Tutte|Alle)\s+Reviews?|\bRecent\s+Reviews?/i;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!rx.test(node.nodeValue || ""))
            return NodeFilter.FILTER_REJECT;
          const el = node.parentElement;
          return el && isInOverallSummary(el)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (el && !el.closest(".ext-steam-guess"))
        el.classList.add("ext-hide");
    }

    // --- EXTRA SPOILER HIDES --------------------------------------------------

    // 1) Publisher row (e.g. "Publisher: Benedict Jaeggi")
    document.querySelectorAll(".dev_row").forEach((row) => {
      const labelEl = row.querySelector(".subtitle");
      const labelText = (labelEl?.textContent || "").trim().toLowerCase();
      // Match "Publisher:" (case-insensitive, allow missing colon just in case)
      if (labelText === "publisher:" || labelText === "publisher") {
        row.classList.add("ext-hide");
      }
    });

    // 2) Curators section ("What Curators Say")
    document.querySelectorAll("h2").forEach((h2) => {
      const title = (h2.textContent || "").trim().toLowerCase();
      if (title.includes("what curators say")) {
        // Hide the closest block-like container if possible, otherwise just the header region
        const block =
          h2.closest(".block") ||
          h2.closest(".block_header") ||
          h2.parentElement;
        if (block) block.classList.add("ext-hide");
      }
    });

    // 4) Awards block (#awardsTable)
    const awards = document.getElementById("awardsTable");
    if (awards) {
      awards.classList.add("ext-hide");
    }

    // 5) “Reviews” in the About section (#game_area_reviews)
    const aboutReviews = document.getElementById("game_area_reviews");
    if (aboutReviews) {
      aboutReviews.classList.add("ext-hide");
    }

    // 6) Recommendation reasons ("Similar to games you've played", friends who own it, etc.)
    document
      .querySelectorAll(".recommendation_reasons")
      .forEach((block) => {
        block.classList.add("ext-hide");
      });

    // 7) Events row ("Recent Events & Announcements")
    document
      .querySelectorAll('[data-featuretarget="events-row"]')
      .forEach((block) => {
        block.classList.add("ext-hide");
      });

      // 8) Metacritic block
    const metacritic = document.getElementById("apppage_metacritic_block");
    if (metacritic) {
      metacritic.classList.add("ext-hide");
    }

    // 9) Friend block ("X friend wants/owns this game")
    const friendBlock = document.getElementById("friend_block");
    if (friendBlock) {
      friendBlock.classList.add("ext-hide");
    }
  }


  function tryGetFromLanguageBreakdown(scope = document) {
    const sel =
      ".review_language_breakdown .outlier_totals.global.review_box_background_secondary .review_summary_count";
    const el = scope.querySelector(sel);
    if (!el) return null;
    const c = parseReviewCountRaw(el.textContent);
    return c != null ? { el, count: c } : null;
  }

  function tryGetFromOverallSummary(scope = document) {
    // Find classic block OR any block whose title contains "Overall Reviews:"
    const candidates = [];
    const classic =
      scope.querySelector(
        ".review_summary_ctn.overall_summary_ctn .summary_text"
      ) || scope.querySelector(".review_summary_ctn.overall_summary_ctn");
    if (classic) candidates.push(classic);

    scope.querySelectorAll(".summary_text").forEach((st) => {
      const t =
        (st.querySelector(".title")?.textContent || "").toLowerCase();
      if (/overall\s*reviews/.test(t)) candidates.push(st);
    });

    // De-dup
    const seen = new Set();
    const uniq = candidates.filter((el) =>
      seen.has(el) ? false : (seen.add(el), true)
    );

    const withUnhidden = (el, fn) => {
      const hidden = [...el.querySelectorAll(".ext-hide")];
      hidden.forEach((n) => n.classList.remove("ext-hide"));
      try {
        return fn();
      } finally {
        hidden.forEach((n) => n.classList.add("ext-hide"));
      }
    };

    for (const box of uniq) {
      const result = withUnhidden(box, () => {
        const fullText = box.textContent || "";

        // Special case: "No reviews" → 0
        if (/no reviews/i.test(fullText)) {
          return { el: box, count: 0 };
        }

        // Prefer explicit "(N reviews)"
        const appCount = box.querySelector(".app_reviews_count");
        if (appCount) {
          const c = parseReviewCountRaw(appCount.textContent);
          if (c != null) return { el: appCount, count: c };
        }

        // Next: "N user reviews"
        const userSummary = box.querySelector(".game_review_summary");
        if (userSummary) {
          const c2 = parseReviewCountRaw(userSummary.textContent);
          if (c2 != null) return { el: userSummary, count: c2 };
        }

        // Last resort: parse the entire block text
        const c3 = parseReviewCountRaw(fullText);
        if (c3 != null) return { el: box, count: c3 };

        return null;
      });

      if (result) return result;
    }

    return null;
  }

  function tryGetFromReviewScoreSummaries(scope = document) {
    const box = scope.querySelector(".review_score_summaries");
    if (!box) return null;

    const hidden = [...box.querySelectorAll(".ext-hide")];
    hidden.forEach((n) => n.classList.remove("ext-hide"));
    try {
      const fullText = box.textContent || "";
      if (/no reviews/i.test(fullText)) {
        return { el: box, count: 0 };
      }

      const candidates = [
        ...box.querySelectorAll(
          ".app_reviews_count, .game_review_summary, .review_summary_count"
        ),
      ];
      const values = [];

      candidates.forEach((el) => {
        const v = parseReviewCountRaw(el.textContent);
        if (v != null) values.push({ el, v });
      });

      const vBlock = parseReviewCountRaw(fullText);
      if (vBlock != null) values.push({ el: box, v: vBlock });

      if (values.length) {
        const best = values.reduce((a, b) => (b.v > a.v ? b : a));
        return { el: best.el, count: best.v };
      }

      return { el: box, count: 0 };
    } finally {
      hidden.forEach((n) => n.classList.add("ext-hide"));
    }
  }

  function tryDetectNoReviews(scope = document) {
    // If any visible summary element shows a numeric count, prefer that.
    const summary = scope.querySelector(
      ".review_score_summaries, .overall_summary_ctn, .review_summary_ctn"
    );
    if (summary) {
      const spots = [
        ".app_reviews_count",
        ".game_review_summary",
        ".summary_text",
      ];
      for (const sel of spots) {
        const node = summary.querySelector(sel);
        if (node) {
          const v = parseReviewCountRaw(node.textContent || "");
          if (typeof v === "number" && v > 0) {
            return null;
          }
        }
      }
    }

    const titleEl = scope.querySelector(".noReviewsYetTitle");
    if (titleEl) {
      const t = (titleEl.textContent || "")
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (t.includes("there are no reviews for this product")) {
        return { el: titleEl, count: 0 };
      }
    }

    const box = scope.querySelector(
      ".review_ctn, .app_reviews_area, #app_reviews_hash, .user_reviews"
    );
    if (box) {
      const text = (box.textContent || "")
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (text.includes("there are no reviews for this product")) {
        return { el: box, count: 0 };
      }
    }

    const bodyText = (document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (bodyText.includes("there are no reviews for this product")) {
      return { el: document.body, count: 0 };
    }

    return null;
  }

  function waitForAnyReviewCount(timeoutMs = 15000) {
    const scope = document;

    const check = () =>
      tryGetFromLanguageBreakdown(scope) ||
      tryGetFromOverallSummary(scope) ||
      tryGetFromReviewScoreSummaries(scope) ||
      tryDetectNoReviews(scope) ||
      null;

    const immediate = check();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
      let settled = false;

      const finish = (res) => {
        if (settled) return;
        settled = true;
        clearInterval(poller);
        obs.disconnect();
        resolve(res);
      };

      const obs = new MutationObserver(() => {
        const got = check();
        if (got) finish(got);
      });

      obs.observe(scope, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      const poller = setInterval(() => {
        const got = check();
        if (got) finish(got);
      }, 250);

      setTimeout(() => finish(null), timeoutMs);
    });
  }

  // Expose
  ns.hideAllSteamReviewCounts = hideAllSteamReviewCounts;
  ns.tryGetFromLanguageBreakdown = tryGetFromLanguageBreakdown;
  ns.tryGetFromOverallSummary = tryGetFromOverallSummary;
  ns.tryGetFromReviewScoreSummaries = tryGetFromReviewScoreSummaries;
  ns.tryDetectNoReviews = tryDetectNoReviews;
  ns.waitForAnyReviewCount = waitForAnyReviewCount;
})(window);
