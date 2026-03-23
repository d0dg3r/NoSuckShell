//! Local WebSocket listener that bridges the Tauri webview to a Proxmox `wss://` console endpoint.
//! Needed when the cluster uses self-signed TLS (`allow insecure TLS`): the system webview may reject
//! `wss://` to the cluster, while this path accepts the browser `ws://127.0.0.1` hop and uses
//! `native_tls` with optional `danger_accept_invalid_certs` toward Proxmox.

use futures_util::{SinkExt, StreamExt};
use http::Uri;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::{accept_hdr_async, WebSocketStream};

/// Tracks the accept-loop task handle and all per-connection task handles for a running proxy.
struct ProxyEntry {
    accept_handle: tokio::task::JoinHandle<()>,
    conn_handles: Arc<Mutex<Vec<tokio::task::JoinHandle<()>>>>,
}

type JoinMap = Arc<Mutex<HashMap<String, ProxyEntry>>>;

fn proxy_tasks() -> &'static JoinMap {
    static MAP: std::sync::OnceLock<JoinMap> = std::sync::OnceLock::new();
    MAP.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

type UpstreamWs = WebSocketStream<tokio_native_tls::TlsStream<TcpStream>>;

fn apply_upstream_auth_headers(
    req: &mut http::Request<()>,
    auth_header: Option<&str>,
    auth_cookie: Option<&str>,
) {
    if let Some(auth) = auth_header {
        let trimmed = auth.trim();
        if !trimmed.is_empty() {
            if let Ok(v) = http::HeaderValue::from_str(trimmed) {
                req.headers_mut().insert(http::header::AUTHORIZATION, v);
            }
        }
    }
    if let Some(cookie) = auth_cookie {
        let trimmed = cookie.trim();
        if !trimmed.is_empty() {
            if let Ok(v) = http::HeaderValue::from_str(trimmed) {
                req.headers_mut().insert(http::header::COOKIE, v);
            }
        }
    }
}

async fn connect_upstream_wss(
    upstream_wss_url: &str,
    allow_insecure_tls: bool,
    auth_header: Option<&str>,
    auth_cookie: Option<&str>,
) -> anyhow::Result<UpstreamWs> {
    let parsed = url::Url::parse(upstream_wss_url)?;
    let host = parsed.host_str().ok_or_else(|| anyhow::anyhow!("upstream URL missing host"))?;
    let port = parsed.port_or_known_default().unwrap_or(443);

    let tcp = TcpStream::connect((host, port)).await?;
    let mut tls_builder = native_tls::TlsConnector::builder();
    if allow_insecure_tls {
        tls_builder.danger_accept_invalid_certs(true);
    }
    let cx = tls_builder.build()?;
    let cx = tokio_native_tls::TlsConnector::from(cx);
    let tls = cx.connect(host, tcp).await?;

    let uri: Uri = upstream_wss_url.parse()?;
    let mut req = uri.into_client_request()?;
    apply_upstream_auth_headers(&mut req, auth_header, auth_cookie);
    req.headers_mut().insert(
        http::header::SEC_WEBSOCKET_PROTOCOL,
        http::HeaderValue::from_static("binary"),
    );
    let (ws, _) = tokio_tungstenite::client_async(req, tls).await?;
    Ok(ws)
}

async fn proxy_one_browser_connection(
    browser_tcp: TcpStream,
    expected_path: String,
    upstream_wss_url: String,
    allow_insecure_tls: bool,
    auth_header: Option<String>,
    auth_cookie: Option<String>,
) {
    let callback = move |req: &Request, response: Response| -> Result<Response, http::Response<Option<String>>> {
        if req.uri().path() != expected_path.as_str() {
            let err = http::Response::builder()
                .status(http::StatusCode::FORBIDDEN)
                .body(Some("Forbidden".to_string()))
                .expect("response");
            return Err(err);
        }
        Ok(response)
    };
    let browser_ws = match accept_hdr_async(browser_tcp, callback).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("proxmux ws proxy: accept browser ws: {e}");
            return;
        }
    };

    let upstream_ws = match connect_upstream_wss(
        &upstream_wss_url,
        allow_insecure_tls,
        auth_header.as_deref(),
        auth_cookie.as_deref(),
    )
    .await
    {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("proxmux ws proxy: connect upstream: {e}");
            return;
        }
    };

    let (mut b_sink, mut b_stream) = browser_ws.split();
    let (mut u_sink, mut u_stream) = upstream_ws.split();

    let up = async {
        while let Some(msg) = u_stream.next().await {
            match msg {
                Ok(m) => {
                    if b_sink.send(m).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("proxmux ws proxy: upstream read: {e}");
                    break;
                }
            }
        }
        let _ = b_sink.close().await;
    };

    let down = async {
        while let Some(msg) = b_stream.next().await {
            match msg {
                Ok(m) => {
                    if u_sink.send(m).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("proxmux ws proxy: browser read: {e}");
                    break;
                }
            }
        }
        let _ = u_sink.close().await;
    };

    tokio::select! {
        () = up => {}
        () = down => {}
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxmuxWsProxyStartResult {
    pub proxy_id: String,
    pub local_ws_url: String,
}

#[tauri::command]
pub async fn proxmux_ws_proxy_start(
    upstream_wss_url: String,
    allow_insecure_tls: bool,
    auth_header: Option<String>,
    auth_cookie: Option<String>,
) -> Result<ProxmuxWsProxyStartResult, String> {
    let upstream_wss_url = upstream_wss_url.trim().to_string();
    if !upstream_wss_url.to_ascii_lowercase().starts_with("wss://") {
        return Err("upstream URL must start with wss://".to_string());
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let proxy_id = uuid::Uuid::new_v4().to_string();
    let path_token = format!("/{proxy_id}");
    let local_ws_url = format!("ws://127.0.0.1:{port}{path_token}");

    let upstream = upstream_wss_url.clone();
    let conn_handles: Arc<Mutex<Vec<tokio::task::JoinHandle<()>>>> =
        Arc::new(Mutex::new(Vec::new()));
    let conn_handles_for_loop = conn_handles.clone();

    let accept_handle = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let upstream = upstream.clone();
                    let auth = auth_header.clone();
                    let cookie = auth_cookie.clone();
                    let path = path_token.clone();
                    let conn_handle = tokio::spawn(proxy_one_browser_connection(
                        stream,
                        path,
                        upstream,
                        allow_insecure_tls,
                        auth,
                        cookie,
                    ));
                    let mut guard = conn_handles_for_loop.lock().expect("conn handles lock");
                    // Prune finished task handles to avoid unbounded growth.
                    guard.retain(|h| !h.is_finished());
                    guard.push(conn_handle);
                }
                Err(e) => {
                    eprintln!("proxmux ws proxy: accept: {e}");
                    break;
                }
            }
        }
    });

    proxy_tasks()
        .lock()
        .expect("proxy map lock")
        .insert(proxy_id.clone(), ProxyEntry { accept_handle, conn_handles });

    Ok(ProxmuxWsProxyStartResult {
        proxy_id,
        local_ws_url,
    })
}

#[tauri::command]
pub fn proxmux_ws_proxy_stop(proxy_id: String) -> Result<(), String> {
    let id = proxy_id.trim().to_string();
    if id.is_empty() {
        return Err("proxyId is required".to_string());
    }
    if let Some(entry) = proxy_tasks().lock().expect("proxy map lock").remove(&id) {
        entry.accept_handle.abort();
        let handles = entry.conn_handles.lock().expect("conn handles lock");
        for h in handles.iter() {
            h.abort();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::apply_upstream_auth_headers;

    #[test]
    fn forwards_cookie_header_for_session_auth() {
        let mut req = http::Request::builder()
            .uri("wss://pve.local:8006/api2/json/nodes/pve/qemu/101/vncwebsocket")
            .body(())
            .expect("request");

        apply_upstream_auth_headers(
            &mut req,
            None,
            Some("PVEAuthCookie=PVE:user@pam:abcdef"),
        );

        let cookie = req
            .headers()
            .get(http::header::COOKIE)
            .expect("cookie header");
        assert_eq!(cookie, "PVEAuthCookie=PVE:user@pam:abcdef");
    }

    #[test]
    fn ignores_blank_auth_values() {
        let mut req = http::Request::builder()
            .uri("wss://pve.local:8006/api2/json/nodes/pve/lxc/101/vncwebsocket")
            .body(())
            .expect("request");

        apply_upstream_auth_headers(&mut req, Some("  "), Some("  "));

        assert!(req.headers().get(http::header::AUTHORIZATION).is_none());
        assert!(req.headers().get(http::header::COOKIE).is_none());
    }
}
