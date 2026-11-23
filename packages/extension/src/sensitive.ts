const sensitiveWords = /password|passcode|payment|card|credit|cvv|cvc|expiry|exp-date|security|login|log-in|sign-in|signin|authentication|auth|otp|one-time|verification|2fa|mfa/i;
const sensitiveAutocomplete = /^(?:current-password|new-password|one-time-code|cc-|webauthn)/i;

function describesSensitiveControl(element: Element): boolean {
  const attributes = ["name", "id", "type", "autocomplete", "aria-label", "placeholder", "role", "data-testid"];
  return attributes.some((name) => {
    const value = element.getAttribute(name);
    return value !== null && (sensitiveWords.test(value) || (name === "autocomplete" && sensitiveAutocomplete.test(value)));
  });
}

export function isSensitiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input[type="password"], [contenteditable="true"]')) return true;
  for (let current: Element | null = target; current; current = current.parentElement) {
    if (describesSensitiveControl(current)) return true;
    if (current instanceof HTMLFormElement) {
      if (current.querySelector('input[type="password"], input[autocomplete^="cc-"], input[autocomplete="one-time-code"]')) return true;
      if (sensitiveWords.test(current.getAttribute("action") ?? "")) return true;
    }
  }
  return false;
}
