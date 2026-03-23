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
use tokio_tungstenite::accept_async;
use tokio_tungstenite::WebSocketStream;

type JoinMap = Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>;

fn proxy_tasks() -> &'static JoinMap {
    static MAP: std::sync::OnceLock<JoinMap> = std::sync::OnceLock::new();
    MAP.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

type UpstreamWs = WebSocketStream<tokio_native_tls::TlsStream<TcpStream>>;

async fn connect_upstream_wss(upstream_wss_url: &str, allow_insecure_tls: bool, auth_header: Option<&str>) -> anyhow::Result<UpstreamWs> {
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
    if let Some(auth) = auth_header {
        req.headers_mut().insert(
            http::header::AUTHORIZATION,
            http::HeaderValue::from_str(auth).unwrap_or_else(|_| http::HeaderValue::from_static("")),
        );
    }
    req.headers_mut().insert(
        http::header::SEC_WEBSOCKET_PROTOCOL,
        http::HeaderValue::from_static("binary"),
    );
    let (ws, _) = tokio_tungstenite::client_async(req, tls).await?;
    Ok(ws)
}

fn debug_log(location: &str, message: &str, data: &str) {
    use std::io::Write;
    let path = std::path::Path::new("/home/joe/Development/devops-geek/NoSuckShell/.cursor/debug-fb87e7.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
        let _ = writeln!(f, r#"{{"sessionId":"fb87e7","runId":"vnc-debug","hypothesisId":"H2","location":"{location}","message":"{message}","data":{data},"timestamp":{ts}}}"#);
    }
}

async fn proxy_one_browser_connection(
    browser_tcp: TcpStream,
    upstream_wss_url: String,
    allow_insecure_tls: bool,
    auth_header: Option<String>,
) {
    debug_log("proxmux_ws_proxy.rs:browser_accept", "accepting browser ws", "{}");
    let browser_ws = match accept_async(browser_tcp).await {
        Ok(ws) => {
            debug_log("proxmux_ws_proxy.rs:browser_accept", "browser ws accepted OK", "{}");
            ws
        }
        Err(e) => {
            debug_log("proxmux_ws_proxy.rs:browser_accept", "browser ws accept FAILED", &format!(r#"{{"error":"{}"}}"#, e.to_string().replace('"', "'")));
            eprintln!("proxmux ws proxy: accept browser ws: {e}");
            return;
        }
    };

    debug_log("proxmux_ws_proxy.rs:upstream_connect", "connecting upstream", &format!(r#"{{"url":"{}","insecure":{},"hasAuth":{}}}"#, upstream_wss_url.chars().take(120).collect::<String>().replace('"', "'"), allow_insecure_tls, auth_header.is_some()));
    let upstream_ws = match connect_upstream_wss(&upstream_wss_url, allow_insecure_tls, auth_header.as_deref()).await {
        Ok(ws) => {
            debug_log("proxmux_ws_proxy.rs:upstream_connect", "upstream connected OK", "{}");
            ws
        }
        Err(e) => {
            debug_log("proxmux_ws_proxy.rs:upstream_connect", "upstream connect FAILED", &format!(r#"{{"error":"{}"}}"#, e.to_string().replace('"', "'")));
            eprintln!("proxmux ws proxy: connect upstream: {e}");
            return;
        }
    };

    // #region agent log
    debug_log("proxmux_ws_proxy.rs:forwarding", "starting bidirectional forwarding", "{}");
    // #endregion
    let (mut b_sink, mut b_stream) = browser_ws.split();
    let (mut u_sink, mut u_stream) = upstream_ws.split();

    let up = async {
        // #region agent log
        let mut up_count: u64 = 0;
        // #endregion
        while let Some(msg) = u_stream.next().await {
            match msg {
                Ok(m) => {
                    // #region agent log
                    up_count += 1;
                    if up_count <= 3 {
                        let desc = format!(r#"{{"n":{},"kind":"{}","len":{}}}"#, up_count, if m.is_binary() { "bin" } else if m.is_text() { "text" } else { "other" }, m.len());
                        debug_log("proxmux_ws_proxy.rs:up", "upstream→browser msg", &desc);
                    }
                    // #endregion
                    if b_sink.send(m).await.is_err() {
                        // #region agent log
                        debug_log("proxmux_ws_proxy.rs:up", "browser sink send FAILED", "{}");
                        // #endregion
                        break;
                    }
                }
                Err(e) => {
                    // #region agent log
                    debug_log("proxmux_ws_proxy.rs:up", "upstream read ERROR", &format!(r#"{{"error":"{}"}}"#, e.to_string().replace('"', "'")));
                    // #endregion
                    eprintln!("proxmux ws proxy: upstream read: {e}");
                    break;
                }
            }
        }
        // #region agent log
        debug_log("proxmux_ws_proxy.rs:up", "upstream stream ended", &format!(r#"{{"totalMsgs":{}}}"#, up_count));
        // #endregion
        let _ = b_sink.close().await;
    };

    let down = async {
        // #region agent log
        let mut down_count: u64 = 0;
        // #endregion
        while let Some(msg) = b_stream.next().await {
            match msg {
                Ok(m) => {
                    // #region agent log
                    down_count += 1;
                    if down_count <= 3 {
                        let desc = format!(r#"{{"n":{},"kind":"{}","len":{}}}"#, down_count, if m.is_binary() { "bin" } else if m.is_text() { "text" } else { "other" }, m.len());
                        debug_log("proxmux_ws_proxy.rs:down", "browser→upstream msg", &desc);
                    }
                    // #endregion
                    if u_sink.send(m).await.is_err() {
                        // #region agent log
                        debug_log("proxmux_ws_proxy.rs:down", "upstream sink send FAILED", "{}");
                        // #endregion
                        break;
                    }
                }
                Err(e) => {
                    // #region agent log
                    debug_log("proxmux_ws_proxy.rs:down", "browser read ERROR", &format!(r#"{{"error":"{}"}}"#, e.to_string().replace('"', "'")));
                    // #endregion
                    eprintln!("proxmux ws proxy: browser read: {e}");
                    break;
                }
            }
        }
        // #region agent log
        debug_log("proxmux_ws_proxy.rs:down", "browser stream ended", &format!(r#"{{"totalMsgs":{}}}"#, down_count));
        // #endregion
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
pub async fn proxmux_ws_proxy_start(upstream_wss_url: String, allow_insecure_tls: bool, auth_header: Option<String>) -> Result<ProxmuxWsProxyStartResult, String> {
    let upstream_wss_url = upstream_wss_url.trim().to_string();
    if !upstream_wss_url.to_ascii_lowercase().starts_with("wss://") {
        return Err("upstream URL must start with wss://".to_string());
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let proxy_id = uuid::Uuid::new_v4().to_string();
    let local_ws_url = format!("ws://127.0.0.1:{port}/");

    let upstream = upstream_wss_url.clone();

    let handle = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let upstream = upstream.clone();
                    let auth = auth_header.clone();
                    tokio::spawn(proxy_one_browser_connection(stream, upstream, allow_insecure_tls, auth));
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
        .insert(proxy_id.clone(), handle);

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
    if let Some(h) = proxy_tasks().lock().expect("proxy map lock").remove(&id) {
        h.abort();
    }
    Ok(())
}
