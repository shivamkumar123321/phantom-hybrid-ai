import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectPickedElement, resolvePickableTarget } from "./manual-picker";

describe("manual element picker", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("diagnoses a picked broken navigation link", () => {
    document.body.innerHTML = '<a id="link" href="#" data-href="#destination">Open</a>';
    const target = resolvePickableTarget(document.querySelector("#link"))!;
    const result = inspectPickedElement(target);
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.kind).toBe("navigation");
      expect(result.diagnosis.action).toBe("RESTORE_NAVIGATION");
    }
  });

  it("resolves and diagnoses a CSS-blocked button via coordinates", () => {
    document.body.innerHTML = '<div id="wrap"><button id="blocked" style="pointer-events: none">Run</button></div>';
    const wrap = document.querySelector("#wrap")!;
    const button = document.querySelector<HTMLButtonElement>("#blocked")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30 } as DOMRect);
    const target = resolvePickableTarget(wrap, 25, 25)!;
    expect(target).toBe(button);
    const result = inspectPickedElement(target);
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.kind).toBe("css-button");
      expect(result.diagnosis.action).toBe("RESTORE_POINTER_EVENTS");
    }
  });

  it("diagnoses a failed image with a backup source", () => {
    document.body.innerHTML = '<img id="img" src="/missing.png" data-fallback-src="/backup.svg">';
    const img = document.querySelector<HTMLImageElement>("#img")!;
    Object.defineProperty(img, "complete", { configurable: true, value: true });
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 0 });
    const result = inspectPickedElement(resolvePickableTarget(img)!);
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.kind).toBe("image");
      expect(result.diagnosis.action).toBe("USE_KNOWN_IMAGE_FALLBACK");
    }
  });

  it("diagnoses a supported broken form button", () => {
    document.body.innerHTML = '<form><input name="demo"><button id="save" type="button" data-phantom-submit>Save</button></form>';
    const button = document.querySelector<HTMLButtonElement>("#save")!;
    const result = inspectPickedElement(resolvePickableTarget(button)!);
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.kind).toBe("form-button");
      expect(result.diagnosis.action).toBe("RESTORE_BUTTON_SEMANTICS");
    }
  });

  it("returns NO_SAFE_REPAIR for a safe element with no supported repair", () => {
    document.body.innerHTML = '<div id="plain"><span id="label">Nothing here</span></div>';
    const result = inspectPickedElement(resolvePickableTarget(document.querySelector("#label"))!);
    expect(result.blocked).toBe(false);
    if (!result.blocked) {
      expect(result.kind).toBe("manual");
      expect(result.diagnosis.action).toBe("NO_SAFE_REPAIR");
    }
  });

  it("refuses sensitive controls", () => {
    document.body.innerHTML = [
      '<input id="pw" type="password">',
      '<button id="plain-btn" type="button">Log in</button>',
      '<a id="auth-link" href="/login">Account</a>',
      '<form id="pay"><input name="cardNumber"><button id="pay-btn" type="button" data-phantom-submit>Continue</button></form>',
    ].join("");
    for (const selector of ["#pw", "#plain-btn", "#auth-link", "#pay-btn"]) {
      const target = resolvePickableTarget(document.querySelector(selector))!;
      expect(inspectPickedElement(target)).toEqual({
        blocked: true,
        reason: "Sensitive controls cannot be inspected or repaired.",
      });
    }
  });
});
