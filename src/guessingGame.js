(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const isSteamAppPage = ns.isSteamAppPage;
  const getCurrentSteamAppId = ns.getCurrentSteamAppId;
  const getSteamReviewsContainer = ns.getSteamReviewsContainer;
  const hideAllSteamReviewCounts = ns.hideAllSteamReviewCounts;
  const waitForAnyReviewCount = ns.waitForAnyReviewCount;

  function buildBuckets(trueCount) {
    const n = Math.max(0, Math.trunc(Number(trueCount) || 0));

    const buckets = [
      { label: "<10",             min: 0,      max: 9 },
      { label: "10–100",          min: 10,     max: 100 },
      { label: "101–1,000",       min: 101,    max: 1000 },
      { label: "1,001–10,000",    min: 1001,   max: 10000 },
      { label: "10,001–100,000",  min: 10001,  max: 100000 },
      { label: ">100,000",        min: 100001, max: Infinity }
    ];

    let correctIndex = buckets.length - 1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (n >= b.min && n <= b.max) {
        correctIndex = i;
        break;
      }
    }

    return { buckets, correctIndex };
  }

  function buildExactGuessSet(trueCount) {
    const MIN_ANSWERS = 6;
    const CAP = 200_000_000_000;

    const TC = Math.max(
        0,
        Math.min(CAP, Math.trunc(Number(trueCount) || 0))
    );

    const answers = new Set();
    answers.add(TC);

    const randInt = (min, max) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

    const MIN_STEP_INCREASE = randInt(40, 60);
    const maxDownGuesses = randInt(4, 5);

    if (TC >= MIN_STEP_INCREASE) {
      let current = TC;
      let downCount = 0;

      while (answers.size < MIN_ANSWERS && downCount < maxDownGuesses) {
        if (current === 0) break;

        let divided = Math.floor(current / 5);
        if (divided === current) break;

        const noise = randInt(-3, 3);
        let next = divided + noise;

        if (next < 0) next = 0;
        if (next >= current) next = current - 1;

        const beforeSize = answers.size;
        answers.add(next);
        if (answers.size > beforeSize) {
          downCount++;
        }

        current = next;
        if (current < 50) break;
      }
    }

    let current = TC;

    while (answers.size < MIN_ANSWERS) {
      let base = current * 5;
      const noise = randInt(-2, 3);
      let candidate = base + noise;

      if (candidate < 0) candidate = 0;
      if (candidate < current + MIN_STEP_INCREASE) {
        candidate = current + MIN_STEP_INCREASE;
      }
      if (candidate > CAP) candidate = CAP;

      let tries = 0;
      while (answers.has(candidate) && candidate < CAP && tries < 10) {
        candidate++;
        tries++;
      }

      if (answers.has(candidate)) {
        break;
      }

      answers.add(candidate);
      current = candidate;
    }

    if (answers.size < MIN_ANSWERS) {
      let maxVal = Math.max(...answers);
      while (answers.size < MIN_ANSWERS && maxVal < CAP) {
        maxVal++;
        if (!answers.has(maxVal)) {
          answers.add(maxVal);
        }
      }
    }

    if (answers.size > 0) {
      const values = Array.from(answers);
      let minVal = values[0];
      for (let i = 1; i < values.length; i++) {
        if (values[i] < minVal) minVal = values[i];
      }

      if (minVal !== TC && Math.random() < 0.5 && minVal < 20) {
        const candidates = Math.random() < 0.5 ? [0, 1] : [1, 0];

        for (const val of candidates) {
          if (val === minVal) break;
          if (!answers.has(val)) {
            answers.delete(minVal);
            answers.add(val);
            break;
          }
        }
      }
    }

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
      const layout =
          typeof ns.getGuessLayout === "function"
              ? ns.getGuessLayout()
              : "ranges";

      wrap.innerHTML = "";
      const btns = [];

      let correctIndex = -1;

      if (layout === "exact") {
        const guesses = buildExactGuessSet(trueCount);
        correctIndex = guesses.findIndex((v) => v === trueCount);
        if (correctIndex === -1) {
          correctIndex = 0;
          guesses[0] = trueCount;
        }

        guesses.forEach((val, index) => {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.index = String(index);
          b.textContent = val.toLocaleString("en-US");
          btns.push(b);
          wrap.appendChild(b);
        });
      } else {
        const bucketData = buildBuckets(trueCount);
        const buckets = bucketData.buckets;
        correctIndex = bucketData.correctIndex;

        buckets.forEach((bucket, index) => {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.index = String(index);
          b.textContent = bucket.label;
          btns.push(b);
          wrap.appendChild(b);
        });
      }

      const note = document.createElement("div");
      note.className = "ext-subtle";
      note.textContent =
          "Guess the All Reviews count (all languages).";
      wrap.appendChild(note);

      const mark = (pickedIndex) => {
        if (wrap.dataset.locked === "1") return;
        wrap.dataset.locked = "1";

        const isCorrect = pickedIndex === correctIndex;
        if (ns.updateStreak) {
          ns.updateStreak(isCorrect);
        }

        if (layout === "ranges") {
          const correctButton = btns[correctIndex];
          if (correctButton) {
            correctButton.textContent =
                trueCount.toLocaleString("en-US");
          }
        }

        btns.forEach((btn, index) => {
          if (index === correctIndex) btn.classList.add("correct");
          if (index === pickedIndex && index !== correctIndex) {
            btn.classList.add("wrong");
          }
          btn.disabled = true;
          btn.setAttribute("aria-disabled", "true");
          btn.style.pointerEvents = "none";
        });
      };

      btns.forEach((b, index) =>
          b.addEventListener(
              "click",
              () => mark(index),
              { once: true }
          )
      );

      wrap.dataset.state = "ready";
    }
  }

  ns.injectSteamGuessingGame = injectSteamGuessingGame;
})(window);
