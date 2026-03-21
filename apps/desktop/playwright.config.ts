import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, "e2e", "screenshots"),
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "npm run preview:e2e",
    cwd: __dirname,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
