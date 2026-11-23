import { beforeEach, describe, expect, it } from "vitest";
import { isSensitiveTarget } from "./sensitive";

describe("sensitive target exclusion", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it.each([
    '<input type="password">',
    '<form action="/login"><button>Continue</button></form>',
    '<form><input autocomplete="cc-number"><button>Pay</button></form>',
    '<button aria-label="Verify OTP">Continue</button>',
    '<div contenteditable="true">text</div>',
  ])("excludes sensitive interaction: %s", (html) => {
    document.body.innerHTML = html;
    expect(isSensitiveTarget(document.querySelector("button, input, div")!)).toBe(true);
  });

  it("admits an ordinary button", () => {
    document.body.innerHTML = '<button id="more">Show more</button>';
    expect(isSensitiveTarget(document.querySelector("button"))).toBe(false);
  });
});
