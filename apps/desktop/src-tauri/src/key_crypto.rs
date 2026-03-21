use anyhow::{anyhow, Context, Result};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

pub fn random_bytes<const N: usize>() -> [u8; N] {
    rand::random::<[u8; N]>()
}

pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let mut key = random_bytes::<32>();
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|err| anyhow!("failed to derive key from passphrase: {err}"))?;
    Ok(key)
}

pub fn encrypt_string(passphrase: &str, plaintext: &str) -> Result<(String, String, String)> {
    let salt = random_bytes::<16>();
    let nonce = random_bytes::<12>();
    let key_bytes = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key_bytes));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .context("failed to encrypt key material")?;
    Ok((B64.encode(ciphertext), B64.encode(salt), B64.encode(nonce)))
}

pub fn decrypt_string(passphrase: &str, ciphertext_b64: &str, salt_b64: &str, nonce_b64: &str) -> Result<String> {
    let ciphertext = B64
        .decode(ciphertext_b64)
        .context("invalid ciphertext encoding")?;
    let salt = B64.decode(salt_b64).context("invalid salt encoding")?;
    let nonce = B64.decode(nonce_b64).context("invalid nonce encoding")?;
    let key_bytes = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key_bytes));
    let decrypted = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .context("failed to decrypt key material")?;
    String::from_utf8(decrypted).context("decrypted key material is not utf-8")
}

#[cfg(test)]
mod tests {
    use super::{decrypt_string, encrypt_string};
    use crate::testutil::random_password;

    #[test]
    fn key_material_encrypt_decrypt_roundtrip() {
        let passphrase = random_password();
        let plaintext = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
        let (ciphertext, salt, nonce) = encrypt_string(&passphrase, plaintext).expect("encrypt");
        let decrypted = decrypt_string(&passphrase, &ciphertext, &salt, &nonce).expect("decrypt");
        assert_eq!(decrypted, plaintext);
    }
}
