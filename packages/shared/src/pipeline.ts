import { z } from "zod";
import { selectedRouteName, type DiagnosisOutcome, type SelectedRouteName } from "./ai-routing";
import { sanitizeText } from "./sanitize";

export const PIPELINE_STAGES = [
  { id: "detection", label: "Detection" },
  { id: "evidence", label: "Evidence & Sanitization" },
  { id: "routing", label: "AI Routing" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "approval", label: "User Approval" },
  { id: "repair", label: "Repair" },
  { id: "verification", label: "Verification" },
  { id: "history", label: "Repair History" },
] as const;

export const pipelineStage = z.enum([
  "detection",
  "evidence",
  "routing",
  "diagnosis",
  "approval",
  "repair",
  "verification",
  "history",
]);

export type PipelineStage = z.infer<typeof pipelineStage>;
export type PipelineStageStatus = "idle" | "done" | "waiting";
export const inferenceSource = z.enum(["on-device", "cloud", "rules-only"]);
export type InferenceSourceName = z.infer<typeof inferenceSource>;

export const pipelineRoute = z.enum(["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "ONLY_IN_CLOUD", "RULES_ONLY", "needs-consent"]);
export type PipelineRoute = z.infer<typeof pipelineRoute>;

export const pipelineEvent = z.object({
  runId: z.string().min(1),
  origin: z.string().url(),
  stage: pipelineStage,
  status: z.enum(["done", "waiting"]),
  detail: z.string().max(200),
  route: pipelineRoute.nullable(),
  source: inferenceSource.nullable(),
  timestamp: z.string().min(1),
});

export type PipelineEvent = z.infer<typeof pipelineEvent>;

export type StageSnapshot = {
  status: PipelineStageStatus;
  detail: string;
};

export type PipelineRunSummary = {
  runId: string | null;
  route: PipelineRoute | null;
  source: InferenceSourceName | null;
  stages: Record<PipelineStage, StageSnapshot>;
  recentEvents: PipelineEvent[];
};

export function createPipelineEvent(input: {
  runId: string;
  origin: string;
  stage: PipelineStage;
  status: PipelineEvent["status"];
  detail: string;
  route?: PipelineRoute | null;
  source?: InferenceSourceName | null;
  timestamp?: string;
}): PipelineEvent {
  return pipelineEvent.parse({
    runId: input.runId,
    origin: input.origin,
    stage: input.stage,
    status: input.status,
    detail: sanitizeText(input.detail, 200),
    route: input.route ?? null,
    source: input.source ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

export function outcomeToPipelineEvents(runId: string, origin: string, outcome: DiagnosisOutcome): PipelineEvent[] {
  const evidenceEvent = createPipelineEvent({
    runId,
    origin,
    stage: "evidence",
    status: "done",
    detail: "Sanitized page metadata ready",
  });
  if (outcome.status === "needs-cloud-consent") {
    return [
      evidenceEvent,
      createPipelineEvent({ runId, origin, stage: "routing", status: "waiting", detail: "Waiting for user permission to ask Cloud AI", route: "needs-consent" }),
      createPipelineEvent({ runId, origin, stage: "diagnosis", status: "waiting", detail: "Consent required before cloud call", route: "needs-consent" }),
    ];
  }
  const route: SelectedRouteName = outcome.selectedRoute ?? selectedRouteName.enum.RULES_ONLY;
  return [
    evidenceEvent,
    createPipelineEvent({ runId, origin, stage: "routing", status: "done", detail: outcome.note, route, source: outcome.diagnosis.source }),
    createPipelineEvent({ runId, origin, stage: "diagnosis", status: "done", detail: `${outcome.diagnosis.action} (${outcome.diagnosis.source})`, route, source: outcome.diagnosis.source }),
  ];
}

export function reducePipelineRun(events: readonly PipelineEvent[]): PipelineRunSummary {
  const stages = Object.fromEntries(
    PIPELINE_STAGES.map(({ id }) => [id, { status: "idle", detail: "Waiting" }]),
  ) as Record<PipelineStage, StageSnapshot>;

  if (events.length === 0) {
    return { runId: null, route: null, source: null, stages, recentEvents: [] };
  }

  const latestRunId = events[events.length - 1].runId;
  const runEvents = events.filter((event) => event.runId === latestRunId);
  let route: PipelineRoute | null = null;
  let source: InferenceSourceName | null = null;

  for (const event of runEvents) {
    if (event.route !== null) route = event.route;
    if (event.source !== null) source = event.source;
    stages[event.stage] = { status: event.status, detail: event.detail };
  }

  return {
    runId: latestRunId,
    route,
    source,
    stages,
    recentEvents: runEvents.slice(-12),
  };
}
