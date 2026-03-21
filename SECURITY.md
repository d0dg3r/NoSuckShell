# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for undisclosed security problems.

Report vulnerabilities through GitHub **Security** for this repository:

1. Open [github.com/d0dg3r/NoSuckShell](https://github.com/d0dg3r/NoSuckShell).
2. Go to **Security** → **Report a vulnerability** (private vulnerability report).

Describe the issue with enough detail for maintainers to reproduce or understand impact (version, platform, steps, relevant logs). We aim to acknowledge reports in a reasonable timeframe; exact SLAs are not guaranteed.

## Scope

In scope for security discussion:

- The **NoSuckShell desktop application** (Tauri shell, bundled frontend, Rust backend).
- Handling of **local SSH configuration**, **session/terminal data**, and **encrypted backup** flows as implemented in this repository.

Out of scope examples: generic SSH protocol weaknesses, misconfiguration of your own servers, or third-party dependencies unless the issue is specific to how this app uses them.

## Bug bounty

This project does **not** run a bug bounty program.

## Code of Conduct

For behavior in issues and discussions, see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
