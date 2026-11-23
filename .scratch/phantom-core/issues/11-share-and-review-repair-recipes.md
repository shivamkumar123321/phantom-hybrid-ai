# 11: Share and review Repair Recipes

**What to build:** Users can optionally share a sanitized Repair Recipe and manually approve a matching community suggestion before it is applied.

**Blocked by:** 08: Ask before cloud diagnosis; 09: Keep local repair history.

**Status:** ready-for-agent

- [ ] Sharing is optional and uses anonymous sign-in with a validated, sanitized Repair Recipe.
- [ ] Community suggestions show their proposed Repair Action and require explicit approval before application.
- [ ] Suggested actions pass the same allowlist, page-hint, verification, and Undo rules as local repairs.
- [ ] Invalid recipes and sensitive data are rejected; tests cover sharing and manual approval.
