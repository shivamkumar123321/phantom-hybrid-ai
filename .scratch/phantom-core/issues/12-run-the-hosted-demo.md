# 12: Run the hosted demo

**What to build:** The AI Companion and separate Demo Website are ready to run on distinct Firebase Hosting sites, with controls to demonstrate and reset all four failures.

**Blocked by:** 02: Find and repair broken navigation; 03: Find and repair a CSS-blocked button; 04: Find and repair a broken image; 05: Find and repair a broken form button; 07: Diagnose with on-device AI; 08: Ask before cloud diagnosis; 10: Show the live diagnosis pipeline.

**Status:** ready-for-agent

- [ ] The two apps have separate Hosting site configuration and documented environment templates.
- [ ] Production AI calls enforce App Check with reCAPTCHA v3; a debug token is limited to local development and excluded from production builds.
- [ ] The Demo Website control panel activates and resets each failure and shows before and after state and logs.
- [ ] The loaded extension works against the separately hosted Demo Website and AI Companion, with a repeatable four-scenario browser check.
