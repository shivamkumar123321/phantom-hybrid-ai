import type { Diagnosis } from "@phantom/shared";
import { isSensitiveTarget } from "./sensitive";

/** A form button is a repair candidate only after a click produced no useful outcome. */
export function supportedFormButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement) || button.getAttribute("type")?.toLowerCase() !== "button" || !button.hasAttribute("data-phantom-submit")) return null;
  const form = button.form;
  if (!form || isSensitiveTarget(button) || isSensitiveTarget(form)) return null;
  return button;
}

export function diagnoseFormButton(button: HTMLButtonElement): Diagnosis {
  const safe = supportedFormButton(button) === button;
  return {
    reason: safe ? "This form button is set to act as a plain button, so it cannot submit its form." : "This form button is not safe to repair automatically.",
    confidence: safe ? 0.9 : 0,
    source: "rules-only",
    action: safe ? "RESTORE_BUTTON_SEMANTICS" : "NO_SAFE_REPAIR",
    safety: safe ? "Only the button's submit setting changes. PHANTOM does not read entered text or submit the form itself. Your next click may submit it. Undo restores the original setting." : "PHANTOM will not inspect or change sensitive forms.",
  };
}

/** Changes only the button setting; the user's next click remains in charge of submission. */
export function applyFormButtonRepair(button: HTMLButtonElement): (() => void) | null {
  if (supportedFormButton(button) !== button) return null;
  const originalType = button.getAttribute("type");
  button.type = "submit";
  return () => {
    if (originalType === null) button.removeAttribute("type");
    else button.setAttribute("type", originalType);
  };
}

/** A real submit event from this button is evidence that its form behavior returned. */
export function verifiesFormButton(event: SubmitEvent, button: HTMLButtonElement): boolean {
  return event.target === button.form && event.submitter === button && !isSensitiveTarget(button) && !isSensitiveTarget(button.form);
}
