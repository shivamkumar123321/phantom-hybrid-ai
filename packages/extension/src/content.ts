import { monitoringKey, repairCommand, siteOrigin, type Diagnosis, type FailureView, type RepairState } from "@phantom/shared";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

type Failure = { link: HTMLAnchorElement; originalHref: string | null; originalOutline: string; originalOutlineOffset: string; originalUrl: string; diagnosis: Diagnosis; state: RepairState };

const origin = siteOrigin(location.href);
let enabled = false;
let failure: Failure | null = null;
let awaitingLinkNavigation = false;

function visibleState(): FailureView {
  if (!failure) return null;
  return { state: failure.state, diagnosis: failure.state === "suspected" ? null : failure.diagnosis };
}

function announce(): void {
  void chrome.runtime.sendMessage({ type: "FAILURE_UPDATED", origin }).catch(() => {});
}

function setOutline(link: HTMLAnchorElement, color: string): void {
  link.style.outline = `2px solid ${color}`;
  link.style.outlineOffset = "3px";
}

function observeClick(event: MouseEvent): void {
  if (!enabled || isSensitiveTarget(event.target)) return;
  void chrome.runtime.sendMessage({ type: "OBSERVED_INTERACTION", origin }).catch(() => {});
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (!(link instanceof HTMLAnchorElement)) return;
  if (failure?.link === link && failure.state === "pending") {
    awaitingLinkNavigation = true;
    window.setTimeout(() => { awaitingLinkNavigation = false; }, 1500);
    return;
  }
  if (!hasBrokenDestination(link)) return;
  const before = location.href;
  const beforeScroll = [scrollX, scrollY];
  let nearbyChange = false;
  const observer = new MutationObserver(() => { nearbyChange = true; });
  observer.observe(link.parentElement ?? link, { childList: true, characterData: true, subtree: true });
  window.setTimeout(() => {
    observer.disconnect();
    if (!enabled || !link.isConnected || failure?.state === "pending" || failure?.state === "verified" || (failure?.link === link && failure.state === "suspected")) return;
    if (nearbyChange || scrollX !== beforeScroll[0] || scrollY !== beforeScroll[1]) return;
    if (location.pathname !== new URL(before).pathname || (location.hash && location.hash !== "#" && location.hash !== new URL(before).hash)) return;
    if (failure && failure.link !== link) failure.link.style.outline = failure.originalOutline;
    failure = { link, originalHref: link.getAttribute("href"), originalOutline: link.style.outline, originalOutlineOffset: link.style.outlineOffset, originalUrl: location.href, diagnosis: diagnoseNavigation(link), state: "suspected" };
    setOutline(link, "#eab308");
    announce();
  }, 700);
}

function verifyNavigation(): void {
  if (!failure || failure.state !== "pending" || !awaitingLinkNavigation) return;
  const destination = knownDestination(failure.link);
  if (!destination) return;
  const expected = new URL(destination, failure.originalUrl);
  if (location.href !== expected.href) return;
  failure.state = "verified";
  awaitingLinkNavigation = false;
  setOutline(failure.link, "#16a34a");
  announce();
}

if (origin) {
  chrome.runtime.sendMessage({ type: "GET_MONITORING", origin }).then((state: { enabled?: boolean }) => {
    enabled = state.enabled === true;
  }).catch(() => { enabled = false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[monitoringKey(origin)]) enabled = changes[monitoringKey(origin)].newValue === true;
  });
  document.addEventListener("click", observeClick, true);
  window.addEventListener("hashchange", verifyNavigation);
  chrome.runtime.onMessage.addListener((untrusted: unknown, _sender, sendResponse) => {
    const parsed = repairCommand.safeParse(untrusted);
    if (!parsed.success) return false;
    if (parsed.data.type === "GET_FAILURE") { sendResponse(visibleState()); return false; }
    if (!failure || !failure.link.isConnected) { sendResponse({ error: "No active failure" }); return false; }
    if (!enabled && parsed.data.type !== "UNDO_REPAIR") { sendResponse({ error: "Monitoring is off" }); return false; }
    if (parsed.data.type === "INVESTIGATE") {
      failure.state = "preview";
    } else if (parsed.data.type === "APPLY_REPAIR") {
      if (failure.state !== "preview" || failure.diagnosis.action !== "RESTORE_NAVIGATION") { sendResponse({ error: "No safe repair" }); return false; }
      const destination = knownDestination(failure.link);
      if (!destination) { sendResponse({ error: "Destination is no longer available" }); return false; }
      failure.originalHref = failure.link.getAttribute("href");
      failure.originalUrl = location.href;
      failure.link.setAttribute("href", destination);
      failure.state = "pending";
      setOutline(failure.link, "#eab308");
    } else if (parsed.data.type === "UNDO_REPAIR") {
      if (failure.state !== "pending" && failure.state !== "verified") { sendResponse({ error: "Nothing to undo" }); return false; }
      if (failure.originalHref === null) failure.link.removeAttribute("href");
      else failure.link.setAttribute("href", failure.originalHref);
      const repairedDestination = knownDestination(failure.link);
      if (repairedDestination && location.href === new URL(repairedDestination, failure.originalUrl).href) history.replaceState(history.state, "", failure.originalUrl);
      failure.link.style.outline = failure.originalOutline;
      failure.link.style.outlineOffset = failure.originalOutlineOffset;
      failure.state = "undone";
      awaitingLinkNavigation = false;
    }
    sendResponse(visibleState());
    announce();
    return false;
  });
}
