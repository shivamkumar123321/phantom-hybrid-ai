# PHANTOM

PHANTOM is a Chrome extension and hosted AI Companion that spots broken parts of a website, diagnoses why they failed, and applies safe, temporary, and reversible fixes directly in the user's browser.

## How it works

1. **Detection & Manual Picker** — While monitoring is enabled for a site, PHANTOM watches for **Suspected Failures** (such as clicks that produce no visible result, blocked buttons, broken images, or non-submitting form buttons) and can also scan a page or let the user pick an element manually.
2. **Evidence & Sanitization** — Relevant DOM and interaction details are collected and sanitized before any diagnosis runs, avoiding sensitive inputs and pages.
3. **Hybrid AI Routing** — Diagnosis can run using deterministic rules, on-device AI (Chrome Prompt API) inside the **AI Companion**, or cloud AI (Firebase AI Logic) with explicit per-site user consent.
4. **Allowlisted, Reversible Repairs** — Models and rules only return structured **Repair Actions** from a fixed allowlist (for example: restoring a link, unblocking `pointer-events`, restoring button semantics, switching to a backup image, or restoring form submit behavior). PHANTOM never executes generated JavaScript or CSS, and every repair can be undone.
5. **Verification & History** — After applying a **Repair Action**, PHANTOM records a **Verification Result** to confirm whether the expected behavior was restored and logs the outcome in repair history.
6. **Community Repair Network** — Verified fixes can be cleaned up into shareable **Repair Recipes** (stored in Firestore) so other users can review and apply community-approved fixes.

## Project structure

This repository is an npm workspaces monorepo with four packages:

- **`packages/extension`** (`@phantom/extension`) — Manifest V3 Chrome extension containing the background service worker, side panel UI, content script scanner, manual element picker, and deterministic repair/undo engine.
- **`packages/companion`** (`@phantom/companion`) — React web app (**AI Companion**) hosted on Firebase Hosting. It bridges to the extension via `externally_connectable`, visualizes the live diagnosis pipeline (`@xyflow/react`), runs on-device (Chrome Prompt API) and cloud (Firebase AI Logic) models with Firebase App Check, and connects to Firestore for community recipes.
- **`packages/demo`** (`@phantom/demo`) — A standalone Demo Website with four deliberately broken client-side scenarios for testing and demonstrating PHANTOM:
  1. Broken navigation link (`href="#"` with a `data-href` target)
  2. CSS-blocked button (`pointer-events: none`)
  3. Broken image (with and without a `data-fallback-src` backup)
  4. Broken form button (`type="button"` instead of `type="submit"`)
- **`packages/shared`** (`@phantom/shared`) — Shared TypeScript types and Zod schemas for messages, diagnoses, repair actions, pipeline events, sanitization, AI routing, history, and community recipes.

## Architecture & documentation

- [`GLOSSARY.md`](./GLOSSARY.md) — Core domain terminology used across the codebase.
- [`docs/adr/0001-hosted-ai-companion-bridge.md`](./docs/adr/0001-hosted-ai-companion-bridge.md) — Why AI runs in the hosted AI Companion rather than the MV3 service worker.
- [`docs/adr/0002-allowlisted-declarative-repairs.md`](./docs/adr/0002-allowlisted-declarative-repairs.md) — Why PHANTOM only executes allowlisted, schema-validated Repair Actions.
- [`firebase.json`](./firebase.json) & [`firestore.rules`](./firestore.rules) — Firebase Hosting targets (`companion` and `demo`) and Firestore security rules.

## Getting started

Prerequisites: **Node.js** and **npm**.

```bash
npm ci
npm run build
```

### Environment variables (optional for local AI / Firebase)

- Copy `packages/companion/.env.example` to `packages/companion/.env` to configure Firebase, App Check (reCAPTCHA Enterprise), and local debug tokens.
- Copy `packages/extension/.env.example` to `packages/extension/.env` if you want to point extension builds at a custom `COMPANION_ORIGIN`.

### Running locally

Start the AI Companion and Demo Website servers after building:

```bash
npm run start -w @phantom/companion
npm run start -w @phantom/demo
```

To load the extension in Chrome, open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked** pointing to `packages/extension/dist`.

## Checks & tests

- **Typecheck:** `npm run typecheck`
- **Unit tests (Vitest):** `npm test`
- **End-to-end browser tests (Playwright):**
  1. Run `npm run setup:e2e` to build all apps and install Playwright Chromium.
  2. Run `npm run test:e2e` to test the loaded extension against the locally served Demo Website and AI Companion.

If Chromium is missing, `npm run test:e2e` stops with the setup command before running any scenarios.

