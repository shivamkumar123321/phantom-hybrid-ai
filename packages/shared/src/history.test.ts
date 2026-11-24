import { describe, expect, it } from "vitest";
import {
  createHistoryEntry,
  isEntryUndoable,
  MAX_HISTORY_ENTRIES,
  updateHistoryVerification,
  upsertHistoryEntry,
} from "./history";

describe("local repair history", () => {
  it("sanitizes diagnosis summary and caps entries", () => {
    const entry = createHistoryEntry({
      id: "rep-1",
      origin: "https://demo.example",
      bugType: "navigation",
      timestamp: "2026-11-24T00:00:00.000Z",
      diagnosisSummary: "Broken link for alice@example.com with Bearer secret.jwt.token",
      repairAction: "RESTORE_NAVIGATION",
      source: "rules-only",
      verificationResult: "pending",
    });
    expect(entry.diagnosisSummary).not.toContain("alice@example.com");
    expect(entry.diagnosisSummary).not.toContain("secret.jwt.token");

    let list = [entry];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
      list = upsertHistoryEntry(list, { ...entry, id: `rep-${i + 2}` });
    }
    expect(list).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it("updates verification result and computes honest undo availability", () => {
    const entry = createHistoryEntry({
      id: "rep-1",
      origin: "https://demo.example",
      bugType: "css-button",
      timestamp: "2026-11-24T00:00:00.000Z",
      diagnosisSummary: "Button blocked by pointer-events.",
      repairAction: "RESTORE_POINTER_EVENTS",
      source: "on-device",
      verificationResult: "pending",
    });

    expect(isEntryUndoable(entry, { origin: "https://demo.example", activeRepairId: "rep-1", activeState: "pending" })).toBe(true);
    expect(isEntryUndoable(entry, { origin: "https://demo.example", activeRepairId: null, activeState: null })).toBe(false);
    expect(isEntryUndoable(entry, { origin: "https://other.example", activeRepairId: "rep-1", activeState: "verified" })).toBe(false);

    const [verified] = updateHistoryVerification([entry], "rep-1", "verified");
    expect(verified.verificationResult).toBe("verified");
    expect(isEntryUndoable(verified, { origin: "https://demo.example", activeRepairId: "rep-1", activeState: "verified" })).toBe(true);

    const [undone] = updateHistoryVerification([verified], "rep-1", "undone");
    expect(isEntryUndoable(undone, { origin: "https://demo.example", activeRepairId: "rep-1", activeState: "verified" })).toBe(false);

    expect(isEntryUndoable(verified, {
      origin: "https://demo.example",
      activeRepairId: "rep-2",
      activeState: "verified",
      activeRepairIds: ["rep-1", "rep-2"],
    })).toBe(true);
    expect(isEntryUndoable(undone, {
      origin: "https://demo.example",
      activeRepairId: "rep-2",
      activeState: "verified",
      activeRepairIds: ["rep-1", "rep-2"],
    })).toBe(false);
  });
});
