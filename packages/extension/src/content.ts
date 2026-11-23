import {
  createHistoryEntry,
  createPipelineEvent,
  monitoringKey,
  repairCommand,
  sanitizeEvidence,
  siteOrigin,
  type Diagnosis,
  type EvidencePacket,
  type FailureKind,
  type FailureView,
  type InferenceSourceName,
  type PickerState,
  type PipelineRoute,
  type PipelineStage,
  type RepairState,
} from "@phantom/shared";
import { applyPointerEventsRepair, diagnoseBlockedButton, findBlockedButtonAtPoint, undoPointerEventsRepair, type PointerEventsSnapshot } from "./css-button";
import { applyImageFallback, diagnoseBrokenImage, isFailedImage, isImageFallbackLoaded, knownImageFallback, restoreImageSource, type OriginalImageSource } from "./broken-image";
import { applyFormButtonRepair, diagnoseFormButton, supportedFormButton, verifiesFormButton } from "./form-button";
import { buildShareableRecipe, resolveCommunityTarget } from "./community";
import { inspectPickedElement, resolvePickableTarget } from "./manual-picker";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

type Failure = {
  runId: string; repairId?: string; fromCommunity?: boolean;
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
  if (!failure || !failure.target.isConnected) return null;
  return {
    kind: failure.kind,
    state: failure.state,
    diagnosis: failure.state === "suspected" ? null : failure.diagnosis,
    repairId: failure.repairId ?? null,
    fromCommunity: failure.fromCommunity,
  };
}

function emitPipeline(
  current: Pick<Failure, "runId">,
  stage: PipelineStage,
  status: "done" | "waiting",
  detail: string,
  source: InferenceSourceName | null = null,
  route: PipelineRoute | null = null,
): void {
  if (!origin) return;
  const event = createPipelineEvent({ runId: current.runId, origin, stage, status, detail, route, source });
  void chrome.runtime.sendMessage({ type: "REPORT_PIPELINE_EVENT", event }).catch(() => {});
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
  failure = { runId: crypto.randomUUID(), kind, target, diagnosis, state: "suspected", originalOutline: target.style.outline, originalOutlineOffset: target.style.outlineOffset };
  outline(target, "#eab308");
  emitPipeline(failure, "detection", "done", `Suspected ${kind} failure detected`);
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
      runId: crypto.randomUUID(),
      kind: inspected.kind,
      target: inspected.target,
      diagnosis: inspected.diagnosis,
      state: "preview",
      ...preserved,
    };
    outline(inspected.target, "#7c3aed");
    emitPipeline(failure, "detection", "done", `Manually picked ${inspected.kind} element`);
    emitPipeline(failure, "evidence", "done", "Sanitized page metadata ready");
    emitPipeline(failure, "routing", "done", "Rules-only local pick", inspected.diagnosis.source, "RULES_ONLY");
    emitPipeline(failure, "diagnosis", "done", inspected.diagnosis.action, inspected.diagnosis.source, "RULES_ONLY");
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
  if (failure.repairId) {
    void chrome.runtime.sendMessage({ type: "UPDATE_REPAIR_HISTORY", id: failure.repairId, verificationResult: "verified" }).catch(() => {});
  }
  emitPipeline(failure, "verification", "done", "Verification Result: behavior restored", failure.diagnosis.source);
  emitPipeline(failure, "history", "done", "History updated: verified", failure.diagnosis.source);
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

function collectEvidence(current: Failure): EvidencePacket {
  const attributeNames = ["href", "data-href", "data-route", "data-url", "src", "data-fallback-src", "data-src", "srcset", "type", "role", "aria-label", "data-phantom-submit"] as const;
  const attributes: Record<string, string> = {};
  for (const name of attributeNames) {
    const value = current.target.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  if (current.kind === "css-button") attributes.pointerEvents = getComputedStyle(current.target).pointerEvents;
  const hasFormOrUserText = current.kind === "form-button"
    || Boolean(current.target.closest("form, [contenteditable='true']"))
    || current.target instanceof HTMLInputElement
    || current.target instanceof HTMLTextAreaElement
    || current.target instanceof HTMLSelectElement;
  const isField = current.target instanceof HTMLInputElement || current.target instanceof HTMLTextAreaElement || current.target instanceof HTMLSelectElement;
  const label = isField ? "" : (current.target.textContent ?? "").trim().slice(0, 60);
  const tag = current.target.tagName.toLowerCase();
  return sanitizeEvidence({
    origin: origin ?? location.origin,
    kind: current.kind,
    tagName: tag,
    role: current.target.getAttribute("role"),
    elementSummary: label ? `<${tag}> "${label}"` : `<${tag}>`,
    attributes,
    observedBehavior: current.diagnosis.reason,
    hasFormOrUserText,
    isComplex: current.kind === "manual",
    relatedElementCount: current.target.parentElement ? Math.max(1, Math.min(50, current.target.parentElement.children.length)) : 1,
  });
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
  current.repairId = crypto.randomUUID();
  outline(current.target, "#eab308");
  if (origin) {
    const entry = createHistoryEntry({
      id: current.repairId,
      origin,
      bugType: current.kind,
      timestamp: new Date().toISOString(),
      diagnosisSummary: current.diagnosis.reason,
      repairAction: current.diagnosis.action,
      source: current.diagnosis.source,
      verificationResult: "pending",
    });
    void chrome.runtime.sendMessage({ type: "RECORD_REPAIR_HISTORY", entry }).catch(() => {});
  }
  emitPipeline(current, "approval", "done", "User approved repair", current.diagnosis.source);
  emitPipeline(current, "repair", "done", `Applied ${current.diagnosis.action}`, current.diagnosis.source);
  emitPipeline(current, "verification", "waiting", "Waiting for Verification Result", current.diagnosis.source);
  emitPipeline(current, "history", "done", "Saved repair to local history", current.diagnosis.source);
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
  if (current.repairId) {
    void chrome.runtime.sendMessage({ type: "UPDATE_REPAIR_HISTORY", id: current.repairId, verificationResult: "undone" }).catch(() => {});
  }
  emitPipeline(current, "verification", "done", "Repair undone by user", current.diagnosis.source);
  emitPipeline(current, "history", "done", "History updated: undone", current.diagnosis.source);
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
    if (parsed.data.type === "APPLY_COMMUNITY_RECIPE") {
      if (!enabled || !origin) { sendResponse({ error: "Monitoring is off" }); return false; }
      if (failure?.state === "pending" || failure?.state === "verified") {
        sendResponse({ error: "Undo the active repair before applying a Repair Recipe." });
        return false;
      }
      const resolved = resolveCommunityTarget(document, origin, parsed.data.recipe);
      if (!resolved.ok) { sendResponse({ error: resolved.error }); return false; }
      const preserved = savedOutline(resolved.target);
      if (failure) restoreOutline(failure);
      failure = {
        runId: crypto.randomUUID(),
        fromCommunity: true,
        kind: resolved.kind,
        target: resolved.target,
        diagnosis: resolved.diagnosis,
        state: "preview",
        ...preserved,
      };
      emitPipeline(failure, "detection", "done", `Repair Recipe matched ${resolved.kind}`);
      emitPipeline(failure, "evidence", "done", "Verified local page metadata");
      emitPipeline(failure, "routing", "done", "Approved community Repair Recipe", "rules-only", "RULES_ONLY");
      emitPipeline(failure, "diagnosis", "done", resolved.diagnosis.action, "rules-only", "RULES_ONLY");
      const error = applyRepair(failure);
      if (error) { restoreOutline(failure); failure = null; sendResponse({ error }); return false; }
      sendResponse(visibleState());
      announce();
      return false;
    }
    if (!failure || !failure.target.isConnected) { sendResponse({ error: "No active failure" }); return false; }
    if (!enabled && parsed.data.type !== "UNDO_REPAIR") { sendResponse({ error: "Monitoring is off" }); return false; }
    if (parsed.data.type === "GET_SHAREABLE_RECIPE") {
      if (!origin || failure.state !== "verified" || failure.fromCommunity) {
        sendResponse({ error: "Verify a local repair before sharing a Repair Recipe." });
        return false;
      }
      const recipe = buildShareableRecipe({ origin, bugType: failure.kind, target: failure.target, diagnosis: failure.diagnosis });
      if (!recipe) { sendResponse({ error: "This repair cannot be shared safely." }); return false; }
      sendResponse({ recipe });
      return false;
    }
    if (parsed.data.type === "GET_EVIDENCE") {
      if (isSensitiveTarget(failure.target)) { sendResponse({ error: "Sensitive controls cannot be inspected or repaired." }); return false; }
      sendResponse({ evidence: collectEvidence(failure), rulesFallback: failure.diagnosis, runId: failure.runId });
      return false;
    }
    if (parsed.data.type === "SET_DIAGNOSIS") {
      failure.diagnosis = parsed.data.diagnosis;
      failure.state = "preview";
      outline(failure.target, "#7c3aed");
      sendResponse(visibleState());
      announce();
      return false;
    }
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
