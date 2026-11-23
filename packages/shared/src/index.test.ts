import { describe, expect, it } from "vitest";
import { monitoringMessage, siteOrigin } from "./index";

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
});
