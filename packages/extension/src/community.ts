import { createRepairRecipe, recipeToDiagnosis, validateCommunityRecipe, type Diagnosis, type FailureKind, type RepairRecipe } from "@phantom/shared";
import { knownImageFallback } from "./broken-image";
import { isBlockedButton } from "./css-button";
import { supportedFormButton } from "./form-button";
import { knownDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

const hintSelectorAttributes = ["data-href", "data-route", "data-url", "data-fallback-src", "data-src", "srcset", "data-phantom-submit"] as const;

export function buildSafeSelectorHint(element: HTMLElement): string {
  const id = element.getAttribute("id")?.trim();
  if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) return `#${id}`;
  const tag = element.tagName.toLowerCase();
  for (const attr of hintSelectorAttributes) {
    if (element.hasAttribute(attr)) return `${tag}[${attr}]`;
  }
  return tag;
}

export function buildShareableRecipe(input: {
  origin: string;
  bugType: FailureKind;
  target: HTMLElement;
  diagnosis: Diagnosis;
}): RepairRecipe | null {
  if (!input.target.isConnected || isSensitiveTarget(input.target)) return null;
  if (input.diagnosis.action === "NO_SAFE_REPAIR") return null;
  return createRepairRecipe({
    origin: input.origin,
    bugType: input.bugType,
    elementTag: input.target.tagName.toLowerCase(),
    selectorHint: buildSafeSelectorHint(input.target),
    summary: input.diagnosis.reason,
    repairAction: input.diagnosis.action,
    safetyNote: input.diagnosis.safety,
  });
}

function matchesAction(found: HTMLElement, action: RepairRecipe["repairAction"]): FailureKind | null {
  if (action === "RESTORE_NAVIGATION" && found instanceof HTMLAnchorElement && knownDestination(found)) return "navigation";
  if (action === "RESTORE_POINTER_EVENTS" && isBlockedButton(found)) return "css-button";
  if (action === "USE_KNOWN_IMAGE_FALLBACK" && found instanceof HTMLImageElement && knownImageFallback(found)) return "image";
  if ((action === "RESTORE_BUTTON_SEMANTICS" || action === "RESTORE_SUPPORTED_FORM_BEHAVIOR") && supportedFormButton(found) === found) {
    return "form-button";
  }
  return null;
}

export function resolveCommunityTarget(
  doc: Document,
  pageOrigin: string,
  untrustedRecipe: unknown,
): { ok: true; target: HTMLElement; recipe: RepairRecipe; diagnosis: Diagnosis; kind: FailureKind } | { ok: false; error: string } {
  const recipe = validateCommunityRecipe(untrustedRecipe);
  if (!recipe || recipe.origin !== pageOrigin) {
    return { ok: false, error: "Invalid or mismatched Repair Recipe." };
  }
  let matches: Element[] = [];
  try {
    matches = [...doc.querySelectorAll(recipe.selectorHint)].slice(0, 100);
  } catch {
    return { ok: false, error: "Invalid Repair Recipe selector." };
  }
  const tagMatches = matches.filter((node): node is HTMLElement => node instanceof HTMLElement && node.tagName.toLowerCase() === recipe.elementTag);
  if (tagMatches.length === 0) {
    return { ok: false, error: "Matching element not found on this page." };
  }
  const nonSensitive = tagMatches.filter((node) => !isSensitiveTarget(node));
  if (nonSensitive.length === 0) {
    return { ok: false, error: "Sensitive controls cannot be inspected or repaired." };
  }
  for (const candidate of nonSensitive) {
    const kind = matchesAction(candidate, recipe.repairAction);
    if (kind) return { ok: true, target: candidate, recipe, diagnosis: recipeToDiagnosis(recipe), kind };
  }
  return { ok: false, error: "Page lacks safe metadata required for this Repair Recipe." };
}
