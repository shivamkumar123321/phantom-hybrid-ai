# 02: Find and repair broken navigation

**What to build:** PHANTOM detects a broken Demo Website link, lets the user investigate and preview a safe Repair Action, verifies restored navigation, and supports Undo.

**Blocked by:** 01: Enable monitoring on a site.

**Status:** ready-for-agent

- [ ] The Demo Website can activate and reset a broken navigation scenario and show relevant before and after state and logs.
- [ ] PHANTOM marks a Suspected Failure without interrupting browsing and offers Investigate in the Side Panel.
- [ ] A Diagnosis shows the reason, confidence, source, proposed Repair Action, and safety explanation before Apply Repair.
- [ ] RESTORE_NAVIGATION accepts only a destination already present in an approved page attribute; otherwise it returns NO_SAFE_REPAIR.
- [ ] Applying the repair produces an honest Verification Result and Undo restores the original state.
- [ ] A loaded-extension browser test covers the journey.
