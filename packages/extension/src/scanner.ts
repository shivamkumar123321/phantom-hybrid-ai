import type { Diagnosis, FailureKind } from "@phantom/shared";
import { diagnoseBrokenImage, isFailedImage } from "./broken-image";
import { diagnoseBlockedButton, isBlockedButton } from "./css-button";
import { diagnoseFormButton, supportedFormButton } from "./form-button";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";
import { isSensitiveTarget } from "./sensitive";

export type ScannedIssue = {
  kind: FailureKind;
  target: HTMLElement;
  diagnosis: Diagnosis;
  label: string;
};

function isElementRendered(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function describeIssueTarget(target: HTMLElement, kind: FailureKind): string {
  if (target instanceof HTMLImageElement) {
    const alt = target.getAttribute("alt")?.trim();
    if (alt) return `Image "${alt.slice(0, 32)}"`;
    const rawSrc = target.getAttribute("src")?.trim() ?? "";
    const file = rawSrc && !rawSrc.startsWith("data:")
      ? (rawSrc.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "")
      : "";
    return file ? `Image "${file.slice(0, 32)}"` : "Broken image";
  }
  const prefix = kind === "navigation" ? "Link" : kind === "form-button" ? "Form button" : "Control";
  const text = (target.getAttribute("aria-label") ?? target.textContent ?? "").trim().replace(/\s+/g, " ");
  if (text) return `${prefix} "${text.slice(0, 32)}"`;
  const id = target.getAttribute("id")?.trim();
  return id ? `${prefix} #${id.slice(0, 28)}` : prefix;
}

export function scanPageForIssues(doc: Document, maxIssues = 25): ScannedIssue[] {
  const issues: ScannedIssue[] = [];
  const seen = new Set<HTMLElement>();

  const add = (kind: FailureKind, target: HTMLElement, diagnosis: Diagnosis) => {
    if (issues.length >= maxIssues || seen.has(target) || !target.isConnected || isSensitiveTarget(target)) return;
    seen.add(target);
    issues.push({ kind, target, diagnosis, label: describeIssueTarget(target, kind) });
  };

  for (const image of [...doc.images].slice(0, 150)) {
    if (isFailedImage(image)) add("image", image, diagnoseBrokenImage(image));
  }

  for (const el of [...doc.querySelectorAll('button, a[href], input[type="button"], input[type="submit"], [role="button"]')].slice(0, 150)) {
    if (el instanceof HTMLElement && isElementRendered(el) && isBlockedButton(el)) {
      add("css-button", el, diagnoseBlockedButton());
    }
  }

  for (const link of [...doc.querySelectorAll("a")].slice(0, 150)) {
    if (link instanceof HTMLAnchorElement && isElementRendered(link) && hasBrokenDestination(link) && knownDestination(link)) {
      add("navigation", link, diagnoseNavigation(link));
    }
  }

  for (const button of [...doc.querySelectorAll('form button[type="button"]')].slice(0, 100)) {
    if (button instanceof HTMLButtonElement && isElementRendered(button) && supportedFormButton(button) === button) {
      add("form-button", button, diagnoseFormButton(button));
    }
  }

  return issues;
}
