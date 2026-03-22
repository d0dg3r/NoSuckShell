//! On Windows, the default console subsystem spawns a second (blank) window next to the WebView.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod backup;
mod license;
mod plugins;
mod host_metadata;
mod sftp_export;
mod key_crypto;
mod quick_ssh;
mod sftp;
#[cfg(test)]
mod testutil;
mod layout_profiles;
mod secure_store;
mod session;
mod ssh_config;
mod ssh_home;
mod store_models;
mod view_profiles;

use backup::{create_backup_payload, export_encrypted_backup, import_encrypted_backup};
use host_metadata::{load_metadata, save_metadata, touch_host_last_used as touch_host_last_used_backend, HostMetadataStore};
use layout_profiles::{
    delete_layout_profile as delete_layout_profile_backend, load_layout_profiles,
    save_layout_profile as save_layout_profile_backend, LayoutProfile,
};
use quick_ssh::QuickSshSessionRequest;
use secure_store::{
    assign_host_binding as assign_host_binding_backend, create_encrypted_key as create_encrypted_key_backend,
    delete_key as delete_key_backend, list_groups as list_groups_backend, list_store_objects as list_store_objects_backend,
    list_tags as list_tags_backend, list_users as list_users_backend, resolve_host_config_for_session,
    save_store_objects as save_store_objects_backend, unlock_key_material as unlock_key_material_backend,
};
use sftp::{
    copy_local_file as sftp_copy_local_file_backend,
    create_local_dir as sftp_create_local_dir_backend,
    delete_local_entry as sftp_delete_local_entry_backend,
    download_remote_file as sftp_download_remote_file_backend,
    get_local_home_canonical_path as sftp_get_local_home_canonical_path_backend,
    list_local_dir as sftp_list_local_dir_backend,
    list_remote_dir as sftp_list_remote_dir_backend,
    open_local_entry_in_os as sftp_open_local_entry_in_os_backend,
    rename_local_entry as sftp_rename_local_entry_backend,
    sftp_create_dir as sftp_create_dir_backend,
    sftp_delete_entry as sftp_delete_entry_backend,
    sftp_rename_entry as sftp_rename_entry_backend,
    upload_remote_file as sftp_upload_remote_file_backend,
    RemoteSshSpec,
};
use session::SessionState;
use ssh_home::SshDirInfo;
use ssh_config::{
    delete_host_from_file, load_hosts, load_ssh_config_raw, save_host_to_file, write_ssh_config_raw,
    HostConfig,
};
use sftp_export::{export_local_archive, export_remote_archive};
use view_profiles::{
    delete_view_profile as delete_view_profile_backend, load_view_profiles,
    reorder_view_profiles as reorder_view_profiles_backend, save_view_profile as save_view_profile_backend,
    ViewProfile,
};
use std::sync::{Arc, Mutex};

use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tauri::WebviewUrl;
use tauri::webview::{PageLoadEvent, WebviewWindowBuilder};
use store_models::{EntityStore, HostBinding, SshKeyObject, TagObject, UserObject, GroupObject};
use serde::Deserialize;
use serde_json::Value as JsonValue;

#[derive(serde::Deserialize)]
struct BackupIpcArgs {
    path: String,
    /// Wire key stays `password` for the TypeScript `invoke(..., { path, password })` payload.
    #[serde(rename = "password")]
    secret: String,
}

#[derive(serde::Serialize)]
struct SessionStarted {
    session_id: String,
}

#[tauri::command]
fn list_hosts() -> Result<Vec<HostConfig>, String> {
    load_hosts().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_host(host: HostConfig) -> Result<(), String> {
    save_host_to_file(&host).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_host(host_name: String) -> Result<(), String> {
    delete_host_from_file(&host_name).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_ssh_config_raw() -> Result<String, String> {
    load_ssh_config_raw().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_ssh_config_raw(content: String) -> Result<(), String> {
    write_ssh_config_raw(&content).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_ssh_dir_info() -> Result<SshDirInfo, String> {
    ssh_home::get_ssh_dir_info_for_ipc().map_err(|err| err.to_string())
}

#[tauri::command]
fn set_ssh_dir_override(path: Option<String>) -> Result<(), String> {
    ssh_home::apply_ssh_dir_override_from_ipc(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_host_metadata() -> Result<HostMetadataStore, String> {
    load_metadata().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_host_metadata(metadata: HostMetadataStore) -> Result<(), String> {
    save_metadata(&metadata).map_err(|err| err.to_string())
}

#[tauri::command]
fn touch_host_last_used(host_alias: String) -> Result<(), String> {
    touch_host_last_used_backend(&host_alias).map_err(|err| err.to_string())
}

fn validate_external_http_url(url: &str) -> Result<(), String> {
    let t = url.trim();
    if t.is_empty() {
        return Err("URL is empty".into());
    }
    if t.len() > 8192 {
        return Err("URL is too long".into());
    }
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Ok(());
    }
    Err("URL must start with http:// or https://".into())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    validate_external_http_url(&url)?;
    open::that(url.trim()).map_err(|e| e.to_string())
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
))]
fn webkit_set_tls_errors_ignored_for_window<R: tauri::Runtime>(
    win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    win.with_webview(|webview| {
        use webkit2gtk::{TLSErrorsPolicy, WebContextExt, WebViewExt, WebsiteDataManagerExt};
        if let Some(ctx) = webview.inner().web_context() {
            if let Some(mgr) = ctx.website_data_manager() {
                mgr.set_tls_errors_policy(TLSErrorsPolicy::Ignore);
            }
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
)))]
fn webkit_set_tls_errors_ignored_for_window<R: tauri::Runtime>(
    _win: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

/// Proxmox ExtJS UI typically sets a non-empty URL fragment after web login (`#v1:…`).
fn proxmox_url_has_nonempty_fragment(url: &tauri::Url) -> bool {
    url.fragment()
        .map(|f| !f.trim().is_empty())
        .unwrap_or(false)
}

fn proxmox_url_query_has_console(url: &tauri::Url) -> bool {
    url.query()
        .map(|q| q.contains("console="))
        .unwrap_or(false)
}

/// True when a finished load or navigation URL should trigger auto-console (not already the console document).
fn proxmox_should_trigger_auto_console_nav(url: &tauri::Url) -> bool {
    if proxmox_url_query_has_console(url) {
        return false;
    }
    proxmox_url_has_nonempty_fragment(url)
}

// #region agent log
fn debug_proxmox_auto_console_ndjson(
    hypothesis_id: &str,
    location: &str,
    message: &str,
    data: serde_json::Value,
) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let entry = serde_json::json!({
        "sessionId": "1d8adf",
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": ts,
    });
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/home/joe/Development/devops-geek/NoSuckShell/.cursor/debug-1d8adf.log")
    {
        let _ = writeln!(f, "{}", entry);
    }
}
// #endregion

fn proxmox_origin_base_uri(url: &tauri::Url) -> String {
    let mut u = url.clone();
    u.set_path("/");
    u.set_query(None);
    u.set_fragment(None);
    let s = u.to_string();
    if s.ends_with('/') {
        s
    } else {
        format!("{s}/")
    }
}

fn finish_proxmox_auto_console_navigation<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    webview_label: &str,
    console_s: String,
    state: &Arc<Mutex<PendingProxmoxAutoConsole>>,
    trigger: &'static str,
) {
    let Some(win) = app.get_webview_window(webview_label) else {
        if let Ok(mut st) = state.lock() {
            st.done = false;
        }
        return;
    };

    let parsed_console = match tauri::Url::parse(console_s.trim()) {
        Ok(p) => p,
        Err(_) => {
            if let Ok(mut st) = state.lock() {
                st.done = false;
            }
            return;
        }
    };

    if win.navigate(parsed_console).is_err() {
        if let Ok(mut st) = state.lock() {
            st.done = false;
        }
        return;
    }

    // #region agent log
    debug_proxmox_auto_console_ndjson(
        "H3",
        "main.rs:finish_proxmox_auto_console_navigation",
        "fired_navigate_to_console",
        serde_json::json!({ "trigger": trigger }),
    );
    // #endregion

    let emit_payload = ProxmoxAssistAutoConsolePayload {
        webview_label: webview_label.to_string(),
        console_url: console_s,
    };
    let _ = app.emit("proxmox-web-assist-auto-console", emit_payload);
}

fn try_fire_proxmox_auto_console<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    webview_label: &str,
    candidate_url: &tauri::Url,
    state: &Arc<Mutex<PendingProxmoxAutoConsole>>,
    trigger: &'static str,
) {
    let has_frag = proxmox_url_has_nonempty_fragment(candidate_url);
    let has_console_q = proxmox_url_query_has_console(candidate_url);
    let url_preview = candidate_url.as_str().chars().take(384).collect::<String>();

    // #region agent log
    debug_proxmox_auto_console_ndjson(
        "H3",
        "main.rs:try_fire_proxmox_auto_console",
        "check",
        serde_json::json!({
            "trigger": trigger,
            "urlPreview": url_preview,
            "hasFragment": has_frag,
            "hasConsoleQuery": has_console_q,
        }),
    );
    // #endregion

    let mut st = match state.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if st.done {
        return;
    }
    if !proxmox_should_trigger_auto_console_nav(candidate_url) {
        return;
    }
    let console_s = st.console_url.clone();
    st.done = true;
    drop(st);

    finish_proxmox_auto_console_navigation(app, webview_label, console_s, state, trigger);
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
))]
fn proxmox_cookie_list_has_auth_ticket(cookies: &mut [soup::Cookie]) -> bool {
    for c in cookies.iter_mut() {
        if let Some(n) = c.name() {
            let s = n.as_str();
            if s == "PVEAuthCookie" || s.ends_with("PVEAuthCookie") {
                return true;
            }
        }
    }
    false
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
))]
fn try_fire_proxmox_auto_console_when_cookies_have_ticket<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    webview_label: &str,
    state: &Arc<Mutex<PendingProxmoxAutoConsole>>,
    cookies: &mut [soup::Cookie],
    trigger: &'static str,
) {
    if !proxmox_cookie_list_has_auth_ticket(cookies) {
        return;
    }

    // #region agent log
    debug_proxmox_auto_console_ndjson(
        "H4",
        "main.rs:try_fire_proxmox_auto_console_when_cookies_have_ticket",
        "pve_auth_cookie_present",
        serde_json::json!({ "trigger": trigger }),
    );
    // #endregion

    let mut st = match state.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if st.done {
        return;
    }
    let console_s = st.console_url.clone();
    st.done = true;
    drop(st);

    finish_proxmox_auto_console_navigation(app, webview_label, console_s, state, trigger);
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
))]
fn webkit_attach_proxmox_pve_auth_cookie_listener<R: tauri::Runtime>(
    win: &tauri::WebviewWindow<R>,
    app: tauri::AppHandle<R>,
    webview_label: String,
    cookie_lookup_uri: String,
    state: Arc<Mutex<PendingProxmoxAutoConsole>>,
) -> Result<(), String> {
    win.with_webview(move |platform| {
        use webkit2gtk::gio;
        use webkit2gtk::{CookieManagerExt, WebContextExt, WebViewExt};

        let webview = platform.inner();
        let Some(ctx) = webview.web_context() else {
            return;
        };
        let Some(cm) = ctx.cookie_manager() else {
            return;
        };

        let cm_probe = cm.clone();
        let probe_uri = cookie_lookup_uri.clone();
        let app_probe = app.clone();
        let label_probe = webview_label.clone();
        let state_probe = Arc::clone(&state);
        cm_probe.cookies(&probe_uri, None::<&gio::Cancellable>, move |res| {
            if let Ok(mut list) = res {
                try_fire_proxmox_auto_console_when_cookies_have_ticket(
                    &app_probe,
                    &label_probe,
                    &state_probe,
                    &mut list,
                    "pve_auth_cookie_probe",
                );
            }
        });

        let app0 = app.clone();
        let label0 = webview_label.clone();
        let uri0 = cookie_lookup_uri.clone();
        let state0 = Arc::clone(&state);
        cm.connect_changed(move |cm| {
            let uri = uri0.clone();
            let app_c = app0.clone();
            let label_c = label0.clone();
            let state_c = Arc::clone(&state0);
            cm.cookies(&uri, None::<&gio::Cancellable>, move |res| {
                if let Ok(mut list) = res {
                    try_fire_proxmox_auto_console_when_cookies_have_ticket(
                        &app_c,
                        &label_c,
                        &state_c,
                        &mut list,
                        "pve_auth_cookie_changed",
                    );
                }
            });
        });
    })
    .map_err(|e| e.to_string())
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd",
)))]
fn webkit_attach_proxmox_pve_auth_cookie_listener<R: tauri::Runtime>(
    _win: &tauri::WebviewWindow<R>,
    _app: tauri::AppHandle<R>,
    _webview_label: String,
    _cookie_lookup_uri: String,
    _state: Arc<Mutex<PendingProxmoxAutoConsole>>,
) -> Result<(), String> {
    Ok(())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxmoxAssistAutoConsolePayload {
    webview_label: String,
    console_url: String,
}

struct PendingProxmoxAutoConsole {
    console_url: String,
    done: bool,
}

/// Opens `http`/`https` in a new app-owned webview window (top-level document), avoiding iframe embedding limits.
///
/// Returns the webview **label** for [`navigate_in_app_webview_window`] (e.g. continue to a console URL after Proxmox web login).
///
/// Uses separate `title` / `url` parameters so the frontend can `invoke(..., { title, url })` (Tauri maps one JSON key per argument; a single struct parameter named `args` would require a nested `args` object).
///
/// When `allow_insecure_tls` is true (Proxmox cluster **Allow insecure TLS**), WebKitGTK is configured to ignore TLS certificate errors for that window (Linux/BSD only). You still log in in that window; API tokens are not shared with the web UI.
///
/// When `auto_console_url` is set, after Proxmox web login the webview navigates to the console URL and emits `proxmox-web-assist-auto-console` so the host UI can dismiss the login assist banner.
///
/// Detection: on Linux/BSD, WebKitGTK’s cookie store is watched for the **`PVEAuthCookie`** session ticket (including `__Host-`-prefixed names). HttpOnly cookies are visible there but not to page JavaScript. A finished load with a non-empty URL fragment is still used as a secondary signal when it occurs.
///
/// We do **not** use [`WebviewWindowBuilder::on_navigation`] on fragment changes: Proxmox sets `#v1:…` during ExtJS bootstrap before a ticket exists, which would navigate to the console too early (**401 No ticket**).
#[tauri::command]
fn open_in_app_webview_window(
    app: tauri::AppHandle,
    title: String,
    url: String,
    allow_insecure_tls: bool,
    auto_console_url: Option<String>,
) -> Result<String, String> {
    validate_external_http_url(&url)?;
    if let Some(ref a) = auto_console_url {
        validate_external_http_url(a)?;
    }
    let t = url.trim();
    let parsed = tauri::Url::parse(t).map_err(|e| format!("Invalid URL: {e}"))?;
    let parsed_login_for_cookie = parsed.clone();
    let label = format!("web-{}", uuid::Uuid::new_v4());
    let window_title: String = title.trim().chars().take(120).collect();
    let window_title = if window_title.is_empty() {
        "Web console".to_string()
    } else {
        window_title
    };

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(window_title)
        .inner_size(1200.0, 800.0);

    let mut proxmox_auto_state: Option<Arc<Mutex<PendingProxmoxAutoConsole>>> = None;
    if let Some(ref auto_s) = auto_console_url {
        let state = Arc::new(Mutex::new(PendingProxmoxAutoConsole {
            console_url: auto_s.clone(),
            done: false,
        }));
        proxmox_auto_state = Some(Arc::clone(&state));
        let state_cb = Arc::clone(&state);
        let app_emit = app.clone();
        let label_evt = label.clone();
        builder = builder.on_page_load(move |_win, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            try_fire_proxmox_auto_console(&app_emit, &label_evt, payload.url(), &state_cb, "page_load_finished");
        });
    }

    let win = builder.build().map_err(|e| e.to_string())?;
    if let Some(state) = proxmox_auto_state {
        let _ = webkit_attach_proxmox_pve_auth_cookie_listener(
            &win,
            app.clone(),
            label.clone(),
            proxmox_origin_base_uri(&parsed_login_for_cookie),
            state,
        );
    }
    if allow_insecure_tls {
        webkit_set_tls_errors_ignored_for_window(&win)?;
        let _ = win.reload();
    }
    let _ = win.set_focus();
    Ok(label)
}

/// Navigates an existing in-app webview window opened by [`open_in_app_webview_window`] (use its returned label).
#[tauri::command]
fn navigate_in_app_webview_window(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    validate_external_http_url(&url)?;
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| "Webview window was closed or not found.".to_string())?;
    let t = url.trim();
    let parsed = tauri::Url::parse(t).map_err(|e| format!("Invalid URL: {e}"))?;
    win.navigate(parsed).map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    Ok(())
}

fn spice_payload_to_virt_viewer_ini(data: &JsonValue) -> Result<String, String> {
    let obj = data
        .as_object()
        .ok_or_else(|| "SPICE payload must be a JSON object".to_string())?;
    let mut out = String::from("[virt-viewer]\n");
    for (k, v) in obj {
        let val_str = match v {
            JsonValue::String(x) => x.clone(),
            JsonValue::Number(n) => n.to_string(),
            JsonValue::Bool(b) => b.to_string(),
            JsonValue::Null => String::new(),
            _ => continue,
        };
        out.push_str(k);
        out.push('=');
        out.push_str(&val_str);
        out.push('\n');
    }
    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenSpicePayloadArgs {
    spice_data: JsonValue,
}

#[tauri::command]
fn open_virt_viewer_from_spice_payload(args: OpenSpicePayloadArgs) -> Result<(), String> {
    let content = spice_payload_to_virt_viewer_ini(&args.spice_data)?;
    let name = format!("nosuckshell-spice-{}.vv", uuid::Uuid::new_v4());
    let path = std::env::temp_dir().join(name);
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
    }
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_session(
    app: tauri::AppHandle,
    sessions: State<'_, SessionState>,
    host: HostConfig,
) -> Result<SessionStarted, String> {
    let resolved_host = resolve_host_config_for_session(&host).map_err(|err| err.to_string())?;
    let session_id = sessions
        .start(app, resolved_host, None)
        .map_err(|err| err.to_string())?;
    Ok(SessionStarted { session_id })
}

#[tauri::command]
fn start_local_session(
    app: tauri::AppHandle,
    sessions: State<'_, SessionState>,
) -> Result<SessionStarted, String> {
    let session_id = sessions.start_local(app).map_err(|err| err.to_string())?;
    Ok(SessionStarted { session_id })
}

#[tauri::command]
fn start_quick_ssh_session(
    app: tauri::AppHandle,
    sessions: State<'_, SessionState>,
    request: QuickSshSessionRequest,
) -> Result<SessionStarted, String> {
    let (host, policy) = quick_ssh::normalize_quick_ssh_request(request)?;
    let session_id = sessions
        .start(app, host, policy)
        .map_err(|err| err.to_string())?;
    Ok(SessionStarted { session_id })
}

#[tauri::command]
fn sftp_list_remote_dir(spec: RemoteSshSpec, path: String) -> Result<Vec<sftp::SftpDirEntry>, String> {
    sftp_list_remote_dir_backend(spec, path)
}

#[tauri::command]
fn list_local_dir(path: String) -> Result<Vec<sftp::LocalDirEntry>, String> {
    sftp_list_local_dir_backend(path)
}

#[tauri::command]
fn get_local_home_canonical_path() -> Result<String, String> {
    sftp_get_local_home_canonical_path_backend()
}

#[tauri::command]
fn sftp_download_file(spec: RemoteSshSpec, remote_file_path: String, dest_dir_path: String) -> Result<String, String> {
    sftp_download_remote_file_backend(spec, remote_file_path, dest_dir_path)
}

#[tauri::command]
fn sftp_export_paths_archive(
    spec: RemoteSshSpec,
    parent_path: String,
    names: Vec<String>,
    format: String,
    dest_dir_path: String,
    local_output_base_name: Option<String>,
) -> Result<String, String> {
    export_remote_archive(
        spec,
        parent_path,
        names,
        format,
        dest_dir_path,
        local_output_base_name,
    )
}

#[tauri::command]
fn local_export_paths_archive(
    parent_path_key: String,
    names: Vec<String>,
    format: String,
    dest_dir_path: String,
    local_output_base_name: Option<String>,
) -> Result<String, String> {
    export_local_archive(
        parent_path_key,
        names,
        format,
        dest_dir_path,
        local_output_base_name,
    )
}

#[tauri::command]
fn sftp_upload_file(
    spec: RemoteSshSpec,
    local_dir_path: String,
    local_file_name: String,
    remote_file_path: String,
) -> Result<(), String> {
    sftp_upload_remote_file_backend(spec, local_dir_path, local_file_name, remote_file_path)
}

#[tauri::command]
fn copy_local_file(
    src_dir_path: String,
    src_name: String,
    dest_dir_path: String,
    dest_name: String,
) -> Result<String, String> {
    sftp_copy_local_file_backend(src_dir_path, src_name, dest_dir_path, dest_name)
}

#[tauri::command]
fn create_local_dir(parent_path_key: String, dir_name: String) -> Result<(), String> {
    sftp_create_local_dir_backend(parent_path_key, dir_name)
}

#[tauri::command]
fn delete_local_entry(parent_path_key: String, name: String) -> Result<(), String> {
    sftp_delete_local_entry_backend(parent_path_key, name)
}

#[tauri::command]
fn rename_local_entry(parent_path_key: String, old_name: String, new_name: String) -> Result<(), String> {
    sftp_rename_local_entry_backend(parent_path_key, old_name, new_name)
}

#[tauri::command]
fn open_local_entry_in_os(parent_path_key: String, name: String) -> Result<(), String> {
    sftp_open_local_entry_in_os_backend(parent_path_key, name)
}

#[tauri::command]
fn sftp_create_dir(spec: RemoteSshSpec, parent_path: String, dir_name: String) -> Result<(), String> {
    sftp_create_dir_backend(spec, parent_path, dir_name)
}

#[tauri::command]
fn sftp_delete_entry(spec: RemoteSshSpec, parent_path: String, name: String) -> Result<(), String> {
    sftp_delete_entry_backend(spec, parent_path, name)
}

#[tauri::command]
fn sftp_rename_entry(
    spec: RemoteSshSpec,
    parent_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    sftp_rename_entry_backend(spec, parent_path, old_name, new_name)
}

#[tauri::command]
fn broadcast_file_transfer_clipboard(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    app.emit("nossuck-file-clipboard", payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_aux_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("aux") {
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "aux", WebviewUrl::default())
        .title("NoSuckShell")
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_store_objects() -> Result<EntityStore, String> {
    list_store_objects_backend().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_store_objects(store: EntityStore) -> Result<(), String> {
    save_store_objects_backend(&store).map_err(|err| err.to_string())
}

#[tauri::command]
fn assign_host_binding(host_alias: String, binding: HostBinding) -> Result<(), String> {
    assign_host_binding_backend(&host_alias, binding).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_users() -> Result<Vec<UserObject>, String> {
    list_users_backend().map_err(|err| err.to_string())
}

#[tauri::command]
fn list_groups() -> Result<Vec<GroupObject>, String> {
    list_groups_backend().map_err(|err| err.to_string())
}

#[tauri::command]
fn list_tags() -> Result<Vec<TagObject>, String> {
    list_tags_backend().map_err(|err| err.to_string())
}

#[tauri::command]
fn create_encrypted_key(
    name: String,
    private_key_pem: String,
    public_key: String,
    passphrase: Option<String>,
) -> Result<SshKeyObject, String> {
    create_encrypted_key_backend(name, private_key_pem, public_key, passphrase).map_err(|err| err.to_string())
}

#[tauri::command]
fn unlock_key_material(key_id: String, passphrase: Option<String>) -> Result<String, String> {
    unlock_key_material_backend(&key_id, passphrase).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_key(key_id: String) -> Result<(), String> {
    delete_key_backend(&key_id).map_err(|err| err.to_string())
}

#[tauri::command]
fn send_input(sessions: State<'_, SessionState>, session_id: String, data: String) -> Result<(), String> {
    sessions
        .send_input(&session_id, &data)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn resize_session(
    sessions: State<'_, SessionState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    sessions
        .resize(&session_id, cols, rows)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn close_session(sessions: State<'_, SessionState>, session_id: String) -> Result<(), String> {
    sessions.close(&session_id).map_err(|err| err.to_string())
}

#[tauri::command]
fn export_backup(args: BackupIpcArgs) -> Result<(), String> {
    let payload = create_backup_payload(
        load_ssh_config_raw().map_err(|err| err.to_string())?,
        load_metadata().map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;
    export_encrypted_backup(&args.path, &args.secret, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
fn import_backup(args: BackupIpcArgs) -> Result<(), String> {
    let payload = import_encrypted_backup(&args.path, &args.secret).map_err(|err| err.to_string())?;
    write_ssh_config_raw(&payload.ssh_config).map_err(|err| err.to_string())?;
    save_metadata(&payload.metadata).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_layout_profiles() -> Result<Vec<LayoutProfile>, String> {
    load_layout_profiles().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_layout_profile(profile: LayoutProfile) -> Result<(), String> {
    save_layout_profile_backend(&profile).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_layout_profile(profile_id: String) -> Result<(), String> {
    delete_layout_profile_backend(&profile_id).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_view_profiles() -> Result<Vec<ViewProfile>, String> {
    load_view_profiles().map_err(|err| err.to_string())
}

#[tauri::command]
fn save_view_profile(profile: ViewProfile) -> Result<(), String> {
    save_view_profile_backend(&profile).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_view_profile(profile_id: String) -> Result<(), String> {
    delete_view_profile_backend(&profile_id).map_err(|err| err.to_string())
}

#[tauri::command]
fn reorder_view_profiles(ids: Vec<String>) -> Result<(), String> {
    reorder_view_profiles_backend(&ids).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_plugins() -> Result<Vec<plugins::PluginListEntry>, String> {
    plugins::list_plugins_backend().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_plugin_enabled(plugin_id: String, enabled: bool) -> Result<(), String> {
    plugins::set_plugin_enabled_backend(&plugin_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn plugin_invoke(
    plugin_id: String,
    method: String,
    arg: serde_json::Value,
) -> Result<serde_json::Value, String> {
    plugins::plugin_invoke_backend(&plugin_id, method, arg).map_err(|e| e.to_string())
}

#[tauri::command]
fn activate_license(token: String) -> Result<license::LicensePayload, String> {
    license::activate_license_token(token).map_err(|e| e.to_string())
}

#[tauri::command]
fn license_status() -> Result<license::LicenseStatusDto, String> {
    license::license_status_backend().map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_license() -> Result<(), String> {
    license::clear_license_backend().map_err(|e| e.to_string())
}

fn main() {
    plugins::register_builtin_plugins();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionState::default())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            save_host,
            delete_host,
            get_ssh_config_raw,
            save_ssh_config_raw,
            get_ssh_dir_info,
            set_ssh_dir_override,
            list_host_metadata,
            save_host_metadata,
            touch_host_last_used,
            open_external_url,
            open_in_app_webview_window,
            navigate_in_app_webview_window,
            open_virt_viewer_from_spice_payload,
            start_session,
            start_local_session,
            start_quick_ssh_session,
            sftp_list_remote_dir,
            list_local_dir,
            get_local_home_canonical_path,
            sftp_download_file,
            sftp_export_paths_archive,
            local_export_paths_archive,
            sftp_upload_file,
            copy_local_file,
            create_local_dir,
            delete_local_entry,
            rename_local_entry,
            open_local_entry_in_os,
            sftp_create_dir,
            sftp_delete_entry,
            sftp_rename_entry,
            broadcast_file_transfer_clipboard,
            open_aux_window,
            send_input,
            resize_session,
            close_session,
            list_store_objects,
            save_store_objects,
            assign_host_binding,
            list_users,
            list_groups,
            list_tags,
            create_encrypted_key,
            unlock_key_material,
            delete_key,
            export_backup,
            import_backup,
            list_layout_profiles,
            save_layout_profile,
            delete_layout_profile,
            list_view_profiles,
            save_view_profile,
            delete_view_profile,
            reorder_view_profiles,
            list_plugins,
            set_plugin_enabled,
            plugin_invoke,
            activate_license,
            license_status,
            clear_license
        ])
        .run(tauri::generate_context!())
        .expect("error while running NoSuckShell");
}

#[cfg(test)]
mod tests {
    use crate::quick_ssh::{normalize_quick_ssh_request, QuickSshSessionRequest};

    #[test]
    fn normalizes_quick_ssh_request_with_defaults() {
        let request = QuickSshSessionRequest {
            host_name: "srv.internal".to_string(),
            user: String::new(),
            port: None,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
            strict_host_key_policy: None,
        };

        let (normalized, policy) = normalize_quick_ssh_request(request).expect("request should normalize");
        assert_eq!(normalized.host, "quick-srv.internal");
        assert_eq!(normalized.host_name, "srv.internal");
        assert_eq!(normalized.port, 22);
        assert!(policy.is_none());
    }

    #[test]
    fn rejects_empty_quick_ssh_host_name() {
        let request = QuickSshSessionRequest {
            host_name: "   ".to_string(),
            user: "deploy".to_string(),
            port: Some(22),
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
            strict_host_key_policy: None,
        };

        let result = normalize_quick_ssh_request(request);
        assert!(result.is_err());
    }
}
