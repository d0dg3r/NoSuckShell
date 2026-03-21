import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so Playwright never attaches to an unrelated preview on 4173. */
const previewPort = 4180;
const previewOrigin = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: previewOrigin,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build:e2e && npx vite preview --mode e2e --host 127.0.0.1 --port ${previewPort}`,
    url: previewOrigin,
    reuseExistingServer: !process.env.CI,
  },
});
