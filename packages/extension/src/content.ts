import {
  createHistoryEntry,
  createPipelineEvent,
  isAllowedCompanionOrigin,
  monitoringKey,
  repairCommand,
  sanitizeEvidence,
  siteOrigin,
  type Diagnosis,
  type EvidencePacket,
  type FailureKind,
  type FailureView,
  type InferenceSourceName,
  type PageIssueSummary,
  type PickerState,
  type PipelineRoute,
  type PipelineStage,
  type RepairState,
} from "@phantom/shared";
import { applyImageFallback, applyImagePlaceholder, diagnoseBrokenImage, isFailedImage, isImageFallbackLoaded, knownImageFallback, restoreImageSource, type OriginalImageSource } from "./broken-image";
import { applyPointerEventsRepair, diagnoseBlockedButton, findBlockedButtonAtPoint, undoPointerEventsRepair, type PointerEventsSnapshot } from "./css-button";
import { applyFormButtonRepair, diagnoseFormButton, supportedFormButton, verifiesFormButton } from "./form-button";
import { buildShareableRecipe, resolveCommunityTarget } from "./community";
import { inspectPickedElement, resolvePickableTarget } from "./manual-picker";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";
import { describeIssueTarget, scanPageForIssues } from "./scanner";
import { isSensitiveTarget } from "./sensitive";

type Failure = {
  id: string;
  runId: string;
  repairId?: string;
  fromCommunity?: boolean;
  kind: FailureKind;
  target: HTMLElement;
  label: string;
  diagnosis: Diagnosis;
  state: RepairState;
  originalOutline: string;
  originalOutlineOffset: string;
  originalHref?: string | null;
  originalUrl?: string;
  pointerSnapshot?: PointerEventsSnapshot;
  imageOriginal?: OriginalImageSource;
  formUndo?: () => void;
  fallback?: string;
};

const origin = siteOrigin(location.href);
let enabled = false;
let failure: Failure | null = null;
const pageIssues = new Map<string, Failure>();
const elementIssueIds = new WeakMap<HTMLElement, string>();
const recentlyUndone = new WeakSet<HTMLElement>();
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let domObserver: MutationObserver | null = null;
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

function summarizePageIssues(): PageIssueSummary[] {
  const summaries: PageIssueSummary[] = [];
  for (const [id, issue] of pageIssues.entries()) {
    if (!issue.target.isConnected) {
      pageIssues.delete(id);
      continue;
    }
    summaries.push({
      id,
      kind: issue.kind,
      label: issue.label,
      reason: issue.diagnosis.reason,
      action: issue.diagnosis.action,
      state: issue.state,
      canAutoRepair: issue.diagnosis.action !== "NO_SAFE_REPAIR",
      repairId: issue.repairId ?? null,
    });
  }
  return summaries;
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
  const existingId = elementIssueIds.get(target);
  const existing = existingId ? pageIssues.get(existingId) : undefined;
  if (existing) {
    return { originalOutline: existing.originalOutline, originalOutlineOffset: existing.originalOutlineOffset };
  }
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

function upsertPageIssue(input: {
  kind: FailureKind;
  target: HTMLElement;
  diagnosis: Diagnosis;
  label?: string;
  state?: RepairState;
  fromCommunity?: boolean;
}): Failure {
  const existingId = elementIssueIds.get(input.target);
  const existing = existingId ? pageIssues.get(existingId) : undefined;
  if (existing && existing.target.isConnected) {
    if (existing.state === "undone" && input.state) {
      existing.kind = input.kind;
      existing.diagnosis = input.diagnosis;
      existing.state = input.state;
      existing.fromCommunity = input.fromCommunity;
      existing.runId = crypto.randomUUID();
    }
    return existing;
  }
  const id = crypto.randomUUID();
  const created: Failure = {
    id,
    runId: crypto.randomUUID(),
    fromCommunity: input.fromCommunity,
    kind: input.kind,
    target: input.target,
    label: input.label ?? describeIssueTarget(input.target, input.kind),
    diagnosis: input.diagnosis,
    state: input.state ?? "suspected",
    ...savedOutline(input.target),
  };
  pageIssues.set(id, created);
  elementIssueIds.set(input.target, id);
  return created;
}

function focusIssue(targetIssue: Failure): void {
  if (failure && failure !== targetIssue && failure.state === "suspected") {
    restoreOutline(failure);
  }
  failure = targetIssue;
  outline(
    targetIssue.target,
    targetIssue.state === "verified" ? "#16a34a" : targetIssue.state === "preview" ? "#7c3aed" : "#eab308",
  );
}

function suspect(kind: FailureKind, target: HTMLElement, diagnosis: Diagnosis): void {
  if (!enabled || !target.isConnected || isSensitiveTarget(target)) return;
  if (failure?.state === "pending" || failure?.state === "verified") return;
  if (failure?.target === target && failure.state !== "undone") return;
  if (failure && failure.state !== "undone") restoreOutline(failure);
  const issue = upsertPageIssue({ kind, target, diagnosis, state: "suspected" });
  issue.kind = kind;
  issue.diagnosis = diagnosis;
  issue.state = "suspected";
  focusIssue(issue);
  emitPipeline(issue, "detection", "done", `Suspected ${kind} failure detected`);
  announce();
}

function restoreOutline(current: Failure): void {
  current.target.style.outline = current.originalOutline;
  current.target.style.outlineOffset = current.originalOutlineOffset;
}

function refreshPageScan(options: { autoSelectImages?: boolean; notify?: boolean } = {}): PageIssueSummary[] {
  if (!enabled) return [];
  const discovered = scanPageForIssues(document);
  let firstNewImage: Failure | null = null;
  let changed = false;

  for (const item of discovered) {
    const existed = elementIssueIds.has(item.target);
    const issue = upsertPageIssue(item);
    if (!existed) {
      changed = true;
      emitPipeline(issue, "detection", "done", `Suspected ${item.kind} failure detected`);
      if (item.kind === "image" && !firstNewImage) firstNewImage = issue;
    }
  }

  if (options.autoSelectImages && firstNewImage && (!failure || !failure.target.isConnected || failure.state === "undone")) {
    focusIssue(firstNewImage);
    changed = true;
  }

  if (changed || options.notify) announce();
  return summarizePageIssues();
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
  const current = failure;
  if (!current || current.kind !== "css-button") return;
  const outcome = expectedOutcome(target);
  if (outcome) {
    const before = outcome.textContent;
    window.setTimeout(() => {
      if (outcome.textContent !== before && current.target === target && current.state === "pending") verifyIssue(current);
    }, 700);
    return;
  }
  const beforeHref = location.href;
  let mutated = false;
  const observer = new MutationObserver(() => { mutated = true; });
  observer.observe(document.body ?? target, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-pressed", "aria-checked", "aria-selected", "hidden", "open", "class"],
  });
  window.setTimeout(() => {
    observer.disconnect();
    if (current.target === target && current.state === "pending" && (mutated || location.href !== beforeHref)) {
      verifyIssue(current);
    }
  }, 300);
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
    if (failure && failure.target !== inspected.target) restoreOutline(failure);
    const issue = upsertPageIssue({
      kind: inspected.kind,
      target: inspected.target,
      diagnosis: inspected.diagnosis,
      state: "preview",
    });
    issue.kind = inspected.kind;
    issue.diagnosis = inspected.diagnosis;
    issue.state = "preview";
    focusIssue(issue);
    emitPipeline(issue, "detection", "done", `Manually picked ${inspected.kind} element`);
    emitPipeline(issue, "evidence", "done", "Sanitized page metadata ready");
    emitPipeline(issue, "routing", "done", "Rules-only local pick", inspected.diagnosis.source, "RULES_ONLY");
    emitPipeline(issue, "diagnosis", "done", inspected.diagnosis.action, inspected.diagnosis.source, "RULES_ONLY");
    announce();
    return;
  }
  if (!enabled || isSensitiveTarget(event.target)) return;
  void chrome.runtime.sendMessage({ type: "OBSERVED_INTERACTION", origin }).catch(() => {});
  const direct = event.target instanceof Element
    ? event.target.closest('a, button, input[type="button"], input[type="submit"], [role="button"]')
    : null;
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

function verifyIssue(targetIssue: Failure): void {
  if (targetIssue.state !== "pending") return;
  targetIssue.state = "verified";
  if (failure === targetIssue) awaitingInteraction = false;
  outline(targetIssue.target, "#16a34a");
  if (targetIssue.repairId) {
    void chrome.runtime.sendMessage({ type: "UPDATE_REPAIR_HISTORY", id: targetIssue.repairId, verificationResult: "verified" }).catch(() => {});
  }
  emitPipeline(targetIssue, "verification", "done", "Verification Result: behavior restored", targetIssue.diagnosis.source);
  emitPipeline(targetIssue, "history", "done", "History updated: verified", targetIssue.diagnosis.source);
  announce();
}

function verify(): void {
  if (!failure || failure.state !== "pending" || !awaitingInteraction) return;
  verifyIssue(failure);
}

function verifyNavigation(): void {
  if (failure?.kind !== "navigation" || failure.state !== "pending" || !awaitingInteraction) return;
  const destination = knownDestination(failure.target as HTMLAnchorElement);
  if (destination && location.href === new URL(destination, failure.originalUrl).href) verify();
}

function observeImage(event: Event): void {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !enabled || isSensitiveTarget(image)) return;
  if (event.type === "error" && isFailedImage(image)) {
    if (recentlyUndone.has(image)) return;
    suspect("image", image, diagnoseBrokenImage(image));
    return;
  }
  if (event.type === "load") {
    const issueId = elementIssueIds.get(image);
    const issue = (issueId ? pageIssues.get(issueId) : undefined) ?? (failure?.target === image ? failure : undefined);
    if (issue && issue.state === "pending" && issue.fallback && isImageFallbackLoaded(image, issue.fallback)) {
      verifyIssue(issue);
    }
  }
}

function collectEvidence(current: Failure): EvidencePacket {
  const attributeNames = ["href", "data-href", "data-route", "data-url", "data-to", "data-link", "src", "data-fallback-src", "data-src", "data-lazy-src", "data-original", "data-srcset", "srcset", "type", "role", "aria-label", "data-phantom-submit"] as const;
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
    current.pointerSnapshot = applyPointerEventsRepair(current.target);
  } else if (current.kind === "image") {
    const image = current.target as HTMLImageElement;
    if (current.diagnosis.action === "REPLACE_BROKEN_IMAGE_PLACEHOLDER") {
      const applied = applyImagePlaceholder(image);
      current.fallback = applied.placeholder;
      current.imageOriginal = applied.original;
    } else {
      current.fallback = knownImageFallback(image) ?? undefined;
      current.imageOriginal = applyImageFallback(image) ?? undefined;
      if (!current.imageOriginal) return "No trusted backup image";
    }
  } else if (current.kind === "form-button") {
    current.formUndo = applyFormButtonRepair(current.target as HTMLButtonElement) ?? undefined;
    if (!current.formUndo) return "Form is not safe to repair";
  }
  current.state = "pending";
  current.repairId = crypto.randomUUID();
  outline(current.target, "#eab308");
  if (origin && isAllowedCompanionOrigin(origin)) {
  document.documentElement.dataset.phantomExtId = chrome.runtime.id;
  window.dispatchEvent(new CustomEvent("phantom-extension-ready", { detail: { extensionId: chrome.runtime.id } }));
} else if (origin) {
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

  if (current.kind === "image" && current.diagnosis.action === "REPLACE_BROKEN_IMAGE_PLACEHOLDER" && current.fallback) {
    const placeholder = current.fallback;
    const image = current.target as HTMLImageElement;
    window.setTimeout(() => {
      if (current.state === "pending" && isImageFallbackLoaded(image, placeholder)) verifyIssue(current);
    }, 50);
  }
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
    undoPointerEventsRepair(current.target, current.pointerSnapshot);
  } else if (current.kind === "image" && current.imageOriginal) {
    restoreImageSource(current.target as HTMLImageElement, current.imageOriginal);
  } else if (current.kind === "form-button") current.formUndo?.();
  restoreOutline(current);
  current.state = "undone";
  recentlyUndone.add(current.target);
  window.setTimeout(() => { recentlyUndone.delete(current.target); }, 800);
  if (failure === current) awaitingInteraction = false;
  if (current.repairId) {
    void chrome.runtime.sendMessage({ type: "UPDATE_REPAIR_HISTORY", id: current.repairId, verificationResult: "undone" }).catch(() => {});
  }
  emitPipeline(current, "verification", "done", "Repair undone by user", current.diagnosis.source);
  emitPipeline(current, "history", "done", "History updated: undone", current.diagnosis.source);
  return null;
}

function startDomWatcher(): void {
  if (domObserver || !document.body) return;
  domObserver = new MutationObserver(() => {
    if (!enabled) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      refreshPageScan({ autoSelectImages: false });
    }, 400);
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopDomWatcher(): void {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  domObserver?.disconnect();
  domObserver = null;
}

if (origin && isAllowedCompanionOrigin(origin)) {
  document.documentElement.dataset.phantomExtId = chrome.runtime.id;
  window.dispatchEvent(new CustomEvent("phantom-extension-ready", { detail: { extensionId: chrome.runtime.id } }));
} else if (origin) {
  chrome.runtime.sendMessage({ type: "GET_MONITORING", origin }).then((state: { enabled?: boolean }) => {
    enabled = state.enabled === true;
    if (enabled) {
      refreshPageScan({ autoSelectImages: true });
      startDomWatcher();
    }
  }).catch(() => { enabled = false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[monitoringKey(origin)]) {
      enabled = changes[monitoringKey(origin)].newValue === true;
      if (!enabled) {
        if (picking) stopPicking(null);
        stopDomWatcher();
      } else {
        refreshPageScan({ autoSelectImages: true });
        startDomWatcher();
      }
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
    const current = failure;
    const outcome = expectedOutcome(current.target);
    if (outcome) {
      const before = outcome.textContent;
      window.setTimeout(() => { if (outcome.textContent !== before) verifyIssue(current); }, 0);
    } else {
      window.setTimeout(() => { if (current.state === "pending") verifyIssue(current); }, 0);
    }
  }, true);
  window.addEventListener("hashchange", verifyNavigation);
  chrome.runtime.onMessage.addListener((untrusted: unknown, _sender, sendResponse) => {
    const parsed = repairCommand.safeParse(untrusted);
    if (!parsed.success) return false;
    if (parsed.data.type === "GET_FAILURE") { sendResponse(visibleState()); return false; }
    if (parsed.data.type === "GET_PICKER_STATE") { sendResponse(pickerState()); return false; }
    if (parsed.data.type === "GET_PAGE_ISSUES") {
      sendResponse({ issues: enabled ? refreshPageScan({ autoSelectImages: false }) : [] });
      return false;
    }
    if (parsed.data.type === "SCAN_PAGE") {
      if (!enabled) { sendResponse({ error: "Monitoring is off", issues: [] }); return false; }
      sendResponse({ issues: refreshPageScan({ autoSelectImages: false, notify: true }) });
      return false;
    }
    if (parsed.data.type === "SELECT_ISSUE") {
      if (!enabled) { sendResponse({ error: "Monitoring is off" }); return false; }
      const targetIssue = pageIssues.get(parsed.data.id);
      if (!targetIssue || !targetIssue.target.isConnected) {
        sendResponse({ error: "Issue no longer exists on this page." });
        return false;
      }
      focusIssue(targetIssue);
      sendResponse({ failure: visibleState(), issues: summarizePageIssues() });
      announce();
      return false;
    }
    if (parsed.data.type === "APPLY_ALL_SAFE") {
      if (!enabled) { sendResponse({ error: "Monitoring is off" }); return false; }
      refreshPageScan({ autoSelectImages: false });
      let repairedCount = 0;
      let lastRepaired: Failure | null = null;
      for (const issue of pageIssues.values()) {
        if (!issue.target.isConnected) continue;
        if ((issue.state === "suspected" || issue.state === "preview" || issue.state === "undone") && issue.diagnosis.action !== "NO_SAFE_REPAIR") {
          issue.runId = crypto.randomUUID();
          issue.state = "preview";
          emitPipeline(issue, "detection", "done", `Suspected ${issue.kind} failure detected`);
          emitPipeline(issue, "evidence", "done", "Sanitized page metadata ready");
          emitPipeline(issue, "routing", "done", "Bulk safe repair (rules-only)", issue.diagnosis.source, "RULES_ONLY");
          emitPipeline(issue, "diagnosis", "done", `${issue.diagnosis.action} (${issue.diagnosis.source})`, issue.diagnosis.source, "RULES_ONLY");
          const err = applyRepair(issue);
          if (!err) {
            repairedCount++;
            lastRepaired = issue;
          }
        }
      }
      if (lastRepaired) focusIssue(lastRepaired);
      sendResponse({ failure: visibleState(), issues: summarizePageIssues(), repairedCount });
      announce();
      return false;
    }
    if (parsed.data.type === "UNDO_ALL_REPAIRS") {
      let undoneCount = 0;
      for (const issue of pageIssues.values()) {
        if (issue.state === "pending" || issue.state === "verified") {
          const err = undoRepair(issue);
          if (!err) undoneCount++;
        }
      }
      if (failure && (failure.state === "pending" || failure.state === "verified")) {
        const err = undoRepair(failure);
        if (!err) undoneCount++;
      }
      sendResponse({ failure: visibleState(), issues: summarizePageIssues(), undoneCount });
      announce();
      return false;
    }
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
      if (failure) restoreOutline(failure);
      const issue = upsertPageIssue({
        kind: resolved.kind,
        target: resolved.target,
        diagnosis: resolved.diagnosis,
        state: "preview",
        fromCommunity: true,
      });
      issue.kind = resolved.kind;
      issue.diagnosis = resolved.diagnosis;
      issue.state = "preview";
      issue.fromCommunity = true;
      failure = issue;
      emitPipeline(issue, "detection", "done", `Repair Recipe matched ${resolved.kind}`);
      emitPipeline(issue, "evidence", "done", "Verified local page metadata");
      emitPipeline(issue, "routing", "done", "Approved community Repair Recipe", "rules-only", "RULES_ONLY");
      emitPipeline(issue, "diagnosis", "done", resolved.diagnosis.action, "rules-only", "RULES_ONLY");
      const error = applyRepair(issue);
      if (error) { restoreOutline(issue); failure = null; sendResponse({ error }); return false; }
      sendResponse(visibleState());
      announce();
      return false;
    }
    if (parsed.data.type === "UNDO_REPAIR" && parsed.data.repairId) {
      const requestedRepairId = parsed.data.repairId;
      const match = [...pageIssues.values()].find((item) => item.repairId === requestedRepairId && item.target.isConnected);
      const targetIssue = match ?? (failure?.target.isConnected ? failure : null);
      if (!targetIssue) { sendResponse({ error: "No active repair to undo" }); return false; }
      const error = undoRepair(targetIssue);
      if (error) { sendResponse({ error }); return false; }
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
