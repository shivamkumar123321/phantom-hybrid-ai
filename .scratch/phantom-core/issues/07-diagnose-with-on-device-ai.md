# 07: Diagnose with on-device AI

**What to build:** Investigation opens or focuses the AI Companion and uses on-device AI for suitable issues while keeping rules available when AI cannot run.

**Blocked by:** 02: Find and repair broken navigation.

**Status:** ready-for-agent

- [ ] The extension opens or focuses one AI Companion tab and exchanges validated, timed, origin-restricted messages with it.
- [ ] Simple single-element cases prefer on-device AI; form or entered-text cases require on-device processing.
- [ ] AI output is validated against the fixed Diagnosis and Repair Action contracts; unknown actions and malformed output are rejected.
- [ ] The user sees the actual inference source, model availability or download state, and rules-only fallback when applicable.
- [ ] Contract tests cover routing, validation, and unavailable-model fallback.
