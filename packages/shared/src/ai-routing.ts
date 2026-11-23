import { z } from "zod";
import { diagnosis, type Diagnosis } from "./contracts";
import { evidencePacket, sanitizeEvidence, type EvidencePacket } from "./sanitize";

export const aiEnvironmentStatus = z.object({
  local: z.enum(["ready", "downloadable", "downloading", "unavailable"]),
  downloadProgress: z.number().min(0).max(1).optional(),
  cloud: z.enum(["available", "unavailable"]),
});

export type AiEnvironmentStatus = z.infer<typeof aiEnvironmentStatus>;

export const UNAVAILABLE_AI_ENV: AiEnvironmentStatus = { local: "unavailable", cloud: "unavailable" };

export function formatAiAvailability(env: AiEnvironmentStatus): { local: string; cloud: string } {
  const progress = env.downloadProgress !== undefined ? ` (${Math.round(env.downloadProgress * 100)}%)` : "";
  const local = env.local === "ready"
    ? "On-device AI: ready"
    : env.local === "downloadable"
      ? "On-device AI: downloadable"
      : env.local === "downloading"
        ? `On-device AI: downloading${progress}`
        : "On-device AI: unavailable";
  const cloud = env.cloud === "available" ? "Cloud AI: available" : "Cloud AI: unavailable";
  return { local, cloud };
}

export const cloudConsent = z.enum(["ask", "granted", "denied"]);
export type CloudConsent = z.infer<typeof cloudConsent>;

export type InferenceModeName = "ONLY_ON_DEVICE" | "PREFER_ON_DEVICE" | "ONLY_IN_CLOUD";

export type RoutingDecision =
  | { kind: "model"; mode: InferenceModeName }
  | { kind: "ask-cloud-consent"; reason: string }
  | { kind: "rules-only"; reason: string };

export const diagnosisOutcome = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("diagnosed"),
    diagnosis,
    env: aiEnvironmentStatus,
    note: z.string(),
  }),
  z.object({
    status: z.literal("needs-cloud-consent"),
    env: aiEnvironmentStatus,
    summary: z.string(),
    sanitizedEvidence: evidencePacket,
  }),
]);

export type DiagnosisOutcome = z.infer<typeof diagnosisOutcome>;

export type ModelRunner = (
  mode: InferenceModeName,
  evidence: EvidencePacket,
) => Promise<{ rawText: string; inferenceSource: "on-device" | "cloud" }>;

function isFormRestricted(evidence: EvidencePacket): boolean {
  return evidence.hasFormOrUserText || evidence.kind === "form-button";
}

function localUnavailableReason(env: AiEnvironmentStatus): string {
  if (env.local === "downloading") return "On-device AI is still downloading";
  if (env.local === "downloadable") return "On-device AI is not downloaded yet";
  return "On-device AI is unavailable";
}

export function decideAiRoute(input: {
  evidence: EvidencePacket;
  env: AiEnvironmentStatus;
  cloudConsent: CloudConsent;
  localConfidence?: number;
  cloudDecision?: "approved" | "declined";
}): RoutingDecision {
  const { evidence, env, cloudConsent, localConfidence, cloudDecision } = input;
  if (isFormRestricted(evidence)) {
    if (env.local === "ready") return { kind: "model", mode: "ONLY_ON_DEVICE" };
    return { kind: "rules-only", reason: `${localUnavailableReason(env)}; using rules-only fallback to keep form text on your device.` };
  }
  const cloudAllowed = env.cloud === "available";
  if (cloudDecision === "declined") {
    return { kind: "rules-only", reason: "Cloud AI declined; using rules-only fallback." };
  }
  if (cloudDecision === "approved") {
    if (cloudAllowed) return { kind: "model", mode: "ONLY_IN_CLOUD" };
    return { kind: "rules-only", reason: "Cloud AI is unavailable; using rules-only fallback." };
  }
  if (evidence.isComplex || (localConfidence !== undefined && localConfidence < 0.7)) {
    if (cloudAllowed && cloudConsent === "granted") return { kind: "model", mode: "ONLY_IN_CLOUD" };
    if (cloudAllowed && cloudConsent === "ask") {
      return { kind: "ask-cloud-consent", reason: "Complex or uncertain issue can use sanitized Cloud AI with your permission." };
    }
    return {
      kind: "rules-only",
      reason: cloudConsent === "denied"
        ? "Cloud AI is turned off for this site; using rules-only fallback."
        : "Cloud AI is unavailable; using rules-only fallback.",
    };
  }
  if (env.local === "ready") {
    return { kind: "model", mode: cloudAllowed && cloudConsent === "granted" ? "PREFER_ON_DEVICE" : "ONLY_ON_DEVICE" };
  }
  if (cloudAllowed && cloudConsent === "granted") return { kind: "model", mode: "ONLY_IN_CLOUD" };
  if (cloudAllowed && cloudConsent === "ask") {
    return { kind: "ask-cloud-consent", reason: `${localUnavailableReason(env)}; Cloud AI can check sanitized page details with your permission.` };
  }
  return { kind: "rules-only", reason: `${localUnavailableReason(env)}; using rules-only fallback.` };
}

export function validateAiDiagnosis(rawText: string, actualSource: "on-device" | "cloud"): Diagnosis | null {
  const trimmed = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsedJson = JSON.parse(trimmed);
    if (typeof parsedJson !== "object" || parsedJson === null || Array.isArray(parsedJson)) return null;
    const candidate = { ...(parsedJson as Record<string, unknown>), source: actualSource };
    const validated = diagnosis.safeParse(candidate);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function buildConsentRequest(env: AiEnvironmentStatus, safeEvidence: EvidencePacket): DiagnosisOutcome {
  const attrPairs = Object.entries(safeEvidence.attributes).map(([key, value]) => `${key}="${value}"`).join(" ");
  const details = attrPairs ? `${safeEvidence.elementSummary} (${attrPairs})` : safeEvidence.elementSummary;
  return {
    status: "needs-cloud-consent",
    env,
    summary: `${safeEvidence.origin}: ${details} — ${safeEvidence.observedBehavior}`,
    sanitizedEvidence: safeEvidence,
  };
}

export async function resolveDiagnosisOutcome(input: {
  evidence: EvidencePacket;
  rulesFallback: Diagnosis;
  env: AiEnvironmentStatus;
  cloudConsent: CloudConsent;
  cloudDecision?: "approved" | "declined";
  runModel: ModelRunner;
}): Promise<DiagnosisOutcome> {
  const safeEvidence = sanitizeEvidence(input.evidence);
  const rulesResult = (note: string): DiagnosisOutcome => ({
    status: "diagnosed",
    diagnosis: { ...input.rulesFallback, source: "rules-only" },
    env: input.env,
    note,
  });
  const route = decideAiRoute({
    evidence: safeEvidence,
    env: input.env,
    cloudConsent: input.cloudConsent,
    cloudDecision: input.cloudDecision,
  });
  if (route.kind === "rules-only") return rulesResult(route.reason);
  if (route.kind === "ask-cloud-consent") return buildConsentRequest(input.env, safeEvidence);

  try {
    const first = await input.runModel(route.mode, safeEvidence);
    const parsed = validateAiDiagnosis(first.rawText, first.inferenceSource);
    if (!parsed) return rulesResult("AI output failed safety validation; using rules-only fallback.");

    if (parsed.source === "on-device" && parsed.confidence < 0.7 && !isFormRestricted(safeEvidence)) {
      const escalation = decideAiRoute({
        evidence: safeEvidence,
        env: input.env,
        cloudConsent: input.cloudConsent,
        localConfidence: parsed.confidence,
      });
      if (escalation.kind === "ask-cloud-consent") return buildConsentRequest(input.env, safeEvidence);
      if (escalation.kind === "model") {
        try {
          const cloudRun = await input.runModel(escalation.mode, safeEvidence);
          const cloudParsed = validateAiDiagnosis(cloudRun.rawText, cloudRun.inferenceSource);
          if (cloudParsed) {
            return { status: "diagnosed", diagnosis: cloudParsed, env: input.env, note: "Diagnosed by Cloud AI after low on-device confidence." };
          }
        } catch {
          return rulesResult("Cloud AI failed after low on-device confidence; using rules-only fallback.");
        }
      }
    }
    return {
      status: "diagnosed",
      diagnosis: parsed,
      env: input.env,
      note: parsed.source === "on-device" ? "Diagnosed privately on your device." : "Diagnosed by Cloud AI using sanitized page details.",
    };
  } catch {
    return rulesResult("AI check could not complete; using rules-only fallback.");
  }
}
