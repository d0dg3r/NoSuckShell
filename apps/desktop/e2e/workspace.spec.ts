import { expect, test } from "@playwright/test";

test.describe("workspace", () => {
  test("split focused pane left creates second pane", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".split-pane")).toHaveCount(1);

    await page.getByRole("button", { name: "Expand toolbar actions" }).first().click();
    await page.getByRole("button", { name: "Split pane 1 left" }).click();

    await expect(page.locator(".split-pane")).toHaveCount(2);
  });
});
