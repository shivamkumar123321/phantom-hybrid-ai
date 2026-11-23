import { z } from "zod";
import { failureKind, siteOrigin, type Diagnosis } from "./contracts";
import { sanitizeText, SENSITIVE_CONTROL_WORDS, SENSITIVE_CREDENTIAL_TEXT, SENSITIVE_DATA_WORDS } from "./sanitize";

export const shareableRepairAction = z.enum([
  "RESTORE_NAVIGATION",
  "RESTORE_POINTER_EVENTS",
  "RESTORE_BUTTON_SEMANTICS",
  "USE_KNOWN_IMAGE_FALLBACK",
  "RESTORE_SUPPORTED_FORM_BEHAVIOR",
]);

export type ShareableRepairAction = z.infer<typeof shareableRepairAction>;

const unsafeMarkupOrScriptPattern = /(?:<|>|javascript:|data:text\/html|eval\s*\(|new\s+Function\s*\()/i;
const validOriginPattern = /^https?:\/\/[^/\s]+$/;
const validTagPattern = /^[a-z0-9-]+$/;
const validSelectorPattern = /^[a-zA-Z0-9#._\[\]="':\- ]+$/;

function hasUnsafeProse(text: string): boolean {
  return SENSITIVE_DATA_WORDS.test(text) || SENSITIVE_CREDENTIAL_TEXT.test(text) || unsafeMarkupOrScriptPattern.test(text);
}

export const repairRecipe = z.object({
  id: z.string().min(1).max(128).optional(),
  origin: z.string().regex(validOriginPattern).max(200),
  bugType: failureKind,
  elementTag: z.string().regex(validTagPattern).min(1).max(20),
  selectorHint: z.string().regex(validSelectorPattern).min(1).max(80),
  summary: z.string().min(1).max(180),
  repairAction: shareableRepairAction,
  safetyNote: z.string().min(1).max(200),
  createdAt: z.string().min(10).max(40),
  authorUid: z.string().min(1).max(128).optional(),
}).superRefine((value, ctx) => {
  if (SENSITIVE_CONTROL_WORDS.test(value.selectorHint) || hasUnsafeProse(value.selectorHint)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectorHint"], message: "Rejected sensitive or unsafe selectorHint" });
  }
  for (const [field, content] of [["summary", value.summary], ["safetyNote", value.safetyNote]] as const) {
    if (hasUnsafeProse(content)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `Rejected sensitive or unsafe content in ${field}` });
    }
  }
});

export type RepairRecipe = z.infer<typeof repairRecipe>;

export function communityRecipesKey(origin: string): string {
  return `community-recipes:${origin}`;
}

export function createRepairRecipe(input: {
  origin: string;
  bugType: z.infer<typeof failureKind>;
  elementTag: string;
  selectorHint: string;
  summary: string;
  repairAction: ShareableRepairAction;
  safetyNote: string;
  createdAt?: string;
}): RepairRecipe | null {
  const normalizedOrigin = siteOrigin(input.origin) ?? "";
  const candidate = {
    origin: normalizedOrigin,
    bugType: input.bugType,
    elementTag: input.elementTag.trim().toLowerCase(),
    selectorHint: input.selectorHint.trim(),
    summary: sanitizeText(input.summary, 180),
    repairAction: input.repairAction,
    safetyNote: sanitizeText(input.safetyNote, 200),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const parsed = repairRecipe.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function validateCommunityRecipe(untrusted: unknown): RepairRecipe | null {
  const parsed = repairRecipe.safeParse(untrusted);
  return parsed.success ? parsed.data : null;
}

export function filterValidRecipes(items: unknown, origin?: string): RepairRecipe[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => validateCommunityRecipe(item))
    .filter((item): item is RepairRecipe => item !== null && (origin === undefined || item.origin === origin));
}

export function recipeToDiagnosis(recipe: RepairRecipe): Diagnosis {
  return {
    reason: recipe.summary,
    confidence: 0.85,
    source: "rules-only",
    action: recipe.repairAction,
    safety: `Community Repair Recipe (requires your approval): ${recipe.safetyNote}`,
  };
}
