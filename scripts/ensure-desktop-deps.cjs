/**
 * If apps/desktop is missing node_modules entries for any package.json dependency,
 * run npm install there once.
 * Keeps root scripts like `npm run tauri:dev` usable after a fresh clone or lockfile updates.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");

function packageDirExists(nodeModules, name) {
  if (name.startsWith("@")) {
    const parts = name.split("/");
    if (parts.length < 2) return false;
    return fs.existsSync(path.join(nodeModules, parts[0], parts[1]));
  }
  return fs.existsSync(path.join(nodeModules, name));
}

function firstMissingPackage(desktopRoot) {
  const pkgPath = path.join(desktopRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const nm = path.join(desktopRoot, "node_modules");
  const names = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  for (const name of names) {
    if (!packageDirExists(nm, name)) return name;
  }
  return null;
}

if (!fs.existsSync(path.join(desktop, "package.json"))) {
  console.error("[nosuckshell] apps/desktop/package.json not found.");
  process.exit(1);
}

const missing = firstMissingPackage(desktop);
if (missing === null) {
  process.exit(0);
}

console.error(`[nosuckshell] Installing desktop dependencies (apps/desktop) — missing: ${missing} …`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["install"], {
  cwd: desktop,
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
const stillMissing = firstMissingPackage(desktop);
if (stillMissing !== null) {
  console.error(
    `[nosuckshell] Install finished but "${stillMissing}" is still missing. Check apps/desktop npm output.`,
  );
  process.exit(1);
}
