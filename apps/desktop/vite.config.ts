import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const monacoEditorPlugin = require("vite-plugin-monaco-editor").default as (opts?: {
  languageWorkers?: string[];
}) => import("vite").Plugin;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e";
  const vitest = Boolean(process.env.VITEST);
  return {
    define: e2e
      ? {
          "import.meta.env.VITE_E2E": JSON.stringify("true"),
        }
      : undefined,
    plugins: [
      react(),
      ...(vitest
        ? []
        : [
            monacoEditorPlugin({
              // FilePaneTextEditor maps many extensions; keep workers for TS/JSON/CSS/HTML (not just editorWorkerService)
              // or users lose diagnostics / language features for those languages.
              languageWorkers: ["editorWorkerService", "css", "html", "json", "typescript"],
            }),
          ]),
    ],
    server: {
      // Must match tauri.conf.json build.devUrl — avoid silent fallback to 5174 while Tauri still loads 5173 (white window).
      port: 5173,
      strictPort: true,
    },
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
    build: {
      // Tauri supports es2021
      // Modernize target to safari15 for color-mix() and other modern CSS features
      target: process.platform === "win32" ? "chrome105" : "safari15",
      // Don't minify in debug builds
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      // Sourcemaps for debug
      sourcemap: !!process.env.TAURI_DEBUG,
      // Ensure the output directory is cleared before building
      emptyOutDir: true,
      // Monaco editor core is a single ~3.7 MB chunk (lazy-loaded with the file editor); avoid noisy warnings.
      chunkSizeWarningLimit: 4000,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      exclude: ["**/node_modules/**", "**/e2e/**"],
    },
  };
});
