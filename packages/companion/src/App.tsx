import { useEffect, useMemo, useState } from "react";
import { Background, Controls, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  companionRequest,
  formatAiAvailability,
  outcomeToPipelineEvents,
  PIPELINE_STAGES,
  reducePipelineRun,
  resolveDiagnosisOutcome,
  UNAVAILABLE_AI_ENV,
  type AiEnvironmentStatus,
  type CompanionResponse,
  type PipelineEvent,
  type PipelineStage,
  type PipelineStageStatus,
} from "@phantom/shared";
import { enableOnDeviceModel, getAiEnvironmentStatus, runHybridModel } from "./firebase-ai";

const statusColors: Record<PipelineStageStatus, string> = {
  done: "#16a34a",
  waiting: "#eab308",
  idle: "#334155",
};

const stageCoords: Record<PipelineStage, { x: number; y: number }> = {
  detection: { x: 10, y: 95 },
  evidence: { x: 185, y: 95 },
  routing: { x: 360, y: 95 },
  diagnosis: { x: 700, y: 95 },
  approval: { x: 10, y: 235 },
  repair: { x: 185, y: 235 },
  verification: { x: 360, y: 235 },
  history: { x: 535, y: 235 },
};

export function App() {
  const [env, setEnv] = useState<AiEnvironmentStatus>(UNAVAILABLE_AI_ENV);
  const [bridgeStatus, setBridgeStatus] = useState("Waiting for extension connection…");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [lastRoute, setLastRoute] = useState("No diagnosis requests yet.");
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);

  const appendEvents = (incoming: PipelineEvent[]) => {
    setEvents((prev) => [...prev, ...incoming].slice(-40));
  };

  const refreshStatus = async (): Promise<AiEnvironmentStatus> => {
    const next = await getAiEnvironmentStatus();
    setEnv(next);
    return next;
  };

  useEffect(() => {
    void refreshStatus();
    const extensionId = new URLSearchParams(location.search).get("ext") ?? "";
    if (!/^[a-p]{32}$/.test(extensionId) || typeof chrome === "undefined" || !chrome.runtime?.connect) {
      setBridgeStatus("Standby: open this companion through the PHANTOM extension.");
      return;
    }
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect(extensionId, { name: "phantom-companion" });
    } catch {
      setBridgeStatus("Could not connect to the PHANTOM extension.");
      return;
    }
    setBridgeStatus("Connected securely to the PHANTOM extension.");
    port.onMessage.addListener((untrusted: unknown) => {
      const parsed = companionRequest.safeParse(untrusted);
      if (!parsed.success) return;
      const req = parsed.data;
      if (req.type === "GET_AI_STATUS") {
        void refreshStatus().then((latest) => {
          port.postMessage({ id: req.id, type: "AI_STATUS_RESPONSE", env: latest } satisfies CompanionResponse);
        });
        return;
      }
      if (req.type === "PIPELINE_EVENT") {
        appendEvents([req.event]);
        return;
      }
      void (async () => {
        const latest = await refreshStatus();
        const runId = req.runId ?? crypto.randomUUID();
        const outcome = await resolveDiagnosisOutcome({
          evidence: req.evidence,
          rulesFallback: req.rulesFallback,
          env: latest,
          cloudConsent: req.cloudConsent,
          cloudDecision: req.cloudDecision,
          runModel: runHybridModel,
        });
        appendEvents(outcomeToPipelineEvents(runId, req.evidence.origin, outcome));
        setLastRoute(
          outcome.status === "needs-cloud-consent"
            ? `Waiting for user permission before Cloud AI check on ${req.evidence.origin}.`
            : `Last check (${outcome.diagnosis.source}): ${outcome.note}`,
        );
        port.postMessage({ id: req.id, type: "DIAGNOSE_RESPONSE", outcome } satisfies CompanionResponse);
      })();
    });
    port.onDisconnect.addListener(() => {
      setBridgeStatus("Extension connection closed.");
    });
    return () => {
      try { port.disconnect(); } catch { /* Already disconnected. */ }
    };
  }, []);

  const handleEnableLocal = async () => {
    setDownloadStatus("Starting on-device model download…");
    try {
      await enableOnDeviceModel((progress) => {
        setDownloadStatus(`Download progress: ${Math.round(progress * 100)}%`);
        void refreshStatus();
      });
      setDownloadStatus("On-device AI model is ready.");
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : "Could not enable on-device AI.");
    }
    await refreshStatus();
  };

  const labels = formatAiAvailability(env);
  const summary = useMemo(() => reducePipelineRun(events), [events]);

  const nodes: Node[] = useMemo(() => {
    const stageNodes: Node[] = PIPELINE_STAGES.map((stage) => {
      const snap = summary.stages[stage.id];
      return {
        id: stage.id,
        position: stageCoords[stage.id],
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 152,
          padding: 8,
          borderRadius: 8,
          background: "#131726",
          color: "#e5e7eb",
          border: `2px solid ${statusColors[snap.status]}`,
        },
        data: {
          label: (
            <div className="stage-node">
              <div className="stage-title">{stage.label}</div>
              <div className="stage-status">{snap.status}</div>
              <div className="stage-detail">{snap.detail}</div>
            </div>
          ),
        },
      };
    });

    const onDeviceActive = summary.route === "ONLY_ON_DEVICE" || summary.route === "PREFER_ON_DEVICE";
    const cloudActive = summary.route === "ONLY_IN_CLOUD" || summary.route === "needs-consent";
    const rulesActive = summary.route === "RULES_ONLY";

    const branchNodes: Node[] = [
      {
        id: "route-on-device",
        position: { x: 535, y: 12 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: { width: 140, padding: 6, borderRadius: 8, background: "#131726", color: "#e5e7eb", border: `2px solid ${onDeviceActive ? "#16a34a" : "#334155"}` },
        data: { label: <div className="stage-node"><div className="stage-title">On-Device AI</div><div className="stage-status">{labels.local}</div></div> },
      },
      {
        id: "route-cloud",
        position: { x: 535, y: 95 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: { width: 140, padding: 6, borderRadius: 8, background: "#131726", color: "#e5e7eb", border: `2px solid ${summary.route === "needs-consent" ? "#eab308" : cloudActive ? "#16a34a" : "#334155"}` },
        data: { label: <div className="stage-node"><div className="stage-title">Cloud AI (Consent)</div><div className="stage-status">{summary.route === "needs-consent" ? "awaiting consent" : labels.cloud}</div></div> },
      },
      {
        id: "route-rules",
        position: { x: 535, y: 175 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: { width: 140, padding: 6, borderRadius: 8, background: "#131726", color: "#e5e7eb", border: `2px solid ${rulesActive ? "#16a34a" : "#334155"}` },
        data: { label: <div className="stage-node"><div className="stage-title">Rules-Only</div><div className="stage-status">{rulesActive ? "active" : "standby"}</div></div> },
      },
    ];
    return [...stageNodes, ...branchNodes];
  }, [summary, labels]);

  const edges: Edge[] = useMemo(() => [
    { id: "detection->evidence", source: "detection", target: "evidence" },
    { id: "evidence->routing", source: "evidence", target: "routing" },
    { id: "routing->on-device", source: "routing", target: "route-on-device", animated: summary.route === "ONLY_ON_DEVICE" || summary.route === "PREFER_ON_DEVICE" },
    { id: "routing->cloud", source: "routing", target: "route-cloud", animated: summary.route === "ONLY_IN_CLOUD" || summary.route === "needs-consent" },
    { id: "routing->rules", source: "routing", target: "route-rules", animated: summary.route === "RULES_ONLY" },
    { id: "on-device->diagnosis", source: "route-on-device", target: "diagnosis" },
    { id: "cloud->diagnosis", source: "route-cloud", target: "diagnosis" },
    { id: "rules->diagnosis", source: "route-rules", target: "diagnosis" },
    { id: "diagnosis->approval", source: "diagnosis", target: "approval" },
    { id: "approval->repair", source: "approval", target: "repair" },
    { id: "repair->verification", source: "repair", target: "verification", animated: summary.stages.verification.status === "waiting" },
    { id: "verification->history", source: "verification", target: "history" },
  ], [summary]);

  const inspected = selectedStage ? summary.stages[selectedStage] : null;
  const routeLabel = summary.route ?? "idle";
  const sourceLabel = summary.source ?? "none yet";

  return (
    <main>
      <header>
        <h1>PHANTOM AI Companion</h1>
        <p className="subtitle">Runs on-device and cloud diagnosis checks and visualizes the live pipeline.</p>
      </header>

      <section className="card">
        <h2>Connection &amp; AI Status</h2>
        <p id="bridge-status" role="status" aria-live="polite">{bridgeStatus}</p>
        <p id="local-status">{labels.local}</p>
        <p id="cloud-status">{labels.cloud}</p>
        <button
          id="enable-local"
          type="button"
          disabled={env.cloud !== "available" || env.local === "ready" || env.local === "downloading"}
          onClick={() => { void handleEnableLocal(); }}
        >
          Enable On-Device AI
        </button>
        <p id="download-status" aria-live="polite">{downloadStatus}</p>
      </section>

      <section className="card">
        <h2>Live Diagnosis Pipeline</h2>
        <div className="badges">
          <span id="routing-badge" className="badge badge-accent">Route: {routeLabel}</span>
          <span id="source-badge" className="badge">AI Source: {sourceLabel}</span>
          <span id="model-badge" className="badge">{labels.local} · {labels.cloud}</span>
        </div>
        <p id="last-route">{lastRoute}</p>
        <div className="pipeline-flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_event, node) => {
              if (PIPELINE_STAGES.some((s) => s.id === node.id)) setSelectedStage(node.id as PipelineStage);
            }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {inspected && selectedStage && (
          <div id="stage-inspector" className="inspector">
            <strong>{PIPELINE_STAGES.find((s) => s.id === selectedStage)?.label}</strong> — {inspected.status}: {inspected.detail}
          </div>
        )}
      </section>
    </main>
  );
}
