import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("shares recipes safely and requires manual approval for validated community suggestions", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-community-"));
  const demoPort = 47000 + Math.floor(Math.random() * 1000);
  const demoOrigin = `http://127.0.0.1:${demoPort}`;
  const demoServer = spawn(process.execPath, [resolve("packages/demo/server.mjs")], {
    env: { ...process.env, PORT: String(demoPort) },
    stdio: "ignore",
  });
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
    for (const url of [demoOrigin, "http://127.0.0.1:4174"]) {
      for (let attempt = 0; attempt < 30; attempt++) {
        try { if ((await fetch(url)).ok) break; } catch {}
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    let worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { predicate: (candidate) => candidate.url().endsWith("/background.js") });
    const extensionId = new URL(worker.url()).host;

    const demo = await context.newPage();
    await demo.goto(demoOrigin);
    await demo.evaluate(() => {
      const noHint = document.createElement("a");
      noHint.id = "no-hint";
      noHint.href = "#";
      noHint.textContent = "Broken without hint";
      document.body.append(noHint);
    });

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.locator("#monitor").check();

    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("link may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await panel.locator("#apply").click();
    await expect(panel.locator("#share-recipe")).toBeHidden();
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");
    await expect(panel.locator("#share-recipe")).toBeVisible();
    await panel.locator("#share-recipe").click();
    await expect(panel.locator("#share-status")).toContainText("Community sharing requires Firebase configuration.");
    await panel.locator("#undo").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#");
    await demo.evaluate(() => { history.replaceState(null, "", location.pathname); });

    await worker.evaluate(async (origin) => {
      await chrome.storage.local.set({
        [`community-recipes:${origin}`]: [
          {
            origin,
            bugType: "navigation",
            elementTag: "a",
            selectorHint: "<script>alert(1)</script>",
            summary: "Bad script",
            repairAction: "EVAL_JS",
            safetyNote: "Unsafe",
            createdAt: "2026-11-24T00:00:00.000Z",
          },
          {
            origin,
            bugType: "navigation",
            elementTag: "a",
            selectorHint: "#login-link",
            summary: "Sensitive login",
            repairAction: "RESTORE_NAVIGATION",
            safetyNote: "Unsafe",
            createdAt: "2026-11-24T00:00:00.000Z",
          },
          {
            origin,
            bugType: "navigation",
            elementTag: "a",
            selectorHint: "#no-hint",
            summary: "Missing metadata link",
            repairAction: "RESTORE_NAVIGATION",
            safetyNote: "Needs existing page metadata.",
            createdAt: "2026-11-24T00:00:00.000Z",
          },
          {
            origin,
            bugType: "navigation",
            elementTag: "a",
            selectorHint: "#demo-link",
            summary: "Restore demo link destination",
            repairAction: "RESTORE_NAVIGATION",
            safetyNote: "Uses existing page metadata.",
            createdAt: "2026-11-24T00:00:00.000Z",
          },
        ],
      });
    }, demoOrigin);

    await panel.reload();
    await expect(panel.locator("#community-list .community-item")).toHaveCount(2);
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#");

    await panel.locator("#community-list .community-item").nth(0).locator(".community-apply").click();
    await expect(panel.locator("#community-status")).toContainText("Page lacks safe metadata");
    await expect(demo.locator("#no-hint")).toHaveAttribute("href", "#");

    await expect(panel.locator("#community-list .community-item").nth(1)).toContainText("#demo-link");
    await panel.locator("#community-list .community-item").nth(1).locator(".community-apply").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#destination");
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");
    await panel.locator("#undo").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#");
  } finally {
    await context.close();
    demoServer.kill();
    companionServer.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
