function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Steam took too long to load."));
    }, 20000);
    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function startSessionOnSteam(message) {
  const tab = await chrome.tabs.create({
    active: true,
    url: "https://store.steampowered.com/app/570/",
  });
  if (!tab.id) throw new Error("Could not open Steam.");
  await waitForTab(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "start-session",
    sessionType: message.sessionType,
    roundCount: message.roundCount,
  });
  if (!response?.ok) throw new Error(response?.error || "Could not start the run.");
  return response;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open-popup") {
    chrome.action.openPopup()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "start-session-on-steam") {
    startSessionOnSteam(message)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
