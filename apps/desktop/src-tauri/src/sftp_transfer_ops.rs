//! Shared cancel/pause flags for monitored NSS-Commander SFTP transfers.
//!
//! Sessions stay registered until the frontend calls [`release_transfer`] for that id so cancel
//! works between per-file IPC calls (directory trees). [`ensure_registered`] is idempotent and
//! never resets flags on an existing session.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, LazyLock, Mutex};

pub struct TransferHandles {
    pub cancel: AtomicBool,
    pub pause: AtomicBool,
}

static ACTIVE: LazyLock<Mutex<HashMap<String, Arc<TransferHandles>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Ensures a session exists for this transfer id. Reuses the existing entry so cancel/pause persist.
pub fn ensure_registered(transfer_id: &str) {
    let mut g = ACTIVE.lock().unwrap();
    g.entry(transfer_id.to_string()).or_insert_with(|| {
        Arc::new(TransferHandles {
            cancel: AtomicBool::new(false),
            pause: AtomicBool::new(false),
        })
    });
}

/// Drops the session when the UI is done with this transfer id (after each batch item).
pub fn release_transfer(transfer_id: &str) {
    ACTIVE.lock().unwrap().remove(transfer_id);
}

pub fn try_handles(transfer_id: &str) -> Option<Arc<TransferHandles>> {
    ACTIVE.lock().unwrap().get(transfer_id).cloned()
}
