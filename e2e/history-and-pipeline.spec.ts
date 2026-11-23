import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("persists repair history across browser restarts with honest undo and updates the live pipeline", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-history-"));
  const demoPort = 46000 + Math.floor(Math.random() * 1000);
  const demoServer = spawn(process.execPath, [resolve("packages/demo/server.mjs")], {
    env: { ...process.env, PORT: String(demoPort) },
    stdio: "ignore",
  });
  const companionServer = spawn(process.execPath, [resolve("packages/companion/server.mjs")], {
    env: { ...process.env, PORT: "4174" },
    stdio: "ignore",
  });

  const launch = () => chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  const findWorker = async (context: Awaited<ReturnType<typeof launch>>) => {
    let worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { predicate: (candidate) => candidate.url().endsWith("/background.js") });
    return new URL(worker.url()).host;
  };

  let context = await launch();

  try {
    for (const url of [`http://127.0.0.1:${demoPort}`, "http://127.0.0.1:4174"]) {
      for (let attempt = 0; attempt < 30; attempt++) {
        try { if ((await fetch(url)).ok) break; } catch {}
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    let extensionId = await findWorker(context);

    let demo = await context.newPage();
    await demo.goto(`http://127.0.0.1:${demoPort}`);
    let panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await panel.locator("#monitor").check();
    await expect(panel.locator("#history-empty")).toBeVisible();

    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("link may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await panel.locator("#apply").click();
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");

    const companion = context.pages().find((page) => page.url().startsWith("http://127.0.0.1:4174"))!;
    expect(companion).toBeTruthy();
    await expect(companion.locator(".react-flow")).toBeVisible();
    await expect(companion.locator(".react-flow__node")).toHaveCount(11);
    await expect(companion.locator("#routing-badge")).toContainText("RULES_ONLY");
    await expect(companion.locator("#source-badge")).toContainText("rules-only");
    await expect(companion.locator("#model-badge")).toContainText("On-device AI: unavailable");
    await expect(companion.locator("#model-badge")).toContainText("Cloud AI: unavailable");
    await expect(companion.locator('.react-flow__node[data-id="verification"]')).toContainText("done");
    await companion.locator('.react-flow__node[data-id="verification"]').click();
    await expect(companion.locator("#stage-inspector")).toContainText("Verification Result: behavior restored");

    const firstHistoryItem = panel.locator("#history-list .history-item").first();
    await expect(firstHistoryItem).toContainText(`http://127.0.0.1:${demoPort}`);
    await expect(firstHistoryItem).toContainText("navigation");
    await expect(firstHistoryItem).toContainText("RESTORE_NAVIGATION");
    await expect(firstHistoryItem).toContainText("rules-only");
    await expect(firstHistoryItem).toContainText("verified");
    await expect(firstHistoryItem.locator(".history-undo")).toBeVisible();

    await context.close();
    context = await launch();
    extensionId = await findWorker(context);
    demo = await context.newPage();
    await demo.goto(`http://127.0.0.1:${demoPort}`);
    panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const persistedItem = panel.locator("#history-list .history-item").first();
    await expect(panel.locator("#history-list .history-item")).toHaveCount(1);
    await expect(persistedItem).toContainText("RESTORE_NAVIGATION");
    await expect(persistedItem).toContainText("verified");
    await expect(persistedItem.locator(".history-undo")).toHaveCount(0);
    await expect(persistedItem).toContainText("Undo unavailable");

    await demo.locator("#broken-button").click({ force: true });
    await expect(panel.locator("#failure-status")).toContainText("button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_POINTER_EVENTS");
    await panel.locator("#apply").click();
    await expect(panel.locator("#history-list .history-item")).toHaveCount(2);

    await demo.evaluate(() => document.querySelector("#broken-button")?.remove());
    await panel.reload();
    await expect(panel.locator("#history-list .history-item").first().locator(".history-undo")).toHaveCount(0);
    await expect(panel.locator("#history-list .history-item").first()).toContainText("Undo unavailable");

    await demo.reload();
    await demo.locator("#broken-button").click({ force: true });
    await expect(panel.locator("#failure-status")).toContainText("button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_POINTER_EVENTS");
    await panel.locator("#apply").click();
    await expect(panel.locator("#history-list .history-item")).toHaveCount(3);
    await panel.locator("#history-list .history-item").first().locator(".history-undo").click();
    await expect(demo.locator("#broken-button")).toHaveCSS("pointer-events", "none");
    await expect(panel.locator("#history-list .history-item").first()).toContainText("undone");
  } finally {
    await context.close();
    demoServer.kill();
    companionServer.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
