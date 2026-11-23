import {
  companionRequest,
  formatAiAvailability,
  resolveDiagnosisOutcome,
  type AiEnvironmentStatus,
  type CompanionResponse,
} from "@phantom/shared";
import { enableOnDeviceModel, getAiEnvironmentStatus, runHybridModel } from "./firebase-ai";

const bridgeStatus = document.querySelector<HTMLElement>("#bridge-status")!;
const localStatus = document.querySelector<HTMLElement>("#local-status")!;
const cloudStatus = document.querySelector<HTMLElement>("#cloud-status")!;
const enableButton = document.querySelector<HTMLButtonElement>("#enable-local")!;
const downloadStatus = document.querySelector<HTMLElement>("#download-status")!;
const lastRoute = document.querySelector<HTMLElement>("#last-route")!;

function renderEnvironment(env: AiEnvironmentStatus): void {
  const labels = formatAiAvailability(env);
  localStatus.textContent = labels.local;
  cloudStatus.textContent = labels.cloud;
  enableButton.disabled = env.cloud !== "available" || env.local === "ready" || env.local === "downloading";
}

async function refreshStatus(): Promise<AiEnvironmentStatus> {
  const env = await getAiEnvironmentStatus();
  renderEnvironment(env);
  return env;
}

enableButton.addEventListener("click", async () => {
  downloadStatus.textContent = "Starting on-device model download…";
  enableButton.disabled = true;
  try {
    await enableOnDeviceModel((progress) => {
      downloadStatus.textContent = `Download progress: ${Math.round(progress * 100)}%`;
      void refreshStatus();
    });
    downloadStatus.textContent = "On-device AI model is ready.";
  } catch (error) {
    downloadStatus.textContent = error instanceof Error ? error.message : "Could not enable on-device AI.";
  }
  await refreshStatus();
});

function connectToExtension(): void {
  const extensionId = new URLSearchParams(location.search).get("ext") ?? "";
  if (!/^[a-p]{32}$/.test(extensionId) || typeof chrome === "undefined" || !chrome.runtime?.connect) {
    bridgeStatus.textContent = "Standby: open this companion through the PHANTOM extension.";
    return;
  }
  try {
    const port = chrome.runtime.connect(extensionId, { name: "phantom-companion" });
    bridgeStatus.textContent = "Connected securely to the PHANTOM extension.";
    port.onMessage.addListener((untrusted: unknown) => {
      const parsed = companionRequest.safeParse(untrusted);
      if (!parsed.success) return;
      const req = parsed.data;
      if (req.type === "GET_AI_STATUS") {
        void refreshStatus().then((env) => {
          const reply: CompanionResponse = { id: req.id, type: "AI_STATUS_RESPONSE", env };
          port.postMessage(reply);
        });
        return;
      }
      void (async () => {
        const env = await refreshStatus();
        const outcome = await resolveDiagnosisOutcome({
          evidence: req.evidence,
          rulesFallback: req.rulesFallback,
          env,
          cloudConsent: req.cloudConsent,
          cloudDecision: req.cloudDecision,
          runModel: runHybridModel,
        });
        lastRoute.textContent = outcome.status === "diagnosed"
          ? `Last check (${outcome.diagnosis.source}): ${outcome.note}`
          : `Waiting for user permission before Cloud AI check on ${req.evidence.origin}.`;
        const reply: CompanionResponse = { id: req.id, type: "DIAGNOSE_RESPONSE", outcome };
        port.postMessage(reply);
      })();
    });
    port.onDisconnect.addListener(() => {
      bridgeStatus.textContent = "Extension connection closed.";
    });
  } catch {
    bridgeStatus.textContent = "Could not connect to the PHANTOM extension.";
  }
}

void refreshStatus();
connectToExtension();
