import { beforeEach, describe, expect, it } from "vitest";
import { buildShareableRecipe, resolveCommunityTarget } from "./community";

describe("community recipe building and validation on DOM", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("builds a sanitized shareable recipe for safe repaired controls and refuses sensitive ones", () => {
    document.body.innerHTML = '<a id="demo-link" href="#" data-href="#destination">Open</a><button id="login-btn">Log in</button>';
    const link = document.querySelector<HTMLElement>("#demo-link")!;
    const recipe = buildShareableRecipe({
      origin: "https://demo.example",
      bugType: "navigation",
      target: link,
      diagnosis: {
        reason: "This link has no working destination.",
        confidence: 0.95,
        source: "rules-only",
        action: "RESTORE_NAVIGATION",
        safety: "Destination exists on page.",
      },
    });
    expect(recipe?.selectorHint).toBe("#demo-link");
    expect(recipe?.repairAction).toBe("RESTORE_NAVIGATION");

    const login = document.querySelector<HTMLElement>("#login-btn")!;
    expect(buildShareableRecipe({
      origin: "https://demo.example",
      bugType: "manual",
      target: login,
      diagnosis: {
        reason: "Blocked",
        confidence: 0.9,
        source: "rules-only",
        action: "RESTORE_POINTER_EVENTS",
        safety: "Safe",
      },
    })).toBeNull();
  });

  it("matches valid hint attributes even when earlier tags lack hints", () => {
    document.body.innerHTML = [
      '<a href="/about">Normal link</a>',
      '<a href="#" data-route="/next">Broken route link</a>',
    ].join("");
    const routeLink = document.querySelectorAll<HTMLElement>("a")[1];
    const hint = buildShareableRecipe({
      origin: "https://demo.example",
      bugType: "navigation",
      target: routeLink,
      diagnosis: {
        reason: "Missing destination",
        confidence: 0.9,
        source: "rules-only",
        action: "RESTORE_NAVIGATION",
        safety: "Safe",
      },
    });
    expect(hint?.selectorHint).toBe("a[data-route]");
    const resolved = resolveCommunityTarget(document, "https://demo.example", hint);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.target).toBe(routeLink);
  });

  it("enforces page-hint, allowlist, and sensitive checks before applying a Repair Recipe", () => {
    document.body.innerHTML = [
      '<a id="demo-link" href="#" data-href="#destination">Open</a>',
      '<a id="no-hint" href="#">Broken</a>',
      '<a id="login-link" href="/login" data-href="/home">Log in</a>',
    ].join("");

    const valid = resolveCommunityTarget(document, "https://demo.example", {
      origin: "https://demo.example",
      bugType: "navigation",
      elementTag: "a",
      selectorHint: "#demo-link",
      summary: "Broken link",
      repairAction: "RESTORE_NAVIGATION",
      safetyNote: "Uses existing data-href.",
      createdAt: "2026-11-24T00:00:00.000Z",
    });
    expect(valid.ok).toBe(true);

    const missingHint = resolveCommunityTarget(document, "https://demo.example", {
      origin: "https://demo.example",
      bugType: "navigation",
      elementTag: "a",
      selectorHint: "#no-hint",
      summary: "Broken link",
      repairAction: "RESTORE_NAVIGATION",
      safetyNote: "No hint",
      createdAt: "2026-11-24T00:00:00.000Z",
    });
    expect(missingHint.ok).toBe(false);

    const sensitive = resolveCommunityTarget(document, "https://demo.example", {
      origin: "https://demo.example",
      bugType: "navigation",
      elementTag: "a",
      selectorHint: "#login-link",
      summary: "Login link",
      repairAction: "RESTORE_NAVIGATION",
      safetyNote: "Safe",
      createdAt: "2026-11-24T00:00:00.000Z",
    });
    expect(sensitive.ok).toBe(false);
  });
});
