# PHANTOM

PHANTOM is a Chrome extension and hosted AI companion that spots broken parts of a website, diagnoses why they failed, and applies safe, temporary fixes in the user's browser.

## Language

**AI Companion**:
The Firebase-hosted web app that runs PHANTOM's local and cloud AI checks on behalf of the extension.
_Avoid_: AI helper web app, backend server, AI worker

**Suspected Failure**:
An interaction or page element that showed signs of being broken (like a click with no visible result) but has not yet been checked by rules or AI.
_Avoid_: confirmed bug, error, crash

**Diagnosis**:
A structured finding from rules or AI that states what went wrong, how confident PHANTOM is, which AI source ran, and which Repair Action (if any) is safe to try.
_Avoid_: error report, raw AI output

**Repair Action**:
One of PHANTOM's fixed, allowlisted browser-side fixes (such as restoring a link, unblocking pointer events, or switching to a backup image).
_Avoid_: patch, script injection, hotfix

**Repair Recipe**:
A cleaned-up, shareable description of a bug pattern and its approved Repair Action stored in the Community Repair Network for other users to review and approve.
_Avoid_: auto-fix, community script

**Verification Result**:
The outcome check run after applying a Repair Action to confirm whether the expected behavior is actually restored, without submitting sensitive forms.
_Avoid_: DOM diff, success guess
