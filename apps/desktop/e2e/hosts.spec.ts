import { expect, test } from "@playwright/test";

test.describe("hosts", () => {
  test("add saved host and open SSH session with mock output", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open add menu" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Add host" }).click();

    await expect(page.getByRole("heading", { name: "Add host" })).toBeVisible();

    await page.getByLabel("Host alias").fill("e2e-test");
    await page.getByLabel("HostName").fill("127.0.0.1");
    await page.getByLabel("User", { exact: true }).fill("testuser");

    await page.locator("section.add-host-modal").getByRole("button", { name: "Add host" }).click();

    await expect(page.locator(".host-item-main", { hasText: "e2e-test" })).toBeVisible();

    await page.getByRole("button", { name: /SSH host e2e-test/ }).dblclick();

    await expect(page.locator(".xterm-rows")).toContainText(/e2e mock shell/, { timeout: 15_000 });
  });
});
