import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("loads main shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Alle" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Terminal workspaces" })).toBeVisible();
    await expect(page.getByPlaceholder("Search alias, hostname, user")).toBeVisible();
  });
});
