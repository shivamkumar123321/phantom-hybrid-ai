# 01: Enable monitoring on a site

**What to build:** A working PHANTOM extension and Side Panel where monitoring starts off, can be enabled per site, and excludes sensitive controls.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] A new site is not monitored until the user enables it, and the choice persists per site.
- [x] Password fields, payment forms, and login or security controls are never inspected or modified, even on enabled sites.
- [x] The Side Panel shows the site's monitoring state and lets the user change it.
- [x] The extension and its shared contracts build and load in Chromium.
