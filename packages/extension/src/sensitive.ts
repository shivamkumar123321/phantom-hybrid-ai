import { SENSITIVE_CONTROL_WORDS } from "@phantom/shared";

const sensitiveAutocomplete = /^(?:current-password|new-password|one-time-code|cc-|webauthn)/i;

function describesSensitiveControl(element: Element): boolean {
  const attributes = ["name", "id", "type", "autocomplete", "aria-label", "placeholder", "role", "data-testid"];
  if (attributes.some((name) => {
    const value = element.getAttribute(name);
    const words = value?.replace(/([a-z])([A-Z])/g, "$1 $2");
    return words !== undefined && (SENSITIVE_CONTROL_WORDS.test(words) || (name === "autocomplete" && sensitiveAutocomplete.test(words)));
  })) return true;
  if (element instanceof HTMLButtonElement && SENSITIVE_CONTROL_WORDS.test(element.textContent ?? "")) return true;
  if (element instanceof HTMLAnchorElement) {
    return SENSITIVE_CONTROL_WORDS.test(element.textContent ?? "") || SENSITIVE_CONTROL_WORDS.test(element.getAttribute("href") ?? "");
  }
  return false;
}

export function isSensitiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input[type="password"], [contenteditable="true"]')) return true;
  for (let current: Element | null = target; current; current = current.parentElement) {
    if (describesSensitiveControl(current)) return true;
    if (current instanceof HTMLFormElement) {
      if ([...current.querySelectorAll("input, button, select, textarea")].some(describesSensitiveControl)) return true;
      if ([...current.querySelectorAll("button")].some((button) => SENSITIVE_CONTROL_WORDS.test(button.textContent ?? ""))) return true;
      if (SENSITIVE_CONTROL_WORDS.test(current.getAttribute("action") ?? "")) return true;
    }
  }
  return false;
}
