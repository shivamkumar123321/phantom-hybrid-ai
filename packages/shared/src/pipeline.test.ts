import { describe, expect, it } from "vitest";
import { createPipelineEvent, outcomeToPipelineEvents, reducePipelineRun } from "./pipeline";

describe("diagnosis pipeline state reduction", () => {
  it("sanitizes event details and tracks route, source, and completed stages for the active run", () => {
    const events = [
      createPipelineEvent({ runId: "old-run", origin: "https://demo.example", stage: "detection", status: "done", detail: "Old event" }),
      createPipelineEvent({ runId: "run-2", origin: "https://demo.example", stage: "detection", status: "done", detail: "Broken link for alice@example.com" }),
      createPipelineEvent({ runId: "run-2", origin: "https://demo.example", stage: "routing", status: "done", detail: "On-device AI unavailable; using rules-only fallback.", route: "RULES_ONLY" }),
      createPipelineEvent({ runId: "run-2", origin: "https://demo.example", stage: "diagnosis", status: "done", detail: "RESTORE_NAVIGATION", source: "rules-only" }),
      createPipelineEvent({ runId: "run-2", origin: "https://demo.example", stage: "verification", status: "done", detail: "Verification Result: restored" }),
    ];

    const summary = reducePipelineRun(events);
    expect(summary.runId).toBe("run-2");
    expect(summary.route).toBe("RULES_ONLY");
    expect(summary.source).toBe("rules-only");
    expect(summary.stages.detection.detail).not.toContain("alice@example.com");
    expect(summary.stages.verification.status).toBe("done");
    expect(summary.stages.history.status).toBe("idle");
  });

  it("distinguishes selected route from fallback source and consent-waiting state", () => {
    const fallbackEvents = outcomeToPipelineEvents("run-3", "https://demo.example", {
      status: "diagnosed",
      selectedRoute: "PREFER_ON_DEVICE",
      env: { local: "ready", cloud: "available" },
      note: "Diagnosed by Cloud AI.",
      diagnosis: {
        reason: "Missing destination",
        confidence: 0.9,
        source: "cloud",
        action: "RESTORE_NAVIGATION",
        safety: "Safe",
      },
    });
    const fallbackSummary = reducePipelineRun(fallbackEvents);
    expect(fallbackSummary.route).toBe("PREFER_ON_DEVICE");
    expect(fallbackSummary.source).toBe("cloud");

    const consentEvents = outcomeToPipelineEvents("run-4", "https://demo.example", {
      status: "needs-cloud-consent",
      env: { local: "unavailable", cloud: "available" },
      summary: "Needs consent",
      sanitizedEvidence: {
        origin: "https://demo.example",
        kind: "manual",
        tagName: "button",
        role: null,
        elementSummary: "<button>",
        attributes: {},
        observedBehavior: "Nothing happened",
        hasFormOrUserText: false,
        isComplex: true,
        relatedElementCount: 2,
      },
    });
    const consentSummary = reducePipelineRun(consentEvents);
    expect(consentSummary.route).toBe("needs-consent");
    expect(consentSummary.stages.routing.status).toBe("waiting");
    expect(consentSummary.stages.diagnosis.status).toBe("waiting");
  });
});
