use crate::host_metadata::HostMetadataStore;
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const BACKUP_VERSION: u8 = 1;
const BACKUP_KDF_ALGORITHM: &str = "argon2id";
const KDF_MEMORY_KIB: u32 = 19_456;
const KDF_ITERATIONS: u32 = 3;
const KDF_PARALLELISM: u32 = 1;
const KDF_OUTPUT_LEN: usize = 32;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPayload {
    #[serde(rename = "sshConfig")]
    pub ssh_config: String,
    pub metadata: HostMetadataStore,
    #[serde(rename = "exportedAt")]
    pub exported_at: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("Backup path is required.")]
    EmptyPath,
    #[error("Unsupported home shortcut in path. Use '~' or '~/...'.")]
    UnsupportedHomeShortcut,
    #[error("Home directory could not be resolved on this system.")]
    HomeDirNotFound,
    #[error("Current working directory could not be resolved.")]
    CurrentDirNotFound,
    #[error("Backup password is required.")]
    EmptyPassword,
    #[error("Backup file not found at '{0}'.")]
    BackupFileNotFound(String),
    #[error("Backup path '{0}' points to a directory. Please provide a file path.")]
    BackupPathIsDirectory(String),
    #[error("Permission denied while accessing '{0}'.")]
    PermissionDenied(String),
    #[error("Backup format is invalid or damaged.")]
    InvalidBackupFormat,
    #[error("Unsupported backup version: {0}.")]
    UnsupportedBackupVersion(u8),
    #[error("Unsupported KDF algorithm: {0}.")]
    UnsupportedKdfAlgorithm(String),
    #[error("Legacy unencrypted backups are no longer supported. Please create a new encrypted backup.")]
    LegacyUnencryptedBackupNotSupported,
    #[error("Backup password is incorrect or the backup file is corrupted.")]
    InvalidPasswordOrCorruptedBackup,
    #[error("{0}")]
    Message(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KdfParams {
    algorithm: String,
    #[serde(rename = "memoryKib")]
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedBackupEnvelope {
    version: u8,
    kdf: KdfParams,
    salt: String,
    nonce: String,
    ciphertext: String,
    #[serde(rename = "exportedAt")]
    exported_at: u64,
}

impl EncryptedBackupEnvelope {
    fn default_kdf() -> KdfParams {
        KdfParams {
            algorithm: BACKUP_KDF_ALGORITHM.to_string(),
            memory_kib: KDF_MEMORY_KIB,
            iterations: KDF_ITERATIONS,
            parallelism: KDF_PARALLELISM,
        }
    }
}

pub fn create_backup_payload(ssh_config: String, metadata: HostMetadataStore) -> Result<BackupPayload, BackupError> {
    let exported_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| BackupError::Message(format!("Failed to calculate export time: {err}")))?
        .as_secs();

    Ok(BackupPayload {
        ssh_config,
        metadata,
        exported_at,
    })
}

pub fn resolve_backup_path(input: &str) -> Result<PathBuf, BackupError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(BackupError::EmptyPath);
    }

    let expanded = if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let home = home::home_dir().ok_or(BackupError::HomeDirNotFound)?;
        if trimmed == "~" {
            home
        } else {
            let suffix = &trimmed[2..];
            home.join(suffix)
        }
    } else if trimmed.starts_with('~') {
        return Err(BackupError::UnsupportedHomeShortcut);
    } else {
        PathBuf::from(trimmed)
    };

    if expanded.is_absolute() {
        Ok(expanded)
    } else {
        let cwd = std::env::current_dir().map_err(|_| BackupError::CurrentDirNotFound)?;
        Ok(cwd.join(expanded))
    }
}

pub fn export_encrypted_backup(
    path: &str,
    passphrase: &str,
    payload: &BackupPayload,
) -> Result<(), BackupError> {
    if passphrase.is_empty() {
        return Err(BackupError::EmptyPassword);
    }

    let resolved = resolve_backup_path(path)?;
    if resolved.exists() && resolved.is_dir() {
        return Err(BackupError::BackupPathIsDirectory(resolved.display().to_string()));
    }

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|err| map_export_io_error(err, parent.display().to_string()))?;
    }

    let kdf = EncryptedBackupEnvelope::default_kdf();
    let salt = rand::random::<[u8; SALT_LEN]>();
    let nonce = rand::random::<[u8; NONCE_LEN]>();

    let key = derive_key(passphrase, &salt, &kdf)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let payload_raw = serde_json::to_vec(payload)
        .map_err(|err| BackupError::Message(format!("Failed to serialize backup payload: {err}")))?;
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), payload_raw.as_ref())
        .map_err(|_| BackupError::Message("Failed to encrypt backup payload.".to_string()))?;

    let envelope = EncryptedBackupEnvelope {
        version: BACKUP_VERSION,
        kdf,
        salt: STANDARD.encode(salt),
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
        exported_at: payload.exported_at,
    };

    let raw = serde_json::to_vec_pretty(&envelope)
        .map_err(|err| BackupError::Message(format!("Failed to serialize encrypted backup: {err}")))?;
    fs::write(&resolved, raw).map_err(|err| map_export_io_error(err, resolved.display().to_string()))
}

pub fn import_encrypted_backup(path: &str, passphrase: &str) -> Result<BackupPayload, BackupError> {
    if passphrase.is_empty() {
        return Err(BackupError::EmptyPassword);
    }

    let resolved = resolve_backup_path(path)?;
    if resolved.exists() && resolved.is_dir() {
        return Err(BackupError::BackupPathIsDirectory(resolved.display().to_string()));
    }

    let raw = fs::read(&resolved).map_err(|err| map_import_io_error(err, resolved.display().to_string()))?;
    let envelope = match serde_json::from_slice::<EncryptedBackupEnvelope>(&raw) {
        Ok(envelope) => envelope,
        Err(_) => {
            if serde_json::from_slice::<BackupPayload>(&raw).is_ok() {
                return Err(BackupError::LegacyUnencryptedBackupNotSupported);
            }
            return Err(BackupError::InvalidBackupFormat);
        }
    };

    if envelope.version != BACKUP_VERSION {
        return Err(BackupError::UnsupportedBackupVersion(envelope.version));
    }
    if envelope.kdf.algorithm != BACKUP_KDF_ALGORITHM {
        return Err(BackupError::UnsupportedKdfAlgorithm(envelope.kdf.algorithm));
    }

    let salt = decode_exact_len(&envelope.salt, SALT_LEN)?;
    let nonce = decode_exact_len(&envelope.nonce, NONCE_LEN)?;
    let ciphertext = STANDARD
        .decode(envelope.ciphertext.as_bytes())
        .map_err(|_| BackupError::InvalidBackupFormat)?;
    let key = derive_key(passphrase, &salt, &envelope.kdf)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));

    let plaintext = cipher
        .decrypt(XNonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| BackupError::InvalidPasswordOrCorruptedBackup)?;

    serde_json::from_slice::<BackupPayload>(&plaintext).map_err(|_| BackupError::InvalidBackupFormat)
}

fn decode_exact_len(encoded: &str, expected_len: usize) -> Result<Vec<u8>, BackupError> {
    let bytes = STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| BackupError::InvalidBackupFormat)?;
    if bytes.len() != expected_len {
        return Err(BackupError::InvalidBackupFormat);
    }
    Ok(bytes)
}

fn derive_key(passphrase: &str, salt: &[u8], kdf: &KdfParams) -> Result<[u8; KDF_OUTPUT_LEN], BackupError> {
    let params = Params::new(kdf.memory_kib, kdf.iterations, kdf.parallelism, Some(KDF_OUTPUT_LEN))
        .map_err(|err| BackupError::Message(format!("Failed to initialize KDF parameters: {err}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = rand::random::<[u8; KDF_OUTPUT_LEN]>();
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|err| BackupError::Message(format!("Failed to derive backup key: {err}")))?;
    Ok(key)
}

fn map_export_io_error(err: std::io::Error, path: String) -> BackupError {
    match err.kind() {
        std::io::ErrorKind::PermissionDenied => BackupError::PermissionDenied(path),
        std::io::ErrorKind::NotFound => BackupError::BackupFileNotFound(path),
        _ => BackupError::Message(format!("Failed to write backup file '{path}': {err}")),
    }
}

fn map_import_io_error(err: std::io::Error, path: String) -> BackupError {
    match err.kind() {
        std::io::ErrorKind::NotFound => BackupError::BackupFileNotFound(path),
        std::io::ErrorKind::PermissionDenied => BackupError::PermissionDenied(path),
        _ => BackupError::Message(format!("Failed to read backup file '{path}': {err}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{export_encrypted_backup, import_encrypted_backup, resolve_backup_path, BackupPayload};
    use crate::host_metadata::HostMetadataStore;
    use crate::testutil::random_password;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn sample_payload() -> BackupPayload {
        BackupPayload {
            ssh_config: "Host test\n  HostName 10.0.0.10\n".to_string(),
            metadata: HostMetadataStore::default(),
            exported_at: 1_700_000_000,
        }
    }

    #[test]
    fn resolves_tilde_path_to_home_directory() {
        let resolved = resolve_backup_path("~/nosuckshell.backup.json").expect("resolve path");
        let home = home::home_dir().expect("home dir exists");
        assert!(resolved.starts_with(home));
    }

    #[test]
    fn resolves_relative_path_from_current_working_directory() {
        let cwd = env::current_dir().expect("cwd");
        let resolved = resolve_backup_path("tmp/backup.enc").expect("resolve path");
        assert_eq!(resolved, cwd.join(PathBuf::from("tmp/backup.enc")));
    }

    #[test]
    fn encrypted_backup_roundtrip_succeeds_with_correct_password() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("nested").join("backup.enc");
        let path_raw = path.to_string_lossy().to_string();
        let password = random_password();

        export_encrypted_backup(&path_raw, &password, &sample_payload()).expect("export succeeds");
        assert!(path.exists(), "expected export to create parent directory and file");
        let restored = import_encrypted_backup(&path_raw, &password).expect("import succeeds");

        assert_eq!(restored.ssh_config, sample_payload().ssh_config);
    }

    #[test]
    fn encrypted_backup_fails_with_wrong_password() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("backup.enc");
        let path_raw = path.to_string_lossy().to_string();
        let good = random_password();
        let mut bad = random_password();
        while bad == good {
            bad = random_password();
        }
        export_encrypted_backup(&path_raw, &good, &sample_payload()).expect("export succeeds");

        let err = import_encrypted_backup(&path_raw, &bad).expect_err("wrong password must fail");
        assert!(
            err.to_string().to_ascii_lowercase().contains("password"),
            "expected password related error but got {err}"
        );
    }

    #[test]
    fn importing_legacy_plaintext_backup_is_rejected() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("legacy.json");
        let path_raw = path.to_string_lossy().to_string();
        let raw = serde_json::to_vec(&sample_payload()).expect("serialize payload");
        fs::write(&path, raw).expect("write legacy backup");

        let err = import_encrypted_backup(&path_raw, &random_password()).expect_err("legacy backup must fail");
        assert!(
            err.to_string().to_ascii_lowercase().contains("legacy"),
            "expected legacy rejection error but got {err}"
        );
    }
}
