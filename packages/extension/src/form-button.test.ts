import { beforeEach, describe, expect, it } from "vitest";
import { applyFormButtonRepair, diagnoseFormButton, supportedFormButton, verifiesFormButton } from "./form-button";

describe("form button repair", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function button(html = '<form><input name="comment"><button type="button"><span>Send feedback</span></button></form>'): HTMLButtonElement {
    document.body.innerHTML = html;
    return document.querySelector("button")!;
  }

  it("offers a reversible repair for a nonsensitive form button", () => {
    const target = button();
    expect(supportedFormButton(target.querySelector("span"))).toBe(target);
    expect(diagnoseFormButton(target).action).toBe("RESTORE_BUTTON_SEMANTICS");
    const undo = applyFormButtonRepair(target);
    expect(target.type).toBe("submit");
    undo?.();
    expect(target.getAttribute("type")).toBe("button");
  });

  it.each([
    '<form><input type="password"><button type="button">Continue</button></form>',
    '<form><input name="cardNumber"><button type="button">Continue</button></form>',
    '<form action="/login"><button type="button">Continue</button></form>',
    '<form><input autocomplete="one-time-code"><button type="button">Continue</button></form>',
  ])("refuses sensitive forms: %s", (html) => {
    const target = button(html);
    expect(supportedFormButton(target)).toBeNull();
    expect(diagnoseFormButton(target).action).toBe("NO_SAFE_REPAIR");
    expect(applyFormButtonRepair(target)).toBeNull();
    expect(target.type).toBe("button");
  });

  it("does not treat a working or detached button as broken", () => {
    expect(supportedFormButton(button('<form><button type="submit">Send</button></form>'))).toBeNull();
    expect(supportedFormButton(button('<button type="button">Send</button>'))).toBeNull();
  });

  it("requires this button's submit event before verification", () => {
    const target = button();
    const other = document.createElement("button");
    other.type = "submit";
    target.form!.append(other);
    const submit = new SubmitEvent("submit", { submitter: target });
    const unrelated = new SubmitEvent("submit", { submitter: other });
    target.form!.dispatchEvent(submit);
    expect(verifiesFormButton(submit, target)).toBe(true);
    target.form!.dispatchEvent(unrelated);
    expect(verifiesFormButton(unrelated, target)).toBe(false);
    expect(target.type).toBe("button");
  });
});
