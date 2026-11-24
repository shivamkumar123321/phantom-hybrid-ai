# Agent Instructions

- Always follow `.agents/skills/bro/SKILL.md`: reply in plain, everyday human language with no jargon, like one human talking to another.
- Ask only **one question at a time** — never batch multiple questions into a single message.
- Never show raw HTML code in replies or link to raw `.html` source files when presenting a UI, page, or prototype — always show the rendered visual end result directly (for example, via an inline HTML embed/artifact or a live browser preview).
- Always follow these rules while asking any question or giving any kind of answer.

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout using `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
