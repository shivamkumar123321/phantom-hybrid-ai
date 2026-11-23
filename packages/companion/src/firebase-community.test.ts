import { describe, expect, it, vi } from "vitest";
import { fetchCommunityRecipes, shareCommunityRecipe, type CommunityStore } from "./firebase-community";

const validRecipe = {
  origin: "https://demo.example",
  bugType: "navigation" as const,
  elementTag: "a",
  selectorHint: "#demo-link",
  summary: "Link has no working destination.",
  repairAction: "RESTORE_NAVIGATION" as const,
  safetyNote: "Uses existing page metadata.",
  createdAt: "2026-11-24T00:00:00.000Z",
};

describe("Firebase Community Repair Network adapter", () => {
  it("signs in anonymously and stores a validated, sanitized recipe", async () => {
    const store: CommunityStore = {
      signIn: vi.fn().mockResolvedValue("anon-uid-123"),
      insertRecipe: vi.fn().mockResolvedValue("doc-42"),
      queryRecipes: vi.fn(),
    };

    const res = await shareCommunityRecipe(validRecipe, store);
    expect(store.signIn).toHaveBeenCalledOnce();
    expect(store.insertRecipe).toHaveBeenCalledWith(expect.objectContaining({
      origin: "https://demo.example",
      repairAction: "RESTORE_NAVIGATION",
      authorUid: "anon-uid-123",
    }));
    expect(res).toEqual({
      ok: true,
      recipe: expect.objectContaining({ id: "doc-42", authorUid: "anon-uid-123" }),
    });
  });

  it("rejects invalid or sensitive recipes before touching Auth or Firestore", async () => {
    const store: CommunityStore = {
      signIn: vi.fn(),
      insertRecipe: vi.fn(),
      queryRecipes: vi.fn(),
    };
    const res = await shareCommunityRecipe({ ...validRecipe, selectorHint: "#password-submit" }, store);
    expect(res.ok).toBe(false);
    expect(store.signIn).not.toHaveBeenCalled();
    expect(store.insertRecipe).not.toHaveBeenCalled();
  });

  it("reports unavailable honestly when Firebase config is absent", async () => {
    const shareRes = await shareCommunityRecipe(validRecipe, null);
    expect(shareRes).toEqual({ ok: false, error: "Community sharing requires Firebase configuration." });
    expect(await fetchCommunityRecipes("https://demo.example", null)).toEqual({ available: false, recipes: [] });
  });

  it("filters out untrusted, invalid, cross-origin, and sensitive recipes from Firestore", async () => {
    const store: CommunityStore = {
      signIn: vi.fn().mockResolvedValue("anon-uid-456"),
      insertRecipe: vi.fn(),
      queryRecipes: vi.fn().mockResolvedValue([
        { id: "good-1", data: validRecipe },
        { id: "bad-action", data: { ...validRecipe, repairAction: "EXEC_JS" } },
        { id: "bad-sensitive", data: { ...validRecipe, summary: "Steal token=xyz123" } },
        { id: "bad-origin", data: { ...validRecipe, origin: "https://evil.example" } },
      ]),
    };

    const result = await fetchCommunityRecipes("https://demo.example", store);
    expect(result.available).toBe(true);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].id).toBe("good-1");
  });
});
