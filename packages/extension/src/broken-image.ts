import type { Diagnosis } from "@phantom/shared";

export type OriginalImageSource = { src: string | null; srcset: string | null };

export function isFailedImage(image: HTMLImageElement): boolean {
  return image.hasAttribute("src") && image.complete && image.naturalWidth === 0;
}

function safeSource(image: HTMLImageElement, candidate: string): string | null {
  try {
    const url = new URL(candidate, image.ownerDocument.location.href);
    const current = new URL(image.getAttribute("src") ?? "", image.ownerDocument.location.href);
    const rendered = image.currentSrc ? new URL(image.currentSrc, image.ownerDocument.location.href) : null;
    if (!(["http:", "https:"].includes(url.protocol) && url.origin === image.ownerDocument.location.origin)) return null;
    return url.href === current.href || url.href === rendered?.href ? null : candidate;
  } catch {
    return null;
  }
}

export function knownImageFallback(image: HTMLImageElement): string | null {
  for (const attribute of ["data-fallback-src", "data-src"] as const) {
    const candidate = image.getAttribute(attribute)?.trim();
    if (candidate) {
      const safe = safeSource(image, candidate);
      if (safe) return safe;
    }
  }
  const srcset = image.getAttribute("srcset");
  if (srcset) {
    for (const entry of srcset.split(",")) {
      const candidate = entry.trim().split(/\s+/)[0];
      if (candidate) {
        const safe = safeSource(image, candidate);
        if (safe) return safe;
      }
    }
  }
  return null;
}

export function diagnoseBrokenImage(image: HTMLImageElement): Diagnosis {
  const fallback = knownImageFallback(image);
  return {
    reason: "This image did not load.",
    confidence: 0.98,
    source: "rules-only",
    action: fallback ? "USE_KNOWN_IMAGE_FALLBACK" : "NO_SAFE_REPAIR",
    safety: fallback
      ? "The backup image source is already in the page. Undo restores the original source."
      : "The page provides no trusted backup image source, so PHANTOM will not guess one.",
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

export function isImageFallbackLoaded(image: HTMLImageElement, fallback: string): boolean {
  if (!image.complete || image.naturalWidth <= 0) return false;
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
