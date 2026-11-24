import { z } from "zod";
import { failureKind, repairAction, type RepairState } from "./contracts";
import { sanitizeText } from "./sanitize";

export const REPAIR_HISTORY_KEY = "repair-history";
export const MAX_HISTORY_ENTRIES = 50;

export const verificationResult = z.enum(["pending", "verified", "undone"]);
export type VerificationResult = z.infer<typeof verificationResult>;

export const repairHistoryEntry = z.object({
  id: z.string().min(1),
  origin: z.string().url(),
  bugType: failureKind,
  timestamp: z.string().min(1),
  diagnosisSummary: z.string().max(240),
  repairAction,
  source: z.enum(["rules-only", "on-device", "cloud"]),
  verificationResult,
});

export type RepairHistoryEntry = z.infer<typeof repairHistoryEntry>;

export function createHistoryEntry(input: Omit<RepairHistoryEntry, "diagnosisSummary"> & { diagnosisSummary: string }): RepairHistoryEntry {
  return repairHistoryEntry.parse({
    ...input,
    diagnosisSummary: sanitizeText(input.diagnosisSummary, 240),
  });
}

export function upsertHistoryEntry(list: readonly RepairHistoryEntry[], entry: RepairHistoryEntry): RepairHistoryEntry[] {
  const safe = createHistoryEntry(entry);
  const filtered = list.filter((item) => item.id !== safe.id);
  return [safe, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
}

export function updateHistoryVerification(
  list: readonly RepairHistoryEntry[],
  id: string,
  result: VerificationResult,
): RepairHistoryEntry[] {
  return list.map((item) => (item.id === id ? { ...item, verificationResult: result } : item));
}

export function isEntryUndoable(
  entry: RepairHistoryEntry,
  liveContext: {
    origin: string | null;
    activeRepairId: string | null;
    activeState: RepairState | null;
    activeRepairIds?: readonly string[];
  },
): boolean {
  if (entry.verificationResult === "undone") return false;
  if (liveContext.origin !== entry.origin) return false;
  if (liveContext.activeRepairIds) return liveContext.activeRepairIds.includes(entry.id);
  if (liveContext.activeRepairId !== entry.id) return false;
  return liveContext.activeState === "pending" || liveContext.activeState === "verified";
}
