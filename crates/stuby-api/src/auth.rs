//! Password login with server-side, revocable sessions.
//!
//! Replaces the legacy stateless HMAC cookie (audit S-02): the cookie holds a random token, the
//! database holds only its SHA-256, so a stolen database cannot be replayed and `logout` really
//! ends the session. The password is checked with Argon2id (the legacy code compared a plaintext
//! environment value).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash};
use sha2::{Digest, Sha256};

/// Login attempts allowed per client per minute (legacy: 6).
const MAX_ATTEMPTS: u32 = 6;
const WINDOW: Duration = Duration::from_secs(60);

pub struct Auth {
    password_phc: String,
    pub cookie_secure: bool,
    pub session_seconds: f64,
    pub trust_proxy: bool,
}

impl Auth {
    /// Hash a plaintext password in memory (so an `APP_PASSWORD` env value never sits in a
    /// comparison against user input).
    pub fn from_password(
        plain: &str,
        cookie_secure: bool,
        session_days: u64,
        trust_proxy: bool,
    ) -> Result<Self, String> {
        let phc = Argon2::default()
            .hash_password(plain.as_bytes())
            .map_err(|e| e.to_string())?
            .to_string();
        Ok(Self {
            password_phc: phc,
            cookie_secure,
            session_seconds: session_days as f64 * 86_400.0,
            trust_proxy,
        })
    }

    /// Use an already hashed password (`$argon2id$...`), e.g. from `APP_PASSWORD_HASH`.
    pub fn from_phc(
        phc: &str,
        cookie_secure: bool,
        session_days: u64,
        trust_proxy: bool,
    ) -> Result<Self, String> {
        PasswordHash::new(phc).map_err(|e| e.to_string())?;
        Ok(Self {
            password_phc: phc.to_owned(),
            cookie_secure,
            session_seconds: session_days as f64 * 86_400.0,
            trust_proxy,
        })
    }

    /// Check a candidate password off the async threads (Argon2 is deliberately slow).
    pub async fn verify(&self, candidate: String) -> bool {
        let phc = self.password_phc.clone();
        tokio::task::spawn_blocking(move || match PasswordHash::new(&phc) {
            Ok(parsed) => Argon2::default()
                .verify_password(candidate.as_bytes(), &parsed)
                .is_ok(),
            Err(_) => false,
        })
        .await
        .unwrap_or(false)
    }
}

/// A fresh, unguessable session token (two random v4 UUIDs, ~244 bits from the OS RNG).
#[must_use]
pub fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// What is stored server-side for a cookie token.
#[must_use]
pub fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// One-time sign-in for the offline apps. The app generates a random token at start, hands it to
/// its own window once, and the window trades it for a session. Nothing else on the machine knows
/// the token, so the loopback port is not an open door for other programs or web pages.
pub struct LocalLogin {
    token: Mutex<Option<String>>,
}

impl LocalLogin {
    #[must_use]
    pub fn new(token: String) -> Self {
        Self {
            token: Mutex::new(Some(token)),
        }
    }

    /// `true` exactly once, for the right token.
    pub fn consume(&self, candidate: &str) -> bool {
        let Ok(mut slot) = self.token.lock() else {
            return false;
        };
        let matches = slot.as_deref().is_some_and(|t| {
            t.len() == candidate.len()
                && t.bytes()
                    .zip(candidate.bytes())
                    .fold(0u8, |acc, (a, b)| acc | (a ^ b))
                    == 0
        });
        if matches {
            *slot = None;
        }
        matches
    }
}

/// Per-client login throttle (legacy: 6 attempts per minute per IP).
#[derive(Default)]
pub struct LoginLimiter {
    attempts: Mutex<HashMap<String, (u32, Instant)>>,
}

impl LoginLimiter {
    /// Record an attempt; returns `true` when the client is over the limit.
    pub fn limited(&self, client: &str) -> bool {
        let now = Instant::now();
        let Ok(mut map) = self.attempts.lock() else {
            return false;
        };
        map.retain(|_, (_, reset)| *reset > now);
        let entry = map.entry(client.to_owned()).or_insert((0, now + WINDOW));
        entry.0 += 1;
        entry.0 > MAX_ATTEMPTS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn only_the_right_password_verifies() {
        let auth = Auth::from_password("kata-sandi-uji-123", false, 30, false).unwrap();
        assert!(auth.verify("kata-sandi-uji-123".into()).await);
        assert!(!auth.verify("salah".into()).await);
        assert!(!auth.verify(String::new()).await);
        assert!(auth.password_phc.starts_with("$argon2id$"));
    }

    #[test]
    fn tokens_are_unique_and_only_their_hash_is_stored() {
        let (a, b) = (new_token(), new_token());
        assert_ne!(a, b);
        assert_eq!(a.len(), 64);
        assert_ne!(hash_token(&a), a);
        assert_eq!(hash_token(&a).len(), 64);
        assert_eq!(hash_token(&a), hash_token(&a));
    }

    #[test]
    fn the_local_token_works_once_and_only_when_right() {
        let login = LocalLogin::new("abc123".into());
        assert!(!login.consume("abc124"));
        assert!(!login.consume(""));
        assert!(login.consume("abc123"));
        assert!(!login.consume("abc123"), "single use");
    }

    #[test]
    fn the_seventh_attempt_in_a_minute_is_limited() {
        let limiter = LoginLimiter::default();
        for _ in 0..6 {
            assert!(!limiter.limited("1.2.3.4"));
        }
        assert!(limiter.limited("1.2.3.4"));
        assert!(!limiter.limited("5.6.7.8"), "other clients are unaffected");
    }
}
