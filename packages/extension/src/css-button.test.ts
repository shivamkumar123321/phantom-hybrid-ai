import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyPointerEventsRepair, diagnoseBlockedButton, findBlockedButtonAtPoint, undoPointerEventsRepair } from "./css-button";

describe("CSS-blocked button repair", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="underlay"><button id="blocked" style="pointer-events: none">Run</button></div>';
  });

  it("finds a blocked button even when the click lands on its parent", () => {
    const parent = document.querySelector("#underlay")!;
    const button = document.querySelector<HTMLButtonElement>("#blocked")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30 } as DOMRect);
    expect(findBlockedButtonAtPoint(parent, 20, 20)).toBe(button);
    expect(findBlockedButtonAtPoint(parent, 200, 200)).toBeNull();
    expect(diagnoseBlockedButton().action).toBe("RESTORE_POINTER_EVENTS");
  });

  it("restores the exact original inline pointer-events value and priority", () => {
    const button = document.querySelector<HTMLButtonElement>("#blocked")!;
    button.style.setProperty("pointer-events", "none", "important");
    const original = applyPointerEventsRepair(button);
    expect(button.style.getPropertyValue("pointer-events")).toBe("auto");
    undoPointerEventsRepair(button, original);
    expect(button.style.getPropertyValue("pointer-events")).toBe("none");
    expect(button.style.getPropertyPriority("pointer-events")).toBe("important");
  });

  it("detects CSS-blocked links and role=button elements as interactive controls", () => {
    document.body.innerHTML = '<div id="wrap"><a id="blocked-link" href="#ok" style="pointer-events: none">Open</a><div id="blocked-role" role="button" style="pointer-events: none">Act</div></div>';
    const link = document.querySelector<HTMLAnchorElement>("#blocked-link")!;
    const roleBtn = document.querySelector<HTMLElement>("#blocked-role")!;
    const wrap = document.querySelector("#wrap")!;
    vi.spyOn(link, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, right: 90, bottom: 30, width: 80, height: 20 } as DOMRect);
    vi.spyOn(roleBtn, "getBoundingClientRect").mockReturnValue({ left: 10, top: 40, right: 90, bottom: 60, width: 80, height: 20 } as DOMRect);
    expect(findBlockedButtonAtPoint(wrap, 20, 20)).toBe(link);
    expect(findBlockedButtonAtPoint(wrap, 20, 50)).toBe(roleBtn);
  });

  it("removes its own inline style when no inline value existed", () => {
    const button = document.querySelector<HTMLButtonElement>("#blocked")!;
    button.style.removeProperty("pointer-events");
    const original = applyPointerEventsRepair(button);
    undoPointerEventsRepair(button, original);
    expect(button.style.getPropertyValue("pointer-events")).toBe("");
  });
});
