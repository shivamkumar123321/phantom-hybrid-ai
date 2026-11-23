import { siteOrigin } from "@phantom/shared";
import { isSensitiveTarget } from "./sensitive";

const origin = siteOrigin(location.href);
let enabled = false;

function observeClick(event: MouseEvent): void {
  if (!enabled || isSensitiveTarget(event.target)) return;
  // Ticket 02 adds failure detection. This boundary only admits safe interactions.
}

if (origin) {
  chrome.runtime.sendMessage({ type: "GET_MONITORING", origin }).then((state: { enabled?: boolean }) => {
    enabled = state.enabled === true;
  }).catch(() => { enabled = false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[`monitoring:${origin}`]) {
      enabled = changes[`monitoring:${origin}`].newValue === true;
    }
  });
  document.addEventListener("click", observeClick, true);
}
