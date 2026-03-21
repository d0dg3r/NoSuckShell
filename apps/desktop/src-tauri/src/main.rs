//! On Windows, the default console subsystem spawns a second (blank) window next to the WebView.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod backup;
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
use tauri::Emitter;
use tauri::Manager;
use tauri::State;
use tauri::WebviewUrl;
use tauri::webview::WebviewWindowBuilder;
use store_models::{EntityStore, HostBinding, SshKeyObject, TagObject, UserObject, GroupObject};

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
    let host = quick_ssh::normalize_quick_ssh_request(request)?;
    let session_id = sessions.start(app, host).map_err(|err| err.to_string())?;
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

fn main() {
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
            reorder_view_profiles
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
