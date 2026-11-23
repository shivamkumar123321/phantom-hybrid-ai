import { interactionCountKey, monitoringKey, monitoringMessage, siteOrigin } from "@phantom/shared";

async function getMonitoring(origin: string): Promise<boolean> {
  const key = monitoringKey(origin);
  const stored = await chrome.storage.local.get(key);
  return stored[key] === true;
}

chrome.action.onClicked.addListener(async () => {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.runtime.onMessage.addListener((untrusted: unknown, sender, sendResponse) => {
  const parsed = monitoringMessage.safeParse(untrusted);
  if (!parsed.success) {
    sendResponse({ error: "Invalid monitoring request" });
    return false;
  }
  const message = parsed.data;
  if (siteOrigin(message.origin) !== message.origin) {
    sendResponse({ error: "Invalid site origin" });
    return false;
  }
  if (message.type === "OBSERVED_INTERACTION") {
    if (siteOrigin(sender.tab?.url ?? "") !== message.origin) {
      sendResponse({ error: "Wrong site" });
      return false;
    }
    void (async () => {
      if (!await getMonitoring(message.origin)) return;
      const key = interactionCountKey(message.origin);
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: (Number(stored[key]) || 0) + 1 });
    })();
    sendResponse({ received: true });
    return false;
  }
  const operation = message.type === "GET_MONITORING"
    ? getMonitoring(message.origin)
    : chrome.storage.local.set({ [monitoringKey(message.origin)]: message.enabled }).then(() => message.enabled);
  operation.then((enabled) => sendResponse({ enabled }), () => sendResponse({ error: "Storage unavailable" }));
  return true;
});
