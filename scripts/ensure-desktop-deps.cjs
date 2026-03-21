/**
 * If apps/desktop has no node_modules (or no local tsc), run npm install there once.
 * Keeps root scripts like `npm run tauri:dev` usable after a fresh clone.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");

// Check package presence rather than bin executables to be cross-platform safe
// (on Windows .bin entries are .cmd wrappers; checking the package dir is always reliable).
const tscPresent = fs.existsSync(path.join(desktop, "node_modules", "typescript"));
const tauriPresent = fs.existsSync(path.join(desktop, "node_modules", "@tauri-apps", "cli"));

if (tscPresent && tauriPresent) {
  process.exit(0);
}

if (!fs.existsSync(path.join(desktop, "package.json"))) {
  console.error("[nosuckshell] apps/desktop/package.json not found.");
  process.exit(1);
}

console.error("[nosuckshell] Installing desktop dependencies (apps/desktop) …");
// On Windows the npm executable is `npm.cmd`; spawn requires the correct name.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["install"], {
  cwd: desktop,
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
if (!fs.existsSync(path.join(desktop, "node_modules", "typescript")) ||
    !fs.existsSync(path.join(desktop, "node_modules", "@tauri-apps", "cli"))) {
  console.error("[nosuckshell] Install finished but typescript/@tauri-apps/cli is still missing. Check apps/desktop npm output.");
  process.exit(1);
}
