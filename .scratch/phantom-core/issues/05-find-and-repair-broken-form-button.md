# 05: Find and repair a broken form button

**What to build:** PHANTOM detects a supported, nonsensitive Demo Website form-button failure, previews a local Repair Action, verifies the result safely, and supports Undo.

**Blocked by:** 01: Enable monitoring on a site.

**Status:** ready-for-agent

- [ ] The Demo Website can activate and reset the form-button scenario and show before and after state and logs.
- [ ] Entered text stays on the device; password, payment, login, and security forms are excluded.
- [ ] The Side Panel shows a Diagnosis and preview before RESTORE_BUTTON_SEMANTICS or RESTORE_SUPPORTED_FORM_BEHAVIOR runs.
- [ ] Verification does not submit a sensitive form or claim success from a superficial DOM change; Undo restores the original state.
- [ ] A loaded-extension browser test covers the supported journey and sensitive-form refusal.
