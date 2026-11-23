import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("four demo failures can be investigated, repaired, verified and undone", async () => {
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
    await expect(panel.locator("#failure-status")).toContainText("link may be broken");
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

    await demo.locator("#broken-button").click({ force: true });
    await expect(panel.locator("#failure-status")).toContainText("button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_POINTER_EVENTS");
    await panel.locator("#apply").click();
    await expect(panel.locator("#failure-status")).toContainText("Click the button");
    await demo.locator("#broken-button").click();
    await expect(panel.locator("#failure-status")).toContainText("button action worked");
    await expect(demo.locator("#css-state")).toContainText("After: the action ran");
    await panel.locator("#undo").click();
    await expect(demo.locator("#broken-button")).toHaveCSS("pointer-events", "none");

    await demo.locator("#image-activate").click();
    await expect(panel.locator("#failure-status")).toContainText("image may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("USE_KNOWN_IMAGE_FALLBACK");
    await panel.locator("#apply").click();
    await expect(panel.locator("#failure-status")).toContainText("backup image loaded");
    await panel.locator("#undo").click();
    await expect(demo.locator("#broken-image")).toHaveAttribute("src", /missing-image/);
    await demo.evaluate(() => { (document.querySelector("#no-fallback-image") as HTMLImageElement).src = "/missing-no-fallback.png?again=" + Date.now(); });
    await expect(panel.locator("#failure-status")).toContainText("image may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("NO_SAFE_REPAIR");
    await expect(panel.locator("#apply")).toBeHidden();

    await demo.locator("#form-button").click();
    await expect(panel.locator("#failure-status")).toContainText("form button may be broken");
    await panel.locator("#investigate").click();
    await expect(panel.locator("#action")).toContainText("RESTORE_BUTTON_SEMANTICS");
    await panel.locator("#apply").click();
    await demo.locator("#form-button").click();
    await expect(panel.locator("#failure-status")).toContainText("form handled submission");
    await expect(demo.locator("#form-state")).toContainText("After: form submission handled locally");
    await panel.locator("#undo").click();
    await expect(demo.locator("#form-button")).toHaveAttribute("type", "button");
    await demo.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML = '<input type="password"><button type="button" id="sensitive-button">Continue</button>';
      document.body.append(form);
    });
    await demo.locator("#sensitive-button").click();
    await expect(panel.locator("#failure")).toBeHidden();
  } finally {
    await context.close();
    server.kill();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true });
  }
});
