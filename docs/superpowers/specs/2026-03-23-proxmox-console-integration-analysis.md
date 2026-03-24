# Proxmox Console Integration

**Original analysis:** 2026-03-23  
**Last reconciled with codebase:** 2026-03-24  

This document describes **upstream Proxmox console behaviour** and how **NoSuckShell** implements it. It is a **reference**, not a change log.

---

## 1. Upstream Repository Map

The authoritative sources for Proxmox web console integration are:

| Repository | Role in console flow | Canonical location |
|---|---|---|
| **pve-xtermjs** | `termproxy` (Rust TCP server) + reference xterm.js browser client | `git.proxmox.com/pve-xtermjs.git` / GitHub mirror |
| **pve-manager** | `pveproxy` (HTTPS + WebSocket gateway on port 8006); routes `/api2/json/nodes/{node}/{type}/{vmid}/vncwebsocket` | `github.com/proxmox/pve-manager` |
| **qemu-server** | REST API: `POST .../qemu/{vmid}/vncproxy` → returns port + ticket | `github.com/proxmox/qemu-server` |
| **pve-container** | REST API: `POST .../lxc/{vmid}/termproxy` → returns port + ticket | `github.com/proxmox/pve-container` |
| **pve-access-control** | PVE ticket system, `VM.Console` ACL | `github.com/proxmox/pve-access-control` |

### Key modules

- **`termproxy/src/main.rs`** — TCP server behind pveproxy for LXC/node-shell sessions; defines the wire protocol.
- **`xterm.js/src/main.js`** — reference browser client; message formats the browser sends and expects.
- **`pveproxy`** — between browser WebSocket and `termproxy` TCP; for VNC it proxies to QEMU on the node.

---

## 2. Upstream Protocol: Exact Flows

### 2a. QEMU VNC Console

```
Browser                    pveproxy (8006)              QEMU (node)
  |                              |                            |
  |-- POST .../qemu/{vmid}/vncproxy ---→                    |
  |   Authorization: PVEAPIToken=...                          |
  |←-- { data: { port: N, ticket: "PVE:..." } } ------------ |
  |-- WebSocket upgrade .../vncwebsocket?port=&vncticket=...   |
  |   Sec-WebSocket-Protocol: binary                          |
  |←-- 101 ... RFB over WebSocket (noVNC handles RFB)         |
```

- `vncticket` is validated server-side; no extra browser auth after upgrade.
- Subprotocol: `binary`.

### 2b. LXC Terminal (pve-xtermjs)

Text-based client→server messages (ASCII leading digit); server→client binary PTY after auth.

| Direction | Content |
|-----------|---------|
| Client → server (after open) | `"{username}:{ticket}\n"` (text) |
| Server → client (first) | `OK` (`0x4F 0x4B`) + optional bytes; strip first two bytes |
| Client → server (input) | Text: `"0:{byteLen}:{utf8data}"` |
| Client → server (resize) | Text: `"1:{cols}:{rows}:"` |
| Client → server (ping) | Text: `"2"` (reference ~30 s) |
| Server → client (after OK) | Raw binary PTY; no per-frame op prefix |

`termproxy` uses `buf[0] - b'0'` for message type — **text** frames with ASCII `'0'`, `'1'`, `'2'`, not raw `0x00` op bytes.

---

## 3. NoSuckShell Implementation Cross-Check

### 3a. QEMU VNC — `ProxmoxQemuVncPane.tsx` + `proxmux.rs`

| Step | Upstream | Implementation | Status |
|------|----------|------------------|--------|
| API | `POST .../vncproxy` + token | `fetch_qemu_vnc_proxy` | OK |
| Parse `{ port, ticket }` | | `parseProxmoxConsoleProxyData` | OK |
| WS URL | `vncwebsocket` + query | `buildProxmoxConsoleWebSocketUrl` | OK |
| Subprotocol | `binary` | noVNC `RFB` | OK |
| TLS to cluster | Often self-signed | Local `ws://127.0.0.1` bridge → `proxmux_ws_proxy` when `allowInsecureTls` **or** non-empty `tlsTrustedCertPem` | OK |
| noVNC ESM | default / nested default | `resolveNovncRfbConstructor` | OK (known interop quirk) |
| Debug telemetry | None | None in pane sources | OK |

### 3b. LXC terminal — `ProxmoxLxcTermPane.tsx` + `proxmux.rs`

Implemented in **`attachProxmoxLxcSocket`** (same file as the pane):

| Step | Upstream | Implementation | Status |
|------|----------|------------------|--------|
| API | `POST .../termproxy` + token | `fetchLxcTermProxy` | OK |
| WS URL / subprotocol | `vncwebsocket`, `binary` | `buildProxmoxConsoleWebSocketUrl` (`lxc`), `WebSocket(..., ["binary"])` | OK |
| Auth | `"{user}:{ticket}\n"` after open | `ws.send(\`${apiUser}:${vncTicket}\n\`)` | OK |
| `apiUser` | Realm-qualified user | Plugin returns `apiUser`; pane falls back `root@pam` | OK |
| First server message | `OK` + optional tail | `0x4F 0x4B` check; then `term.write` remainder | OK |
| Input | `"0:{byteLen}:{data}"` | `term.onData` → `ws.send(\`0:${byteLen}:${data}\`)` | OK |
| Resize | `"1:{cols}:{rows}:"` | `term.onResize` (after auth) | OK |
| Ping | `"2"` ~30 s | `setInterval` 30_000 ms | OK |
| PTY after auth | Raw binary | `term.write(raw)` on further messages | OK |
| TLS to cluster | Self-signed / custom trust | Same bridge rule as QEMU (`useTlsBridge` + `proxmuxWsProxyStart`) | OK |
| Debug telemetry | None | None in pane sources | OK |

**LXC verdict:** Wire protocol matches upstream reference; the earlier “critical bug” analysis in this file **no longer applies** to the current tree.

---

## 4. PROXMUX TLS and HTTP Client (`proxmux.rs` + `proxmux_ws_proxy.rs`)

- **HTTP** uses **reqwest** with **`native-tls`** (not rustls) for Proxmox API traffic.
- **`allow_insecure_tls`** on the cluster → `danger_accept_invalid_certs(true)` for that client.
- **Non-empty `tls_trusted_cert_pem`** (saved PEM + leaf SHA-256 from **Fetch from server** in Settings) → **also** `danger_accept_invalid_certs(true)`. OpenSSL chain validation with custom PEM alone was unreliable on typical PVE deployments; the PEM is kept for **identity / rotation UX** (fingerprint compare on fetch), not as the sole wire verifier.
- **`proxmux_ws_proxy`**: if **`allow_insecure_tls`** **or** non-empty trusted PEM → **`danger_accept_invalid_certs(true)`** on the upstream `native_tls` connector; forwards `PVEAuthCookie` on the WebSocket upgrade when the plugin supplies it.

**Fetch TLS certificate** (`fetchTlsCertificate` plugin method): uses **OpenSSL** (`SslConnector`, verify off) to read **`SSL_get_peer_cert_chain`** and return **PEM + leaf SHA-256** for storage in cluster settings.

---

## 5. Known Limitations (unchanged product scope)

- **Node shell** is not a native in-pane xterm client; it uses the web / in-app webview path like other Proxmox URLs.
- **`proxmoxQemuVnc` / `proxmoxLxcTerm` sessions** are not persisted across app restarts (consoles are not resumable).
- **WS proxy lifecycle:** `proxmux_ws_proxy_start` accepts multiple browser connections on one listener; rapid reconnect without `stop` can leave extra upstream sockets until teardown (low impact).

---

## 6. Suggested QA Matrix

| Case | Expectation |
|------|-------------|
| LXC running, public CA | Direct `wss://` or bridge as configured |
| LXC running, self-signed + Allow insecure TLS | Bridge + relaxed upstream TLS |
| LXC running, self-signed + stored PEM (no insecure flag) | Bridge + relaxed upstream TLS; PEM/fingerprint in settings |
| QEMU VNC, same TLS variants | Same bridge rules as LXC |
| QEMU paused / guest down | Clean error from API or noVNC, no hang |

---

## 7. Ground Truth Summary

| Question | Answer |
|----------|--------|
| LXC wire protocol reference | `pve-xtermjs` `termproxy` + `xterm.js` client |
| QEMU VNC client in app | `@novnc/novnc` RFB |
| API plugin | `apps/desktop/src-tauri/src/plugins/proxmux.rs` |
| WS bridge | `apps/desktop/src-tauri/src/proxmux_ws_proxy.rs` |
| Panes | `ProxmoxQemuVncPane.tsx`, `ProxmoxLxcTermPane.tsx` |
| Debug ingest / `127.0.0.1:7291` | **Not** in shipped sources; `.cursor/debug-*.log` is local IDE-only |

When behaviour changes, update this doc in the **same PR** as the code, or in a follow-up that references the PR.
