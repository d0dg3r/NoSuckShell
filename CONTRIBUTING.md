# Contributing to NoSuckShell

Thanks for your interest in improving NoSuckShell. This repository is a small monorepo: the product is the **Tauri 2** desktop app under `apps/desktop` (React + Vite frontend, Rust backend).

## Prerequisites

- **Node.js** and **npm** (versions aligned with what you use for local development).
- **Rust** (stable toolchain) and **Cargo**.
- **Tauri prerequisites** for your OS: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Getting started

Clone the repository, then from the **repository root**:

```bash
npm run desktop:install
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

On Linux, `WEBKIT_DISABLE_DMABUF_RENDERER=1` matches the workflow documented in the root [README.md](README.md) and avoids common WebKit/DRM issues on some setups. Omit or adjust if your environment does not need it.

You can also work from `apps/desktop` directly (`npm install`, `npm run tauri:dev`); the root scripts ensure dependencies are present when you use the root commands.

## Marketing screenshots

To regenerate README / store PNGs (Playwright + stubbed Tauri IPC), from the **repository root**:

```bash
npm run screenshots
```

Details: [docs/media/screenshots/README.md](docs/media/screenshots/README.md).

## Validate your changes

From `apps/desktop` (see also the root README):

```bash
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

## Pull requests

- Keep changes **focused** on the problem or feature you are addressing.
- Add or update **tests** when behavior changes or new logic deserves coverage.
- Avoid **drive-by refactors** or unrelated formatting churn in the same PR.

Use the checklist in [.github/pull_request_template.md](.github/pull_request_template.md) when you open a PR.

For security-sensitive reports, use the process in [SECURITY.md](SECURITY.md), not a public issue.

## Community standards

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project ([MIT](LICENSE)).
