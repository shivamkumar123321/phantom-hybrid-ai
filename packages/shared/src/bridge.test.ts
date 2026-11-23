import { describe, expect, it } from "vitest";
import { companionRequest, companionResponse, isAllowedCompanionOrigin, parseCompanionOrigins } from "./bridge";

describe("companion messaging bridge contract", () => {
  it("restricts allowed companion origins and permits valid production https origins", () => {
    expect(isAllowedCompanionOrigin("http://127.0.0.1:4174")).toBe(true);
    expect(isAllowedCompanionOrigin("http://localhost:4174")).toBe(true);
    expect(isAllowedCompanionOrigin("https://evil.example")).toBe(false);
    expect(parseCompanionOrigins("https://phantom-companion.web.app/path")).toContain("https://phantom-companion.web.app");
    expect(parseCompanionOrigins("http://insecure.example")).not.toContain("http://insecure.example");
  });

  it("validates request and response envelopes with message ids", () => {
    expect(companionRequest.safeParse({ id: "req-1", type: "GET_AI_STATUS" }).success).toBe(true);
    expect(companionRequest.safeParse({ id: "", type: "GET_AI_STATUS" }).success).toBe(false);
    expect(companionResponse.safeParse({
      id: "req-1",
      type: "AI_STATUS_RESPONSE",
      env: { local: "unavailable", cloud: "unavailable" },
    }).success).toBe(true);
  });
});
