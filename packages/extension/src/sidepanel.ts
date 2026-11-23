import { interactionCountKey, siteOrigin } from "@phantom/shared";

const site = document.querySelector<HTMLElement>("#site")!;
const status = document.querySelector<HTMLElement>("#status")!;
const monitor = document.querySelector<HTMLInputElement>("#monitor")!;
let currentOrigin: string | null = null;

async function showStatus(origin: string, enabled: boolean): Promise<void> {
  if (!enabled) { status.textContent = "Monitoring is off for this site."; return; }
  const key = interactionCountKey(origin);
  const stored = await chrome.storage.local.get(key);
  if (currentOrigin === origin) status.textContent = `Monitoring is on. ${Number(stored[key]) || 0} safe interactions observed.`;
}

async function refresh(): Promise<void> {
  monitor.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentOrigin = siteOrigin(tab?.url ?? "");
  if (!currentOrigin) {
    site.textContent = "This page cannot be monitored.";
    status.textContent = "Open a website to enable monitoring.";
    monitor.checked = false;
    return;
  }
  const requestedOrigin = currentOrigin;
  site.textContent = requestedOrigin;
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_MONITORING", origin: requestedOrigin });
    if (currentOrigin !== requestedOrigin) return;
    monitor.checked = response.enabled === true;
    monitor.disabled = false;
    await showStatus(requestedOrigin, monitor.checked);
  } catch {
    status.textContent = "Could not read monitoring settings.";
  }
}

monitor.addEventListener("change", async () => {
  const origin = currentOrigin;
  if (!origin) return;
  monitor.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "SET_MONITORING", origin, enabled: monitor.checked });
    if (response.error) throw new Error(response.error);
    if (currentOrigin === origin) {
      await showStatus(origin, response.enabled === true);
    }
  } catch {
    status.textContent = "Could not save monitoring settings.";
    await refresh();
    return;
  }
  if (currentOrigin === origin) monitor.disabled = false;
});

chrome.tabs.onActivated.addListener(() => { void refresh(); });
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url) void refresh(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && currentOrigin && changes[interactionCountKey(currentOrigin)]) void showStatus(currentOrigin, monitor.checked);
});
void refresh();
