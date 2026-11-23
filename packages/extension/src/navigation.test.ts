import { beforeEach, describe, expect, it } from "vitest";
import { diagnoseNavigation, hasBrokenDestination, knownDestination } from "./navigation";

describe("broken navigation", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  function link(html: string): HTMLAnchorElement {
    document.body.innerHTML = html;
    return document.querySelector("a")!;
  }
  it("recognizes a broken link and an explicit same-site destination", () => {
    const anchor = link('<a href="#" data-href="/destination">Go</a>');
    expect(hasBrokenDestination(anchor)).toBe(true);
    expect(knownDestination(anchor)).toBe("/destination");
    expect(diagnoseNavigation(anchor).action).toBe("RESTORE_NAVIGATION");
  });
  it.each(['<a href="#">Go</a>', '<a href="#" data-href="javascript:alert(1)">Go</a>', '<a href="#" data-href="https://elsewhere.test/">Go</a>'])("refuses an untrusted destination: %s", (html) => {
    expect(diagnoseNavigation(link(html)).action).toBe("NO_SAFE_REPAIR");
  });
  it("does not flag a working link", () => {
    expect(hasBrokenDestination(link('<a href="/destination">Go</a>'))).toBe(false);
  });
});
