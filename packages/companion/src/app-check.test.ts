import { describe, expect, it } from "vitest";
import { resolveAppCheckConfig } from "./firebase-ai";

describe("Firebase App Check enforcement policy", () => {
  it("enforces reCAPTCHA v3 and drops debug tokens in production builds", () => {
    expect(resolveAppCheckConfig({
      isProd: true,
      hasFirebaseConfig: true,
      recaptchaSiteKey: "",
      debugToken: "dev-debug-token",
      hostname: "phantom-companion.web.app",
    })).toMatchObject({ allowed: false, mode: "disabled", debugToken: null });

    expect(resolveAppCheckConfig({
      isProd: true,
      hasFirebaseConfig: true,
      recaptchaSiteKey: "6Le-site-key",
      debugToken: "dev-debug-token",
      hostname: "phantom-companion.web.app",
    })).toEqual({ allowed: true, mode: "recaptcha", debugToken: null });
  });

  it("permits debug tokens strictly on local development hosts", () => {
    expect(resolveAppCheckConfig({
      isProd: false,
      hasFirebaseConfig: true,
      recaptchaSiteKey: "",
      debugToken: "local-debug-token",
      hostname: "127.0.0.1",
    })).toEqual({ allowed: true, mode: "debug-only", debugToken: "local-debug-token" });

    expect(resolveAppCheckConfig({
      isProd: false,
      hasFirebaseConfig: true,
      recaptchaSiteKey: "",
      debugToken: "local-debug-token",
      hostname: "hosted.example.com",
    })).toMatchObject({ allowed: false, debugToken: null });

    expect(resolveAppCheckConfig({
      isProd: false,
      hasFirebaseConfig: true,
      recaptchaSiteKey: "",
      debugToken: "local-debug-token",
      hostname: "",
    })).toMatchObject({ allowed: false, debugToken: null });
  });
});
