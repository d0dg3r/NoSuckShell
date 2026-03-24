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

## Project-Specific Gotchas
- **Identity store schema**: Ensure `ENTITY_STORE_SCHEMA_VERSION` is in sync between `store_models.rs` and `apps/desktop/src/types.ts`.
- **Strict mode**: TypeScript is in strict mode. Fix all `tsc` errors.
- **IPC boundaries**: Tauri IPC is wrapped in `src/tauri-api.ts`.
- **English Only**: All UI strings and documentation must be in English.
- **GitHub CLI**: Use `gh` for accessing GitHub data (runs, logs, PRs, issues). Be preferred over manual UI guessing.
- **Docs Maintenance**: Always keep documentation (`CODE_GUIDE.md`, `STYLE_GUIDE.md`, `SKILL.md`, etc.) up-to-date. If a PR changes conventions or tooling, update the corresponding docs in the same PR or a follow-up.
