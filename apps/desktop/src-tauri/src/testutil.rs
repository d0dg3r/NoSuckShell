//! Test-only helpers (avoid string literals in crypto APIs for static analysis).

/// Random passphrase for unit tests (hex from OS RNG, not a string literal).
pub fn random_password() -> String {
    rand::random::<[u8; 16]>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
