use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const ENTITY_STORE_SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostKeyRef {
    #[serde(rename = "keyId")]
    pub key_id: String,
    pub usage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserObject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub username: String,
    /// When set and this user is linked on a host binding, overrides SSH `HostName` for the session.
    #[serde(default, rename = "hostName")]
    pub host_name: String,
    /// When set and the host binding does not specify `proxyJump`, used as `ProxyJump` for the session.
    #[serde(default, rename = "proxyJump")]
    pub proxy_jump: String,
    /// SSH keys linked to this user (used when the host binding does not specify keys).
    #[serde(default, rename = "keyRefs")]
    pub key_refs: Vec<HostKeyRef>,
    #[serde(default, rename = "tagIds")]
    pub tag_ids: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GroupObject {
    pub id: String,
    pub name: String,
    #[serde(default, rename = "memberUserIds")]
    pub member_user_ids: Vec<String>,
    #[serde(default, rename = "tagIds")]
    pub tag_ids: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagObject {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum KeyKdf {
    Argon2id,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SshKeyObject {
    Path {
        id: String,
        name: String,
        #[serde(rename = "identityFilePath")]
        identity_file_path: String,
        #[serde(default, rename = "tagIds")]
        tag_ids: Vec<String>,
        #[serde(rename = "createdAt")]
        created_at: u64,
        #[serde(rename = "updatedAt")]
        updated_at: u64,
    },
    Encrypted {
        id: String,
        name: String,
        ciphertext: String,
        kdf: KeyKdf,
        salt: String,
        nonce: String,
        fingerprint: String,
        #[serde(rename = "publicKey", default)]
        public_key: String,
        #[serde(default, rename = "tagIds")]
        tag_ids: Vec<String>,
        #[serde(rename = "createdAt")]
        created_at: u64,
        #[serde(rename = "updatedAt")]
        updated_at: u64,
    },
}

impl SshKeyObject {
    #[allow(dead_code)]
    pub fn id(&self) -> &str {
        match self {
            SshKeyObject::Path { id, .. } | SshKeyObject::Encrypted { id, .. } => id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct HostBinding {
    #[serde(rename = "userId", default)]
    pub user_id: Option<String>,
    #[serde(default, rename = "groupIds")]
    pub group_ids: Vec<String>,
    #[serde(default, rename = "tagIds")]
    pub tag_ids: Vec<String>,
    #[serde(default, rename = "keyRefs")]
    pub key_refs: Vec<HostKeyRef>,
    #[serde(default, rename = "proxyJump")]
    pub proxy_jump: String,
    #[serde(default, rename = "legacyUser")]
    pub legacy_user: String,
    #[serde(default, rename = "legacyTags")]
    pub legacy_tags: Vec<String>,
    #[serde(default, rename = "legacyIdentityFile")]
    pub legacy_identity_file: String,
    #[serde(default, rename = "legacyProxyJump")]
    pub legacy_proxy_jump: String,
    #[serde(default, rename = "legacyProxyCommand")]
    pub legacy_proxy_command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntityStore {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
    #[serde(default)]
    pub users: HashMap<String, UserObject>,
    #[serde(default)]
    pub groups: HashMap<String, GroupObject>,
    #[serde(default)]
    pub keys: HashMap<String, SshKeyObject>,
    #[serde(default)]
    pub tags: HashMap<String, TagObject>,
    #[serde(default, rename = "hostBindings")]
    pub host_bindings: HashMap<String, HostBinding>,
}

impl Default for EntityStore {
    fn default() -> Self {
        Self {
            schema_version: ENTITY_STORE_SCHEMA_VERSION,
            updated_at: 0,
            users: HashMap::new(),
            groups: HashMap::new(),
            keys: HashMap::new(),
            tags: HashMap::new(),
            host_bindings: HashMap::new(),
        }
    }
}
