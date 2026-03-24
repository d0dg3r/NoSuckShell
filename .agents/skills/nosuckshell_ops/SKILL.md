---
name: nosuckshell_ops
description: Operations and validation for the NoSuckShell project (Tauri/React/Rust)
---

# NoSuckShell Operations Skill

This skill provides a set of tools and instructions for managing the NoSuckShell project, a cross-platform SSH manager built with Tauri 2, React, Vite, and Rust.

## Canonical Guides
Always refer to these documents before making changes:
- [CODE_GUIDE.md](../../docs/CODE_GUIDE.md) - Implementation rules.
- [STYLE_GUIDE.md](../../docs/STYLE_GUIDE.md) - UI and documentation tone.
- [AGENTS.md](../../AGENTS.md) - Agent-specific instructions.
- [.cursor/rules/](../../.cursor/rules/) - IDE-specific rules and GitHub CLI usage.

## Common Development Commands
These commands are available from the monorepo root:

### Frontend & Tauri
- `npm run tauri:dev`: Start the Tauri development environment (with backend).
- `npm run desktop:dev`: Start the React frontend dev server (without backend).
- `npm run desktop:test`: Run Vitest frontend tests.
- `npm run desktop:e2e`: Run Playwright E2E tests.

### Backend (Rust)
From `apps/desktop/src-tauri`:
- `cargo test`: Run Rust unit and integration tests.
- `cargo check`: Check the Rust code for compilation errors.

## Validation Workflow
Before submitting a PR, run the validation script provided by this skill:
```bash
bash .agents/skills/nosuckshell_ops/scripts/validate_project.sh
```

## Release preparation (always)

For **every** release (stable `vMAJOR.MINOR.PATCH` or pre-release `v…-beta.N` / `-rc.N`), complete **before** pushing the tag:

1. **Single version string** — Set the same SemVer in:
   - `apps/desktop/package.json`
   - `apps/desktop/package-lock.json` (root + `packages.""` entries)
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
2. **Regenerate Rust lock metadata** — From `apps/desktop/src-tauri`, run `cargo check` or `cargo build` so `Cargo.lock` reflects the workspace crate version (look for `name = "src-tauri"`).
3. **Changelog** — Add a top section in `docs/CHANGELOG.md` with user-facing **Added** / **Changed** / **Fixed** / **Notes**; backfill any **missing prerelease** lines if `main` moved without changelog entries. Add a compare/link footer entry for the new tag when applicable.
4. **Release docs** — Update `docs/releases.md` (**Current release** / examples), root `README.md` (tag examples if they pin a version), issue templates or runbooks that show a **sample version string**, and any **in-app** or **store** copy that hard-codes the version (search the repo).
5. **Architecture / product docs** — If behavior changed, update `docs/architecture.md`, in-app `HelpPanel.tsx`, and linked specs (e.g. `docs/superpowers/specs/…`) in the same preparation PR.
6. **Validate** — Run `bash .agents/skills/nosuckshell_ops/scripts/validate_project.sh` (or equivalent `npm test` / `npm run build` / `cargo test` from `apps/desktop`).

The GitHub **release workflow** overwrites the three app manifests from the tag at build time; the checklist still applies so **local builds**, **PR review**, and **changelog accuracy** stay correct.

## Project-Specific Gotchas
- **Identity store schema**: Ensure `ENTITY_STORE_SCHEMA_VERSION` is in sync between `store_models.rs` and `apps/desktop/src/types.ts`.
- **Strict mode**: TypeScript is in strict mode. Fix all `tsc` errors.
- **IPC boundaries**: Tauri IPC is wrapped in `src/tauri-api.ts`.
- **English Only**: All UI strings and documentation must be in English.
- **GitHub CLI**: Use `gh` for accessing GitHub data (runs, logs, PRs, issues). Be preferred over manual UI guessing.
- **Docs Maintenance**: Always keep documentation (`CODE_GUIDE.md`, `STYLE_GUIDE.md`, `SKILL.md`, etc.) up-to-date. If a PR changes conventions or tooling, update the corresponding docs in the same PR or a follow-up.
