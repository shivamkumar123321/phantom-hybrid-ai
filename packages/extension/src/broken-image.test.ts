import { beforeEach, describe, expect, it } from "vitest";
import { applyImageFallback, diagnoseBrokenImage, isFailedImage, isImageFallbackLoaded, knownImageFallback, restoreImageSource } from "./broken-image";

describe("broken image repair", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function image(markup: string): HTMLImageElement {
    document.body.innerHTML = markup;
    return document.querySelector("img")!;
  }

  it("uses a page-provided fallback and restores the original source", () => {
    const target = image('<img src="/missing.png" srcset="/missing-2.png 2x" data-fallback-src="/good.png">');
    expect(knownImageFallback(target)).toBe("/good.png");
    expect(diagnoseBrokenImage(target).action).toBe("USE_KNOWN_IMAGE_FALLBACK");
    const original = applyImageFallback(target)!;
    expect(target.getAttribute("src")).toBe("/good.png");
    expect(target.hasAttribute("srcset")).toBe(false);
    restoreImageSource(target, original);
    expect(target.getAttribute("src")).toBe("/missing.png");
    expect(target.getAttribute("srcset")).toBe("/missing-2.png 2x");
  });

  it.each([
    '<img src="/missing.png">',
    '<img src="/missing.png" data-fallback-src="javascript:alert(1)">',
    '<img src="/missing.png" data-fallback-src="https://elsewhere.example/good.png">',
    '<img src="/missing.png" data-fallback-src="/missing.png">',
  ])("refuses missing or unsafe backups: %s", (markup) => {
    const target = image(markup);
    expect(diagnoseBrokenImage(target).action).toBe("NO_SAFE_REPAIR");
    expect(applyImageFallback(target)).toBeNull();
  });

  it("can use an explicit srcset alternative", () => {
    expect(knownImageFallback(image('<img src="/missing.png" srcset="/known.png 1x">'))).toBe("/known.png");
  });

  it("does not reuse a srcset source that already failed", () => {
    const target = image('<img src="/missing.png" srcset="/failed.png 1x">');
    Object.defineProperty(target, "currentSrc", { configurable: true, value: new URL("/failed.png", document.location.href).href });
    expect(knownImageFallback(target)).toBeNull();
  });

  it("requires an actual successful load to verify", () => {
    const target = image('<img src="/good.png">');
    Object.defineProperty(target, "complete", { configurable: true, value: true });
    Object.defineProperty(target, "naturalWidth", { configurable: true, value: 0 });
    expect(isFailedImage(target)).toBe(true);
    expect(isImageFallbackLoaded(target, "/good.png")).toBe(false);
    Object.defineProperty(target, "naturalWidth", { configurable: true, value: 100 });
    expect(isImageFallbackLoaded(target, "/good.png")).toBe(true);
    expect(isImageFallbackLoaded(target, "/other.png")).toBe(false);
  });
});
