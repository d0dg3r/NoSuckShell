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

/** Apply patch-package when patches/ exists (e.g. after git pull without npm install). */
function applyPatchesIfNeeded(desktopRoot) {
  const patchesDir = path.join(desktopRoot, "patches");
  if (!fs.existsSync(patchesDir)) {
    return 0;
  }
  const entries = fs.readdirSync(patchesDir).filter((n) => n.endsWith(".patch"));
  if (entries.length === 0) {
    return 0;
  }
  const nm = path.join(desktopRoot, "node_modules", "patch-package");
  if (!fs.existsSync(nm)) {
    console.error(
      "[nosuckshell] patches/ contains .patch files but patch-package is missing. Run: npm install (in apps/desktop)",
    );
    return 1;
  }
  console.error(`[nosuckshell] Applying ${entries.length} npm patch(es) (patch-package) …`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["exec", "patch-package"], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

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
  const patchExit = applyPatchesIfNeeded(desktop);
  process.exit(patchExit !== 0 ? patchExit : 0);
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

const patchExit = applyPatchesIfNeeded(desktop);
if (patchExit !== 0) {
  process.exit(patchExit);
}
