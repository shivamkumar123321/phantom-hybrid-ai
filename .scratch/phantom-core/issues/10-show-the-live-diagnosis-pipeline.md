# 10: Show the live diagnosis pipeline

**What to build:** The AI Companion shows an interactive view of a run from detection and AI routing through repair and verification.

**Blocked by:** 07: Diagnose with on-device AI; 08: Ask before cloud diagnosis.

**Status:** ready-for-agent

- [ ] The pipeline view updates from actual run events and shows the selected route, actual AI source, and each completed stage.
- [ ] The routing view distinguishes on-device, cloud, and rules-only outcomes, including unavailable-model and consent states.
- [ ] The view remains useful for a rules-only run and does not display sensitive page data.
- [ ] A browser test checks that a real demo run appears accurately in the view.
