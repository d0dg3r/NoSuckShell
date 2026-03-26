import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("loads main shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "All" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Favorites" })).toBeVisible();
    await expect(page.getByTitle("Workspaces and layouts")).toBeVisible();
    await expect(page.getByPlaceholder("Search alias, hostname, user")).toBeVisible();
  });
});
