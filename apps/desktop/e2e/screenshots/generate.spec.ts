import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const storeDir = path.join(repoRoot, "docs/media/screenshots/store-ms-snap");
const flatDir = path.join(repoRoot, "docs/media/screenshots/flathub");

function ensureDirs() {
  fs.mkdirSync(storeDir, { recursive: true });
  fs.mkdirSync(flatDir, { recursive: true });
}

async function shot(page: import("@playwright/test").Page, baseName: string) {
  const shell = page.locator(".app-shell");
  await expect(shell).toBeVisible();
  const storePath = path.join(storeDir, `${baseName}.png`);
  const flatPath = path.join(flatDir, `${baseName}.png`);
  await shell.screenshot({ path: storePath, animations: "disabled" });
  try {
    execSync(`magick "${storePath}" -resize '1000x700>' "${flatPath}"`, { stdio: "pipe" });
  } catch {
    fs.copyFileSync(storePath, flatPath);
  }
}

test.describe.configure({ mode: "serial" });

test("generate store and Flathub marketing screenshots", async ({ page }) => {
  test.setTimeout(120_000);
  ensureDirs();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");

  await page.getByLabel("SSH host demo-server").waitFor({ state: "visible" });
  await page.getByLabel("SSH host demo-server").dblclick();
  await expect(page.locator(".xterm-rows")).toContainText("Connected", { timeout: 15_000 });

  await shot(page, "01-main");

  await page.getByRole("button", { name: "Open add menu" }).click();
  await page.getByText("New local terminal").click();
  await expect(page.locator(".split-pane")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.split-pane[data-pane-index="1"] .xterm-rows')).toContainText("NoSuckShell local", {
    timeout: 15_000,
  });

  await shot(page, "02-split");

  await page.getByRole("button", { name: "Open layout command center" }).click();
  await expect(page.getByRole("dialog", { name: "Layout command center" })).toBeVisible();
  await shot(page, "03-layout-profiles");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Layout command center" })).toBeHidden();

  await page.getByRole("button", { name: "Open add menu" }).click();
  await page.getByText("Quick connect terminal").click();
  await expect(page.getByRole("heading", { name: "Quick connect" })).toBeVisible();
  await shot(page, "04-quick-connect");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Open app settings" }).click();
  await page.getByRole("button", { name: "Data & Backup" }).click();
  await expect(page.getByRole("button", { name: "Export backup" })).toBeVisible();
  await shot(page, "05-backup");
  await page.locator(".app-settings-header").getByRole("button", { name: "Close" }).click();

  await page.getByRole("tab", { name: "Favoriten" }).click();
  await shot(page, "06-organization");

  await page.locator(".split-pane").first().click();
  await page.getByRole("button", { name: "Turn on broadcast to multiple panes" }).first().click({ force: true });
  await page.getByRole("button", { name: "Target all visible panes" }).first().click({ force: true });
  await shot(page, "07-broadcast");
});
