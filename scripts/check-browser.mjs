import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

if (!existsSync(chromium.executablePath())) {
  console.error("Playwright Chromium is missing. Run `npm run setup:e2e`, then `npm run test:e2e`.");
  process.exitCode = 1;
}
