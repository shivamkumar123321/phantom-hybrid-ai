# PHANTOM

PHANTOM is a Chrome extension that finds broken website controls and offers reversible repairs. The project includes an AI Companion and a separate Demo Website with four broken scenarios.

## Run the browser demo checks

From a fresh checkout, with Node.js and npm installed:

1. Run `npm ci`.
2. Run `npm run setup:e2e` to build all three apps and install Playwright Chromium.
3. Run `npm run test:e2e` to check the loaded extension against the locally served Demo Website and AI Companion.

If Chromium is missing, the test command stops with the setup command before running any scenarios. You can also run `npm run typecheck` and `npm test` for the other checks.
