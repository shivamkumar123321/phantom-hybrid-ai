import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("runs all four demo scenarios and developer controls against separately hosted Demo Website and AI Companion", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-hosted-demo-"));
  const demoPort = 48000 + Math.floor(Math.random() * 1000);
  const demoOrigin = `http://127.0.0.1:${demoPort}`;
  const companionOrigin = "http://127.0.0.1:4174";
  expect(demoOrigin).not.toBe(companionOrigin);

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
    for (const url of [demoOrigin, companionOrigin]) {
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
    await demo.locator("#reset-all").click();
    await expect(demo.locator("#summary-nav")).toContainText("reset (working)");
    await expect(demo.locator("#summary-css")).toContainText("reset (working)");
    await expect(demo.locator("#summary-image")).toContainText("reset (working)");
    await expect(demo.locator("#summary-form")).toContainText("reset (working)");
    await expect(demo.locator("#log")).toContainText("Form button reset.");

    await demo.locator("#activate-all").click();
    await expect(demo.locator("#summary-nav")).toContainText("before (broken)");
    await expect(demo.locator("#summary-css")).toContainText("before (broken)");
    await expect(demo.locator("#summary-image")).toContainText("before (broken)");
    await expect(demo.locator("#summary-form")).toContainText("before (broken)");

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.locator("#monitor").check();
    await expect(panel.locator("#status")).toContainText("Monitoring is on");

    // 1. Broken Navigation
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("link may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await panel.locator("#apply").click();
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");
    await expect(demo.locator("#summary-nav")).toContainText("after (destination reached)");
    await panel.locator("#undo").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#");

    // 2. CSS-Blocked Button
    await demo.locator("#broken-button").click({ force: true });
    await expect(panel.locator("#failure-status")).toContainText("button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_POINTER_EVENTS");
    await panel.locator("#apply").click();
    await demo.locator("#broken-button").click();
    await expect(panel.locator("#failure-status")).toContainText("button action worked");
    await expect(demo.locator("#summary-css")).toContainText("after (action ran)");
    await panel.locator("#undo").click();
    await expect(demo.locator("#broken-button")).toHaveCSS("pointer-events", "none");

    // 3. Broken Image
    await demo.locator("#image-activate").click();
    await expect(panel.locator("#failure-status")).toContainText("image may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("USE_KNOWN_IMAGE_FALLBACK");
    await panel.locator("#apply").click();
    await expect(panel.locator("#failure-status")).toContainText("backup image loaded");
    await expect(demo.locator("#summary-image")).toContainText("after (backup loaded)");
    await panel.locator("#undo").click();
    await expect(demo.locator("#broken-image")).toHaveAttribute("src", /missing-image/);

    // 4. Broken Form Button
    await demo.locator("#form-button").click();
    await expect(panel.locator("#failure-status")).toContainText("form button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_BUTTON_SEMANTICS");
    await panel.locator("#apply").click();
    await demo.locator("#form-button").click();
    await expect(panel.locator("#failure-status")).toContainText("form handled submission");
    await expect(demo.locator("#summary-form")).toContainText("after (submitted)");
    await panel.locator("#undo").click();
    await expect(demo.locator("#form-button")).toHaveAttribute("type", "button");

    const companionPages = context.pages().filter((page) => page.url().startsWith(companionOrigin));
    expect(companionPages).toHaveLength(1);
    await expect(companionPages[0].locator(".react-flow__node")).toHaveCount(11);
    await expect(panel.locator("#history-list .history-item")).toHaveCount(4);
  } finally {
    await context.close();
    demoServer.kill();
    companionServer.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
