import { describe, expect, it } from "vitest";
import { monitoringMessage, repairCommand, siteOrigin } from "./index";

describe("monitoring contract", () => {
  it("accepts a site setting", () => {
    expect(monitoringMessage.safeParse({ type: "SET_MONITORING", origin: "https://example.com", enabled: true }).success).toBe(true);
  });
  it("rejects malformed settings", () => {
    expect(monitoringMessage.safeParse({ type: "SET_MONITORING", origin: "https://example.com", enabled: "yes" }).success).toBe(false);
  });
  it("only derives web origins", () => {
    expect(siteOrigin("https://example.com/path")).toBe("https://example.com");
    expect(siteOrigin("chrome://settings")).toBeNull();
  });
  it("accepts manual picker commands", () => {
    expect(repairCommand.safeParse({ type: "GET_PICKER_STATE" }).success).toBe(true);
    expect(repairCommand.safeParse({ type: "START_PICKING" }).success).toBe(true);
    expect(repairCommand.safeParse({ type: "CANCEL_PICKING" }).success).toBe(true);
  });
});
