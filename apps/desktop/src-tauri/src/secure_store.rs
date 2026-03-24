use crate::host_metadata::{self, load_metadata};
use crate::key_crypto::{decrypt_string, encrypt_string};
use crate::ssh_config::{load_hosts, HostConfig};
use crate::store_models::{
    EntityStore, HostBinding, HostKeyRef, KeyKdf, SshKeyObject, TagObject, UserObject, ENTITY_STORE_SCHEMA_VERSION,
};
use anyhow::Result;
use std::collections::{HashMap, HashSet};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

static UNLOCKED_KEY_MATERIAL: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn unlocked_key_cache() -> &'static Mutex<HashMap<String, String>> {
    UNLOCKED_KEY_MATERIAL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn home_ssh_dir() -> Result<PathBuf> {
    crate::ssh_home::effective_ssh_dir()
}

fn store_path() -> Result<PathBuf> {
    Ok(home_ssh_dir()?.join("nosuckshell.store.v1.json"))
}

fn runtime_key_dir() -> Result<PathBuf> {
    Ok(home_ssh_dir()?.join("nosuckshell.runtime").join("keys"))
}

fn normalize_id(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch == '-' || ch == '_' {
            out.push(ch);
        } else if ch.is_whitespace() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        trimmed
    }
}

fn keychain_token_path() -> Result<PathBuf> {
    Ok(home_ssh_dir()?.join("nosuckshell.master.key"))
}

fn load_master_secret_from_keychain_like_source() -> Option<String> {
    if let Ok(value) = std::env::var("NOSUCKSHELL_MASTER_KEY") {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    let token_path = keychain_token_path().ok()?;
    let raw = fs::read_to_string(token_path).ok()?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Encrypt `plaintext` with the optional app master key (`NOSUCKSHELL_MASTER_KEY` or `~/.ssh/nosuckshell.master.key`).
/// Returns `None` when no master key is configured.
pub fn try_encrypt_with_app_master(plaintext: &str) -> Option<Result<(String, String, String)>> {
    let secret = load_master_secret_from_keychain_like_source()?;
    Some(encrypt_string(&secret, plaintext))
}

/// Decrypt a credential produced with [`try_encrypt_with_app_master`].
pub fn decrypt_with_app_master(ciphertext: &str, salt: &str, nonce: &str) -> Result<String> {
    let secret = load_master_secret_from_keychain_like_source().ok_or_else(|| {
        anyhow::anyhow!("Missing app master key (set NOSUCKSHELL_MASTER_KEY or create nosuckshell.master.key under your SSH directory)")
    })?;
    decrypt_string(&secret, ciphertext, salt, nonce)
}

pub fn list_store_objects() -> Result<EntityStore> {
    load_or_migrate_store()
}

pub fn save_store_objects(store: &EntityStore) -> Result<()> {
    let mut normalized = store.clone();
    normalized.schema_version = ENTITY_STORE_SCHEMA_VERSION;
    normalized.updated_at = now_unix();
    write_store(&normalized)
}

pub fn assign_host_binding(host_alias: &str, binding: HostBinding) -> Result<()> {
    let mut store = load_or_migrate_store()?;
    store.host_bindings.insert(host_alias.to_string(), binding);
    store.updated_at = now_unix();
    write_store(&store)
}

pub fn list_users() -> Result<Vec<UserObject>> {
    let mut users: Vec<UserObject> = load_or_migrate_store()?.users.into_values().collect();
    users.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(users)
}

pub fn list_groups() -> Result<Vec<crate::store_models::GroupObject>> {
    let mut groups: Vec<crate::store_models::GroupObject> = load_or_migrate_store()?.groups.into_values().collect();
    groups.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(groups)
}

pub fn list_tags() -> Result<Vec<TagObject>> {
    let mut tags: Vec<TagObject> = load_or_migrate_store()?.tags.into_values().collect();
    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}

pub fn create_encrypted_key(
    name: String,
    private_key_pem: String,
    public_key: String,
    passphrase: Option<String>,
) -> Result<SshKeyObject> {
    let effective_secret = passphrase
        .and_then(|entry| {
            let trimmed = entry.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .or_else(load_master_secret_from_keychain_like_source)
        .ok_or_else(|| anyhow::anyhow!("missing passphrase and no keychain token available"))?;
    let (ciphertext, salt, nonce) = encrypt_string(&effective_secret, &private_key_pem)?;
    let ts = now_unix();
    let id = format!("key-{}", Uuid::new_v4());
    let key = SshKeyObject::Encrypted {
        id: id.clone(),
        name,
        ciphertext,
        kdf: KeyKdf::Argon2id,
        salt,
        nonce,
        fingerprint: format!("fp-{}", &id[4..12]),
        public_key,
        tag_ids: vec![],
        created_at: ts,
        updated_at: ts,
    };
    let mut store = load_or_migrate_store()?;
    store.keys.insert(id, key.clone());
    store.updated_at = ts;
    write_store(&store)?;
    Ok(key)
}

pub fn unlock_key_material(key_id: &str, passphrase: Option<String>) -> Result<String> {
    let store = load_or_migrate_store()?;
    let key = store
        .keys
        .get(key_id)
        .ok_or_else(|| anyhow::anyhow!("unknown key id"))?;
    match key {
        SshKeyObject::Path {
            identity_file_path, ..
        } => Ok(identity_file_path.clone()),
        SshKeyObject::Encrypted {
            ciphertext,
            salt,
            nonce,
            ..
        } => {
            let effective_secret = passphrase
                .and_then(|entry| {
                    let trimmed = entry.trim().to_string();
                    if trimmed.is_empty() { None } else { Some(trimmed) }
                })
                .or_else(load_master_secret_from_keychain_like_source)
                .ok_or_else(|| anyhow::anyhow!("missing passphrase and no keychain token available"))?;
            let private_key = decrypt_string(&effective_secret, ciphertext, salt, nonce)?;
            let mut cache = unlocked_key_cache()
                .lock()
                .map_err(|_| anyhow::anyhow!("unlocked-key cache lock poisoned"))?;
            cache.insert(key_id.to_string(), private_key.clone());
            Ok(private_key)
        }
    }
}

pub fn delete_key(key_id: &str) -> Result<()> {
    let mut store = load_or_migrate_store()?;
    store.keys.remove(key_id);
    for binding in store.host_bindings.values_mut() {
        binding.key_refs.retain(|entry| entry.key_id != key_id);
    }
    for user in store.users.values_mut() {
        user.key_refs.retain(|entry| entry.key_id != key_id);
    }
    store.updated_at = now_unix();
    write_store(&store)?;
    if let Ok(mut cache) = unlocked_key_cache().lock() {
        cache.remove(key_id);
    }
    Ok(())
}

fn resolved_identity_file_for_key_id(store: &EntityStore, key_id: &str) -> Result<Option<String>> {
    let Some(key_obj) = store.keys.get(key_id) else {
        return Ok(None);
    };
    match key_obj {
        SshKeyObject::Path {
            identity_file_path, ..
        } => {
            if identity_file_path.trim().is_empty() {
                Ok(None)
            } else {
                Ok(Some(identity_file_path.clone()))
            }
        }
        SshKeyObject::Encrypted { id, .. } => {
            let maybe_unlocked = unlocked_key_cache()
                .lock()
                .ok()
                .and_then(|cache| cache.get(id).cloned());
            if let Some(private_key) = maybe_unlocked {
                let runtime_path = write_runtime_private_key(id, &private_key)?;
                Ok(Some(runtime_path.to_string_lossy().to_string()))
            } else {
                Ok(None)
            }
        }
    }
}

fn resolve_host_config_with_store(host: &HostConfig, store: &EntityStore) -> Result<HostConfig> {
    let Some(binding) = store.host_bindings.get(&host.host) else {
        return Ok(host.clone());
    };

    let mut resolved = host.clone();
    if let Some(user_id) = &binding.user_id {
        if let Some(user) = store.users.get(user_id) {
            if !user.username.trim().is_empty() {
                resolved.user = user.username.clone();
            }
            if !user.host_name.trim().is_empty() {
                resolved.host_name = user.host_name.clone();
            }
        }
    } else if !binding.legacy_user.trim().is_empty() {
        resolved.user = binding.legacy_user.clone();
    }
    if !binding.proxy_jump.trim().is_empty() {
        resolved.proxy_jump = binding.proxy_jump.clone();
    } else {
        let mut from_user = String::new();
        if let Some(user_id) = &binding.user_id {
            if let Some(user) = store.users.get(user_id) {
                from_user = user.proxy_jump.clone();
            }
        }
        if !from_user.trim().is_empty() {
            resolved.proxy_jump = from_user;
        } else if !binding.legacy_proxy_jump.trim().is_empty() {
            resolved.proxy_jump = binding.legacy_proxy_jump.clone();
        }
    }
    if !binding.legacy_proxy_command.trim().is_empty() {
        resolved.proxy_command = binding.legacy_proxy_command.clone();
    }

    let mut identity_from_keys: Option<String> = None;
    if let Some(primary_ref) = binding
        .key_refs
        .iter()
        .find(|entry| entry.usage == "primary")
        .or_else(|| binding.key_refs.first())
    {
        identity_from_keys = resolved_identity_file_for_key_id(store, &primary_ref.key_id)?;
    }
    if identity_from_keys.is_none() {
        if let Some(user_id) = &binding.user_id {
            if let Some(user) = store.users.get(user_id) {
                if let Some(uk) = user
                    .key_refs
                    .iter()
                    .find(|entry| entry.usage == "primary")
                    .or_else(|| user.key_refs.first())
                {
                    identity_from_keys = resolved_identity_file_for_key_id(store, &uk.key_id)?;
                }
            }
        }
    }
    if let Some(path) = identity_from_keys {
        resolved.identity_file = path;
    } else if !binding.legacy_identity_file.trim().is_empty() {
        resolved.identity_file = binding.legacy_identity_file.clone();
    }

    Ok(resolved)
}

pub fn resolve_host_config_for_session(host: &HostConfig) -> Result<HostConfig> {
    let store = load_or_migrate_store()?;
    let mut resolved = resolve_host_config_with_store(host, &store)?;
    crate::plugins::enrich_resolved_host(&mut resolved, host)?;
    Ok(resolved)
}

const RUNTIME_IDENTITY_PATH_MARKER: &str = "nosuckshell.runtime";

/// Fails before spawning SSH when the only configured keys are encrypted store keys that are still locked
/// and no `IdentityFile` / legacy path was resolved.
pub fn ensure_ssh_session_identity_ready(host: &HostConfig) -> Result<(), String> {
    let store = load_or_migrate_store().map_err(|e| e.to_string())?;
    let mut resolved = resolve_host_config_with_store(host, &store).map_err(|e| e.to_string())?;
    crate::plugins::enrich_resolved_host(&mut resolved, host).map_err(|e| e.to_string())?;
    if !resolved.identity_file.trim().is_empty() {
        return Ok(());
    }
    let Some(binding) = store.host_bindings.get(&host.host) else {
        return Ok(());
    };
    if !binding.legacy_identity_file.trim().is_empty() {
        return Ok(());
    }

    // Mirror `resolve_host_config_with_store` identity resolution.
    let mut identity_from_keys: Option<String> = None;
    if let Some(primary_ref) = binding
        .key_refs
        .iter()
        .find(|entry| entry.usage == "primary")
        .or_else(|| binding.key_refs.first())
    {
        identity_from_keys = resolved_identity_file_for_key_id(&store, &primary_ref.key_id).map_err(|e| e.to_string())?;
    }
    if identity_from_keys.is_none() {
        if let Some(user_id) = &binding.user_id {
            if let Some(user) = store.users.get(user_id) {
                if let Some(uk) = user
                    .key_refs
                    .iter()
                    .find(|entry| entry.usage == "primary")
                    .or_else(|| user.key_refs.first())
                {
                    identity_from_keys =
                        resolved_identity_file_for_key_id(&store, &uk.key_id).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    if identity_from_keys.is_some() {
        return Ok(());
    }

    if let Some(primary_ref) = binding
        .key_refs
        .iter()
        .find(|entry| entry.usage == "primary")
        .or_else(|| binding.key_refs.first())
    {
        if let Some(SshKeyObject::Encrypted { id, name, .. }) = store.keys.get(&primary_ref.key_id) {
            if unlocked_key_cache()
                .lock()
                .ok()
                .and_then(|c| c.get(id).cloned())
                .is_none()
            {
                return Err(format!(
                    "Unlock the SSH key \"{}\" in Identity Store before connecting.",
                    name
                ));
            }
        }
    }
    if let Some(user_id) = &binding.user_id {
        if let Some(user) = store.users.get(user_id) {
            if let Some(uk) = user
                .key_refs
                .iter()
                .find(|entry| entry.usage == "primary")
                .or_else(|| user.key_refs.first())
            {
                if let Some(SshKeyObject::Encrypted { id, name, .. }) = store.keys.get(&uk.key_id) {
                    if unlocked_key_cache()
                        .lock()
                        .ok()
                        .and_then(|c| c.get(id).cloned())
                        .is_none()
                    {
                        return Err(format!(
                            "Unlock the SSH key \"{}\" in Identity Store before connecting.",
                            name
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Resolved OpenSSH config text for every non-wildcard host in `~/.ssh/config`, using the same resolution as sessions.
/// Runtime key paths and locked encrypted keys are not written as portable `IdentityFile` lines.
pub fn export_resolved_openssh_config(include_strict_host_key: bool) -> Result<String> {
    let store = load_or_migrate_store()?;
    let hosts = load_hosts()?;
    let metadata = host_metadata::load_metadata().unwrap_or_default();
    let mut out = String::from("# OpenSSH config generated by NoSuckShell (resolved).\n");
    out.push_str("# Path-based IdentityFile values are portable; encrypted keys and runtime paths are omitted or commented.\n\n");
    for host in &hosts {
        let mut resolved = resolve_host_config_with_store(host, &store)?;
        crate::plugins::enrich_resolved_host(&mut resolved, host)?;
        let mut extras: Vec<String> = Vec::new();
        let id = resolved.identity_file.trim();
        if !id.is_empty() && id.contains(RUNTIME_IDENTITY_PATH_MARKER) {
            resolved.identity_file.clear();
            extras.push(
                "  # NoSuckShell: IdentityFile omitted — runtime key path is not portable.\n".to_string(),
            );
        } else if id.is_empty() {
            if let Some(comment) = export_comment_for_missing_identity(&store, host) {
                extras.push(comment);
            }
        }
        if include_strict_host_key {
            let sk = host_metadata::resolved_strict_host_key_checking(metadata.hosts.get(&host.host));
            extras.push(format!("  StrictHostKeyChecking {}\n", sk));
        }
        out.push_str(&crate::ssh_config::render_single_host_stanza(&resolved, &extras));
    }
    Ok(out)
}

fn export_comment_for_missing_identity(store: &EntityStore, host: &HostConfig) -> Option<String> {
    let binding = store.host_bindings.get(&host.host)?;
    let mut key_ids: Vec<&str> = Vec::new();
    if let Some(r) = binding
        .key_refs
        .iter()
        .find(|e| e.usage == "primary")
        .or_else(|| binding.key_refs.first())
    {
        key_ids.push(r.key_id.as_str());
    }
    if let Some(uid) = &binding.user_id {
        if let Some(user) = store.users.get(uid) {
            if let Some(uk) = user
                .key_refs
                .iter()
                .find(|e| e.usage == "primary")
                .or_else(|| user.key_refs.first())
            {
                key_ids.push(uk.key_id.as_str());
            }
        }
    }
    for key_id in key_ids {
        if resolved_identity_file_for_key_id(store, key_id).ok().flatten().is_some() {
            return None;
        }
        if let Some(SshKeyObject::Encrypted { id, name, .. }) = store.keys.get(key_id) {
            if unlocked_key_cache()
                .lock()
                .ok()
                .and_then(|c| c.get(id).cloned())
                .is_none()
            {
                return Some(format!(
                    "  # NoSuckShell: encrypted key \"{}\" not exported — unlock in the app or use a path-based key.\n",
                    name
                ));
            }
        }
    }
    None
}

pub fn export_resolved_openssh_config_to_path(
    path: &std::path::Path,
    include_strict_host_key: bool,
) -> Result<()> {
    let text = export_resolved_openssh_config(include_strict_host_key)?;
    fs::write(path, text)?;
    Ok(())
}

fn write_runtime_private_key(key_id: &str, private_key: &str) -> Result<PathBuf> {
    let dir = runtime_key_dir()?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.pem", normalize_id(key_id)));
    fs::write(&path, private_key)?;
    #[cfg(unix)]
    {
        let mut perms = fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)?;
    }
    Ok(path)
}

fn load_or_migrate_store() -> Result<EntityStore> {
    let path = store_path()?;
    if path.exists() {
        let raw = fs::read_to_string(&path)?;
        let mut parsed: EntityStore = serde_json::from_str(&raw)?;
        if parsed.schema_version == 0 {
            parsed.schema_version = ENTITY_STORE_SCHEMA_VERSION;
        }
        if parsed.schema_version < ENTITY_STORE_SCHEMA_VERSION {
            parsed.schema_version = ENTITY_STORE_SCHEMA_VERSION;
            parsed.updated_at = now_unix();
            write_store(&parsed)?;
        }
        return Ok(parsed);
    }
    let migrated = migrate_from_legacy_sources()?;
    write_store(&migrated)?;
    Ok(migrated)
}

fn write_store(store: &EntityStore) -> Result<()> {
    let path = store_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(store)?;
    fs::write(path, raw)?;
    Ok(())
}

fn migrate_from_legacy_sources() -> Result<EntityStore> {
    let hosts = load_hosts().unwrap_or_default();
    let metadata = load_metadata().unwrap_or_default();
    let ts = now_unix();
    let mut store = EntityStore {
        schema_version: ENTITY_STORE_SCHEMA_VERSION,
        updated_at: ts,
        ..EntityStore::default()
    };
    let mut seen_tags: HashSet<String> = HashSet::new();
    for host in hosts {
        let mut binding = HostBinding::default();
        binding.legacy_user = host.user.clone();
        binding.legacy_identity_file = host.identity_file.clone();
        binding.legacy_proxy_jump = host.proxy_jump.clone();
        binding.legacy_proxy_command = host.proxy_command.clone();
        if let Some(host_meta) = metadata.hosts.get(&host.host) {
            binding.legacy_tags = host_meta.tags.clone();
            for tag_name in &host_meta.tags {
                let normalized = normalize_id(tag_name);
                if seen_tags.insert(normalized.clone()) {
                    store.tags.insert(
                        normalized.clone(),
                        TagObject {
                            id: normalized,
                            name: tag_name.clone(),
                            created_at: ts,
                            updated_at: ts,
                        },
                    );
                }
            }
        }
        if !host.user.trim().is_empty() {
            let user_id = format!("user-{}", normalize_id(&host.user));
            store.users.entry(user_id.clone()).or_insert(UserObject {
                id: user_id,
                name: host.user.clone(),
                username: host.user.clone(),
                host_name: String::new(),
                proxy_jump: String::new(),
                key_refs: vec![],
                tag_ids: vec![],
                created_at: ts,
                updated_at: ts,
            });
        }
        if !host.identity_file.trim().is_empty() {
            let key_id = format!("key-path-{}", normalize_id(&host.identity_file));
            store
                .keys
                .entry(key_id.clone())
                .or_insert(SshKeyObject::Path {
                    id: key_id.clone(),
                    name: format!("Path key ({})", host.host),
                    identity_file_path: host.identity_file.clone(),
                    tag_ids: vec![],
                    created_at: ts,
                    updated_at: ts,
                });
            binding.key_refs.push(HostKeyRef {
                key_id,
                usage: "primary".to_string(),
            });
        }
        store.host_bindings.insert(host.host, binding);
    }
    Ok(store)
}

#[cfg(test)]
mod tests {
    use super::{migrate_from_legacy_sources, resolve_host_config_for_session, resolve_host_config_with_store};
    use crate::ssh_config::HostConfig;
    use crate::store_models::{EntityStore, HostBinding, UserObject};

    #[test]
    fn migration_produces_schema_version() {
        let store = migrate_from_legacy_sources().expect("migrate");
        assert!(store.schema_version >= 1);
    }

    #[test]
    fn resolving_unknown_host_keeps_original() {
        let host = HostConfig {
            host: "x".to_string(),
            host_name: "10.0.0.1".to_string(),
            user: "ubuntu".to_string(),
            port: 22,
            identity_file: "~/.ssh/id".to_string(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };
        let resolved = resolve_host_config_for_session(&host).expect("resolve");
        assert_eq!(resolved.host_name, host.host_name);
    }

    #[test]
    fn user_proxy_jump_used_when_binding_empty() {
        let host = HostConfig {
            host: "app".to_string(),
            host_name: "10.0.0.1".to_string(),
            user: "legacy".to_string(),
            port: 22,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };
        let uid = "user-a".to_string();
        let mut store = EntityStore::default();
        store.users.insert(
            uid.clone(),
            UserObject {
                id: uid.clone(),
                name: "Alice".to_string(),
                username: "alice".to_string(),
                host_name: String::new(),
                proxy_jump: "bastion".to_string(),
                key_refs: vec![],
                tag_ids: vec![],
                created_at: 0,
                updated_at: 0,
            },
        );
        store.host_bindings.insert(
            "app".to_string(),
            HostBinding {
                user_id: Some(uid),
                ..HostBinding::default()
            },
        );
        let resolved = resolve_host_config_with_store(&host, &store).expect("resolve");
        assert_eq!(resolved.proxy_jump, "bastion");
    }

    #[test]
    fn binding_proxy_jump_wins_over_user() {
        let host = HostConfig {
            host: "app".to_string(),
            host_name: "10.0.0.1".to_string(),
            user: "legacy".to_string(),
            port: 22,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };
        let uid = "user-b".to_string();
        let mut store = EntityStore::default();
        store.users.insert(
            uid.clone(),
            UserObject {
                id: uid.clone(),
                name: "Bob".to_string(),
                username: "bob".to_string(),
                host_name: String::new(),
                proxy_jump: "user-jump".to_string(),
                key_refs: vec![],
                tag_ids: vec![],
                created_at: 0,
                updated_at: 0,
            },
        );
        store.host_bindings.insert(
            "app".to_string(),
            HostBinding {
                user_id: Some(uid),
                proxy_jump: "per-host".to_string(),
                ..HostBinding::default()
            },
        );
        let resolved = resolve_host_config_with_store(&host, &store).expect("resolve");
        assert_eq!(resolved.proxy_jump, "per-host");
    }

    #[test]
    fn legacy_proxy_jump_still_applies_without_user_jump() {
        let host = HostConfig {
            host: "app".to_string(),
            host_name: "10.0.0.1".to_string(),
            user: "legacy".to_string(),
            port: 22,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };
        let uid = "user-d".to_string();
        let mut store = EntityStore::default();
        store.users.insert(
            uid.clone(),
            UserObject {
                id: uid.clone(),
                name: "Dan".to_string(),
                username: "dan".to_string(),
                host_name: String::new(),
                proxy_jump: String::new(),
                key_refs: vec![],
                tag_ids: vec![],
                created_at: 0,
                updated_at: 0,
            },
        );
        store.host_bindings.insert(
            "app".to_string(),
            HostBinding {
                user_id: Some(uid),
                legacy_proxy_jump: "bastion".to_string(),
                ..HostBinding::default()
            },
        );
        let resolved = resolve_host_config_with_store(&host, &store).expect("resolve");
        assert_eq!(resolved.proxy_jump, "bastion");
    }

    #[test]
    fn user_host_name_applies_when_linked() {
        let host = HostConfig {
            host: "app".to_string(),
            host_name: "10.0.0.1".to_string(),
            user: "legacy".to_string(),
            port: 22,
            identity_file: String::new(),
            proxy_jump: String::new(),
            proxy_command: String::new(),
        };
        let uid = "user-c".to_string();
        let mut store = EntityStore::default();
        store.users.insert(
            uid.clone(),
            UserObject {
                id: uid.clone(),
                name: "Carol".to_string(),
                username: "carol".to_string(),
                host_name: "192.168.1.50".to_string(),
                proxy_jump: String::new(),
                key_refs: vec![],
                tag_ids: vec![],
                created_at: 0,
                updated_at: 0,
            },
        );
        store.host_bindings.insert(
            "app".to_string(),
            HostBinding {
                user_id: Some(uid),
                ..HostBinding::default()
            },
        );
        let resolved = resolve_host_config_with_store(&host, &store).expect("resolve");
        assert_eq!(resolved.host_name, "192.168.1.50");
    }
}
