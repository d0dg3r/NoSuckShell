import { expect, test } from "@playwright/test";

/**
 * Requires a working `invoke` in the preview bundle (e2e shims). Until then:
 * `PW_E2E_HOSTS=1 npx playwright test e2e/hosts.spec.ts` when debugging locally.
 */
(process.env.PW_E2E_HOSTS ? test.describe : test.describe.skip)("hosts", () => {
  test("add saved host and open SSH session with mock output", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open add menu" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Add host" }).click();

    await expect(page.getByRole("heading", { name: "Add host" })).toBeVisible();

    await page.getByLabel("Host alias").fill("e2e-test");
    await page.getByLabel("HostName").fill("127.0.0.1");
    await page.getByLabel("User", { exact: true }).fill("testuser");

    await page.locator("section.add-host-modal").getByRole("button", { name: "Add host" }).click();

    await expect(page.locator(".host-item-main").filter({ hasText: "e2e-test" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /SSH host e2e-test/ }).dblclick();

    await expect(page.locator(".xterm-rows")).toContainText(/e2e mock shell/, { timeout: 15_000 });
  });
});
