# 02: Redesign PHANTOM side panel with Soft Gradient theme

**What to build:** Rebuild the PHANTOM Chrome extension side panel in the Soft Gradient (Variant D) glassmorphic purple-pink theme with the Ghost Eye header logo, token-driven CSS, full 7-state interactive coverage, and WCAG 2.2 AA accessibility — while keeping every existing sidepanel behavior and selector intact.

**Blocked by:** 01: Add Ghost Eye logo across extension and websites

**Status:** done

- [x] Side panel uses the Soft Gradient dark purple-pink gradient background, frosted glass cards, gradient pill primary buttons, and Ghost Eye header logo.
- [x] All existing interactive controls and IDs (`#site`, `#monitor`, `#status`, `#cloud-consent`, `#ai-status`, `#pick`, `#cancel-pick`, `#picker-status`, `#cloud-confirm`, `#cloud-summary`, `#cloud-remember`, `#cloud-approve`, `#cloud-decline`, `#failure`, `#failure-status`, `#diagnosis`, `#reason`, `#confidence`, `#source`, `#diagnosis-note`, `#action`, `#safety`, `#investigate`, `#apply`, `#undo`, `#share-recipe`, `#share-status`, `#community`, `#community-status`, `#community-empty`, `#community-list`, `#history`, `#history-empty`, `#history-list`) remain wired and functional without breaking `packages/extension/src/sidepanel.ts`.
- [x] All interactive elements cover idle, hover, active, focus-visible (2px ring), disabled, loading/status, and empty/error states with readable dark dropdown options.
- [x] `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` (all 6 Playwright specs) pass.
