import { describe, expect, it } from "vitest";
import { sanitizeEvidence } from "./sanitize";

describe("evidence sanitization", () => {
  it("strips sensitive attribute keys and redacts tokens, cookies, emails, and card numbers", () => {
    const cleaned = sanitizeEvidence({
      origin: "https://example.com",
      kind: "navigation",
      tagName: "A",
      role: "link",
      elementSummary: "Contact alice@example.com with Bearer secret.jwt.token",
      attributes: {
        href: "/account?access_token=abc123xyz&session_id=s99&user_email=a@b.co&view=home",
        "data-href": "/home",
        "data-token": "should-drop",
        "data-auth-header": "should-drop",
        cookie: "session=xyz",
        password: "hunter2",
        value: "typed-secret",
        email: "alice@example.com",
        "data-card": "4111-1111-1111-1111",
      },
      observedBehavior: "cookie=sess_999 card 4111 1111 1111 1111 password=letmein AIzaSyD1234567890",
      hasFormOrUserText: false,
      isComplex: false,
      relatedElementCount: 1,
    });

    expect(cleaned.tagName).toBe("a");
    expect(cleaned.attributes).toEqual({
      href: "/account?access_token=[REDACTED]&session_id=[REDACTED]&user_email=[REDACTED]&view=home",
      "data-href": "/home",
    });
    expect(cleaned.elementSummary).not.toContain("alice@example.com");
    expect(cleaned.elementSummary).not.toContain("secret.jwt.token");
    expect(cleaned.observedBehavior).not.toContain("sess_999");
    expect(cleaned.observedBehavior).not.toContain("4111");
    expect(cleaned.observedBehavior).not.toContain("letmein");
    expect(cleaned.observedBehavior).not.toContain("AIzaSyD1234567890");
  });
});
