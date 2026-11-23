import { z } from "zod";

export const monitoringMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_MONITORING"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_MONITORING"), origin: z.string().url(), enabled: z.boolean() }),
  z.object({ type: z.literal("OBSERVED_INTERACTION"), origin: z.string().url() }),
]);

export type MonitoringMessage = z.infer<typeof monitoringMessage>;

export const monitoringState = z.object({ enabled: z.boolean() });
export type MonitoringState = z.infer<typeof monitoringState>;

export const monitoringKey = (origin: string) => `monitoring:${origin}`;
export const interactionCountKey = (origin: string) => `interactions:${origin}`;

export const repairAction = z.enum(["RESTORE_NAVIGATION", "RESTORE_POINTER_EVENTS", "RESTORE_BUTTON_SEMANTICS", "USE_KNOWN_IMAGE_FALLBACK", "RESTORE_SUPPORTED_FORM_BEHAVIOR", "NO_SAFE_REPAIR"]);
export const diagnosis = z.object({
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["rules-only", "on-device", "cloud"]),
  action: repairAction,
  safety: z.string(),
});
export type Diagnosis = z.infer<typeof diagnosis>;
export type RepairState = "suspected" | "preview" | "pending" | "verified" | "undone";
export type FailureKind = "navigation" | "css-button" | "image" | "form-button";
export type FailureView = { kind: FailureKind; state: RepairState; diagnosis: Diagnosis | null } | null;

export const repairCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_FAILURE") }),
  z.object({ type: z.literal("INVESTIGATE") }),
  z.object({ type: z.literal("APPLY_REPAIR") }),
  z.object({ type: z.literal("UNDO_REPAIR") }),
]);

export type RepairCommand = z.infer<typeof repairCommand>;

export function siteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}
