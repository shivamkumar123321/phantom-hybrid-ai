import { siteOrigin } from "@phantom/shared";

const site = document.querySelector<HTMLElement>("#site")!;
const status = document.querySelector<HTMLElement>("#status")!;
const monitor = document.querySelector<HTMLInputElement>("#monitor")!;
let currentOrigin: string | null = null;

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
    status.textContent = monitor.checked ? "Monitoring is on for this site." : "Monitoring is off for this site.";
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
      status.textContent = response.enabled ? "Monitoring is on for this site." : "Monitoring is off for this site.";
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
void refresh();
