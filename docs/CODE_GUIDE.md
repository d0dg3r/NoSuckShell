# NoSuckShell code guide

This guide defines **how to implement changes** in this repository. For UI and documentation tone, see [STYLE_GUIDE.md](STYLE_GUIDE.md).

## Repository layout

- **Monorepo root**: npm scripts delegate to `apps/desktop`.
- **Desktop app**: `apps/desktop` — React + Vite + TypeScript frontend, Tauri Rust backend in `apps/desktop/src-tauri`.

## Scope and PR discipline

- Keep changes **focused** on the problem or feature; avoid **drive-by refactors** or unrelated formatting churn in the same PR.
- Add or update **tests** when behavior changes or new logic deserves coverage.
- Match **existing patterns** in nearby files (naming, file layout, hooks, IPC boundaries).

## TypeScript and React (`apps/desktop`)

- **Compiler**: `tsconfig.json` uses **strict** mode, `noUnusedLocals`, and `noUnusedParameters` — fix errors before merge.
- Prefer **small, composable** components; colocate state where it is used.
- Centralize Tauri IPC behind a thin wrapper (see `src/tauri-api.ts`) and **invoke** with the same command names as Rust `#[tauri::command]` handlers.
- **New commands**: add the Rust handler, register it in the Tauri builder, expose typed helpers in `tauri-api.ts`, and handle errors in the UI consistently.

## Rust and Tauri (`apps/desktop/src-tauri`)

- **Edition**: Rust 2024 as declared in `Cargo.toml`.
- **Identity store schema**: `ENTITY_STORE_SCHEMA_VERSION` in `store_models.rs` must stay in sync with `ENTITY_STORE_SCHEMA_VERSION` in `apps/desktop/src/types.ts` when bumping persisted JSON.
- Use **serde** for structured payloads; prefer **explicit errors** (`thiserror` / `anyhow`) as used elsewhere in the crate.
- **Security-sensitive paths** (crypto, file I/O, SSH): follow [SECURITY.md](../SECURITY.md) and avoid logging secrets.

## Testing and validation

From `apps/desktop`:

```bash
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

- **Vitest** for unit/integration tests in the frontend.
- **Playwright** for e2e and screenshot generation (see [CONTRIBUTING.md](../CONTRIBUTING.md) and [docs/media/screenshots/README.md](media/screenshots/README.md)).

There is **no ESLint/Prettier** in the repo today; **`tsc` (via `npm run build`) and `cargo check`** are the baseline. If formatters are added later, follow the repo configuration.

## AI-assisted editors and agents

- Read [STYLE_GUIDE.md](STYLE_GUIDE.md) and this **CODE_GUIDE** before large edits.
- **Do not commit** without explicit human approval; propose changes and wait for review.
- If the **real codebase** diverges from these guides (new tooling, new patterns), **propose updates** to the guides and get **maintainer approval** before merging doc-only policy changes. See [AGENTS.md](../AGENTS.md).

## Security

- **Vulnerability reports**: follow [SECURITY.md](../SECURITY.md), not public issues for sensitive matters.
