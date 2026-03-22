# Security and privacy

This document explains how **NoSuckShell** handles security-sensitive information — **accurately and in full**. It sits alongside [Reporting a vulnerability](#reporting-a-vulnerability) below.

**Language:** All project documentation, including this file, is **English**. Vulnerability reports may be submitted in English or German if that is easier for the reporter.

---

## Summary: what “we do not store” means in practice

**The NoSuckShell maintainers and this open-source repository do not operate a central service** that the app automatically uploads your hosts, passwords, private SSH keys, terminal contents, or similar data to.

- There is **no built-in telemetry**, **no analytics backend**, and **no “phone home”** for core app data in the sense of the project operating a central collection service.
- Sensitive work happens **on your device** and over **connections you initiate** (for example SSH to servers you configure).

**Important:** “We do not store” does **not** mean “no data exists anywhere.” The app **must write local files** (configuration, metadata, optionally encrypted key material, and so on) — but **only on your machine** or in **paths you choose** (for example a backup export file). The next section lists what that includes.

---

## Local data: what the app writes on your system

Everything below is kept **locally** — typically under your **SSH configuration directory** (default: `~/.ssh` on Linux/macOS, `%USERPROFILE%\.ssh` on Windows) or under the OS **local app data directory** for one settings file. The effective SSH directory can be overridden in the app (see below).

| Artifact | Purpose (short) |
| --- | --- |
| `~/.ssh/config` (and other standard SSH files as needed) | Normal OpenSSH layout; the app works with your SSH configuration. |
| `nosuckshell.store.v1.json` | App **entity store** (hosts, users, groups, tags, key references, and related data). |
| `nosuckshell.metadata.json` | App **host metadata** (favorites, tags, last used, host-key policy choices, and similar). |
| `nosuckshell.layouts.json` | Saved **layout profiles** (split geometry, mapping to hosts/sessions). |
| `nosuckshell.license.json` | **Verified license** payload and signature for paid plugins — checked **offline** against a public key. |
| `nosuckshell.master.key` | Material used to protect the store **locally** (app keychain logic). |
| `nosuckshell.runtime/...` | **Runtime/cache paths** under the SSH directory (for example decrypted key material for the lifetime of the process — see `secure_store.rs` in the source tree). |
| `%LOCALAPPDATA%\NoSuckShell\ssh-path.json` (or the equivalent `data_local_dir` path on your OS) | Optional **SSH directory path override**. |

**Private SSH keys** may be referenced by **file path** or, depending on how you use the app, stored **encrypted in the store** — in both cases **locally**, not on project-operated servers.

For backup encryption and export/import password handling, see [docs/backup-security.md](docs/backup-security.md).

---

## What is not sent to the project operators

As long as you do **not** use separate services you or a vendor run (for example a self-hosted license server or your own storefront) and you only use the **published desktop app** from this repository:

- There is **no automatic upload** of your host list, metadata, layouts, or keys to a **maintainer-operated cloud**.
- There is **no** in-app **crash or usage analytics SDK** that we document as part of this project’s default build (current implementation: none such).

**Honest limits:** If you open a link in a **web browser** (for example from the plugin store UI to an external site such as Ko-fi), that site’s **privacy policy** applies — not this app’s. The app does **not** fetch a remote plugin catalog JSON from our servers; the catalog is **bundled statically** in the frontend.

---

## Network: where connections go

- **SSH / SFTP / SCP** (and similar): traffic goes to **hostnames and ports you configure** — your or your chosen servers. Session content is **not** sent to the NoSuckShell project.
- **License:** verification is **offline** (Ed25519 signature over a local file). A **separate license server** matters only if **you** or a **seller** runs one; see [docs/licensing.md](docs/licensing.md). Using the app **without** purchasing through such channels does **not** require contact with “our” servers, because the project does not mandate such infrastructure for basic use.

---

## Terminal output and session data

- **Terminal output** and **keystrokes** in embedded terminals are **process-local** and are **not** mirrored to a project-operated cloud.
- **RAM and swap** are governed by your OS and hardening; that is **outside** application logic.
- For **remote sessions**, **server operators** and **network infrastructure** may observe or log content — that is **normal for SSH** and not specific to NoSuckShell.

---

## Backups

- Exported backups are **encrypted**; plaintext legacy backups are **rejected** on import.
- The **backup password** is **not** persisted by the app (see [docs/backup-security.md](docs/backup-security.md)).
- Where you store the backup file (USB, cloud drive, email, and so on) is **your** responsibility.

---

## Threat model and user responsibility

The app may process **highly sensitive** data. You should:

- **Protect access** to your user account and the files listed above (disk encryption, screen lock, backups only to trusted locations).
- Avoid **malware**; a compromised machine can read anything the app stores locally.
- Follow **SSH best practices** (key strength, `known_hosts`, permissions on `~/.ssh`).

---

## Technical notes (transparency)

- Tauri config currently sets **`csp: null`** for the webview — this affects **Content Security Policy** for the embedded frontend. Consult the [Tauri documentation](https://v2.tauri.app/) and the source when assessing impact.
- **Dependencies** (Rust, npm) have their own security posture; staying current and running `cargo audit` / `npm audit` is part of responsible use.

---

## Reporting a vulnerability

Please **do not** open a public GitHub issue for **undisclosed** security problems.

**Steps:**

1. Open [github.com/d0dg3r/NoSuckShell](https://github.com/d0dg3r/NoSuckShell).
2. Go to **Security** → **Report a vulnerability** (private vulnerability report).

**What to include:** version, platform, reproduction steps, likely impact, relevant logs — avoid posting weaponized exploit details in public comments.

We aim to acknowledge reports in a reasonable timeframe; **fixed SLAs are not guaranteed** in an open-source context.

---

## Scope

**In scope:**

- The **NoSuckShell desktop application** (Tauri shell, bundled frontend, Rust backend).
- Handling of **local SSH configuration**, **in-app session/terminal flows**, and **encrypted backup** flows as implemented in this repository.

**Typically out of scope:**

- Generic weaknesses in the **SSH protocol** or **your server configuration**.
- **Third parties** with no specific link to how this app integrates them.

---

## Bug bounty

This project does **not** run a bug bounty program.

---

## Code of Conduct

For behavior in issues and discussions, see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Further reading

| Document | Contents |
| --- | --- |
| [docs/backup-security.md](docs/backup-security.md) | Backup format, password handling, path validation |
| [docs/licensing.md](docs/licensing.md) | Offline licenses, keys, privacy notes for shop webhooks |
