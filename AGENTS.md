# Agent and IDE instructions (NoSuckShell)

This file orients **human contributors**, **IDE assistants**, and **automation** to the project’s canonical rules.

## What this repository is

**NoSuckShell** is a cross-platform **SSH manager** desktop app: **Tauri 2** with a **React + Vite + TypeScript** frontend under `apps/desktop` and a **Rust** backend under `apps/desktop/src-tauri`. The monorepo root provides npm scripts that delegate into `apps/desktop`.

## Canonical guides (read first)

| Document | Purpose |
| --- | --- |
| [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) | Implementation: TypeScript/React, Rust/Tauri, tests, validation commands, scope. |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | User-visible copy and documentation: English-only, tone, terminology. |
| [.agents/skills/nosuckshell_ops/SKILL.md](.agents/skills/nosuckshell_ops/SKILL.md) | Operations: Common commands and validation for agentic automation. |

## Machine-enforced snippets

Cursor (and similar) may load rules under [`.cursor/rules/`](.cursor/rules/) — for example English UI copy and GitHub CLI usage. Those rules **complement** the guides above; if anything conflicts, **update the guides and the rules together** with maintainer approval.

## Maintenance and approval

- When **conventions or tooling** change, update **`docs/CODE_GUIDE.md`** and/or **`docs/STYLE_GUIDE.md`** in the same PR as the change, or in a **follow-up PR** that references it.
- **Doc-only or policy changes** to these guides require **explicit maintainer approval** before merge.
- **Do not rely on chat “memory”** for policy — the **repository text** is the source of truth for agents and contributors.

## Contributing workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, screenshots, PR checklist, and security reporting.
