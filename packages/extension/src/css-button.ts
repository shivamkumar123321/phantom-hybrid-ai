import type { Diagnosis } from "@phantom/shared";
import { isSensitiveTarget } from "./sensitive";

export type PointerEventsSnapshot = { value: string; priority: string };

const INTERACTIVE_SELECTOR = 'button, a[href], input[type="button"], input[type="submit"], [role="button"]';

export function isBlockedButton(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.matches(INTERACTIVE_SELECTOR)) return false;
  if ("disabled" in element && (element as HTMLButtonElement | HTMLInputElement).disabled) return false;
  if (isSensitiveTarget(element)) return false;
  return getComputedStyle(element).pointerEvents === "none";
}

function buttonAtPoint(root: Element, x: number, y: number): HTMLElement | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let visited = 0;
  let node: Node | null = root;
  while (node && visited++ < 120) {
    if (node instanceof HTMLElement && isBlockedButton(node)) {
      const rect = node.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && rect.width > 0 && rect.height > 0) return node;
    }
    node = walker.nextNode();
  }
  return null;
}

/** A blocked control is skipped as a click target, so inspect a small area around the actual target. */
export function findBlockedButtonAtPoint(target: EventTarget | null, x: number, y: number): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let root: Element | null = target;
  for (let depth = 0; root && depth < 4; depth++, root = root.parentElement) {
    const control = buttonAtPoint(root, x, y);
    if (control) return control;
  }
  return null;
}

export function diagnoseBlockedButton(): Diagnosis {
  return {
    reason: "This interactive control is blocked by pointer-event styling.",
    confidence: 0.95,
    source: "rules-only",
    action: "RESTORE_POINTER_EVENTS",
    safety: "Only this element's pointer-event style changes. Undo restores its original inline style.",
  };
}

export function applyPointerEventsRepair(element: HTMLElement): PointerEventsSnapshot {
  const snapshot = {
    value: element.style.getPropertyValue("pointer-events"),
    priority: element.style.getPropertyPriority("pointer-events"),
  };
  element.style.setProperty("pointer-events", "auto", "important");
  return snapshot;
}

export function undoPointerEventsRepair(element: HTMLElement, snapshot: PointerEventsSnapshot): void {
  if (snapshot.value) element.style.setProperty("pointer-events", snapshot.value, snapshot.priority);
  else element.style.removeProperty("pointer-events");
}
