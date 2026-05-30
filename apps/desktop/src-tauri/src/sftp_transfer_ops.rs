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
    // Recover from a poisoned mutex (another thread panicked while holding the lock) rather than
    // propagate the panic into the Tauri command thread.
    let mut g = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    g.entry(transfer_id.to_string()).or_insert_with(|| {
        Arc::new(TransferHandles {
            cancel: AtomicBool::new(false),
            pause: AtomicBool::new(false),
        })
    });
}

/// Drops the session when the UI is done with this transfer id (after each batch item).
pub fn release_transfer(transfer_id: &str) {
    ACTIVE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(transfer_id);
}

pub fn try_handles(transfer_id: &str) -> Option<Arc<TransferHandles>> {
    ACTIVE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(transfer_id)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn fresh_id(prefix: &str) -> String {
        format!(
            "{prefix}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        )
    }

    #[test]
    fn try_handles_returns_none_when_not_registered() {
        let id = fresh_id("nope");
        assert!(try_handles(&id).is_none());
    }

    #[test]
    fn ensure_registered_creates_unflagged_handles() {
        let id = fresh_id("create");
        ensure_registered(&id);
        let h = try_handles(&id).expect("registered handles");
        assert!(!h.cancel.load(Ordering::SeqCst));
        assert!(!h.pause.load(Ordering::SeqCst));
        release_transfer(&id);
        assert!(try_handles(&id).is_none());
    }

    #[test]
    fn ensure_registered_preserves_cancel_and_pause_flags() {
        // Caller toggles flags; a re-registration during the same transfer must not reset them
        // or the UI's "cancel between batch items" semantics break.
        let id = fresh_id("preserve");
        ensure_registered(&id);
        let h = try_handles(&id).expect("registered");
        h.cancel.store(true, Ordering::SeqCst);
        h.pause.store(true, Ordering::SeqCst);

        ensure_registered(&id);
        let h2 = try_handles(&id).expect("still registered");
        assert!(h2.cancel.load(Ordering::SeqCst));
        assert!(h2.pause.load(Ordering::SeqCst));
        // Same Arc points at the same handles instance.
        assert!(Arc::ptr_eq(&h, &h2));

        release_transfer(&id);
    }

    #[test]
    fn release_transfer_drops_state_for_id() {
        let id = fresh_id("release");
        ensure_registered(&id);
        assert!(try_handles(&id).is_some());
        release_transfer(&id);
        assert!(try_handles(&id).is_none());
        // Releasing twice is a no-op.
        release_transfer(&id);
    }
}
