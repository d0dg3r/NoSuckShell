mod backup;
mod host_metadata;
mod key_crypto;
mod layout_profiles;
mod secure_store;
mod session;
mod ssh_config;
mod store_models;
mod view_profiles;

use backup::{create_backup_payload, export_encrypted_backup, import_encrypted_backup};
use host_metadata::{load_metadata, save_metadata, touch_host_last_used as touch_host_last_used_backend, HostMetadataStore};
use layout_profiles::{
    delete_layout_profile as delete_layout_profile_backend, load_layout_profiles,
    save_layout_profile as save_layout_profile_backend, LayoutProfile,
};
use secure_store::{
    assign_host_binding as assign_host_binding_backend, create_encrypted_key as create_encrypted_key_backend,
    delete_key as delete_key_backend, list_groups as list_groups_backend, list_store_objects as list_store_objects_backend,
    list_tags as list_tags_backend, list_users as list_users_backend, resolve_host_config_for_session,
    save_store_objects as save_store_objects_backend, unlock_key_material as unlock_key_material_backend,
};
use session::SessionState;
use ssh_config::{
    delete_host_from_file, load_hosts, load_ssh_config_raw, save_host_to_file, write_ssh_config_raw,
    HostConfig,
};
use view_profiles::{
    delete_view_profile as delete_view_profile_backend, load_view_profiles,
    reorder_view_profiles as reorder_view_profiles_backend, save_view_profile as save_view_profile_backend,
    ViewProfile,
};
use tauri::State;
use store_models::{EntityStore, HostBinding, SshKeyObject, TagObject, UserObject, GroupObject};

#[derive(serde::Serialize)]
struct SessionStarted {
    session_id: String,
}

#[derive(serde::Deserialize)]
struct QuickSshSessionRequest {
    #[serde(rename = "hostName")]
    host_name: String,
    #[serde(default)]
    user: String,
    #[serde(default)]
    port: Option<u16>,
    #[serde(rename = "identityFile", default)]
    identity_file: String,
    #[serde(rename = "proxyJump", default)]
    proxy_jump: String,
    #[serde(rename = "proxyCommand", default)]
    proxy_command: String,
}

fn normalize_quick_ssh_request(request: QuickSshSessionRequest) -> Result<HostConfig, String> {
    let host_name = request.host_name.trim();
    if host_name.is_empty() {
        return Err("HostName is required for quick connect.".to_string());
    }
    let port = request.port.unwrap_or(22);
    if port == 0 {
        return Err("Port must be between 1 and 65535.".to_string());
    }
    let user = request.user.trim();
    Ok(HostConfig {
        host: format!("quick-{host_name}"),
        host_name: host_name.to_string(),
        user: user.to_string(),
        port,
        identity_file: request.identity_file.trim().to_string(),
        proxy_jump: request.proxy_jump.trim().to_string(),
        proxy_command: request.proxy_command.trim().to_string(),
    })
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

#[tauri::command]
fn start_session(
    app: tauri::AppHandle,
    sessions: State<'_, SessionState>,
    host: HostConfig,
) -> Result<SessionStarted, String> {
    let resolved_host = resolve_host_config_for_session(&host).map_err(|err| err.to_string())?;
    let session_id = sessions.start(app, resolved_host).map_err(|err| err.to_string())?;
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
    let host = normalize_quick_ssh_request(request)?;
    let session_id = sessions.start(app, host).map_err(|err| err.to_string())?;
    Ok(SessionStarted { session_id })
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
fn export_backup(path: String, password: String) -> Result<(), String> {
    let payload = create_backup_payload(
        load_ssh_config_raw().map_err(|err| err.to_string())?,
        load_metadata().map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;
    export_encrypted_backup(&path, &password, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
fn import_backup(path: String, password: String) -> Result<(), String> {
    let payload = import_encrypted_backup(&path, &password).map_err(|err| err.to_string())?;
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

fn main() {
    tauri::Builder::default()
        .manage(SessionState::default())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            save_host,
            delete_host,
            list_host_metadata,
            save_host_metadata,
            touch_host_last_used,
            start_session,
            start_local_session,
            start_quick_ssh_session,
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
            reorder_view_profiles
        ])
        .run(tauri::generate_context!())
        .expect("error while running NoSuckShell");
}

#[cfg(test)]
mod tests {
    use super::{normalize_quick_ssh_request, QuickSshSessionRequest};

    #[test]
    fn normalizes_quick_ssh_request_with_defaults() {
        let request = QuickSshSessionRequest {
            host_name: "srv.internal".to_string(),
            user: String::new(),
            port: None,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };

        let normalized = normalize_quick_ssh_request(request).expect("request should normalize");
        assert_eq!(normalized.host, "quick-srv.internal");
        assert_eq!(normalized.host_name, "srv.internal");
        assert_eq!(normalized.port, 22);
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
        };

        let result = normalize_quick_ssh_request(request);
        assert!(result.is_err());
    }
}
