import { describe, expect, it } from "vitest";
import { createRepairRecipe, recipeToDiagnosis, validateCommunityRecipe } from "./recipes";

const validInput = {
  origin: "https://demo.example/page?token=secret",
  bugType: "navigation" as const,
  elementTag: "A",
  selectorHint: "#demo-link",
  summary: "This link has no working destination.",
  repairAction: "RESTORE_NAVIGATION" as const,
  safetyNote: "Uses the destination already present on this page.",
  createdAt: "2026-11-24T00:00:00.000Z",
};

describe("community Repair Recipe validation", () => {
  it("normalizes origin and accepts valid sanitized recipes including prose mentioning verification", () => {
    const recipe = createRepairRecipe({
      ...validInput,
      safetyNote: "Uses existing page metadata with standard verification.",
    });
    expect(recipe).not.toBeNull();
    expect(recipe?.origin).toBe("https://demo.example");
    expect(recipe?.elementTag).toBe("a");

    const diagnosis = recipeToDiagnosis(recipe!);
    expect(diagnosis.action).toBe("RESTORE_NAVIGATION");
    expect(diagnosis.safety).toContain("requires your approval");
  });

  it("rejects NO_SAFE_REPAIR, unknown actions, and unsafe origins", () => {
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", repairAction: "NO_SAFE_REPAIR" })).toBeNull();
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", repairAction: "EVAL_JS" })).toBeNull();
    expect(validateCommunityRecipe({ ...validInput, origin: "javascript:alert(1)", elementTag: "a" })).toBeNull();
  });

  it("rejects recipes containing sensitive data or markup/script payloads", () => {
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", selectorHint: "#login-btn" })).toBeNull();
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", selectorHint: "<script>alert(1)</script>" })).toBeNull();
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", summary: "Fix password field for alice@example.com" })).toBeNull();
    expect(validateCommunityRecipe({ ...validInput, origin: "https://demo.example", elementTag: "a", safetyNote: "Uses token=abc123" })).toBeNull();
  });
});
