Status: ready-for-agent

# PHANTOM — Self-Repair Browser Layer

## Problem Statement

People using websites regularly hit broken client-side interactions: buttons that do nothing when clicked, navigation links with missing destinations, forms whose submit button is misconfigured, images that fail to load, and controls blocked by faulty CSS. Users cannot fix these issues themselves, and website owners often do not know they exist or take weeks to deploy a fix.

## Solution

PHANTOM is a Manifest V3 Chrome extension paired with a Firebase-hosted **AI Companion** web app. After a user enables monitoring on a site, PHANTOM watches for broken interactions using lightweight browser signals, flags a **Suspected Failure**, collects and sanitizes minimal page evidence, routes analysis between on-device Gemini Nano and cloud Gemini via the Firebase AI Logic Hybrid Inference SDK, presents a clear **Diagnosis** and preview in the Chrome Side Panel, applies an allowlisted, reversible **Repair Action** in the user's browser, checks the **Verification Result**, and records the outcome in local repair history (with optional sharing to a **Community Repair Network**).

## User Stories

1. As a website user, I want PHANTOM to stay off by default on new websites and let me enable monitoring per site, so that my browsing stays private and banking or login sites are never touched automatically.
2. As a website user, I want PHANTOM to automatically skip password fields, payment forms, and login or security controls even when monitoring is enabled, so that sensitive credentials and financial actions are never inspected or modified.
3. As a website user, I want PHANTOM to watch button clicks, links, forms, images, CSS-blocked controls, and page errors without slowing down the webpage, so that broken interactions are caught as I browse.
4. As a website user, I want PHANTOM to wait about 0.7 seconds after a button click before flagging a **Suspected Failure** (unless a JavaScript error fires immediately), so that normal buttons doing quiet background work do not trigger false alarms.
5. As a website user, I want to see a subtle outline and notification when PHANTOM spots a **Suspected Failure**, so that I can choose to click **Investigate** without interrupting my browsing.
6. As a website user, I want a **"Something is broken"** manual picker in the Side Panel, so that I can click any broken element on the page when automatic detection did not catch it.
7. As a website user, I want PHANTOM to open or focus the **AI Companion** tab automatically when I click **Investigate** and no companion tab is open, so that I do not have to manage it manually.
8. As a website user, I want PHANTOM to keep form and user-entered text analysis strictly on-device, so that my form inputs never leave my computer.
9. As a website user, I want PHANTOM to try on-device AI first for simple single-element issues (like a blocked button, broken image, or link missing its destination), so that diagnosis is fast and private.
10. As a website user, I want PHANTOM to ask my permission with a one-click confirmation (and a "Remember for this site" option) before sending sanitized page metadata to cloud AI for complex or low-confidence cases, so that I stay in control of what goes to the cloud.
11. As a website user, I want PHANTOM to clearly show whether the **Diagnosis** came from on-device AI, cloud AI, or rules-only fallback, along with model availability and download status, so that I always know what actually ran.
12. As a website user, I want to see what went wrong, how confident PHANTOM is, the proposed **Repair Action**, and why it is safe before anything changes on the page, so that I can make an informed decision.
13. As a website user, I want PHANTOM to only use real backup destinations or image sources already present in the page's HTML attributes and refuse to guess otherwise, so that PHANTOM never invents links, images, or endpoints.
14. As a website user, I want to click **Apply Repair** to run the allowlisted fix locally in my browser, so that the broken control starts working immediately without waiting for the site owner.
15. As a website user, I want PHANTOM to check the **Verification Result** after applying a fix and only turn the element outline green when expected behavior is actually restored, so that I am not misled by superficial page changes.
16. As a website user, I want to click **Undo** at any time to revert a repair cleanly back to the original page state, so that every change is safe and reversible.
17. As a website user, I want to view my local repair history in the Side Panel (origin, bug type, timestamp, **Diagnosis** summary, **Repair Action**, AI source, **Verification Result**, and Undo availability), so that I can track or revert past fixes.
18. As a developer or judge, I want to view an interactive pipeline and AI routing flowchart inside the **AI Companion** web app, so that I can inspect each stage from event detection to verification live.
19. As a developer or judge, I want a separate, controlled **Demo Website** with four broken scenarios (broken navigation, broken form button, CSS-blocked button, broken image) and a developer control panel to reset/activate bugs and view before/after page state and logs, so that I can test PHANTOM reliably.
20. As a community user, I want to optionally share a sanitized **Repair Recipe** to the **Community Repair Network** using silent anonymous sign-in, and review and manually approve matching community suggestions when I visit a broken site, so that verified fixes can help other users safely.

## Implementation Decisions

### Monorepo & Shared Contracts
- Organize the project as a single TypeScript workspace containing four packages: the Manifest V3 Chrome extension, the Firebase-hosted **AI Companion** web app, the standalone **Demo Website**, and a shared core package.
- The shared package owns the Zod-validated **Diagnosis** schema, the fixed allowlist of **Repair Actions** (`RESTORE_NAVIGATION`, `RESTORE_POINTER_EVENTS`, `RESTORE_BUTTON_SEMANTICS`, `USE_KNOWN_IMAGE_FALLBACK`, `RESTORE_SUPPORTED_FORM_BEHAVIOR`, `NO_SAFE_REPAIR`), the **Repair Recipe** schema, and the typed messaging bridge protocol.

### Chrome Extension Architecture
- Use Chrome Side Panel as the sole extension UI surface so the panel remains open during element picking, outline inspection, repair preview, and undo.
- The content script handles lightweight, event-driven observation (bounded DOM inspection, `MutationObserver`, click/submit/image-error/window-error listeners, debounced/throttled observers), 0.7-second post-click outcome checks (DOM mutation, navigation/scroll, form submission, or network request start), sensitive-control exclusion, sanitization, element highlighting, and the deterministic repair + undo engine.
- The extension service worker routes messages, manages per-site monitoring and cloud-consent permissions in `chrome.storage.local`, tracks tabs, cancels stale analyses on navigation, and ensures an **AI Companion** tab is opened or focused when inference is requested.
- Personal repair history is stored locally in `chrome.storage.local` without storing unnecessary webpage contents or sensitive form data.

### Hosted AI Companion & Hybrid AI Routing (per ADR-0001)
- Run Firebase AI Logic (`getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`, `generateContent`, `initializeDeviceModel`, `inferenceSource`) inside the Firebase-hosted React **AI Companion** web app, connected to the extension via an origin-restricted `externally_connectable` bridge (restricted to exact localhost dev origins and the production Firebase Hosting origin, with message IDs, timeouts, and schema validation).
- Dynamic AI routing module enforces explicit task selection:
  - `ONLY_ON_DEVICE` for form-related or user-entered text issues.
  - `PREFER_ON_DEVICE` for clear single-element issues (blocked pointer events, broken image with fallback, missing link destination).
  - `ONLY_IN_CLOUD` for complex multi-element failures or low-confidence on-device results, gated behind sanitization and explicit per-request or per-site user consent.
  - Deterministic rules-only fallback when AI is unavailable.
- Always surface the actual `inferenceSource` returned by the Firebase SDK; never label cloud fallback or rules-only results as local inference.
- Display an interactive `@xyflow/react` pipeline and routing visualizer inside the **AI Companion** web app.

### Security, App Check & Zero-Budget Hosting (per ADR-0002)
- AI output is strictly declarative JSON validated by Zod; unknown operations are rejected, and all webpage text is treated as untrusted prompt-injection-prone input.
- Never use `eval()`, `new Function()`, remote JS execution, or arbitrary AI-generated patches.
- Trustworthy repair hints for `RESTORE_NAVIGATION` and `USE_KNOWN_IMAGE_FALLBACK` come exclusively from explicit attributes already present on the element/page (`data-href`, `data-route`, `data-url`, `data-fallback-src`, `data-src`, `srcset`); otherwise return `NO_SAFE_REPAIR`.
- Enforce Firebase App Check using free-tier **reCAPTCHA v3** in production and `FIREBASE_APPCHECK_DEBUG_TOKEN` strictly in local development (never committed or shipped in production builds).
- Host the **AI Companion** and the **Demo Website** on separate free-tier Firebase Hosting sites/URLs so the extension treats the Demo Website as a real external site.
- Set up `.env.example` templates for all Firebase and App Check configuration.

### Build Sequencing
- Build and verify the complete core experience first (automatic/manual detection, sanitization, hybrid AI routing, deterministic repair + verification + undo, local repair history, AI Companion visualizer, and the 4-scenario Demo Website).
- Layer the **Community Repair Network** on top using Firebase Anonymous Authentication and Cloud Firestore (`repair_recipes` collection with strict schema validation and manual user approval before applying any suggested recipe).

## Testing Decisions

- **Primary End-to-End Seam (Playwright + Loaded Extension + Demo Website)**: Test the full user journey from the highest seam—launching Chromium with the built MV3 extension loaded against the local **Demo Website** and **AI Companion**—verifying all four scenarios (Broken Navigation, Broken Form, CSS-Blocked Button, Broken Image), manual "Something is broken" element picking, repair preview, **Verification Result**, **Undo**, and local history persistence.
- **Pipeline & Contract Seam (Vitest)**: Test external behavior of the shared pipeline modules without mocking internal details:
  - Sanitization (strips passwords, tokens, cookies, emails, and sensitive form values).
  - Dynamic AI routing (selects `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`, or rules fallback accurately and respects cloud consent).
  - Schema validation (rejects unknown repair actions or malformed AI JSON).
  - Deterministic repair & verification engine (executes each allowlisted **Repair Action**, restores original DOM state on **Undo**, and refuses repairs when no trustworthy fallback attribute exists).
- **Prior Art**: Green-field repository; establish Vitest for unit/contract suites and Playwright for MV3 extension end-to-end tests.

## Out of Scope

- Modifying any website's server code, database, or deployed source repository.
- Automatic execution of community-submitted **Repair Recipes** without explicit user approval.
- Inspecting, diagnosing, or repairing password fields, payment forms, or login/security controls.
- Guessing or inventing missing URLs, backup images, API endpoints, or backend behavior.
- Paid cloud infrastructure, custom backend servers, or Docker hosting services.

## Further Notes

- Related glossary: [GLOSSARY.md](file:///c:/Users/shiva/OneDrive/Desktop/hybrid_hacks/GLOSSARY.md)
- Related architectural decisions: [0001-hosted-ai-companion-bridge.md](file:///c:/Users/shiva/OneDrive/Desktop/hybrid_hacks/docs/adr/0001-hosted-ai-companion-bridge.md), [0002-allowlisted-declarative-repairs.md](file:///c:/Users/shiva/OneDrive/Desktop/hybrid_hacks/docs/adr/0002-allowlisted-declarative-repairs.md)
- Implementation proceeds only when the user explicitly requests it.
