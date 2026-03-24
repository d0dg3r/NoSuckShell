# SSH domain model and export (implementation reference)

This document complements [2026-03-17-ssh-manager-design.md](2026-03-17-ssh-manager-design.md) with field-to-source mapping, Identity Store semantics, raw-config rules, and export behavior.

## Field → source → effective use

Priority matches `resolve_host_config_with_store` in `secure_store.rs`, then `enrich_resolved_host` for plugins.

| Concern | On-disk `HostConfig` (`~/.ssh/config`) | Identity Store | Host metadata (`nosuckshell.metadata.json`) | Effective for `ssh` |
|--------|----------------------------------------|----------------|---------------------------------------------|---------------------|
| Alias | `Host` | — | — | Session uses alias from list host |
| `HostName` | Parsed line | User object `hostName` overrides if binding has `userId` and user’s `hostName` is set | — | Resolved `HostName` |
| `User` | Parsed line | Linked user’s `username` if set; else binding `legacyUser` | `defaultUser` is UI/default only for empty fields in app, not automatic OpenSSH `User` in file | Resolved `User` |
| `Port` | Parsed line | Not overridden by store today | — | From disk host |
| `IdentityFile` | Parsed line | Primary key on binding, then primary key on linked user; path keys → path; encrypted → runtime PEM if unlocked | — | Resolved path; session fails fast if encrypted primary is locked and no other identity source applies |
| `ProxyJump` | Parsed line | Binding `proxyJump`, else user `proxyJump`, else legacy | — | Resolved |
| `ProxyCommand` | Parsed line | Binding `legacyProxyCommand` | — | Resolved |
| `StrictHostKeyChecking` | Only if manually edited in raw config; not parsed into `HostConfig` | — | Per-host policy + `trustHostDefault` migration | Applied as `ssh -o StrictHostKeyChecking=…` at session start (not from narrow `HostConfig` struct) |

## Identity Store: groups and tags

- **`groupIds` on `HostBinding`:** Organizational membership and UI filtering. They do **not** change SSH directives or resolution today.
- **`tagIds` on `HostBinding` / users / groups:** Same — labels for the app, not OpenSSH.
- **Future:** Group-level defaults (e.g. default `ProxyJump`) would require extending `resolve_host_config_with_store` and tests.

## Raw SSH config editor and `Host *`

- The **full file** is loaded and saved as raw text (`get_ssh_config_raw` / `save_ssh_config_raw`).
- The **managed host list** is produced by parsing only **non-wildcard** `Host` stanzas with the keys the app understands; other content is not represented in the in-app list.
- **`Host *` managed block:** The UI inserts or replaces only the region between `# BEGIN_NOSUCKSHELL_HOST_STAR` and `# END_NOSUCKSHELL_HOST_STAR` via `mergeManagedHostStarBlock`. The rest of the file is untouched by that action until **Save SSH config** writes the buffer.
- Saving a host from the app uses `write_hosts` / `render_hosts`, which **rewrites** the config file to managed stanzas — do not mix with manual preservation of large custom files without backup.

## StrictHostKey policy

- Stored in **host metadata** (JSON), not in the slim `HostConfig` on disk.
- Applied at **session** time through the SSH command line, consistent with `resolved_strict_host_key_for_alias`.

## Export (resolved OpenSSH text)

- **Purpose:** Produce a portable text file that reflects **resolved** connection settings (Identity Store + on-disk host) for each listed host.
- **StrictHostKeyChecking:** Optional lines per host when “include strict host key in export” is enabled.
- **Limits:** Encrypted private keys that are not unlocked do not produce an `IdentityFile` line; a comment explains why. Paths under `nosuckshell.runtime/keys` (temporary material) are **never** written to export — a comment is emitted instead.

## Manual verification (release / PR)

1. Create a host with a **path-based** key; connect; export resolved config; run `ssh -F exported.conf <alias>` on another machine with the same key path layout (or adjust paths).
2. Create a host with an **encrypted** key; without unlock, export — expect comment, no secret material.
3. Unlock encrypted key, connect, export — expect no runtime path in export (comment only for runtime paths).
