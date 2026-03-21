import { expect, test } from "@playwright/test";

test.describe("e2e shell smoke", () => {
  test("document title is set", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/NoSuckShell/i);
  });

  test("settings control is visible in the shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open app settings" })).toBeVisible();
  });
});
