/**
 * Run `tauri dev` from apps/desktop and forward CLI flags to the **application** binary.
 *
 * Tauri 2 expects app arguments after a *second* `--` (see `tauri dev --help`: runner args vs app args).
 * npm run scripts with `&&` do not forward `npm run … -- …` args to the inner command, so the root
 * `tauri:dev` script uses this file instead.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");

const ensure = spawnSync(process.execPath, [path.join(__dirname, "ensure-desktop-deps.cjs")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if ((ensure.status ?? 1) !== 0) {
  process.exit(ensure.status ?? 1);
}

const userArgs = process.argv.slice(2);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const inner = ["--prefix", desktop, "run", "tauri:dev"];
if (userArgs.length > 0) {
  inner.push("--", "--", "--", ...userArgs);
}
const r = spawnSync(npm, inner, { cwd: root, stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
