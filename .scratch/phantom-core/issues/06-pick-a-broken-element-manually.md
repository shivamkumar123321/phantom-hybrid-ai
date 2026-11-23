# 06: Pick a broken element manually

**What to build:** The Side Panel's “Something is broken” action lets a user select an element missed by automatic detection and investigate it through the existing repair journey.

**Blocked by:** 02: Find and repair broken navigation.

**Status:** ready-for-agent

- [x] Picking works while the Side Panel remains open and clearly highlights the current target.
- [x] A picked safe element can be diagnosed, previewed, repaired, verified, and undone.
- [x] Sensitive controls cannot be selected for inspection or repair.
- [x] A loaded-extension browser test covers a missed element and cancellation.
