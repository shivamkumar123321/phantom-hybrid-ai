import { beforeEach, describe, expect, it } from "vitest";
import { applyImageFallback, applyImagePlaceholder, diagnoseBrokenImage, isFailedImage, isImageFallbackLoaded, knownImageFallback, restoreImageSource } from "./broken-image";

describe("broken image repair", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function image(markup: string): HTMLImageElement {
    document.body.innerHTML = markup;
    return document.querySelector("img")!;
  }

  it("uses a page-provided fallback (same-origin, https CDN, or lazy attributes) and restores the original source", () => {
    const target = image('<img src="/missing.png" srcset="/missing-2.png 2x" data-fallback-src="/good.png">');
    expect(knownImageFallback(target)).toBe("/good.png");
    expect(diagnoseBrokenImage(target).action).toBe("USE_KNOWN_IMAGE_FALLBACK");
    const original = applyImageFallback(target)!;
    expect(target.getAttribute("src")).toBe("/good.png");
    expect(target.hasAttribute("srcset")).toBe(false);
    restoreImageSource(target, original);
    expect(target.getAttribute("src")).toBe("/missing.png");
    expect(target.getAttribute("srcset")).toBe("/missing-2.png 2x");

    expect(knownImageFallback(image('<img src="/missing.png" data-lazy-src="https://cdn.example/good.webp">'))).toBe("https://cdn.example/good.webp");
  });

  it("uses a safe local SVG placeholder when no backup URL exists, and restores original src on undo", () => {
    const target = image('<img src="/asdf.jpg" alt="Missing banner">');
    const diag = diagnoseBrokenImage(target);
    expect(diag.action).toBe("REPLACE_BROKEN_IMAGE_PLACEHOLDER");
    const { original, placeholder } = applyImagePlaceholder(target);
    expect(placeholder).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(placeholder)).toContain("Missing banner");
    expect(target.getAttribute("src")).toBe(placeholder);
    restoreImageSource(target, original);
    expect(target.getAttribute("src")).toBe("/asdf.jpg");
  });

  it.each([
    '<img src="/missing.png">',
    '<img src="/missing.png" data-fallback-src="javascript:alert(1)">',
    '<img src="/missing.png" data-fallback-src="http://elsewhere.example/good.png">',
    '<img src="/missing.png" data-fallback-src="/missing.png">',
  ])("refuses unsafe or missing backups in applyImageFallback and never writes unsafe URLs: %s", (markup) => {
    const target = image(markup);
    expect(knownImageFallback(target)).toBeNull();
    expect(applyImageFallback(target)).toBeNull();
    expect(target.getAttribute("src")).toBe("/missing.png");
  });

  it("escapes HTML/script characters in alt text inside SVG placeholders", () => {
    const target = image('<img src="/bad.jpg">');
    target.setAttribute("alt", '<script>alert(1)</script>');
    const { placeholder } = applyImagePlaceholder(target);
    const decoded = decodeURIComponent(placeholder);
    expect(decoded).not.toContain("<script>");
    expect(decoded).toContain("&lt;script&gt;");
  });

  it("can use an explicit srcset alternative", () => {
    expect(knownImageFallback(image('<img src="/missing.png" srcset="/known.png 1x">'))).toBe("/known.png");
  });

  it("does not reuse a srcset source that already failed", () => {
    const target = image('<img src="/missing.png" srcset="/failed.png 1x">');
    Object.defineProperty(target, "currentSrc", { configurable: true, value: new URL("/failed.png", document.location.href).href });
    expect(knownImageFallback(target)).toBeNull();
  });

  it("detects unhydrated lazy images with empty src and requires successful load to verify", () => {
    const lazy = image('<img data-src="/lazy.png">');
    expect(isFailedImage(lazy)).toBe(true);

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
