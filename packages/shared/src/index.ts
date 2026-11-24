import { z } from "zod";
import { cloudConsent } from "./ai-routing";
import { diagnosis } from "./contracts";
import { repairHistoryEntry, verificationResult } from "./history";
import { pipelineEvent } from "./pipeline";
import { repairRecipe } from "./recipes";
import { evidencePacket } from "./sanitize";

export * from "./contracts";
export * from "./sanitize";
export * from "./ai-routing";
export * from "./bridge";
export * from "./history";
export * from "./pipeline";
export * from "./recipes";

export const monitoringMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_MONITORING"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_MONITORING"), origin: z.string().url(), enabled: z.boolean() }),
  z.object({ type: z.literal("OBSERVED_INTERACTION"), origin: z.string().url() }),
  z.object({ type: z.literal("GET_CLOUD_CONSENT"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_CLOUD_CONSENT"), origin: z.string().url(), consent: cloudConsent }),
  z.object({ type: z.literal("GET_COMPANION_STATUS") }),
  z.object({
    type: z.literal("RUN_DIAGNOSIS"),
    runId: z.string().min(1).optional(),
    tabId: z.number().int().nonnegative().optional(),
    tabUrl: z.string().url().optional(),
    evidence: evidencePacket,
    rulesFallback: diagnosis,
    overrideConsent: cloudConsent.optional(),
    cloudDecision: z.enum(["approved", "declined"]).optional(),
  }),
  z.object({ type: z.literal("GET_REPAIR_HISTORY") }),
  z.object({ type: z.literal("RECORD_REPAIR_HISTORY"), entry: repairHistoryEntry }),
  z.object({
    type: z.literal("UPDATE_REPAIR_HISTORY"),
    id: z.string().min(1),
    verificationResult,
  }),
  z.object({ type: z.literal("REPORT_PIPELINE_EVENT"), event: pipelineEvent }),
  z.object({ type: z.literal("SHARE_RECIPE"), recipe: repairRecipe }),
  z.object({ type: z.literal("GET_COMMUNITY_RECIPES"), origin: z.string().url(), fetchLive: z.boolean().optional() }),
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
  z.object({ type: z.literal("GET_SHAREABLE_RECIPE") }),
  z.object({ type: z.literal("APPLY_COMMUNITY_RECIPE"), recipe: repairRecipe }),
  z.object({ type: z.literal("GET_PAGE_ISSUES") }),
  z.object({ type: z.literal("SCAN_PAGE") }),
  z.object({ type: z.literal("SELECT_ISSUE"), id: z.string().min(1) }),
  z.object({ type: z.literal("APPLY_ALL_SAFE") }),
  z.object({ type: z.literal("UNDO_ALL_REPAIRS") }),
]);

export type RepairCommand = z.infer<typeof repairCommand>;
