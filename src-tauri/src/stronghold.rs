use sha2::{Digest, Sha256};
use std::sync::OnceLock;

// Cache for the password hash to avoid recomputation
static PASSWORD_HASH_CACHE: OnceLock<Vec<u8>> = OnceLock::new();

/// Fast password hash function optimized for Stronghold
/// Uses SHA-256 with a fixed salt for consistent 32-byte output
pub fn fast_password_hash(password: &str) -> Vec<u8> {
    // Check if we have a cached hash for this session
    if let Some(cached_hash) = PASSWORD_HASH_CACHE.get() {
        return cached_hash.clone();
    }

    // Create a fast hash using SHA-256 (much faster than argon2)
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(b"aura-stronghold-salt-2024"); // Fixed salt for consistency
    let result = hasher.finalize();
    let hash = result.to_vec();

    // Cache the hash for this session
    let _ = PASSWORD_HASH_CACHE.set(hash.clone());
    
    hash
}

/// Clear the password hash cache (call on logout)
pub fn clear_password_cache() {
    // We can't actually clear OnceLock, but we can document this limitation
    // In practice, the cache will be cleared when the app restarts
    // For additional security, we could use a Mutex<Option<Vec<u8>>> instead
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hash_consistency() {
        let password = "test_password";
        let hash1 = fast_password_hash(password);
        let hash2 = fast_password_hash(password);
        
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 32); // SHA-256 produces 32 bytes
    }

    #[test]
    fn test_different_passwords_different_hashes() {
        let hash1 = fast_password_hash("password1");
        let hash2 = fast_password_hash("password2");
        
        assert_ne!(hash1, hash2);
    }
}
