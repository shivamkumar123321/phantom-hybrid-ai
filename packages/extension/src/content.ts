import { monitoringKey, repairCommand, siteOrigin, type Diagnosis, type FailureKind, type FailureView, type PickerState, type RepairState } from "@phantom/shared";
import { applyPointerEventsRepair, diagnoseBlockedButton, findBlockedButtonAtPoint, undoPointerEventsRepair, type PointerEventsSnapshot } from "./css-button";
import { applyImageFallback, diagnoseBrokenImage, isFailedImage, isImageFallbackLoaded, knownImageFallback, restoreImageSource, type OriginalImageSource } from "./broken-image";
import { applyFormButtonRepair, diagnoseFormButton, supportedFormButton, verifiesFormButton } from "./form-button";
import { inspectPickedElement, resolvePickableTarget } from "./manual-picker";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

type Failure = {
  kind: FailureKind; target: HTMLElement; diagnosis: Diagnosis; state: RepairState;
  originalOutline: string; originalOutlineOffset: string;
  originalHref?: string | null; originalUrl?: string;
  pointerSnapshot?: PointerEventsSnapshot; imageOriginal?: OriginalImageSource;
  formUndo?: () => void; fallback?: string;
};

const origin = siteOrigin(location.href);
let enabled = false;
let failure: Failure | null = null;
let awaitingInteraction = false;
let pendingClick: { target: HTMLElement; kind: FailureKind; diagnosis: Diagnosis } | null = null;
let picking = false;
let pickerNotice: string | null = null;
let hovered: { target: HTMLElement; originalOutline: string; originalOutlineOffset: string } | null = null;
let originalCursor: string | null = null;

function pickerState(): PickerState {
  return { active: picking, notice: pickerNotice };
}

function visibleState(): FailureView {
  if (!failure) return null;
  return { kind: failure.kind, state: failure.state, diagnosis: failure.state === "suspected" ? null : failure.diagnosis };
}

function announce(): void {
  void chrome.runtime.sendMessage({ type: "FAILURE_UPDATED", origin }).catch(() => {});
}

function outline(target: HTMLElement, color: string): void {
  target.style.outline = `2px solid ${color}`;
  target.style.outlineOffset = "3px";
}

function savedOutline(target: HTMLElement): { originalOutline: string; originalOutlineOffset: string } {
  return failure?.target === target
    ? { originalOutline: failure.originalOutline, originalOutlineOffset: failure.originalOutlineOffset }
    : { originalOutline: target.style.outline, originalOutlineOffset: target.style.outlineOffset };
}

function clearHover(): void {
  if (!hovered) return;
  const { target, originalOutline, originalOutlineOffset } = hovered;
  hovered = null;
  if (failure?.target === target && failure.state !== "undone") {
    outline(target, failure.state === "verified" ? "#16a34a" : failure.state === "preview" ? "#7c3aed" : "#eab308");
    return;
  }
  target.style.outline = originalOutline;
  target.style.outlineOffset = originalOutlineOffset;
}

function highlightHover(target: HTMLElement): void {
  if (isSensitiveTarget(target)) { clearHover(); return; }
  if (hovered?.target === target) return;
  clearHover();
  hovered = { target, ...savedOutline(target) };
  outline(target, "#7c3aed");
}

function startPicking(): void {
  picking = true;
  pickerNotice = "Click a broken element on the page, or press Escape to cancel.";
  if (originalCursor === null) originalCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = "crosshair";
  announce();
}

function stopPicking(notice: string | null): void {
  picking = false;
  pickerNotice = notice;
  clearHover();
  if (originalCursor !== null) {
    document.documentElement.style.cursor = originalCursor;
    originalCursor = null;
  }
  announce();
}

function suspect(kind: FailureKind, target: HTMLElement, diagnosis: Diagnosis): void {
  if (!enabled || !target.isConnected || isSensitiveTarget(target)) return;
  if (failure?.state === "pending" || failure?.state === "verified") return;
  if (failure?.target === target && failure.state !== "undone") return;
  if (failure) restoreOutline(failure);
  failure = { kind, target, diagnosis, state: "suspected", originalOutline: target.style.outline, originalOutlineOffset: target.style.outlineOffset };
  outline(target, "#eab308");
  announce();
}

function restoreOutline(current: Failure): void {
  current.target.style.outline = current.originalOutline;
  current.target.style.outlineOffset = current.originalOutlineOffset;
}

function afterQuietClick(target: HTMLElement, kind: FailureKind, diagnosis: Diagnosis): void {
  const candidate = { target, kind, diagnosis };
  pendingClick = candidate;
  const before = location.href;
  const beforeScroll = [scrollX, scrollY];
  let nearbyChange = false;
  const observer = new MutationObserver(() => { nearbyChange = true; });
  observer.observe(target.parentElement ?? target, { childList: true, characterData: true, subtree: true });
  window.setTimeout(() => {
    observer.disconnect();
    if (pendingClick === candidate) pendingClick = null;
    if (nearbyChange || (kind !== "navigation" && (scrollX !== beforeScroll[0] || scrollY !== beforeScroll[1]))) return;
    const prior = new URL(before);
    if (location.pathname !== prior.pathname || (location.hash && location.hash !== "#" && location.hash !== prior.hash)) return;
    suspect(kind, target, diagnosis);
  }, 700);
}

function watchRepairedClick(target: HTMLElement): void {
  awaitingInteraction = true;
  window.setTimeout(() => { awaitingInteraction = false; }, 1500);
  if (failure?.kind !== "css-button") return;
  const outcome = expectedOutcome(target);
  const before = outcome?.textContent;
  window.setTimeout(() => {
    if (outcome && outcome.textContent !== before && failure?.target === target && failure.state === "pending") verify();
  }, 700);
}

function expectedOutcome(target: HTMLElement): Element | null {
  const selector = target.getAttribute("data-phantom-outcome");
  if (!selector) return null;
  try { return target.ownerDocument.querySelector(selector); } catch { return null; }
}

function observeClick(event: MouseEvent): void {
  if (picking) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const target = resolvePickableTarget(event.target, event.clientX, event.clientY);
    if (!target) return;
    const inspected = inspectPickedElement(target);
    if (inspected.blocked) {
      pickerNotice = inspected.reason;
      clearHover();
      announce();
      return;
    }
    stopPicking(null);
    const preserved = savedOutline(inspected.target);
    if (failure && failure.target !== inspected.target) restoreOutline(failure);
    failure = {
      kind: inspected.kind,
      target: inspected.target,
      diagnosis: inspected.diagnosis,
      state: "preview",
      ...preserved,
    };
    outline(inspected.target, "#7c3aed");
    announce();
    return;
  }
  if (!enabled || isSensitiveTarget(event.target)) return;
  void chrome.runtime.sendMessage({ type: "OBSERVED_INTERACTION", origin }).catch(() => {});
  const direct = event.target instanceof Element ? event.target.closest("a, button") : null;
  if (failure?.state === "pending" && direct === failure.target) { watchRepairedClick(failure.target); return; }
  const blocked = findBlockedButtonAtPoint(event.target, event.clientX, event.clientY);
  if (blocked && !isSensitiveTarget(blocked)) { afterQuietClick(blocked, "css-button", diagnoseBlockedButton()); return; }
  if (direct instanceof HTMLAnchorElement && hasBrokenDestination(direct)) {
    afterQuietClick(direct, "navigation", diagnoseNavigation(direct));
  } else {
    const button = supportedFormButton(event.target);
    if (button) afterQuietClick(button, "form-button", diagnoseFormButton(button));
  }
}

function verify(): void {
  if (!failure || failure.state !== "pending" || !awaitingInteraction) return;
  failure.state = "verified";
  awaitingInteraction = false;
  outline(failure.target, "#16a34a");
  announce();
}

function verifyNavigation(): void {
  if (failure?.kind !== "navigation" || failure.state !== "pending" || !awaitingInteraction) return;
  const destination = knownDestination(failure.target as HTMLAnchorElement);
  if (destination && location.href === new URL(destination, failure.originalUrl).href) verify();
}

function observeImage(event: Event): void {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !enabled || isSensitiveTarget(image)) return;
  if (event.type === "error" && isFailedImage(image)) suspect("image", image, diagnoseBrokenImage(image));
  if (event.type === "load" && failure?.target === image && failure.state === "pending" && failure.fallback && isImageFallbackLoaded(image, failure.fallback)) {
    awaitingInteraction = true;
    verify();
  }
}

function scanFailedImages(): void {
  if (!enabled) return;
  for (const image of [...document.images].slice(0, 100)) {
    if (isFailedImage(image) && !isSensitiveTarget(image)) { suspect("image", image, diagnoseBrokenImage(image)); break; }
  }
}

function applyRepair(current: Failure): string | null {
  if (current.state !== "preview" || current.diagnosis.action === "NO_SAFE_REPAIR") return "No safe repair is available";
  if (current.kind === "navigation") {
    const link = current.target as HTMLAnchorElement;
    const destination = knownDestination(link);
    if (!destination) return "No trusted destination";
    current.originalHref = link.getAttribute("href");
    current.originalUrl = location.href;
    link.setAttribute("href", destination);
  } else if (current.kind === "css-button") {
    current.pointerSnapshot = applyPointerEventsRepair(current.target as HTMLButtonElement);
  } else if (current.kind === "image") {
    const image = current.target as HTMLImageElement;
    current.fallback = knownImageFallback(image) ?? undefined;
    current.imageOriginal = applyImageFallback(image) ?? undefined;
    if (!current.imageOriginal) return "No trusted backup image";
  } else if (current.kind === "form-button") {
    current.formUndo = applyFormButtonRepair(current.target as HTMLButtonElement) ?? undefined;
    if (!current.formUndo) return "Form is not safe to repair";
  }
  current.state = "pending";
  outline(current.target, "#eab308");
  return null;
}

function undoRepair(current: Failure): string | null {
  if (current.state !== "pending" && current.state !== "verified") return "Nothing to undo";
  if (current.kind === "navigation") {
    const link = current.target as HTMLAnchorElement;
    const destination = knownDestination(link);
    if (current.originalHref === null) link.removeAttribute("href");
    else if (current.originalHref !== undefined) link.setAttribute("href", current.originalHref);
    if (destination && location.href === new URL(destination, current.originalUrl).href) history.replaceState(history.state, "", current.originalUrl);
  } else if (current.kind === "css-button" && current.pointerSnapshot) {
    undoPointerEventsRepair(current.target as HTMLButtonElement, current.pointerSnapshot);
  } else if (current.kind === "image" && current.imageOriginal) {
    restoreImageSource(current.target as HTMLImageElement, current.imageOriginal);
  } else if (current.kind === "form-button") current.formUndo?.();
  restoreOutline(current);
  current.state = "undone";
  awaitingInteraction = false;
  return null;
}

if (origin) {
  chrome.runtime.sendMessage({ type: "GET_MONITORING", origin }).then((state: { enabled?: boolean }) => {
    enabled = state.enabled === true;
    scanFailedImages();
  }).catch(() => { enabled = false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[monitoringKey(origin)]) {
      enabled = changes[monitoringKey(origin)].newValue === true;
      if (!enabled && picking) stopPicking(null);
      scanFailedImages();
    }
  });
  document.addEventListener("pointermove", (event) => {
    if (!picking) return;
    const target = resolvePickableTarget(event.target, event.clientX, event.clientY);
    if (target) highlightHover(target);
    else clearHover();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (picking && event.key === "Escape") {
      event.preventDefault();
      stopPicking("Element picking cancelled.");
    }
  }, true);
  document.addEventListener("click", observeClick, true);
  document.addEventListener("error", observeImage, true);
  document.addEventListener("load", observeImage, true);
  window.addEventListener("error", (event) => {
    if (!(event instanceof ErrorEvent) || !pendingClick) return;
    const candidate = pendingClick;
    pendingClick = null;
    suspect(candidate.kind, candidate.target, candidate.diagnosis);
  });
  document.addEventListener("submit", (event) => {
    if (failure?.kind !== "form-button" || !awaitingInteraction || !verifiesFormButton(event as SubmitEvent, failure.target as HTMLButtonElement)) return;
    const outcome = expectedOutcome(failure.target);
    const before = outcome?.textContent;
    window.setTimeout(() => { if (outcome && outcome.textContent !== before) verify(); }, 0);
  }, true);
  window.addEventListener("hashchange", verifyNavigation);
  chrome.runtime.onMessage.addListener((untrusted: unknown, _sender, sendResponse) => {
    const parsed = repairCommand.safeParse(untrusted);
    if (!parsed.success) return false;
    if (parsed.data.type === "GET_FAILURE") { sendResponse(visibleState()); return false; }
    if (parsed.data.type === "GET_PICKER_STATE") { sendResponse(pickerState()); return false; }
    if (parsed.data.type === "START_PICKING") {
      if (!enabled) { sendResponse({ error: "Monitoring is off" }); return false; }
      if (failure?.state === "pending" || failure?.state === "verified") {
        pickerNotice = "Undo the active repair before picking another element.";
        sendResponse(pickerState());
        return false;
      }
      startPicking();
      sendResponse(pickerState());
      return false;
    }
    if (parsed.data.type === "CANCEL_PICKING") {
      if (picking) stopPicking("Element picking cancelled.");
      sendResponse(pickerState());
      return false;
    }
    if (!failure || !failure.target.isConnected) { sendResponse({ error: "No active failure" }); return false; }
    if (!enabled && parsed.data.type !== "UNDO_REPAIR") { sendResponse({ error: "Monitoring is off" }); return false; }
    if (parsed.data.type === "INVESTIGATE") failure.state = "preview";
    else {
      const error = parsed.data.type === "APPLY_REPAIR" ? applyRepair(failure) : undoRepair(failure);
      if (error) { sendResponse({ error }); return false; }
    }
    sendResponse(visibleState());
    announce();
    return false;
  });
}
