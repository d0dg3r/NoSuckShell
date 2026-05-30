# Performance notes and measurement methodology

This document records the **performance-sensitive paths** in NoSuckShell and the **measurement methodology** that should accompany any optimization PR. Optimize against numbers, not vibes.

## Hot paths

| Path | Where | Notes |
| --- | --- | --- |
| Terminal output | [`features/terminal-output-batch.ts`](../apps/desktop/src/features/terminal-output-batch.ts), [`session-output-bridge.ts`](../apps/desktop/src/session-output-bridge.ts) | PTY chunks are coalesced per `requestAnimationFrame`, then written to xterm. Bypassing this batcher tanks throughput. |
| Terminal input | [`features/session-input-queue.ts`](../apps/desktop/src/features/session-input-queue.ts), `tauri-api.sendInput` | Single-character keystrokes are coalesced inside a 6 ms micro-batch window before crossing the IPC boundary. |
| Terminal pane subtree | [`components/TerminalPane.tsx`](../apps/desktop/src/components/TerminalPane.tsx) | Wrapped in `React.memo` (since 0.4.x). Parent re-renders no longer cascade into xterm. |
| Split renderer | [`components/SplitWorkspace.tsx`](../apps/desktop/src/components/SplitWorkspace.tsx) (`createSplitPaneRenderer`) | Receives a fresh ~80-field bridge from `App.tsx` each render. Direct memoization is **not** safe (stale closures). The right path is to stabilize the consumed leaf props (e.g. `RemoteFilePane.spec`) and add `React.memo` around them. |
| SFTP / SCP browsing and transfers | [`src-tauri/src/sftp.rs`](../apps/desktop/src-tauri/src/sftp.rs) | Synchronous Tauri commands using **blocking** `ssh2`. Tauri runs each command on a worker thread, so a single transfer does not block the UI, but many concurrent ones can saturate the worker pool. |

## SFTP characteristics today

- Each `#[tauri::command] fn sftp_*` runs on a Tauri worker thread.
- Inside the command, `ssh2` is **blocking** on read/write; there is no `tokio` involvement on the SFTP path. (`tokio` is used only by `proxmux_ws_proxy.rs`.)
- Transfer pause/cancel is cooperative: the worker polls `AtomicBool` flags from [`sftp_transfer_ops.rs`](../apps/desktop/src-tauri/src/sftp_transfer_ops.rs) between chunks.
- Progress is emitted via `app.emit("nss-xfer:progress", …)` while the transfer thread is alive.

This means optimization is mostly about **saturating bandwidth** (chunk size, parallelism), **avoiding redundant connects** (session reuse), and **not blocking the worker pool** with many small files at once.

## Measurement methodology

Before changing perf-sensitive code, capture a baseline. Re-measure after the change with the **same** dataset and environment. Record both numbers in the PR description.

### Frontend re-render and interaction profiling

1. Run a development build (`npm run tauri:dev`) and open Chrome DevTools (or the Tauri devtools).
2. Use the **Performance** tab and record while typing into a terminal pane, dragging a host between panes, or opening Settings.
3. Look for cascades of React commit phases triggered from `App.tsx`. The fix is usually `React.memo` on a leaf or stabilizing a callback prop, not micro-optimizations inside the leaf.
4. For React-specific instrumentation use the **React DevTools Profiler**. Record a 5-second interaction, then compare the **Render reasons** column before/after.

### SFTP transfer benchmark

Use a representative workload:

- A directory containing **~1 file × 100 MiB** (single-stream throughput).
- A directory containing **~1000 files × 32 KiB** (small-file fan-out).

Steps:

1. Pick a pinned remote target (loopback `localhost:22` works well to remove network jitter).
2. From the file pane, copy the workload directory between two panes.
3. Record the **wall-clock time** displayed in the transfer dialog and the **MB/s** average.
4. Repeat 3 times; report median.

If you reach for `tokio` or worker pools as an optimization, first answer:

- Is `ssh2` (blocking) actually the bottleneck, or is it the Tauri IPC / progress event rate?
- Would a larger chunk size (currently `8 KB` reads in PTY paths, `MAX_UPLOAD_BYTES = 50 MiB` cap for in-memory uploads in `sftp.rs`) get most of the win?
- Does session reuse across files in a tree copy already amortize the connect cost?

### Startup and cold-start

For startup regressions, time **`tauri:dev` first paint** and **production `tauri:build` cold launch** with a stopwatch. Record both with the same build profile.

## Future work (perf-related, tracked elsewhere)

- Stabilize `RemoteFilePane` / `LocalFilePane` props so they can be wrapped in `React.memo` (see [refactoring-app-roadmap.md](refactoring-app-roadmap.md), section E).
- Investigate adaptive SFTP chunk sizing under high latency.
- Investigate `tokio`-based async for SFTP **only** if measurements show the worker-pool saturation pattern.
