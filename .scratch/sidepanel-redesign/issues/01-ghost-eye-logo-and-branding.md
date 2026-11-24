# 01: Add Ghost Eye logo across extension and websites

**What to build:** Give PHANTOM the Ghost Eye visual identity across the Chrome extension (toolbar/manifest icons and SVG mark) and both web apps (Demo Website and AI Companion favicons and page headers).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Extension has Ghost Eye SVG mark and crisp 16×16, 32×32, 48×48, and 128×128 PNG icons registered in `manifest.json` (`icons` and `action.default_icon`) and copied into `packages/extension/dist/`.
- [x] Demo Website and AI Companion each display the Ghost Eye favicon and header logo mark and copy the favicon into their `dist/` output on build.
- [x] `npm run build`, `npm run typecheck`, and `npm test` pass.
