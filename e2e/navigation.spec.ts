import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("broken navigation can be investigated, repaired, verified and undone", async () => {
  const extensionPath = resolve("packages/extension/dist");
  const profile = await mkdtemp(resolve(tmpdir(), "phantom-browser-"));
  const port = 43000 + Math.floor(Math.random() * 1000);
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
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panel.locator("#site")).toContainText(`127.0.0.1:${port}`);
    await panel.locator("#monitor").check();
    await expect(panel.locator("#status")).toContainText("Monitoring is on");
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure")).toBeVisible();
    await expect(panel.locator("#failure-status")).toContainText("may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_NAVIGATION");
    await expect(panel.locator("#source")).toContainText("rules-only");
    await panel.locator("#apply").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#destination");
    await expect(panel.locator("#failure-status")).toContainText("Click the link");
    await demo.evaluate(() => { location.hash = "destination"; });
    await expect(panel.locator("#failure-status")).toContainText("Click the link");
    await demo.evaluate(() => { history.replaceState(null, "", location.pathname); });
    await demo.locator("#demo-link").click();
    await expect(panel.locator("#failure-status")).toContainText("navigation worked");
    await panel.locator("#undo").click();
    await expect(demo.locator("#demo-link")).toHaveAttribute("href", "#");
    await expect(demo).not.toHaveURL(/#destination$/);
    await demo.evaluate(() => {
      const link = document.createElement("a");
      link.id = "working-handler";
      link.href = "#";
      link.textContent = "Show details";
      link.addEventListener("click", () => { link.insertAdjacentText("afterend", "Details shown"); });
      document.body.append(link);
    });
    await demo.locator("#working-handler").click();
    await expect(demo.getByText("Details shown")).toBeVisible();
    await expect(panel.locator("#failure")).toBeHidden();
  } finally {
    await context.close();
    server.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
