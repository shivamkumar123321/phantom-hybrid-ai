import { beforeEach, describe, expect, it } from "vitest";
import { isSensitiveTarget } from "./sensitive";

describe("sensitive target exclusion", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it.each([
    '<input type="password">',
    '<form action="/login"><button>Continue</button></form>',
    '<form><input autocomplete="cc-number"><button>Pay</button></form>',
    '<form><input name="cardNumber"><button>Continue</button></form>',
    '<form><input name="userName"><button>Sign in</button></form>',
    '<button aria-label="Verify OTP">Continue</button>',
    '<button type="button">Log in</button>',
    '<a href="/login">Account</a>',
    '<div contenteditable="true">text</div>',
  ])("excludes sensitive interaction: %s", (html) => {
    document.body.innerHTML = html;
    expect(isSensitiveTarget(document.querySelector("button, a, input, div"))).toBe(true);
  });

  it("admits an ordinary button", () => {
    document.body.innerHTML = '<button id="more">Show more</button>';
    expect(isSensitiveTarget(document.querySelector("button"))).toBe(false);
  });
  it("does not mistake unrelated names for sensitive controls", () => {
    document.body.innerHTML = '<button id="discard">Discard</button>';
    expect(isSensitiveTarget(document.querySelector("button"))).toBe(false);
  });
});
