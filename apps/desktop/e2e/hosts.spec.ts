import { expect, test } from "@playwright/test";

test.describe("hosts", () => {
  test("add saved host and open SSH session with mock output", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open add menu" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Add host" }).click();

    await expect(page.getByRole("heading", { name: "Add host" })).toBeVisible();

    await page.getByLabel("Host alias").fill("e2e-test");
    await page.getByLabel("HostName").fill("127.0.0.1");
    await page.getByLabel("SSH user").fill("testuser");

    await page.locator("section.add-host-modal").getByRole("button", { name: "Add host" }).click();

    await expect(page.locator(".proxmux-sidebar-row-main").filter({ hasText: "e2e-test" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /SSH host e2e-test/ }).dblclick();

    await expect(page.locator(".xterm-rows")).toContainText(/e2e mock shell/, { timeout: 15_000 });
  });

  test("quick-add Add user opens Identity Store on Users sub-tab", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open add menu" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Add user" }).click();

    await expect(page.getByRole("tab", { name: "Identity Store" })).toHaveAttribute("aria-selected", "true");
    const usersSubtab = page.locator('[aria-label="Identity store sections"]').getByRole("button", { name: "Users" });
    await expect(usersSubtab).toHaveClass(/is-active/);
  });
});
