import type { Diagnosis, FailureKind } from "@phantom/shared";
import { diagnoseBrokenImage, isFailedImage } from "./broken-image";
import { diagnoseBlockedButton, findBlockedButtonAtPoint, isBlockedButton } from "./css-button";
import { diagnoseFormButton, supportedFormButton } from "./form-button";
import { diagnoseNavigation, hasBrokenDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

export type PickedInspection =
  | { blocked: true; reason: string }
  | { blocked: false; kind: FailureKind; target: HTMLElement; diagnosis: Diagnosis };

export function resolvePickableTarget(target: EventTarget | null, clientX?: number, clientY?: number): HTMLElement | null {
  if (clientX !== undefined && clientY !== undefined) {
    const blocked = findBlockedButtonAtPoint(target, clientX, clientY);
    if (blocked) return blocked;
  }
  if (!(target instanceof Element)) return null;
  return (target.closest("a, button, img") as HTMLElement | null) ?? (target instanceof HTMLElement ? target : null);
}

export function inspectPickedElement(target: HTMLElement): PickedInspection {
  if (isSensitiveTarget(target)) {
    return { blocked: true, reason: "Sensitive controls cannot be inspected or repaired." };
  }
  if (target instanceof HTMLAnchorElement && hasBrokenDestination(target)) {
    return { blocked: false, kind: "navigation", target, diagnosis: diagnoseNavigation(target) };
  }
  if (isBlockedButton(target)) {
    return { blocked: false, kind: "css-button", target, diagnosis: diagnoseBlockedButton() };
  }
  if (target instanceof HTMLImageElement && isFailedImage(target)) {
    return { blocked: false, kind: "image", target, diagnosis: diagnoseBrokenImage(target) };
  }
  const formButton = supportedFormButton(target);
  if (formButton) {
    return { blocked: false, kind: "form-button", target: formButton, diagnosis: diagnoseFormButton(formButton) };
  }
  return {
    blocked: false,
    kind: "manual",
    target,
    diagnosis: {
      reason: "No supported automatic repair applies to this element.",
      confidence: 0.5,
      source: "rules-only",
      action: "NO_SAFE_REPAIR",
      safety: "PHANTOM only applies allowlisted repairs when trustworthy page metadata is present.",
    },
  };
}
