const sensitiveWords = /(?:^|[^a-z])(?:password|passcode|payment|pay|checkout|billing|bank|card|credit|cvv|cvc|expiry|exp-date|security|login|log[ -]?in|sign[ -]?in|authentication|auth|otp|one-time|verification|2fa|mfa)(?=$|[^a-z])/i;
const sensitiveAutocomplete = /^(?:current-password|new-password|one-time-code|cc-|webauthn)/i;

function describesSensitiveControl(element: Element): boolean {
  const attributes = ["name", "id", "type", "autocomplete", "aria-label", "placeholder", "role", "data-testid"];
  if (attributes.some((name) => {
    const value = element.getAttribute(name);
    const words = value?.replace(/([a-z])([A-Z])/g, "$1 $2");
    return words !== undefined && (sensitiveWords.test(words) || (name === "autocomplete" && sensitiveAutocomplete.test(words)));
  })) return true;
  if (element instanceof HTMLButtonElement && sensitiveWords.test(element.textContent ?? "")) return true;
  if (element instanceof HTMLAnchorElement) {
    return sensitiveWords.test(element.textContent ?? "") || sensitiveWords.test(element.getAttribute("href") ?? "");
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
      if ([...current.querySelectorAll("button")].some((button) => sensitiveWords.test(button.textContent ?? ""))) return true;
      if (sensitiveWords.test(current.getAttribute("action") ?? "")) return true;
    }
  }
  return false;
}
