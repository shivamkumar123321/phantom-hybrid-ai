# 08: Ask before cloud diagnosis

**What to build:** PHANTOM offers cloud AI for complex or uncertain cases only after the user approves sanitized evidence, with a per-site remember option.

**Blocked by:** 07: Diagnose with on-device AI.

**Status:** ready-for-agent

- [x] The user sees a one-click cloud confirmation and can remember consent for that site; consent can be changed later.
- [x] Evidence sent to cloud AI excludes passwords, tokens, cookies, email addresses, and sensitive form values.
- [x] Form and entered-text cases never route to cloud AI, including when on-device AI is unavailable.
- [x] Cloud refusal or failure has a truthful rules-only or no-diagnosis outcome; actual inference source is displayed.
- [x] Contract tests cover sanitization, routing, consent, and source reporting.
