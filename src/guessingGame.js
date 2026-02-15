(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const isSteamAppPage = ns.isSteamAppPage;
  const getCurrentSteamAppId = ns.getCurrentSteamAppId;
  const getSteamReviewsContainer = ns.getSteamReviewsContainer;
  const hideAllSteamReviewCounts = ns.hideAllSteamReviewCounts;
  const waitForAnyReviewCount = ns.waitForAnyReviewCount;
  const formatNum = ns.formatNum;

  function buildGuessSet(trueCount) {
    const MIN_ANSWERS = 6;
    const CAP = 200_000_000_000;

    // Normalise the true answer and cap it
    const TC = Math.max(
      0,
      Math.min(CAP, Math.trunc(Number(trueCount) || 0))
    );

    const answers = new Set();
    answers.add(TC);

    const randInt = (min, max) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    // Random minimum step between answers when going upwards (40–60)
    const MIN_STEP_INCREASE = randInt(40, 60);

    // Random limit for how many *downward* options we may generate: 2–5
    const maxDownGuesses = randInt(4, 5);

    //
    // 1) DOWNWARDS PHASE (divide by 5 with noise) — ONLY if TC >= MIN_STEP_INCREASE.
    //    Also limited to maxDownGuesses.
    //
    if (TC >= MIN_STEP_INCREASE) {
      let current = TC;
      let downCount = 0;

      while (answers.size < MIN_ANSWERS && downCount < maxDownGuesses) {
        if (current === 0) break;

        let divided = Math.floor(current / 5);

        // No progress? bail out to avoid infinite loops
        if (divided === current) break;

        // Small random wobble: [-3, 3]
        const noise = randInt(-3, 3);
        let next = divided + noise;

        // Clamp so it's still lower than the previous value and >= 0
        if (next < 0) next = 0;
        if (next >= current) next = current - 1;

        const beforeSize = answers.size;
        answers.add(next);
        if (answers.size > beforeSize) {
          downCount++;
        }

        current = next;

        // Stop downwards once we've reached below 50 (original rule)
        if (current < 50) break;
      }
    }

    //
    // 2) UPWARDS PHASE: multiply by 5 with noise and enforce a random min distance (40–60).
    //    This fills remaining slots with higher values.
    //
    let current = TC;

    while (answers.size < MIN_ANSWERS) {
      // Base "multiply by 5"
      let base = current * 5;

      // Small random wobble: [-2, 3]  (add up to 3, remove up to 2)
      const noise = randInt(-2, 3);
      let candidate = base + noise;

      if (candidate < 0) candidate = 0;

      // Enforce a minimum increase of MIN_STEP_INCREASE over the previous value
      if (candidate < current + MIN_STEP_INCREASE) {
        candidate = current + MIN_STEP_INCREASE;
      }

      // Cap very large values
      if (candidate > CAP) candidate = CAP;

      // Avoid duplicates by nudging up a bit if needed
      let tries = 0;
      while (answers.has(candidate) && candidate < CAP && tries < 10) {
        candidate++;
        tries++;
      }

      if (answers.has(candidate)) {
        // No more unique space reasonably nearby; stop the upward phase.
        break;
      }

      answers.add(candidate);
      current = candidate;
    }

    //
    // 3) Fallback: if we *still* have fewer than 6 answers,
    //    just fill upwards by +1 from the current max.
    //
    if (answers.size < MIN_ANSWERS) {
      let maxVal = Math.max(...answers);
      while (answers.size < MIN_ANSWERS && maxVal < CAP) {
        maxVal++;
        if (!answers.has(maxVal)) {
          answers.add(maxVal);
        }
      }
    }

    //
    // 4) LOWEST-OPTION TWEAK:
    //    If the lowest option is NOT the correct answer, then with 50% chance
    //    replace it with 0 or 1 (chosen randomly), while keeping all answers distinct.
    //
    if (answers.size > 0) {
      const values = Array.from(answers);
      let minVal = values[0];
      for (let i = 1; i < values.length; i++) {
        if (values[i] < minVal) minVal = values[i];
      }

      if (minVal !== TC && Math.random() < 0.5 && minVal < 20) {
        const candidates = Math.random() < 0.5 ? [0, 1] : [1, 0];

        for (const val of candidates) {
          // If replacing with the same value, no point; skip
          if (val === minVal) {
            // already that value, but it's still 0 or 1, so that's okay
            break;
          }
          // Avoid creating duplicates: allow if it's not already in the set
          if (!answers.has(val)) {
            answers.delete(minVal);
            answers.add(val);
            break;
          }
        }
      }
    }

    //
    // 5) Convert to array and shuffle so the correct answer isn’t in a fixed spot.
    //
    const picks = Array.from(answers);

    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }

    return picks;
  }





  function ensureLoadingWidget(container, appId) {
    let wrap = container.querySelector(
      `.ext-steam-guess[data-ext-appid="${appId}"]`
    );
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-steam-guess";
      wrap.dataset.extAppid = appId;
      const msg = document.createElement("div");
      msg.className = "ext-wait";
      msg.textContent = "Waiting for review count to load…";
      wrap.appendChild(msg);
      container.prepend(wrap);
    } else {
      const hasButtons = wrap.querySelector("button");
      if (!hasButtons) {
        let msg = wrap.querySelector(".ext-wait");
        if (!msg) {
          msg = document.createElement("div");
          msg.className = "ext-wait";
          wrap.appendChild(msg);
        }
        msg.textContent = "Waiting for review count to load…";
      }
    }
    container.classList.add("ext-mask-reviews");
    return wrap;
  }

  /**
   * Extract review summary data from (hidden) Steam DOM elements
   * and build our own compact display inside the guess widget.
   */
  function revealReviewSummary(wrap) {
    if (wrap.querySelector(".ext-review-reveal")) return;

    const seen = new Set();
    const entries = [];

    document.querySelectorAll(".user_reviews_summary_row").forEach((row) => {
      const subtitleEl = row.querySelector(".subtitle");
      const summaryEl = row.querySelector(".game_review_summary");
      if (!subtitleEl || !summaryEl) return;

      const subtitle = subtitleEl.textContent.trim().replace(/:$/, "");
      // Normalise key for dedup (e.g. "Recent Reviews" / "All Reviews")
      const key = subtitle.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const label = summaryEl.textContent.trim();
      if (!label) return;

      // Try tooltip first — it has the "XX% of N … are positive" string
      const tooltip = summaryEl.getAttribute("data-tooltip-html") || "";

      // Also check the sibling .responsive_reviewdesc for the same info
      const descEl = row.querySelector(".responsive_reviewdesc");
      const descText = descEl ? descEl.textContent : "";
      const source = tooltip || descText || "";

      const pctMatch = source.match(/(\d+)%/);
      const countMatch = source.match(/([\d,.\u00A0\s]+)\s*user\s*reviews?/i);

      let extra = "";
      if (countMatch) {
        const num = countMatch[1].replace(/[\s,.\u00A0]/g, "");
        extra += " (" + formatNum(parseInt(num, 10)) + ")";
      }
      if (pctMatch) {
        extra += " \u2014 " + pctMatch[1] + "% positive";
      }

      // Determine sentiment color (matches Steam's palette)
      const lw = label.toLowerCase();
      let sentimentColor;
      if (/\bnegative\b/.test(lw) && !/mostly/.test(lw)) {
        sentimentColor = "#A34C25";          // Negative / Very Negative / Overwhelmingly Negative
      } else if (/mostly negative/.test(lw)) {
        sentimentColor = "#C35C2C";          // Mostly Negative
      } else if (/\bmixed\b/.test(lw)) {
        sentimentColor = "#B9A074";          // Mixed
      } else {
        sentimentColor = "#66C0F4";          // Positive variants
      }

      entries.push({ subtitle, label, extra, sentimentColor });
    });

    if (!entries.length) return;

    const reveal = document.createElement("div");
    reveal.className = "ext-review-reveal";

    const appId = getCurrentSteamAppId();
    const reviewsUrl = appId
      ? "https://store.steampowered.com/app/" + appId + "/#app_reviews_hash"
      : null;

    entries.forEach((e) => {
      const line = document.createElement("div");
      line.className = "ext-review-line";

      const lbl = document.createElement("span");
      lbl.className = "ext-review-label";
      lbl.textContent = e.subtitle + ":";

      const val = document.createElement("span");
      val.className = "ext-review-value";

      const link = document.createElement("a");
      link.className = "ext-review-link";
      link.href = reviewsUrl || "#app_reviews_hash";
      link.textContent = e.label;
      link.style.color = e.sentimentColor;
      link.addEventListener("click", (ev) => {
        ev.preventDefault();

        // Flip a single class on <html> that disables ALL plugin hiding
        document.documentElement.classList.add("ext-game-over");

        // Scroll to the reviews section
        const target =
          document.getElementById("app_reviews_hash") ||
          document.querySelector(".review_ctn");
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
      val.appendChild(link);

      if (e.extra) {
        val.appendChild(document.createTextNode(e.extra));
      }

      line.appendChild(lbl);
      line.appendChild(val);
      reveal.appendChild(line);
    });

    wrap.appendChild(reveal);
  }

  async function injectSteamGuessingGame() {
    if (!isSteamAppPage()) return;

    const appId = getCurrentSteamAppId() || "unknown";

    const existingWrap = document.querySelector(
      `.ext-steam-guess[data-ext-appid="${appId}"]`
    );
    if (existingWrap && existingWrap.dataset.state === "ready") {
      hideAllSteamReviewCounts();
      return;
    }

    document
      .querySelectorAll(".ext-steam-guess[data-ext-appid]")
      .forEach((el) => {
        if (el.getAttribute("data-ext-appid") !== appId) el.remove();
      });

    const container = getSteamReviewsContainer();
    if (!container) {
      return;
    }

    hideAllSteamReviewCounts();

    const wrap = ensureLoadingWidget(container, appId);
    if (!wrap) return;

    if (wrap.dataset.state === "ready") {
      hideAllSteamReviewCounts();
      return;
    }

    let trueCount = wrap.dataset.truecount
      ? parseInt(wrap.dataset.truecount, 10)
      : null;
    if (!Number.isFinite(trueCount)) {
      const got = await waitForAnyReviewCount(5000);
      if (!got) {
        if (!wrap.querySelector(".ext-error")) {
          wrap.innerHTML =
            '<div class="ext-error">Failed to load review count</div>';
        }
        return;
      }
      trueCount = got.count;
      wrap.dataset.truecount = String(trueCount);
    }

    if (wrap.dataset.state !== "ready") {
      const guesses = buildGuessSet(trueCount);
      wrap.dataset.guesses = JSON.stringify(guesses);
      wrap.innerHTML = "";

      const btns = [];
      guesses.forEach((val) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.value = String(val);
        b.textContent = formatNum(val);
        btns.push(b);
        wrap.appendChild(b);
      });

      const note = document.createElement("div");
      note.className = "ext-subtle";
      note.textContent =
        "Guess the All Reviews count (all languages).";
      wrap.appendChild(note);

      const correct = trueCount;
      const mark = (picked) => {
        if (wrap.dataset.locked === "1") return;
        wrap.dataset.locked = "1";
        btns.forEach((btn) => {
          const val = parseInt(btn.dataset.value, 10);
          if (val === correct) btn.classList.add("correct");
          if (val === picked && val !== correct)
            btn.classList.add("wrong");
          btn.disabled = true;
          btn.setAttribute("aria-disabled", "true");
          btn.style.pointerEvents = "none";
        });

        // Reveal the review summary after guessing
        revealReviewSummary(wrap);
      };
      btns.forEach((b) =>
        b.addEventListener(
          "click",
          () => mark(parseInt(b.dataset.value, 10)),
          { once: true }
        )
      );

      wrap.dataset.state = "ready";
    }
  }

  ns.injectSteamGuessingGame = injectSteamGuessingGame;
})(window);
