# 04: Find and repair a broken image

**What to build:** PHANTOM detects a failed Demo Website image and offers a reversible replacement from an image source already present on the page.

**Blocked by:** 01: Enable monitoring on a site.

**Status:** ready-for-agent

- [ ] The Demo Website can activate and reset a broken image and show before and after state and logs.
- [ ] The Side Panel presents a Diagnosis and preview before USE_KNOWN_IMAGE_FALLBACK runs.
- [ ] A fallback is accepted only from an approved existing page attribute; missing or unsafe sources yield NO_SAFE_REPAIR.
- [ ] Verification confirms the replacement loaded; Undo restores the original image state.
- [ ] A loaded-extension browser test covers the journey and the no-fallback case.
