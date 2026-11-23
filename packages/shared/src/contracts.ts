import { z } from "zod";

export const repairAction = z.enum([
  "RESTORE_NAVIGATION",
  "RESTORE_POINTER_EVENTS",
  "RESTORE_BUTTON_SEMANTICS",
  "USE_KNOWN_IMAGE_FALLBACK",
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
export type FailureKind = "navigation" | "css-button" | "image" | "form-button" | "manual";
export type FailureView = { kind: FailureKind; state: RepairState; diagnosis: Diagnosis | null } | null;
export type PickerState = { active: boolean; notice: string | null };
