import { interactionCountKey, siteOrigin, type FailureView, type PickerState } from "@phantom/shared";

const site = document.querySelector<HTMLElement>("#site")!;
const status = document.querySelector<HTMLElement>("#status")!;
const monitor = document.querySelector<HTMLInputElement>("#monitor")!;
const pick = document.querySelector<HTMLButtonElement>("#pick")!;
const cancelPick = document.querySelector<HTMLButtonElement>("#cancel-pick")!;
const pickerStatus = document.querySelector<HTMLElement>("#picker-status")!;
const failureSection = document.querySelector<HTMLElement>("#failure")!;
const failureStatus = document.querySelector<HTMLElement>("#failure-status")!;
const diagnosisSection = document.querySelector<HTMLElement>("#diagnosis")!;
const investigate = document.querySelector<HTMLButtonElement>("#investigate")!;
const apply = document.querySelector<HTMLButtonElement>("#apply")!;
const undo = document.querySelector<HTMLButtonElement>("#undo")!;
let currentOrigin: string | null = null;
let currentTabId: number | null = null;

function renderFailure(view: FailureView): void {
  failureSection.hidden = !view || view.state === "undone";
  if (!view || view.state === "undone") return;
  const names = { navigation: "link", "css-button": "button", image: "image", "form-button": "form button", manual: "element" };
  const pending: Partial<Record<typeof view.kind, string>> = { navigation: "Click the link to verify navigation.", "css-button": "Click the button to verify its action.", image: "Waiting for the backup image to load.", "form-button": "Click the form button to verify submission." };
  const verified: Partial<Record<typeof view.kind, string>> = { navigation: "navigation worked.", "css-button": "the button action worked.", image: "the backup image loaded.", "form-button": "the form handled submission." };
  const previewText = view.diagnosis?.action === "NO_SAFE_REPAIR"
    ? "Diagnosis complete. No safe repair is available."
    : "Review the proposed repair before applying it.";
  const labels = {
    suspected: `A ${names[view.kind]} may be broken. Investigate to see a safe option.`,
    preview: previewText,
    pending: `Repair applied. ${pending[view.kind] ?? ""}`,
    verified: `Verification Result: ${verified[view.kind] ?? ""}`,
    undone: "",
  };
  failureStatus.textContent = labels[view.state];
  investigate.hidden = view.state !== "suspected";
  diagnosisSection.hidden = !view.diagnosis;
  apply.hidden = view.state !== "preview" || !view.diagnosis || view.diagnosis.action === "NO_SAFE_REPAIR";
  undo.hidden = view.state !== "pending" && view.state !== "verified";
  if (view.diagnosis) {
    document.querySelector<HTMLElement>("#reason")!.textContent = `What went wrong: ${view.diagnosis.reason}`;
    document.querySelector<HTMLElement>("#confidence")!.textContent = `Confidence: ${Math.round(view.diagnosis.confidence * 100)}%`;
    document.querySelector<HTMLElement>("#source")!.textContent = `Diagnosis source: ${view.diagnosis.source}`;
    document.querySelector<HTMLElement>("#action")!.textContent = `Repair Action: ${view.diagnosis.action}`;
    document.querySelector<HTMLElement>("#safety")!.textContent = `Why it is safe: ${view.diagnosis.safety}`;
  }
}

function renderPicker(state: PickerState | null): void {
  const active = state?.active === true;
  pick.hidden = active;
  pick.disabled = !monitor.checked || !currentOrigin;
  cancelPick.hidden = !active;
  pickerStatus.textContent = state?.notice ?? "";
}

async function queryTabState<T>(type: "GET_FAILURE" | "GET_PICKER_STATE", applyState: (value: T | null) => void): Promise<void> {
  const tabId = currentTabId;
  if (tabId === null) { applyState(null); return; }
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type }) as T;
    if (currentTabId === tabId) applyState(state);
  } catch { if (currentTabId === tabId) applyState(null); }
}

async function sendTabCommand<T>(type: "INVESTIGATE" | "APPLY_REPAIR" | "UNDO_REPAIR" | "START_PICKING" | "CANCEL_PICKING", applyState: (value: T) => void, onError: () => void): Promise<void> {
  if (currentTabId === null) return;
  try {
    const result = await chrome.tabs.sendMessage(currentTabId, { type });
    if (result?.error) throw new Error(result.error);
    applyState(result as T);
  } catch { onError(); }
}

const refreshFailure = () => queryTabState<FailureView>("GET_FAILURE", renderFailure);
const refreshPicker = () => queryTabState<PickerState>("GET_PICKER_STATE", renderPicker);

investigate.addEventListener("click", () => { void sendTabCommand("INVESTIGATE", renderFailure, () => { failureStatus.textContent = "Could not complete that action. Try again."; }); });
apply.addEventListener("click", () => { void sendTabCommand("APPLY_REPAIR", renderFailure, () => { failureStatus.textContent = "Could not complete that action. Try again."; }); });
undo.addEventListener("click", () => { void sendTabCommand("UNDO_REPAIR", renderFailure, () => { failureStatus.textContent = "Could not complete that action. Try again."; }); });
pick.addEventListener("click", () => { void sendTabCommand("START_PICKING", renderPicker, () => { pickerStatus.textContent = "Could not update element picking. Reload the page and try again."; }); });
cancelPick.addEventListener("click", () => { void sendTabCommand("CANCEL_PICKING", renderPicker, () => { pickerStatus.textContent = "Could not update element picking. Reload the page and try again."; }); });

async function showStatus(origin: string, enabled: boolean): Promise<void> {
  if (!enabled) { status.textContent = "Monitoring is off for this site."; return; }
  const key = interactionCountKey(origin);
  const stored = await chrome.storage.local.get(key);
  if (currentOrigin === origin) status.textContent = `Monitoring is on. ${Number(stored[key]) || 0} safe interactions observed.`;
}

async function refresh(): Promise<void> {
  monitor.disabled = true;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tab = tabs.find((candidate) => candidate.active && siteOrigin(candidate.url ?? ""))
    ?? tabs.find((candidate) => siteOrigin(candidate.url ?? ""));
  currentTabId = tab?.id ?? null;
  currentOrigin = siteOrigin(tab?.url ?? "");
  if (!currentOrigin) {
    site.textContent = "This page cannot be monitored.";
    status.textContent = "Open a website to enable monitoring.";
    monitor.checked = false;
    renderPicker(null);
    renderFailure(null);
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
    await refreshFailure();
    await refreshPicker();
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
      await refreshFailure();
      await refreshPicker();
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
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message === "object" && message !== null && "type" in message && message.type === "FAILURE_NOTICE" && "tabId" in message && message.tabId === currentTabId) {
    void refreshFailure();
    void refreshPicker();
  }
});
void refresh();
