import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("proactively scans external sites, auto-connects live pipeline without ?ext=, fixes all safe bugs, and undoes cleanly", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-external-"));
  const port = 49000 + Math.floor(Math.random() * 500);

  const html = `<!doctype html>
  <html lang="en">
    <head><meta charset="utf-8"><title>External Test Site</title></head>
    <body>
      <h1>Broken Gallery &amp; Controls</h1>
      <img id="ext-img-1" src="/asdf.jpg" width="120" height="90">
      <img id="ext-img-2" src="/hjkl.jpg" width="120" height="90">
      <a id="ext-blocked-link" href="#ext-ok" style="pointer-events: none; display: inline-block; padding: 6px;">Open section</a>
      <form id="ext-form">
        <input name="comment" autocomplete="off">
        <button id="ext-submit" type="button">Submit</button>
      </form>
      <form id="ext-login">
        <input type="password" name="pw">
        <button id="ext-login-btn" type="button">Log in</button>
      </form>
    </body>
  </html>`;

  const server = createServer((req, res) => {
    if (req.url === "/asdf.jpg" || req.url === "/hjkl.jpg") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));

  const companionServer = spawn(process.execPath, [resolve("packages/companion/server.mjs")], {
    env: { ...process.env, PORT: "4174" },
    stdio: "ignore",
  });

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if ((await fetch("http://127.0.0.1:4174")).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }

    let worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { predicate: (candidate) => candidate.url().endsWith("/background.js") });
    const extensionId = new URL(worker.url()).host;

    const swErrors: string[] = [];
    worker.on("console", (msg) => {
      if (msg.type() === "error") swErrors.push(msg.text());
    });
    await worker.evaluate(async (origin) => {
      self.addEventListener("unhandledrejection", (event) => {
        console.error("unhandledrejection:", String(event.reason));
      });
      // Enable monitoring BEFORE opening the side panel so FAILURE_UPDATED fires with no panel listening
      await chrome.storage.local.set({ [`monitoring:${origin}`]: true });
    }, `http://127.0.0.1:${port}`);

    // Open Companion directly WITHOUT ?ext= — content script must auto-discover extension ID and connect
    const companion = await context.newPage();
    await companion.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
    await expect(companion.locator("#bridge-status")).toContainText("Connected securely");

    const extPage = await context.newPage();
    await extPage.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
    await extPage.waitForTimeout(300);

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panel.locator("#site")).toContainText(`127.0.0.1:${port}`);
    await expect(panel.locator("#status")).toContainText("Monitoring is on");

    // Proactive Page Scan finds all 4 non-sensitive issues automatically with zero user clicks on the page
    await expect(panel.locator("#page-issues-count")).toHaveText("4 found");
    await expect(panel.locator("#page-issues-list .issue-item")).toHaveCount(4);
    await expect(panel.locator("#page-issues-list")).not.toContainText("Log in");
    await expect(panel.locator("#fix-all-safe")).toBeVisible();

    await panel.locator("#fix-all-safe").click();
    await expect(extPage.locator("#ext-img-1")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await expect(extPage.locator("#ext-img-2")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await extPage.waitForFunction(() => (
      (document.querySelector("#ext-img-1") as HTMLImageElement).naturalWidth > 0 &&
      (document.querySelector("#ext-img-2") as HTMLImageElement).naturalWidth > 0
    ));
    await expect(extPage.locator("#ext-blocked-link")).toHaveCSS("pointer-events", "auto");
    await expect(extPage.locator("#ext-submit")).toHaveAttribute("type", "submit");

    // Live Pipeline shows all 8 stages done + truthful Rules-Only active route + live event log
    await expect(companion.locator("#routing-badge")).toContainText("RULES_ONLY");
    await expect(companion.locator("#source-badge")).toContainText("rules-only");
    await expect(companion.locator('.react-flow__node[data-id="route-rules"]')).toContainText("active");
    for (const stage of ["detection", "evidence", "routing", "diagnosis", "approval", "repair", "verification", "history"]) {
      await expect(companion.locator(`.react-flow__node[data-id="${stage}"]`)).toContainText("done");
    }
    await expect(companion.locator("#pipeline-event-log")).toBeVisible();

    // Every bulk-repaired item in local Repair History keeps Undo available
    await expect(panel.locator("#history-list .history-item")).toHaveCount(4);
    await expect(panel.locator("#history-list .history-undo")).toHaveCount(4);

    // Undo all restores original broken attributes cleanly
    await expect(panel.locator("#undo-all")).toBeVisible();
    await panel.locator("#undo-all").click();
    await expect(extPage.locator("#ext-img-1")).toHaveAttribute("src", "/asdf.jpg");
    await expect(extPage.locator("#ext-img-2")).toHaveAttribute("src", "/hjkl.jpg");
    await expect(extPage.locator("#ext-blocked-link")).toHaveCSS("pointer-events", "none");
    await expect(extPage.locator("#ext-submit")).toHaveAttribute("type", "button");
    expect(swErrors).toEqual([]);
  } finally {
    await context.close();
    server.close();
    companionServer.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
