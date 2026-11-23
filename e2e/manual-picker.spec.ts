import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("manual picker highlights, refuses sensitive controls, cancels, and repairs a missed element", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-picker-"));
  const port = 44000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, [resolve("packages/demo/server.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    let worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { predicate: (candidate) => candidate.url().endsWith("/background.js") });
    const extensionId = new URL(worker.url()).host;
    const demo = await context.newPage();
    await demo.goto(`http://127.0.0.1:${port}`);
    await demo.evaluate(() => {
      for (const img of document.images) img.src = "/backup.svg";
      const area = document.createElement("div");
      area.innerHTML = [
        '<button id="missed-button" type="button">Silent button</button>',
        '<a id="missed-link" href="#" data-href="#destination">Open missed destination</a>',
        '<button id="standalone-btn" type="button">Log in</button>',
      ].join(" ");
      document.body.append(area);
    });
    await demo.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(panel.locator("#pick")).toBeDisabled();
    await panel.locator("#monitor").check();
    await expect(panel.locator("#status")).toContainText("Monitoring is on");
    await expect(panel.locator("#pick")).toBeEnabled();
    await expect(panel.locator("#failure")).toBeHidden();

    await panel.locator("#pick").click();
    await expect(panel.locator("#cancel-pick")).toBeVisible();
    await expect(panel.locator("#picker-status")).toContainText("Click a broken element");
    await panel.locator("#cancel-pick").click();
    await expect(panel.locator("#pick")).toBeVisible();
    await expect(panel.locator("#picker-status")).toContainText("cancelled");

    await panel.locator("#pick").click();
    await demo.keyboard.press("Escape");
    await expect(panel.locator("#pick")).toBeVisible();
    await expect(panel.locator("#picker-status")).toContainText("cancelled");

    await panel.locator("#pick").click();
    await demo.locator("#standalone-btn").hover();
    await expect(demo.locator("#standalone-btn")).toHaveCSS("outline-style", "none");
    await demo.locator("#standalone-btn").click();
    await expect(panel.locator("#picker-status")).toContainText("Sensitive controls cannot be inspected or repaired.");
    await expect(panel.locator("#failure")).toBeHidden();
    await expect(panel.locator("#cancel-pick")).toBeVisible();

    await demo.locator("#missed-button").click();
    await expect(panel.locator("#failure")).toBeVisible();
    await expect(panel.locator("#failure-status")).toContainText("No safe repair is available");
    await expect(panel.locator("#action")).toContainText("NO_SAFE_REPAIR");
    await expect(panel.locator("#apply")).toBeHidden();

    await panel.locator("#pick").click();
    await demo.locator("#missed-link").hover();
    await expect(demo.locator("#missed-link")).toHaveCSS("outline-style", "solid");
    await expect(demo.locator("#missed-link")).toHaveCSS("outline-width", "2px");

    await demo.locator("#missed-link").click();
    await expect(panel.locator("#pick")).toBeVisible();
    await expect(panel.locator("#cancel-pick")).toBeHidden();
    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await expect(panel.locator("#apply")).toBeVisible();

    await panel.locator("#apply").click();
    await expect(demo.locator("#missed-link")).toHaveAttribute("href", "#destination");
    await demo.locator("#missed-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");
    await panel.locator("#undo").click();
    await expect(demo.locator("#missed-link")).toHaveAttribute("href", "#");
    await expect(demo).not.toHaveURL(/#destination$/);
  } finally {
    await context.close();
    server.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
