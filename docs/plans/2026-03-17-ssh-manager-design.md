# NoSuckShell Desktop Design

## Baseline Stack

- Shell: `ssh` binary executed through a PTY.
- Desktop runtime: Tauri 2 + Rust backend.
- UI: React + Vite + xterm.
- Platforms: Linux, macOS, Windows through Tauri packaging.

This repository now uses Tauri as the baseline architecture.

## Implemented MVP Slice

- SSH host list loaded from `~/.ssh/config`.
- Host editor for:
  - `Host`
  - `HostName`
  - `User`
  - `Port`
  - `IdentityFile`
  - `ProxyJump`
  - `ProxyCommand`
- Save and delete host entries (with automatic config backup).
- Connection start from UI.
- Embedded terminal tabs via xterm and backend PTY streaming.
- Known-host prompt assist via a `Trust host` action that sends `yes`.
- Security mode intent:
  - Default mode: use existing `ssh-agent`/key files.
  - Optional managed-key mode currently exposed as opt-in UI flag placeholder.

## Test Strategy

- Rust unit tests:
  - parse ssh host block
  - render/parse roundtrip for host fields
  - verify ssh command construction with proxy + identity
- Frontend unit tests:
  - host form port update callback behavior
- Build verification:
  - `npm test`
  - `npm run build`
  - `cargo test`
  - `cargo check`
- Manual smoke tests:
  - Open app
  - Create/save host
  - Connect and interact in terminal
  - Accept host key prompt with `Trust host`

## Known Constraints

- Parser currently manages standard `Host` blocks, but does not preserve complex custom formatting/comments.
- Wildcard `Host` blocks are intentionally skipped in the managed list.
- Managed-key mode UI is present, but secure encrypted key storage is not implemented yet.
