import type { Diagnosis } from "@phantom/shared";

export type PointerEventsSnapshot = { value: string; priority: string };

export function isBlockedButton(element: Element): element is HTMLButtonElement {
  return element instanceof HTMLButtonElement && !element.disabled && getComputedStyle(element).pointerEvents === "none";
}

function buttonAtPoint(root: Element, x: number, y: number): HTMLButtonElement | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let visited = 0;
  let node: Node | null = root;
  while (node && visited++ < 120) {
    if (node instanceof Element && isBlockedButton(node)) {
      const rect = node.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && rect.width > 0 && rect.height > 0) return node;
    }
    node = walker.nextNode();
  }
  return null;
}

/** A blocked button is skipped as a click target, so inspect a small area around the actual target. */
export function findBlockedButtonAtPoint(target: EventTarget | null, x: number, y: number): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  let root: Element | null = target;
  for (let depth = 0; root && depth < 4; depth++, root = root.parentElement) {
    const button = buttonAtPoint(root, x, y);
    if (button) return button;
  }
  return null;
}

export function diagnoseBlockedButton(): Diagnosis {
  return {
    reason: "This button is blocked by pointer-event styling.",
    confidence: 0.95,
    source: "rules-only",
    action: "RESTORE_POINTER_EVENTS",
    safety: "Only this button's pointer-event style changes. Undo restores its original inline style.",
  };
}

export function applyPointerEventsRepair(button: HTMLButtonElement): PointerEventsSnapshot {
  const snapshot = {
    value: button.style.getPropertyValue("pointer-events"),
    priority: button.style.getPropertyPriority("pointer-events"),
  };
  button.style.setProperty("pointer-events", "auto", "important");
  return snapshot;
}

export function undoPointerEventsRepair(button: HTMLButtonElement, snapshot: PointerEventsSnapshot): void {
  if (snapshot.value) button.style.setProperty("pointer-events", snapshot.value, snapshot.priority);
  else button.style.removeProperty("pointer-events");
}
