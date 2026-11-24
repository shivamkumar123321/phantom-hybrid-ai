import type { Diagnosis } from "@phantom/shared";

export type OriginalImageSource = { src: string | null; srcset: string | null };

const fallbackAttributes = ["data-fallback-src", "data-src", "data-lazy-src", "data-original"] as const;

export function isFailedImage(image: HTMLImageElement): boolean {
  const rawSrc = image.getAttribute("src")?.trim() ?? "";
  if (rawSrc && image.complete && image.naturalWidth === 0) return true;
  if (!rawSrc && Boolean(knownImageFallback(image))) return true;
  return false;
}

function safeSource(image: HTMLImageElement, candidate: string): string | null {
  try {
    const pageUrl = new URL(image.ownerDocument.location.href);
    const url = new URL(candidate, pageUrl.href);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const sameOrigin = url.origin === pageUrl.origin;
    if (!sameOrigin && url.protocol !== "https:") return null;
    const currentRaw = image.getAttribute("src")?.trim() ?? "";
    const current = currentRaw ? new URL(currentRaw, pageUrl.href) : null;
    const rendered = image.currentSrc ? new URL(image.currentSrc, pageUrl.href) : null;
    if ((current && url.href === current.href) || (rendered && url.href === rendered.href)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function pickFromSrcset(image: HTMLImageElement, rawSrcset: string | null): string | null {
  if (!rawSrcset) return null;
  for (const entry of rawSrcset.split(",")) {
    const candidate = entry.trim().split(/\s+/)[0];
    if (candidate) {
      const safe = safeSource(image, candidate);
      if (safe) return safe;
    }
  }
  return null;
}

export function knownImageFallback(image: HTMLImageElement): string | null {
  for (const attribute of fallbackAttributes) {
    const candidate = image.getAttribute(attribute)?.trim();
    if (candidate) {
      const safe = safeSource(image, candidate);
      if (safe) return safe;
    }
  }
  return pickFromSrcset(image, image.getAttribute("data-srcset")) ?? pickFromSrcset(image, image.getAttribute("srcset"));
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  ));
}

function clampSize(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

function placeholderLabel(image: HTMLImageElement): string {
  const alt = image.getAttribute("alt")?.trim();
  if (alt) return alt.slice(0, 28);
  const rawSrc = image.getAttribute("src")?.trim() ?? "";
  if (rawSrc && !rawSrc.startsWith("data:")) {
    const file = rawSrc.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "";
    if (file) return file.slice(0, 28);
  }
  return "Image unavailable";
}

export function buildSafeImagePlaceholder(image: HTMLImageElement): string {
  const rect = image.getBoundingClientRect();
  const attrW = Number(image.getAttribute("width"));
  const attrH = Number(image.getAttribute("height"));
  const width = clampSize(rect.width || attrW, 80, 600, 160);
  const height = clampSize(rect.height || attrH, 60, 600, 120);
  const label = escapeXml(placeholderLabel(image));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="10" fill="#1e1535"/>`,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9" fill="none" stroke="#7c3aed" stroke-opacity="0.65" stroke-width="1.5"/>`,
    `<circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2) - 10}" r="11" fill="#7c3aed" fill-opacity="0.28"/>`,
    `<path d="M${Math.round(width / 2) - 6} ${Math.round(height / 2) - 6}l4-5 3 4 2-2 3 3z" fill="#c4b5fd"/>`,
    `<text x="${Math.round(width / 2)}" y="${Math.round(height / 2) + 16}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#e2e8f0">${label}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function diagnoseBrokenImage(image: HTMLImageElement): Diagnosis {
  const fallback = knownImageFallback(image);
  if (fallback) {
    return {
      reason: "This image did not load.",
      confidence: 0.98,
      source: "rules-only",
      action: "USE_KNOWN_IMAGE_FALLBACK",
      safety: "The backup image source is already in the page. Undo restores the original source.",
    };
  }
  return {
    reason: "This image failed to load and has no backup URL in the page.",
    confidence: 0.95,
    source: "rules-only",
    action: "REPLACE_BROKEN_IMAGE_PLACEHOLDER",
    safety: "Replaces the broken image locally with a clean offline placeholder showing its label. No external URLs are invented, and Undo restores the original image source.",
  };
}

export function applyImageFallback(image: HTMLImageElement): OriginalImageSource | null {
  const fallback = knownImageFallback(image);
  if (!fallback) return null;
  const original = { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") };
  image.removeAttribute("srcset");
  image.setAttribute("src", fallback);
  return original;
}

export function applyImagePlaceholder(image: HTMLImageElement): { original: OriginalImageSource; placeholder: string } {
  const original = { src: image.getAttribute("src"), srcset: image.getAttribute("srcset") };
  const placeholder = buildSafeImagePlaceholder(image);
  image.removeAttribute("srcset");
  image.setAttribute("src", placeholder);
  return { original, placeholder };
}

export function isImageFallbackLoaded(image: HTMLImageElement, fallback: string): boolean {
  if (!image.complete || image.naturalWidth <= 0) return false;
  if (fallback.startsWith("data:image/svg+xml")) return image.getAttribute("src") === fallback;
  try {
    const expected = new URL(fallback, image.ownerDocument.location.href);
    const actual = new URL(image.currentSrc || image.src, image.ownerDocument.location.href);
    return actual.href === expected.href;
  } catch {
    return false;
  }
}

export function restoreImageSource(image: HTMLImageElement, original: OriginalImageSource): void {
  if (original.src === null) image.removeAttribute("src");
  else image.setAttribute("src", original.src);
  if (original.srcset === null) image.removeAttribute("srcset");
  else image.setAttribute("srcset", original.srcset);
}
