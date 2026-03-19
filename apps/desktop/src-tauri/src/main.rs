mod backup;
mod host_metadata;
mod layout_profiles;
mod session;
mod ssh_config;
mod view_profiles;

use backup::{create_backup_payload, export_encrypted_backup, import_encrypted_backup};
use host_metadata::{load_metadata, save_metadata, touch_host_last_used as touch_host_last_used_backend, HostMetadataStore};
use layout_profiles::{
    delete_layout_profile as delete_layout_profile_backend, load_layout_profiles,
    save_layout_profile as save_layout_profile_backend, LayoutProfile,
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
    let session_id = sessions.start(app, host).map_err(|err| err.to_string())?;
    Ok(SessionStarted { session_id })
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
            send_input,
            resize_session,
            close_session,
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
