import { z } from "zod";
import { diagnosis } from "./contracts";
import { aiEnvironmentStatus, cloudConsent, diagnosisOutcome } from "./ai-routing";
import { pipelineEvent } from "./pipeline";
import { evidencePacket } from "./sanitize";

export const ALLOWED_COMPANION_ORIGINS = ["http://127.0.0.1:4174", "http://localhost:4174"] as const;
export const DEFAULT_COMPANION_URL = "http://127.0.0.1:4174/";

export function isAllowedCompanionOrigin(origin: string): boolean {
  return (ALLOWED_COMPANION_ORIGINS as readonly string[]).includes(origin);
}

export const companionRequest = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), type: z.literal("GET_AI_STATUS") }),
  z.object({
    id: z.string().min(1),
    type: z.literal("DIAGNOSE_REQUEST"),
    runId: z.string().min(1).optional(),
    evidence: evidencePacket,
    rulesFallback: diagnosis,
    cloudConsent,
    cloudDecision: z.enum(["approved", "declined"]).optional(),
  }),
  z.object({ id: z.string().min(1), type: z.literal("PIPELINE_EVENT"), event: pipelineEvent }),
]);

export type CompanionRequest = z.infer<typeof companionRequest>;

export const companionResponse = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), type: z.literal("AI_STATUS_RESPONSE"), env: aiEnvironmentStatus }),
  z.object({ id: z.string().min(1), type: z.literal("DIAGNOSE_RESPONSE"), outcome: diagnosisOutcome }),
]);

export type CompanionResponse = z.infer<typeof companionResponse>;
