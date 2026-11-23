import type { Diagnosis } from "@phantom/shared";

const hintNames = ["data-href", "data-route", "data-url"] as const;

export function hasBrokenDestination(link: HTMLAnchorElement): boolean {
  const raw = link.getAttribute("href");
  return raw === null || raw.trim() === "" || raw.trim() === "#";
}

export function knownDestination(link: HTMLAnchorElement): string | null {
  for (const name of hintNames) {
    const hint = link.getAttribute(name)?.trim();
    if (!hint || hint === "#") continue;
    try {
      const resolved = new URL(hint, link.ownerDocument.location.href);
      if ((resolved.protocol === "http:" || resolved.protocol === "https:") && resolved.origin === link.ownerDocument.location.origin) return hint;
    } catch { /* Invalid hints are ignored. */ }
  }
  return null;
}

export function diagnoseNavigation(link: HTMLAnchorElement): Diagnosis {
  const known = knownDestination(link);
  return {
    reason: "This link has no working destination.",
    confidence: 0.95,
    source: "rules-only",
    action: known ? "RESTORE_NAVIGATION" : "NO_SAFE_REPAIR",
    safety: known ? "The destination is already present on this page. Undo restores the original link." : "The page provides no trusted destination, so PHANTOM will not guess one.",
  };
}
