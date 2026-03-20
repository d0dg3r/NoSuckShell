/**
 * If apps/desktop has no node_modules (or no local tsc), run npm install there once.
 * Keeps root scripts like `npm run tauri:dev` usable after a fresh clone.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");
const tscBin = path.join(desktop, "node_modules", ".bin", "tsc");
const tauriBin = path.join(desktop, "node_modules", ".bin", "tauri");

if (fs.existsSync(tscBin) && fs.existsSync(tauriBin)) {
  process.exit(0);
}

if (!fs.existsSync(path.join(desktop, "package.json"))) {
  console.error("[nosuckshell] apps/desktop/package.json not found.");
  process.exit(1);
}

console.error("[nosuckshell] Installing desktop dependencies (apps/desktop) …");
const r = spawnSync("npm", ["install"], {
  cwd: desktop,
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
if (!fs.existsSync(tscBin) || !fs.existsSync(tauriBin)) {
  console.error("[nosuckshell] Install finished but tsc/tauri is still missing. Check apps/desktop npm output.");
  process.exit(1);
}
