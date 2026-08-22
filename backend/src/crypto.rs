use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

/// Fixed-size key stored in memory for the app session.
/// In production, this should be derived from OS-level keychain (DPAPI / Keychain).
/// For now, we derive a deterministic key from a machine-specific seed.
fn get_encryption_key() -> [u8; 32] {
    // Use a stable key derived from a fixed seed stored alongside the DB.
    // This is a reasonable default for desktop apps where the DB file
    // is already protected by OS-level user permissions.
    let mut key = [0u8; 32];
    // We'll use a simple approach: read or create a keyfile next to the DB
    let key_path = crate::db::get_db_dir().join("encryption.key");
    if let Ok(data) = std::fs::read(&key_path) {
        if data.len() == 32 {
            key.copy_from_slice(&data);
            return key;
        }
    }
    // Generate a new key
    OsRng.fill_bytes(&mut key);
    let _ = std::fs::write(&key_path, &key);
    key
}

pub fn encrypt_secret(plaintext: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok((ciphertext, nonce_bytes.to_vec()))
}

pub fn decrypt_secret(ciphertext: &[u8], nonce_bytes: &[u8]) -> Result<String, String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Failed to decrypt credential".to_string())?;

    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

pub fn mask_secret(secret: &str) -> String {
    if secret.len() <= 4 {
        return "••••••••".to_string();
    }
    format!("••••••••{}", &secret[secret.len() - 4..])
}
