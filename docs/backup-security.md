# Backup Security and Host Access

## Backup format

- Backups are encrypted only. Plain JSON backups are rejected on import.
- Encryption envelope is versioned and stores:
  - `version`
  - `kdf` (`argon2id`, memory/iterations/parallelism)
  - `salt`
  - `nonce`
  - `ciphertext`
  - `exportedAt`

## Password handling

- Export and import require a user-provided password.
- Passwords are never persisted by the app.
- Password inputs are kept only for the current action and cleared immediately after export/import completes (success or failure).

## Path normalization and host filesystem access

- Backup paths support `~` expansion to the active user's home directory.
- Relative paths are resolved from the current working directory.
- Export creates parent directories when needed.
- Import/export reject directory paths and require a file path.
- The backend uses Rust filesystem APIs directly (host access), with guardrails:
  - explicit path validation
  - clear permission-denied/file-not-found errors
  - deterministic path resolution across Linux, macOS, and Windows

## Cross-platform notes

- Linux/macOS:
  - `~` maps to the current home directory
  - standard POSIX permission errors are surfaced to the UI
- Windows:
  - home path resolves through the user profile directory
  - slash/backslash user input is normalized by `PathBuf` resolution
  - ACL permission failures are reported as permission-denied errors
