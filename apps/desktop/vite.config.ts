import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e";
  return {
    define: e2e
      ? {
          "import.meta.env.VITE_E2E": JSON.stringify("true"),
        }
      : undefined,
    plugins: [react()],
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
      ...(e2e
        ? {
            alias: {
              "@tauri-apps/api/core": path.resolve(__dirname, "src/e2e/tauri-core-shim.ts"),
              "@tauri-apps/api/event": path.resolve(__dirname, "src/e2e/tauri-event-shim.ts"),
            },
          }
        : {}),
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      exclude: ["**/node_modules/**", "**/e2e/**"],
    },
  };
});
