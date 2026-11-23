import { monitoringMessage, siteOrigin } from "@phantom/shared";

const keyFor = (origin: string) => `monitoring:${origin}`;

async function getMonitoring(origin: string): Promise<boolean> {
  const key = keyFor(origin);
  const stored = await chrome.storage.local.get(key);
  return stored[key] === true;
}

chrome.action.onClicked.addListener(async () => {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.runtime.onMessage.addListener((untrusted: unknown, _sender, sendResponse) => {
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
  const operation = message.type === "GET_MONITORING"
    ? getMonitoring(message.origin)
    : chrome.storage.local.set({ [keyFor(message.origin)]: message.enabled }).then(() => message.enabled);
  operation.then((enabled) => sendResponse({ enabled }), () => sendResponse({ error: "Storage unavailable" }));
  return true;
});
