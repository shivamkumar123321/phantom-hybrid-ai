# 13: Make the browser demo checks runnable from a fresh checkout

**What to build:** A contributor can set up the required browser and run PHANTOM's full extension and Demo Website checks with one clear, repeatable command. If the browser is missing, the check explains the fix before running any scenarios.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] A fresh checkout has documented setup steps for the required Playwright Chromium browser and the app build.
- [x] Running the browser checks without Chromium gives a short, actionable setup message instead of six identical test failures.
- [ ] After setup, the full browser suite runs against the locally served Demo Website and AI Companion, and its results are recorded, including any real product failures found.
- [x] The check is repeatable in automated builds so a missing browser or broken demo journey is caught before release.

## Verification

The local preflight stopped with the setup command before any scenario ran. The app build completed. The Chromium download then failed because this environment could not resolve `cdn.playwright.dev`, so the six browser scenarios could not be run here. The automated build is configured to install Chromium and its system dependencies before running them.
