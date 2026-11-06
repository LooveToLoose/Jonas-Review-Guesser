(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: "typed",
    pool: "balanced",
    spoilerLevel: "standard",
    filters: {
      genre: "any",
      release: "any",
      price: "any",
      reviews: "any",
      rating: "any",
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

  function getLocal(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  function setLocal(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, resolve);
    });
  }

  async function getSettings() {
    const { settings } = await getLocal(["settings"]);
    return {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      filters: {
        ...DEFAULT_SETTINGS.filters,
        ...(settings?.filters || {}),
      },
    };
  }

  async function getStats() {
    const { stats } = await getLocal(["stats"]);
    return { ...DEFAULT_STATS, ...(stats || {}) };
  }

  async function getHistory() {
    const { history } = await getLocal(["history"]);
    return Array.isArray(history) ? history : [];
  }

  async function getSession() {
    const { session } = await getLocal(["session"]);
    return session || null;
  }

  async function saveSession(session) {
    await setLocal({ session });
    return session;
  }

  async function clearSession() {
    await setLocal({ session: null });
  }

  async function recordResult(round) {
    const stored = await getLocal(["stats", "history", "session"]);
    const stats = { ...DEFAULT_STATS, ...(stored.stats || {}) };
    const history = Array.isArray(stored.history) ? stored.history : [];
    let session = stored.session || null;

    stats.rounds += 1;
    stats.hits += round.hit ? 1 : 0;
    stats.streak = round.hit ? stats.streak + 1 : 0;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.totalScore += Number(round.score) || 0;
    if (!round.timedOut) {
      stats.totalPercentError += Number(round.percentError) || 0;
      stats.biasLogSum += Math.log(
        (Number(round.guess) + 1) / (Number(round.trueCount) + 1)
      );
      stats.calibrationRounds += 1;
    }

    const historyItem = {
      appId: String(round.appId || ""),
      name: String(round.name || "Unknown game"),
      guess: Number(round.guess) || 0,
      trueCount: Number(round.trueCount) || 0,
      score: Number(round.score) || 0,
      percentError: Number(round.percentError) || 0,
      hintCount: Number(round.hintCount) || 0,
      timedOut: Boolean(round.timedOut),
      timestamp: Date.now(),
    };
    history.unshift(historyItem);
    history.splice(50);

    if (
      session &&
      !session.complete &&
      String(session.appIds?.[session.index]) === historyItem.appId
    ) {
      session.results = Array.isArray(session.results)
        ? session.results
        : [];
      session.results.push(historyItem);
      session.index += 1;
      if (session.index >= session.appIds.length) {
        session.complete = true;
        session.completedAt = Date.now();
      }
    }

    await setLocal({ stats, history, session });
    return { stats, history, session };
  }

  ns.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  ns.DEFAULT_STATS = DEFAULT_STATS;
  ns.getSettings = getSettings;
  ns.getStats = getStats;
  ns.getHistory = getHistory;
  ns.getSession = getSession;
  ns.saveSession = saveSession;
  ns.clearSession = clearSession;
  ns.recordResult = recordResult;
})(window);
