import { z } from "zod";

export const evidencePacket = z.object({
  origin: z.string().url(),
  kind: z.enum(["navigation", "css-button", "image", "form-button", "manual"]),
  tagName: z.string().max(40),
  role: z.string().max(40).nullable(),
  elementSummary: z.string().max(240),
  attributes: z.record(z.string().max(64), z.string().max(300)),
  observedBehavior: z.string().max(300),
  hasFormOrUserText: z.boolean(),
  isComplex: z.boolean(),
  relatedElementCount: z.number().int().min(1).max(50),
});

export type EvidencePacket = z.infer<typeof evidencePacket>;

const sensitiveKeyPattern = /(password|passcode|passwd|token|auth|cookie|secret|key|session|value|email|card|cvv|cvc|ssn)/i;

export function sanitizeText(raw: string, maxLength = 240): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[REDACTED_TOKEN]")
    .replace(/\b(?:AIza|sk-|ghp_|gho_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]")
    .replace(/((?:password|passcode|passwd|secret|token|cookie|session|auth|api[_-]?key|cvv|cvc)\s*[:=]\s*)([^\s;,&"']+)/gi, "$1[REDACTED]")
    .replace(/([?&][a-z0-9_-]*(?:token|auth|session|secret|password|passwd|key|code|email|cookie|credential)[a-z0-9_-]*=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[REDACTED_NUMBER]")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEvidence(raw: EvidencePacket): EvidencePacket {
  const safeAttributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.attributes)) {
    if (sensitiveKeyPattern.test(key)) continue;
    safeAttributes[sanitizeText(key, 64)] = sanitizeText(value, 300);
  }
  return evidencePacket.parse({
    origin: raw.origin,
    kind: raw.kind,
    tagName: sanitizeText(raw.tagName, 40).toLowerCase(),
    role: raw.role ? sanitizeText(raw.role, 40) : null,
    elementSummary: sanitizeText(raw.elementSummary, 240),
    attributes: safeAttributes,
    observedBehavior: sanitizeText(raw.observedBehavior, 300),
    hasFormOrUserText: raw.hasFormOrUserText,
    isComplex: raw.isComplex,
    relatedElementCount: Math.max(1, Math.min(50, Math.round(raw.relatedElementCount))),
  });
}
