# Proxmox Console Integration Analysis

**Date:** 2026-03-23  
**Scope:** Analysis only — no code changes.

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

- **`termproxy/src/main.rs`** — the TCP server that pveproxy spawns per console session. Defines the wire protocol for LXC/node-shell sessions.
- **`xterm.js/src/main.js`** — the reference browser client for xtermjs consoles. Defines the exact message format the browser sends and expects.
- **`pveproxy`** — sits between browser WebSocket and the `termproxy` TCP socket; for VNC it proxies to the QEMU VNC port.

---

## 2. Upstream Protocol: Exact Flows

### 2a. QEMU VNC Console

```
Browser                    pveproxy (8006)              QEMU (node)
  |                              |                            |
  |-- POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy ---→ |
  |   Authorization: PVEAPIToken=...                          |
  |←-- { data: { port: N, ticket: "PVE:..." } } ------------ |
  |                              |                            |
  |-- WebSocket upgrade ------→ |                            |
  |   GET /api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket   |
  |       ?port=N&vncticket=... (URL-encoded)                 |
  |   Sec-WebSocket-Protocol: binary                          |
  |←-- 101 Switching Protocols - |                            |
  |                              |-- TCP connect to QEMU VNC -|
  |←===== RFB frames (binary) ==|===========================→ |
  |  noVNC handles all RFB internally                        |
```

- The `vncticket` in the query string is validated by `pveproxy` server-side. The browser sends no explicit auth after the upgrade.
- noVNC's `RFB` object speaks the RFB protocol. Proxmox's pveproxy speaks standard RFB-over-WebSocket.
- Subprotocol: `binary` (negotiated via `Sec-WebSocket-Protocol`).

### 2b. LXC Terminal Console (pve-xtermjs protocol)

This is a **text-based netstring protocol** (not binary framing):

```
Browser                    pveproxy (8006)              termproxy (TCP)
  |                              |                            |
  |-- POST /api2/json/nodes/{node}/lxc/{vmid}/termproxy ----→|
  |   Authorization: PVEAPIToken=...                          |
  |←-- { data: { port: N, ticket: "PVE:..." } } ------------ |
  |                              |                            |
  |-- WebSocket upgrade ------→ |                            |
  |   GET /api2/json/nodes/{node}/lxc/{vmid}/vncwebsocket    |
  |       ?port=N&vncticket=... (URL-encoded)                 |
  |   Sec-WebSocket-Protocol: binary                          |
  |←-- 101 Switching Protocols - |                            |
  |                              |-- TCP connect to termproxy |
  |                              |                            |
  |-- TEXT: "{username}:{ticket}\n" -------------------------→|
  |   (auth handshake; must include the trailing newline)     |
  |                              |                            |
  |←-- Binary: "OK" (0x4F 0x4B) + optional data ------------ |
  |   (server confirms auth; slice off the 2 OK bytes)        |
  |                              |                            |
  |-- TEXT: "0:{byteLen}:{utf8data}" (user input) ----------→|
  |-- TEXT: "1:{cols}:{rows}:" (resize) --------------------→|
  |-- TEXT: "2" (ping, every 30 s) ------------------------→  |
  |                              |                            |
  |←-- Binary: raw PTY output (Uint8Array, write direct) --- |
```

**Auth handshake detail:**  
Immediately after the WebSocket `open` event, the client sends:
```
"{PVE.UserName}:{ticket}\n"
```
Where `PVE.UserName` is the authenticated username (e.g. `root@pam`) and `ticket` is the ticket string from the termproxy response. The trailing `\n` is **required** — `termproxy/src/main.rs` (`read_ticket_line`) reads until it sees `\n`.

**Data frames (client → server) — TEXT strings:**
| Type | Format |
|---|---|
| Input data | `"0:{byteLen}:{data}"` — where `{byteLen}` is the *byte length* of the UTF-8 encoded data, and `{data}` is the raw string |
| Resize | `"1:{cols}:{rows}:"` |
| Ping | `"2"` |

**Server → client — binary frames:**
- Raw PTY bytes as `ArrayBuffer`. No op-byte prefix.
- First message after auth: `"OK"` (bytes 0x4F, 0x4B) + any immediate output. Slice those 2 bytes off.

**How `termproxy` decodes the message type (from `main.rs`):**
```rust
let msgtype = buf[0] - b'0';  // ASCII '0' → 0, '1' → 1, '2' → 2
```
This means the wire format uses **ASCII digit characters**, not raw byte values.

---

## 3. Cross-Check Against Local Implementation

### 3a. QEMU VNC (`ProxmoxQemuVncPane.tsx` + `proxmux.rs`)

| Step | Upstream requirement | Our implementation | Status |
|---|---|---|---|
| API call | `POST .../qemu/{vmid}/vncproxy` with `PVEAPIToken` | `fetch_qemu_vnc_proxy` in `proxmux.rs` | ✅ Correct |
| Response fields | `{ port, ticket }` in `data` | `parseProxmoxConsoleProxyData` | ✅ Correct |
| WS URL | `/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?port={port}&vncticket={url-encoded-ticket}` | `buildProxmoxConsoleWebSocketUrl` | ✅ Correct |
| WS subprotocol | `binary` | `new RFB(...)` (noVNC handles this) | ✅ Correct |
| Auth | Server-side via `vncticket` query param | Passed in URL | ✅ Correct |
| Protocol | RFB handled by noVNC | Dynamic import + `new RFB(screen, url)` | ✅ Correct in principle |
| TLS (insecure) | n/a | Rust WS bridge (`proxmux_ws_proxy.rs`) | ✅ Correct |
| Debug telemetry | None | 6× `fetch('http://127.0.0.1:7291/ingest/...')` | ❌ MUST REMOVE |
| ESM export shape | `RFB` is a default export | Double-resolved with `mod.default?.default` fallback | ⚠️ Fragile but covers the known case |

**QEMU VNC verdict: fundamentally correct; main risk is the debug telemetry.**

---

### 3b. LXC Terminal (`ProxmoxLxcTermPane.tsx` + `proxmux.rs`)

| Step | Upstream requirement | Our implementation | Status |
|---|---|---|---|
| API call | `POST .../lxc/{vmid}/termproxy` with `PVEAPIToken` | `fetch_lxc_term_proxy` in `proxmux.rs` | ✅ Correct |
| Response fields | `{ port, ticket }` in `data` | `parseProxmoxConsoleProxyData` | ✅ Correct |
| WS URL | `/api2/json/nodes/{node}/lxc/{vmid}/vncwebsocket?port={port}&vncticket={url-encoded-ticket}` | `buildProxmoxConsoleWebSocketUrl` with `guest="lxc"` | ✅ Correct |
| WS subprotocol | `binary` | `new WebSocket(url, ["binary"])` | ✅ Correct |
| **Auth handshake** | **After open: send `"{username}:{ticket}\n"` as text string** | **NOT sent at all** | 🔴 CRITICAL BUG |
| **"OK" handshake** | **First server message is `"OK"` (0x4F 0x4B); must check before writing output** | **Not handled; all bytes go to xterm immediately** | 🔴 CRITICAL BUG |
| **Send format** | **Text string: `"0:{byteLen}:{data}"`** | **Binary ArrayBuffer: `[0x00, ...utf8bytes]`** | 🔴 CRITICAL BUG |
| **Receive format** | **Raw binary PTY bytes, no prefix** | **Expects binary frame with op-byte prefix (0 or 2)** | 🔴 CRITICAL BUG |
| Resize | Text: `"1:{cols}:{rows}:"` | Not sent at all | 🔴 Missing |
| Ping | Text: `"2"` every 30 s | Not sent | ⚠️ May cause server-side timeout |
| Debug telemetry | None | 8× `fetch('http://127.0.0.1:7291/ingest/...')` | ❌ MUST REMOVE |
| TLS (insecure) | n/a | Rust WS bridge | ✅ Correct |

**LXC Terminal verdict: protocol is fundamentally broken. The session will be established at the WebSocket level but will fail at the Proxmox auth handshake, causing an immediate close or garbled output.**

---

## 4. Critical Findings by Priority

### P0 — Protocol correctness blockers (LXC terminal will not work)

**P0-1: Missing auth handshake**  
File: `apps/desktop/src/components/ProxmoxLxcTermPane.tsx`  
After WebSocket `open`, the browser must send:
```typescript
ws.send(`${username}:${ticket}\n`);
```
Where `username` comes from the cluster/session context (e.g. `root@pam`) and `ticket` from the termproxy response. Without this, `termproxy` closes the connection with "connection closed before authentication".

**P0-2: Wrong client→server message format**  
Our code sends binary `ArrayBuffer` with `[0x00, ...data]`. Upstream expects a text `string` `"0:{byteLen}:{data}"`. The server reads `buf[0] - b'0'` expecting an ASCII digit.

Fix:
```typescript
// Instead of:
const pkt = new Uint8Array(1 + body.length);
pkt[0] = 0;
ws.send(pkt.buffer);

// Should be:
const byteLen = enc.encode(data).length;
ws.send(`0:${byteLen}:${data}`);
```

**P0-3: Wrong server→client message handling**  
Upstream sends raw PTY bytes (binary, no prefix). Our code reads `buf[0]` as an op byte and discards messages not starting with 0 or 2.

Fix: after the "OK" check, write all received bytes directly:
```typescript
ws.binaryType = "arraybuffer";
ws.onmessage = (ev) => {
  if (!connected) {
    const b = new Uint8Array(ev.data as ArrayBuffer);
    if (b[0] === 79 && b[1] === 75) { // "OK"
      connected = true;
      term.write(b.slice(2));
    } else {
      ws.close(); // auth rejected
    }
  } else {
    term.write(new Uint8Array(ev.data as ArrayBuffer));
  }
};
```

**P0-4: Missing resize signal**  
When the terminal is resized, the server must be notified:
```typescript
term.onResize(({ cols, rows }) => {
  if (ws.readyState === WebSocket.OPEN && connected) {
    ws.send(`1:${cols}:${rows}:`);
  }
});
```

### P1 — Shipping risk (not protocol, but must fix before release)

**P1-1: Debug telemetry in both panes**  
Both `ProxmoxQemuVncPane.tsx` and `ProxmoxLxcTermPane.tsx` contain `#region agent log` blocks that POST to `http://127.0.0.1:7291/ingest/...` — a local debug ingest server from a previous debugging session. These fire on every WebSocket event, every message, and on connection. Must be removed before any release or QA testing.

**P1-2: Missing ping keepalive (LXC)**  
Termproxy likely has an idle timeout. The reference client sends `socket.send("2")` every 30 seconds. Without this, long-idle sessions may be dropped silently.

### P2 — Auth context gap

**P2-1: Username unknown at LXC pane level**  
The `username:ticket\n` handshake requires knowing the PVE username (e.g. `root@pam`, `user@pve`). Currently the termproxy ticket is fetched from the Rust plugin using an API token, but the response from `POST .../termproxy` does NOT return the username — it only returns `port` and `ticket`. The username must be inferred from the cluster's `api_user` field.

The Proxmox API token format is `user@realm!tokenid`, so `api_user` from `StoredCluster` already contains the realm-qualified username. This can be returned from `fetch_lxc_term_proxy` alongside `apiOrigin` and `data`.

### P3 — Design limitation (known, acceptable)

**P3-1: Node shell not natively integrated**  
Only QEMU VNC and LXC terminal have native in-pane implementations. Node shell still uses the web fallback (pveproxy's xtermjs UI in a webview). The protocol is the same as LXC terminal, so the P0 fixes above are a prerequisite for node shell native integration if desired later.

**P3-2: Session restore is ephemeral**  
`proxmoxQemuVnc` and `proxmoxLxcTerm` tabs are not persisted across app restarts. This is an intentional design decision (console sessions cannot be resumed), but it is not documented in the UI.

**P3-3: WS proxy lifecycle edge case**  
`proxmux_ws_proxy_start` binds a listener that accepts multiple connections in a loop. If the frontend reconnects without calling `stop` first (e.g. on React strict mode double-mount), a second connection is accepted on the same local port and a second upstream WS is opened. The prior connection is not closed. This is harmless in practice but could leave zombie upstream connections.

---

## 5. Verified Correct (no action needed)

- **Rust API plugin** (`proxmux.rs`): vncproxy/termproxy HTTP calls, URL construction, API token header format, failover logic, input validation — all match upstream requirements.
- **URL builder** (`proxmox-console-ws.ts`): `buildProxmoxConsoleWebSocketUrl` produces the correct `vncwebsocket` endpoint with `port` and `vncticket` query params.
- **QEMU VNC pane** (protocol correctness): noVNC handles RFB; the server-side vncticket auth is in the URL; the pane implementation correctly delegates all protocol to the noVNC library.
- **TLS bridge** (`proxmux_ws_proxy.rs`): transparent TCP proxy with `native_tls` + optional `danger_accept_invalid_certs` — correctly enables self-signed cluster certs.

---

## 6. Prioritized Implementation Checkpoints

In order of priority for the next implementation phase:

1. **Remove debug telemetry** from both pane files (8 + 6 `fetch(...)` blocks marked `#region agent log`). Prerequisite for any meaningful QA.

2. **Fix LXC auth handshake**: Pass `username` from plugin response, send `username:ticket\n` after WebSocket open.

3. **Fix LXC send protocol**: Replace binary `pkt[0] = 0` sending with text-string netstring format.

4. **Fix LXC receive protocol**: Remove the op-byte stripping; handle "OK" handshake; write raw bytes to xterm.

5. **Add LXC resize signal**: Wire `term.onResize` to send `"1:{cols}:{rows}:"`.

6. **Add LXC ping keepalive**: Send `"2"` every 30 s while connected.

7. **Verify QEMU on real cluster**: Run the QEMU VNC path against an actual cluster (valid TLS + self-signed) to confirm noVNC ESM import and RFB lifecycle work end-to-end.

8. **QA matrix** (after P0 fixes): (a) LXC running / valid TLS, (b) LXC running / insecure TLS, (c) QEMU running / valid TLS, (d) QEMU running / insecure TLS, (e) QEMU paused → expect clean error.

---

## 7. Ground Truth Summary

| Question | Answer |
|---|---|
| Ground truth for LXC protocol | `pve-xtermjs/xterm.js/src/main.js` (client) + `pve-xtermjs/termproxy/src/main.rs` (server) |
| Ground truth for QEMU VNC | noVNC (`@novnc/novnc`) is the client; `pveproxy` proxies RFB to QEMU on the node |
| Ground truth for API endpoints | `pve-container` (LXC `termproxy`), `qemu-server` (QEMU `vncproxy`/`vncwebsocket`) |
| Which parts are correct | QEMU VNC flow, all Rust API calls, URL builder, TLS bridge |
| Which parts are broken | LXC terminal: auth handshake, message encoding (send + receive), resize, ping |
| Biggest pre-release risk | Debug telemetry (`127.0.0.1:7291` calls) in both panes |
