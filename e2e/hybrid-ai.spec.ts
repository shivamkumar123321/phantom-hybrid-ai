import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("extension opens one AI Companion tab, exchanges validated messages, and saves cloud consent", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-hybrid-"));
  const demoPort = 45000 + Math.floor(Math.random() * 1000);
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
    for (const url of [`http://127.0.0.1:${demoPort}`, "http://127.0.0.1:4174"]) {
      for (let attempt = 0; attempt < 30; attempt++) {
        try { if ((await fetch(url)).ok) break; } catch {}
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    let worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { predicate: (candidate) => candidate.url().endsWith("/background.js") });
    const extensionId = new URL(worker.url()).host;

    const demo = await context.newPage();
    await demo.goto(`http://127.0.0.1:${demoPort}`);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await panel.locator("#monitor").check();
    await expect(panel.locator("#status")).toContainText("Monitoring is on");

    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("link may be broken");
    await expect(panel.locator("#investigate")).toBeVisible();
    await panel.locator("#investigate").click();

    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await expect(panel.locator("#source")).toContainText("rules-only");
    await expect(panel.locator("#ai-status")).toContainText("Companion connected");
    await expect(panel.locator("#ai-status")).toContainText("On-device AI: unavailable");

    const companionPages = () => context.pages().filter((page) => page.url().startsWith("http://127.0.0.1:4174"));
    expect(companionPages()).toHaveLength(1);
    await expect(companionPages()[0].locator("#bridge-status")).toContainText("Connected securely");
    await expect(companionPages()[0].locator("#last-route")).toContainText("Last check (rules-only)");

    await demo.locator("#broken-button").click({ force: true });
    await expect(panel.locator("#failure-status")).toContainText("button may be broken");
    await expect(panel.locator("#investigate")).toBeVisible();
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_POINTER_EVENTS");
    expect(companionPages()).toHaveLength(1);

    await panel.locator("#cloud-consent").selectOption("granted");
    await panel.reload();
    await expect(panel.locator("#cloud-consent")).toHaveValue("granted");
    await panel.locator("#cloud-consent").selectOption("denied");
    await panel.reload();
    await expect(panel.locator("#cloud-consent")).toHaveValue("denied");
  } finally {
    await context.close();
    demoServer.kill();
    companionServer.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
