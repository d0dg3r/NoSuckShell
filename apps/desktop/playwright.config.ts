import { defineConfig, devices } from "@playwright/test";

const previewOrigin = "http://127.0.0.1:4173";

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
    command: "npm run build:e2e && npx vite preview --mode e2e --host 127.0.0.1 --port 4173",
    url: previewOrigin,
    reuseExistingServer: !process.env.CI,
  },
});
