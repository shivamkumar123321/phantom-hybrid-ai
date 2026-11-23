import {
  cloudConsentKey,
  companionResponse,
  DEFAULT_COMPANION_URL,
  interactionCountKey,
  isAllowedCompanionOrigin,
  monitoringKey,
  monitoringMessage,
  resolveDiagnosisOutcome,
  sanitizeEvidence,
  siteOrigin,
  UNAVAILABLE_AI_ENV,
  type CloudConsent,
  type CompanionRequest,
  type CompanionResponse,
} from "@phantom/shared";

let companionPort: chrome.runtime.Port | null = null;
let companionTabId: number | null = null;
let connectAttempt: Promise<chrome.runtime.Port | null> | null = null;
const connectWaiters: Array<(port: chrome.runtime.Port | null) => void> = [];
const pendingRequests = new Map<string, { resolve: (res: CompanionResponse | null) => void; timer: ReturnType<typeof setTimeout> }>();
const activeTabUrls = new Map<number, string>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) activeTabUrls.set(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabUrls.delete(tabId);
});

async function isTabCurrent(tabId?: number, expectedUrl?: string): Promise<boolean> {
  if (tabId === undefined || !expectedUrl) return true;
  const cached = activeTabUrls.get(tabId);
  if (cached && cached !== expectedUrl) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url === expectedUrl;
  } catch {
    return false;
  }
}

async function getMonitoring(origin: string): Promise<boolean> {
  const key = monitoringKey(origin);
  const stored = await chrome.storage.local.get(key);
  return stored[key] === true;
}

async function getCloudConsent(origin: string): Promise<CloudConsent> {
  const key = cloudConsentKey(origin);
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return value === "granted" || value === "denied" ? value : "ask";
}

function flushConnectWaiters(port: chrome.runtime.Port | null): void {
  while (connectWaiters.length > 0) connectWaiters.shift()?.(port);
}

chrome.runtime.onConnectExternal.addListener((port) => {
  const senderOrigin = port.sender?.origin ?? "";
  if (port.name !== "phantom-companion" || !isAllowedCompanionOrigin(senderOrigin)) {
    port.disconnect();
    return;
  }
  companionPort = port;
  companionTabId = port.sender?.tab?.id ?? null;
  flushConnectWaiters(port);

  port.onMessage.addListener((untrusted: unknown) => {
    const parsed = companionResponse.safeParse(untrusted);
    if (!parsed.success) return;
    const entry = pendingRequests.get(parsed.data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingRequests.delete(parsed.data.id);
    entry.resolve(parsed.data);
  });

  port.onDisconnect.addListener(() => {
    if (companionPort === port) {
      companionPort = null;
      companionTabId = null;
    }
    for (const [id, entry] of pendingRequests.entries()) {
      clearTimeout(entry.timer);
      pendingRequests.delete(id);
      entry.resolve(null);
    }
  });
});

async function findExistingCompanionTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => {
    const tabOrigin = siteOrigin(tab.url ?? "");
    return tabOrigin !== null && isAllowedCompanionOrigin(tabOrigin);
  }) ?? null;
}

async function ensureCompanionPort(openIfMissing: boolean): Promise<chrome.runtime.Port | null> {
  if (companionPort) return companionPort;
  if (!openIfMissing) return null;
  if (connectAttempt) return connectAttempt;
  connectAttempt = (async () => {
    try {
      const targetUrl = `${DEFAULT_COMPANION_URL}?ext=${chrome.runtime.id}`;
      const existing = await findExistingCompanionTab();
      if (existing?.id !== undefined) {
        companionTabId = existing.id;
        if (existing.url !== targetUrl) await chrome.tabs.update(existing.id, { url: targetUrl, active: false });
        else await chrome.tabs.reload(existing.id);
      } else {
        const created = await chrome.tabs.create({ url: targetUrl, active: false });
        companionTabId = created.id ?? null;
      }
      if (companionPort) return companionPort;
      return await new Promise<chrome.runtime.Port | null>((resolve) => {
        const timer = setTimeout(() => {
          const index = connectWaiters.indexOf(onReady);
          if (index >= 0) connectWaiters.splice(index, 1);
          resolve(companionPort);
        }, 1500);
        function onReady(port: chrome.runtime.Port | null): void {
          clearTimeout(timer);
          resolve(port);
        }
        connectWaiters.push(onReady);
      });
    } catch {
      return null;
    } finally {
      connectAttempt = null;
    }
  })();
  return connectAttempt;
}

function sendCompanionRequest(port: chrome.runtime.Port, request: CompanionRequest, timeoutMs = 5000): Promise<CompanionResponse | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(request.id);
      resolve(null);
    }, timeoutMs);
    pendingRequests.set(request.id, { resolve, timer });
    try {
      port.postMessage(request);
    } catch {
      clearTimeout(timer);
      pendingRequests.delete(request.id);
      resolve(null);
    }
  });
}

chrome.action.onClicked.addListener(async () => {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.runtime.onMessage.addListener((untrusted: unknown, sender, sendResponse) => {
  if (typeof untrusted === "object" && untrusted !== null && "type" in untrusted && untrusted.type === "FAILURE_UPDATED") {
    const claimedOrigin = "origin" in untrusted && typeof untrusted.origin === "string" ? untrusted.origin : null;
    if (sender.tab?.id !== undefined && claimedOrigin && siteOrigin(sender.tab.url ?? "") === claimedOrigin) {
      void chrome.runtime.sendMessage({ type: "FAILURE_NOTICE", tabId: sender.tab.id });
    }
    return false;
  }
  const parsed = monitoringMessage.safeParse(untrusted);
  if (!parsed.success) {
    sendResponse({ error: "Invalid request" });
    return false;
  }
  const message = parsed.data;
  if ("origin" in message && siteOrigin(message.origin) !== message.origin) {
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
  if (message.type === "GET_MONITORING") {
    getMonitoring(message.origin).then((enabled) => sendResponse({ enabled }), () => sendResponse({ error: "Storage unavailable" }));
    return true;
  }
  if (message.type === "SET_MONITORING") {
    chrome.storage.local.set({ [monitoringKey(message.origin)]: message.enabled }).then(() => sendResponse({ enabled: message.enabled }), () => sendResponse({ error: "Storage unavailable" }));
    return true;
  }
  if (message.type === "GET_CLOUD_CONSENT") {
    getCloudConsent(message.origin).then((consent) => sendResponse({ consent }), () => sendResponse({ error: "Storage unavailable" }));
    return true;
  }
  if (message.type === "SET_CLOUD_CONSENT") {
    chrome.storage.local.set({ [cloudConsentKey(message.origin)]: message.consent }).then(() => sendResponse({ consent: message.consent }), () => sendResponse({ error: "Storage unavailable" }));
    return true;
  }
  if (message.type === "GET_COMPANION_STATUS") {
    void (async () => {
      const port = await ensureCompanionPort(false);
      if (!port) { sendResponse({ connected: false, env: UNAVAILABLE_AI_ENV }); return; }
      const response = await sendCompanionRequest(port, { id: crypto.randomUUID(), type: "GET_AI_STATUS" }, 2000);
      if (response?.type === "AI_STATUS_RESPONSE") sendResponse({ connected: true, env: response.env });
      else sendResponse({ connected: false, env: UNAVAILABLE_AI_ENV });
    })();
    return true;
  }
  if (message.type === "RUN_DIAGNOSIS") {
    void (async () => {
      if (message.tabId !== undefined && message.tabUrl) activeTabUrls.set(message.tabId, message.tabUrl);
      const safeEvidence = sanitizeEvidence(message.evidence);
      const storedConsent = await getCloudConsent(safeEvidence.origin);
      const effectiveConsent = message.overrideConsent ?? storedConsent;
      const port = await ensureCompanionPort(true);
      if (!await isTabCurrent(message.tabId, message.tabUrl)) { sendResponse({ stale: true }); return; }
      if (port) {
        const reply = await sendCompanionRequest(port, {
          id: crypto.randomUUID(),
          type: "DIAGNOSE_REQUEST",
          evidence: safeEvidence,
          rulesFallback: message.rulesFallback,
          cloudConsent: effectiveConsent,
          cloudDecision: message.cloudDecision,
        });
        if (!await isTabCurrent(message.tabId, message.tabUrl)) { sendResponse({ stale: true }); return; }
        if (reply?.type === "DIAGNOSE_RESPONSE") {
          sendResponse({ outcome: reply.outcome, companionConnected: true });
          return;
        }
      }
      const outcome = await resolveDiagnosisOutcome({
        evidence: safeEvidence,
        rulesFallback: message.rulesFallback,
        env: UNAVAILABLE_AI_ENV,
        cloudConsent: effectiveConsent,
        cloudDecision: message.cloudDecision,
        runModel: async () => { throw new Error("Companion unavailable"); },
      });
      sendResponse({ outcome, companionConnected: false });
    })();
    return true;
  }
  return false;
});
