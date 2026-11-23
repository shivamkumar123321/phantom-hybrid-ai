# 03: Find and repair a CSS-blocked button

**What to build:** PHANTOM detects and repairs a Demo Website button blocked by pointer events, verifies that it works, and lets the user undo the change.

**Blocked by:** 01: Enable monitoring on a site.

**Status:** ready-for-agent

- [ ] The Demo Website can activate and reset the blocked-button scenario and show before and after state and logs.
- [ ] Click observation waits about 0.7 seconds for a visible outcome, except when a JavaScript error provides an immediate signal.
- [ ] The Side Panel presents a Diagnosis and safe preview before RESTORE_POINTER_EVENTS runs.
- [ ] Verification checks restored behavior before a success outline appears; Undo restores the original state.
- [ ] A loaded-extension browser test covers detection through Undo.
