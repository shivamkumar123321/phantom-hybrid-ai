import { z } from "zod";

export const failureKind = z.enum(["navigation", "css-button", "image", "form-button", "manual"]);
export type FailureKind = z.infer<typeof failureKind>;

export const repairAction = z.enum([
  "RESTORE_NAVIGATION",
  "RESTORE_POINTER_EVENTS",
  "RESTORE_BUTTON_SEMANTICS",
  "USE_KNOWN_IMAGE_FALLBACK",
  "REPLACE_BROKEN_IMAGE_PLACEHOLDER",
  "RESTORE_SUPPORTED_FORM_BEHAVIOR",
  "NO_SAFE_REPAIR",
]);

export const diagnosis = z.object({
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["rules-only", "on-device", "cloud"]),
  action: repairAction,
  safety: z.string(),
});

export type Diagnosis = z.infer<typeof diagnosis>;
export type RepairState = "suspected" | "preview" | "pending" | "verified" | "undone";
export type FailureView = { kind: FailureKind; state: RepairState; diagnosis: Diagnosis | null; repairId?: string | null; fromCommunity?: boolean } | null;
export type PickerState = { active: boolean; notice: string | null };
export type PageIssueSummary = {
  id: string;
  kind: FailureKind;
  label: string;
  reason: string;
  action: z.infer<typeof repairAction>;
  state: RepairState;
  canAutoRepair: boolean;
  repairId?: string | null;
};

export function siteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}
