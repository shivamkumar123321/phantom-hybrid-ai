import { beforeEach, describe, expect, it } from "vitest";
import { scanPageForIssues } from "./scanner";

describe("proactive page scanner", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("finds multiple broken images, CSS-blocked controls, broken links, and broken form buttons while skipping sensitive controls", () => {
    document.body.innerHTML = [
      '<img id="img1" src="/asdf.jpg">',
      '<img id="img2" src="/hjkl.jpg">',
      '<a id="blocked-link" href="#target" style="pointer-events: none">Open section</a>',
      '<a id="hint-link" href="#" data-to="#dest">Go dest</a>',
      '<form id="safe-form"><input name="note"><button id="ext-submit" type="button">Submit</button></form>',
      '<form id="login-form"><input type="password"><button id="login-btn" type="button">Submit</button></form>',
    ].join("");
    for (const img of document.images) {
      Object.defineProperty(img, "complete", { configurable: true, value: true });
      Object.defineProperty(img, "naturalWidth", { configurable: true, value: 0 });
    }

    const issues = scanPageForIssues(document);
    expect(issues.map((i) => i.target.id)).toEqual(["img1", "img2", "blocked-link", "hint-link", "ext-submit"]);
    expect(issues.map((i) => i.diagnosis.action)).toEqual([
      "REPLACE_BROKEN_IMAGE_PLACEHOLDER",
      "REPLACE_BROKEN_IMAGE_PLACEHOLDER",
      "RESTORE_POINTER_EVENTS",
      "RESTORE_NAVIGATION",
      "RESTORE_BUTTON_SEMANTICS",
    ]);
  });
});
