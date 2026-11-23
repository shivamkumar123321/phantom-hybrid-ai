import { z } from "zod";
import { cloudConsent } from "./ai-routing";
import { diagnosis } from "./contracts";
import { evidencePacket } from "./sanitize";

export * from "./contracts";
export * from "./sanitize";
export * from "./ai-routing";
export * from "./bridge";

export const monitoringMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_MONITORING"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_MONITORING"), origin: z.string().url(), enabled: z.boolean() }),
  z.object({ type: z.literal("OBSERVED_INTERACTION"), origin: z.string().url() }),
  z.object({ type: z.literal("GET_CLOUD_CONSENT"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_CLOUD_CONSENT"), origin: z.string().url(), consent: cloudConsent }),
  z.object({ type: z.literal("GET_COMPANION_STATUS") }),
  z.object({
    type: z.literal("RUN_DIAGNOSIS"),
    tabId: z.number().int().nonnegative().optional(),
    tabUrl: z.string().url().optional(),
    evidence: evidencePacket,
    rulesFallback: diagnosis,
    overrideConsent: cloudConsent.optional(),
    cloudDecision: z.enum(["approved", "declined"]).optional(),
  }),
]);

export type MonitoringMessage = z.infer<typeof monitoringMessage>;

export const monitoringState = z.object({ enabled: z.boolean() });
export type MonitoringState = z.infer<typeof monitoringState>;

export const monitoringKey = (origin: string) => `monitoring:${origin}`;
export const interactionCountKey = (origin: string) => `interactions:${origin}`;
export const cloudConsentKey = (origin: string) => `cloud-consent:${origin}`;

export const repairCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_FAILURE") }),
  z.object({ type: z.literal("INVESTIGATE") }),
  z.object({ type: z.literal("APPLY_REPAIR") }),
  z.object({ type: z.literal("UNDO_REPAIR") }),
  z.object({ type: z.literal("GET_PICKER_STATE") }),
  z.object({ type: z.literal("START_PICKING") }),
  z.object({ type: z.literal("CANCEL_PICKING") }),
  z.object({ type: z.literal("GET_EVIDENCE") }),
  z.object({ type: z.literal("SET_DIAGNOSIS"), diagnosis }),
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
