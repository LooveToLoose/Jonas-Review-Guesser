(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const isSteamAppPage = ns.isSteamAppPage;
  const getCurrentSteamAppId = ns.getCurrentSteamAppId;
  const getSteamReviewsContainer = ns.getSteamReviewsContainer;
  const hideAllSteamReviewCounts = ns.hideAllSteamReviewCounts;
  const waitForAnyReviewCount = ns.waitForAnyReviewCount;
  const formatNum = ns.formatNum;

  function buildGuessSet(trueCount, answerCount = 6) {
    const MIN_ANSWERS = Math.max(3, Math.min(9, Number(answerCount) || 6));
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

  function buildExpertGuessSet(trueCount, answerCount = 6) {
    const target = Math.max(0, Math.trunc(Number(trueCount) || 0));
    const count = Math.max(4, Math.min(9, Number(answerCount) || 6));
    const step = Math.max(1, Math.round(Math.max(target, 12) * 0.075));
    const offsets = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    const answers = new Set([target]);

    while (answers.size < count && offsets.length) {
      const index = Math.floor(Math.random() * offsets.length);
      const offset = offsets.splice(index, 1)[0];
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(step / 3)));
      answers.add(Math.max(0, target + offset * step + jitter));
    }
    let fallback = target + 1;
    while (answers.size < count) answers.add(fallback++);

    const picks = Array.from(answers);
    for (let index = picks.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [picks[index], picks[swap]] = [picks[swap], picks[index]];
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
    } else if (wrap.dataset.state !== "error") {
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

  function getRoundMetrics(guess, trueCount, mode, hintCount = 0) {
    let percentError;
    if (trueCount === 0) {
      percentError = guess === 0 ? 0 : 100;
    } else {
      percentError = (Math.abs(guess - trueCount) / trueCount) * 100;
    }

    const ratio = (guess + 1) / (trueCount + 1);
    const logError = Math.abs(Math.log2(ratio));
    const baseScore = Math.round(100 * Math.exp(-0.45 * logError));
    const score = Math.max(0, baseScore - hintCount * 10);
    const hit = mode === "typed"
      ? percentError <= 25
      : guess === trueCount;

    return { percentError, score, hit, logError, hintCount };
  }

  function formatPercent(value) {
    if (value >= 1000) return `${Math.round(value).toLocaleString()}%`;
    if (value >= 100) return `${Math.round(value)}%`;
    return `${value.toFixed(1)}%`;
  }

  function describeGuess(guess, trueCount) {
    if (guess === trueCount) return "Exactly right.";
    if (trueCount === 0) return "This game has no reviews yet.";
    if (guess === 0) return "Your guess was below the actual count.";
    const factor = guess > trueCount
      ? guess / trueCount
      : trueCount / guess;
    return `${factor.toFixed(factor >= 10 ? 0 : 1)}× too ${
      guess > trueCount ? "high" : "low"
    }.`;
  }

  function gameName() {
    return (
      document.querySelector(".apphub_AppName")?.textContent ||
      document.querySelector("h1")?.textContent ||
      document.title.replace(/\s+on Steam$/i, "") ||
      "Unknown game"
    ).trim();
  }

  function addSessionSummary(wrap, session) {
    if (!session?.complete || wrap.querySelector(".ext-session-summary")) return;
    const summary = document.createElement("div");
    summary.className = "ext-session-summary";
    const results = session.results || [];
    const total = results.reduce((sum, item) => sum + item.score, 0);
    const average = results.length ? Math.round(total / results.length) : 0;
    const title = document.createElement("strong");
    title.textContent = session.type === "daily"
      ? "Daily challenge complete"
      : `${session.appIds.length}-game run complete`;
    const score = document.createElement("span");
    score.textContent = `${total} total points · ${average} average`;
    const list = document.createElement("ol");
    results.forEach((item) => {
      const row = document.createElement("li");
      row.textContent = `${item.name} — ${item.score}`;
      list.appendChild(row);
    });
    summary.append(title, score, list);
    wrap.appendChild(summary);
  }

  function addSessionContinue(wrap, session, inline = false) {
    if (!session || session.complete || !ns.continueSession) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ext-session-next${inline ? " is-inline" : ""}`;
    button.textContent = `Next game · ${session.index + 1}/${session.appIds.length}`;
    button.addEventListener("click", () => ns.continueSession(session));
    wrap.appendChild(button);
    document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "n" && button.isConnected) button.click();
    });
  }

  function addSessionProgress(wrap, session, appId) {
    if (!session || session.complete) return;
    if (String(session.appIds?.[session.index]) !== String(appId)) return;
    const progress = document.createElement("div");
    progress.className = "ext-session-progress";
    progress.textContent = `${session.type === "daily" ? "Daily challenge" : `${session.appIds.length}-game run`} · ${session.index + 1}/${session.appIds.length}`;
    wrap.appendChild(progress);
  }

  function findHintValue(type) {
    if (type === "price") {
      return (
        document.querySelector(".discount_final_price")?.textContent ||
        document.querySelector(".game_purchase_price")?.textContent ||
        "Unavailable"
      ).replace(/\s+/g, " ").trim();
    }
    if (type === "year") {
      const value = document.querySelector(".release_date .date")?.textContent || "";
      return value.match(/\b(19|20)\d{2}\b/)?.[0] || value.trim() || "Unavailable";
    }
    return (
      document.querySelector('.details_block a[href*="/genre/"]')?.textContent ||
      document.querySelector(".glance_tags a")?.textContent ||
      "Unavailable"
    ).replace(/\s+/g, " ").trim();
  }

  function renderHints(wrap) {
    const state = { count: 0 };
    const section = document.createElement("div");
    section.className = "ext-hints";
    const label = document.createElement("span");
    label.textContent = "Hints · −10 points each";
    const controls = document.createElement("div");
    [
      ["price", "Price"],
      ["year", "Year"],
      ["genre", "Genre"],
    ].forEach(([type, title]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = title;
      button.addEventListener("click", () => {
        if (button.dataset.revealed === "1") return;
        button.dataset.revealed = "1";
        button.classList.add("is-revealed");
        button.textContent = `${title}: ${findHintValue(type)}`;
        state.count += 1;
      });
      controls.appendChild(button);
    });
    section.append(label, controls);
    wrap.appendChild(section);
    return state;
  }

  function makeStatPill(label, value, modifier = "") {
    const pill = document.createElement("span");
    pill.className = `ext-stat-pill ${modifier}`.trim();
    const name = document.createElement("small");
    name.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = String(value);
    pill.append(name, amount);
    return pill;
  }

  async function showRoundResult(
    wrap,
    guess,
    trueCount,
    mode,
    hintCount = 0,
    options = {}
  ) {
    if (wrap.querySelector(".ext-result")) return;

    const timedOut = Boolean(options.timedOut);
    const metrics = getRoundMetrics(timedOut ? 0 : guess, trueCount, mode, hintCount);
    if (timedOut) {
      metrics.score = 0;
      metrics.hit = false;
      metrics.timedOut = true;
    }
    const scoreTier = metrics.score >= 75
      ? "high"
      : (metrics.score >= 40 ? "mid" : "low");
    const result = document.createElement("div");
    result.className = `ext-result ${metrics.hit ? "is-hit" : "is-miss"} score-${scoreTier}`;

    const headline = document.createElement("strong");
    headline.className = "ext-result-actual";
    headline.textContent = `Actual: ${formatNum(trueCount)} reviews`;

    const detail = document.createElement("div");
    detail.className = "ext-result-detail";
    const callout = document.createElement("span");
    callout.className = `ext-result-pill ${timedOut
      ? "is-timeout"
      : (guess === trueCount ? "is-exact" : (guess > trueCount ? "is-high" : "is-low"))}`;
    callout.textContent = timedOut ? "Time’s up" : describeGuess(guess, trueCount);
    const error = document.createElement("span");
    error.className = "ext-result-pill is-error";
    error.textContent = timedOut ? "No answer" : `${formatPercent(metrics.percentError)} error`;
    detail.append(callout, error);

    const points = document.createElement("b");
    points.className = "ext-score-pill";
    points.textContent = `${metrics.score} pts`;

    result.append(headline, detail, points);
    wrap.appendChild(result);

    if (ns.recordResult) {
      const recorded = await ns.recordResult({
        ...metrics,
        guess: timedOut ? 0 : guess,
        timedOut,
        trueCount,
        appId: getCurrentSteamAppId(),
        name: gameName(),
      });
      if (!wrap.isConnected) return;
      const stats = recorded.stats;
      const statsLine = document.createElement("div");
      statsLine.className = "ext-round-stats";
      const average = stats.rounds
        ? Math.round(stats.totalScore / stats.rounds)
        : 0;
      statsLine.append(
        makeStatPill("Streak", stats.streak, stats.streak ? "is-active" : ""),
        makeStatPill("Rounds", stats.rounds),
        makeStatPill("Average", average, average >= 60 ? "is-good" : "")
      );
      result.appendChild(statsLine);
      if (recorded.session?.complete) addSessionSummary(wrap, recorded.session);
      else addSessionContinue(result, recorded.session, true);
    }
  }

  function renderTypedGame(wrap, trueCount) {
    wrap.classList.add("ext-mode-typed");

    const title = document.createElement("div");
    title.className = "ext-prompt";
    title.textContent = "Guess the all-language review count";

    const form = document.createElement("form");
    form.className = "ext-guess-form";

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = "e.g. 12 500";
    input.setAttribute("aria-label", "Your review count guess");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Submit";

    const validation = document.createElement("div");
    validation.className = "ext-validation";
    validation.setAttribute("role", "alert");

    form.append(input, submit);
    wrap.append(title, form, validation);

    const hints = renderHints(wrap);

    const note = document.createElement("div");
    note.className = "ext-subtle";
    note.textContent = "A guess within 25% keeps the streak.";
    wrap.appendChild(note);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (wrap.dataset.locked === "1") return;

      const cleaned = input.value.trim().replace(/[\s,._]/g, "");
      const guess = Number(cleaned);
      if (!cleaned || !Number.isSafeInteger(guess) || guess < 0) {
        validation.textContent = "Enter a whole number of zero or more.";
        input.focus();
        return;
      }

      wrap.dataset.locked = "1";
      input.disabled = true;
      submit.disabled = true;
      validation.textContent = "";
      await showRoundResult(wrap, guess, trueCount, "typed", hints.count);
    });
  }

  function renderChoiceGame(wrap, trueCount, config = {}) {
    const {
      answerCount = 6,
      variant = "choice",
      timedSeconds = 0,
    } = config;
    wrap.classList.add("ext-mode-choice");
    const guesses = variant === "expert"
      ? buildExpertGuessSet(trueCount, answerCount)
      : buildGuessSet(trueCount, answerCount);
    wrap.dataset.guesses = JSON.stringify(guesses);

    const header = document.createElement("div");
    header.className = "ext-choice-header";
    const prompt = document.createElement("strong");
    prompt.className = "ext-choice-prompt";
    prompt.textContent = variant === "quick"
      ? "Pick before time runs out"
      : (variant === "expert"
        ? "Close call: choose the exact count"
        : "Which review count is correct?");
    const modeTag = document.createElement("span");
    modeTag.className = timedSeconds ? "ext-choice-tag ext-timer" : "ext-choice-tag";
    modeTag.textContent = timedSeconds
      ? `${timedSeconds}s`
      : (variant === "expert" ? "Tight answers" : `${answerCount} choices`);
    header.append(prompt, modeTag);
    wrap.appendChild(header);

    const btns = [];
    guesses.forEach((val) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = String(val);
      button.textContent = formatNum(val);
      btns.push(button);
      wrap.appendChild(button);
    });

    const note = document.createElement("div");
    note.className = "ext-choice-context";
    note.textContent = variant === "expert"
      ? "Decoys stay close to the real number."
      : "All-language Steam reviews";
    wrap.appendChild(note);

    let timerId = null;
    const mark = async (picked, timedOut = false) => {
      if (wrap.dataset.locked === "1") return;
      wrap.dataset.locked = "1";
      if (timerId) clearInterval(timerId);
      btns.forEach((button) => {
        const value = parseInt(button.dataset.value, 10);
        if (value === trueCount) button.classList.add("correct");
        if (value === picked && value !== trueCount) {
          button.classList.add("wrong");
        }
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      });
      await showRoundResult(
        wrap,
        timedOut ? 0 : picked,
        trueCount,
        "choice",
        0,
        { timedOut }
      );
    };

    btns.forEach((button) => {
      button.addEventListener(
        "click",
        () => mark(parseInt(button.dataset.value, 10)),
        { once: true }
      );
    });

    document.addEventListener("keydown", (event) => {
      if (!wrap.isConnected || wrap.dataset.locked === "1") return;
      if (/^[1-9]$/.test(event.key)) btns[Number(event.key) - 1]?.click();
    });

    if (timedSeconds) {
      let remaining = timedSeconds;
      timerId = setInterval(() => {
        remaining -= 1;
        modeTag.textContent = `${remaining}s`;
        modeTag.classList.toggle("is-urgent", remaining <= 3);
        if (remaining <= 0) mark(null, true);
      }, 1000);
    }
  }

  async function injectSteamGuessingGame() {
    if (!isSteamAppPage()) return;

    const appId = getCurrentSteamAppId() || "unknown";

    const existingWrap = document.querySelector(
      `.ext-steam-guess[data-ext-appid="${appId}"]`
    );
    if (existingWrap) {
      const state = existingWrap.dataset.state;
      if (state === "ready" || state === "loading") {
        hideAllSteamReviewCounts();
        return;
      }

      if (state === "error") {
        const lastAttempt = Number(existingWrap.dataset.lastattempt) || 0;
        if (Date.now() - lastAttempt < 10_000) {
          hideAllSteamReviewCounts();
          return;
        }
      }
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

    // main.js runs after every DOM mutation. Mark this attempt before waiting
    // so those reruns do not create overlapping timers and contradictory UI.
    wrap.dataset.state = "loading";
    wrap.dataset.lastattempt = String(Date.now());

    let trueCount = wrap.dataset.truecount
      ? parseInt(wrap.dataset.truecount, 10)
      : null;
    if (!Number.isFinite(trueCount)) {
      const got = await waitForAnyReviewCount(15000);

      // Ignore a result from a page we navigated away from while waiting.
      if (!wrap.isConnected || getCurrentSteamAppId() !== appId) return;

      if (!got) {
        wrap.dataset.state = "error";
        wrap.innerHTML =
          '<div class="ext-error">Failed to load review count. Retrying…</div>';
        return;
      }
      trueCount = got.count;
      wrap.dataset.truecount = String(trueCount);
    }

    if (wrap.dataset.state !== "ready") {
      const settings = ns.settings ||
        (ns.getSettings ? await ns.getSettings() : { mode: "typed" });
      const session = ns.getSession ? await ns.getSession() : null;
      wrap.innerHTML = "";
      wrap.classList.remove("ext-mode-typed", "ext-mode-choice");
      addSessionProgress(wrap, session, appId);
      const choiceModes = {
        quick: { answerCount: 3, variant: "quick", timedSeconds: 8 },
        choice: { answerCount: 6, variant: "choice" },
        expert: { answerCount: 6, variant: "expert" },
      };
      if (choiceModes[settings.mode]) {
        renderChoiceGame(wrap, trueCount, choiceModes[settings.mode]);
      } else {
        renderTypedGame(wrap, trueCount);
      }
      wrap.dataset.state = "ready";
    }
  }

  ns.injectSteamGuessingGame = injectSteamGuessingGame;
})(window);
