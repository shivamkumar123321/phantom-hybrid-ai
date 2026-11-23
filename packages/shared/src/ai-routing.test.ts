import { describe, expect, it, vi } from "vitest";
import { cloudConsent, decideAiRoute, resolveDiagnosisOutcome, validateAiDiagnosis } from "./ai-routing";
import type { Diagnosis } from "./contracts";
import type { EvidencePacket } from "./sanitize";

const baseEvidence: EvidencePacket = {
  origin: "https://demo.example",
  kind: "navigation",
  tagName: "a",
  role: "link",
  elementSummary: "Open destination link",
  attributes: { href: "#", "data-href": "#destination" },
  observedBehavior: "Click produced no navigation.",
  hasFormOrUserText: false,
  isComplex: false,
  relatedElementCount: 1,
};

const rulesFallback: Diagnosis = {
  reason: "This link has no working destination.",
  confidence: 0.95,
  source: "rules-only",
  action: "RESTORE_NAVIGATION",
  safety: "Destination exists on page.",
};

describe("hybrid AI routing and validation", () => {
  it("validates cloud consent options", () => {
    expect(cloudConsent.safeParse("ask").success).toBe(true);
    expect(cloudConsent.safeParse("granted").success).toBe(true);
    expect(cloudConsent.safeParse("denied").success).toBe(true);
    expect(cloudConsent.safeParse("auto").success).toBe(false);
  });

  it("never routes form or entered-text issues to cloud even when local AI is unavailable or downloading", async () => {
    const formEvidence: EvidencePacket = { ...baseEvidence, kind: "form-button", hasFormOrUserText: true };
    for (const local of ["unavailable", "downloadable", "downloading"] as const) {
      expect(decideAiRoute({
        evidence: formEvidence,
        env: { local, cloud: "available" },
        cloudConsent: "granted",
        cloudDecision: "approved",
      })).toMatchObject({ kind: "rules-only" });
    }

    const runModel = vi.fn();
    const outcome = await resolveDiagnosisOutcome({
      evidence: formEvidence,
      rulesFallback,
      env: { local: "downloading", cloud: "available" },
      cloudConsent: "granted",
      runModel,
    });
    expect(runModel).not.toHaveBeenCalled();
    expect(outcome.status).toBe("diagnosed");
    if (outcome.status === "diagnosed") expect(outcome.diagnosis.source).toBe("rules-only");
  });

  it("forces ONLY_ON_DEVICE unless cloud consent is granted, and truthfully reports cloud fallback under PREFER_ON_DEVICE", async () => {
    expect(decideAiRoute({
      evidence: baseEvidence,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "ask",
    })).toEqual({ kind: "model", mode: "ONLY_ON_DEVICE" });

    expect(decideAiRoute({
      evidence: baseEvidence,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "granted",
    })).toEqual({ kind: "model", mode: "PREFER_ON_DEVICE" });

    const outcome = await resolveDiagnosisOutcome({
      evidence: baseEvidence,
      rulesFallback,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "granted",
      runModel: async () => ({
        inferenceSource: "cloud",
        rawText: JSON.stringify({ ...rulesFallback, source: "on-device" }),
      }),
    });
    expect(outcome.status).toBe("diagnosed");
    if (outcome.status === "diagnosed") expect(outcome.diagnosis.source).toBe("cloud");
  });

  it("handles cloud consent approval and refusal truthfully even after low-confidence local checks", async () => {
    const runModel = vi.fn()
      .mockResolvedValueOnce({
        inferenceSource: "on-device",
        rawText: JSON.stringify({ ...rulesFallback, confidence: 0.45 }),
      });

    const needsConsent = await resolveDiagnosisOutcome({
      evidence: baseEvidence,
      rulesFallback,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "ask",
      runModel,
    });
    expect(needsConsent.status).toBe("needs-cloud-consent");
    if (needsConsent.status === "needs-cloud-consent") {
      expect(needsConsent.summary).toContain('data-href="#destination"');
    }

    const declined = await resolveDiagnosisOutcome({
      evidence: baseEvidence,
      rulesFallback,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "ask",
      cloudDecision: "declined",
      runModel,
    });
    expect(declined.status).toBe("diagnosed");
    if (declined.status === "diagnosed") expect(declined.diagnosis.source).toBe("rules-only");

    const approvedModel = vi.fn().mockResolvedValueOnce({
      inferenceSource: "cloud",
      rawText: JSON.stringify({ ...rulesFallback, confidence: 0.92 }),
    });
    const approved = await resolveDiagnosisOutcome({
      evidence: baseEvidence,
      rulesFallback,
      env: { local: "ready", cloud: "available" },
      cloudConsent: "ask",
      cloudDecision: "approved",
      runModel: approvedModel,
    });
    expect(approvedModel).toHaveBeenCalledWith("ONLY_IN_CLOUD", expect.any(Object));
    expect(approved.status).toBe("diagnosed");
    if (approved.status === "diagnosed") expect(approved.diagnosis.source).toBe("cloud");
  });

  it("falls back to rules-only if cloud execution throws", async () => {
    const outcome = await resolveDiagnosisOutcome({
      evidence: { ...baseEvidence, isComplex: true },
      rulesFallback,
      env: { local: "unavailable", cloud: "available" },
      cloudConsent: "granted",
      runModel: async () => { throw new Error("Cloud network error"); },
    });
    expect(outcome.status).toBe("diagnosed");
    if (outcome.status === "diagnosed") expect(outcome.diagnosis.source).toBe("rules-only");
  });

  it("rejects unknown repair actions and malformed JSON and falls back to rules-only", async () => {
    expect(validateAiDiagnosis('{"action":"EVAL_SCRIPT"}', "on-device")).toBeNull();
    expect(validateAiDiagnosis("not json at all", "cloud")).toBeNull();

    const outcome = await resolveDiagnosisOutcome({
      evidence: baseEvidence,
      rulesFallback,
      env: { local: "ready", cloud: "unavailable" },
      cloudConsent: "ask",
      runModel: async () => ({ inferenceSource: "on-device", rawText: '{"action":"RUN_ARBITRARY_JS"}' }),
    });
    expect(outcome.status).toBe("diagnosed");
    if (outcome.status === "diagnosed") {
      expect(outcome.diagnosis.source).toBe("rules-only");
      expect(outcome.diagnosis.action).toBe("RESTORE_NAVIGATION");
    }
  });
});
