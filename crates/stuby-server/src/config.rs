//! Server configuration, read from environment variables and validated at startup.
//!
//! Secrets (database URLs, the app password) never appear in `Debug` output or logs.

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::str::FromStr;

use stuby_storage::PgConnectOptions;
use chrono_tz::Tz;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("{name} tidak valid: {reason}")]
    Invalid { name: &'static str, reason: String },
    #[error("{0} wajib diisi")]
    Missing(&'static str),
}

/// How the owner password is configured.
#[derive(Clone)]
pub enum PasswordSource {
    /// `APP_PASSWORD`: plaintext, hashed with Argon2id in memory at startup.
    Plain(String),
    /// `APP_PASSWORD_HASH`: a PHC string (`$argon2id$...`).
    Hash(String),
}

#[derive(Clone)]
pub struct Config {
    pub bind: SocketAddr,
    /// Restricted application role (subject to row-level security).
    pub database_url: String,
    /// Administrator login used only to apply migrations; optional.
    pub database_admin_url: Option<String>,
    pub password: PasswordSource,
    pub session_days: u64,
    pub cookie_secure: bool,
    pub trust_proxy: bool,
    pub static_dir: PathBuf,
    pub files_dir: PathBuf,
    pub tz: Tz,
    pub day_start_hour: i64,
    pub max_upload_mb: u64,
    pub job_workers: usize,
    /// Offline mode: keep everything in this SQLite file instead of a Postgres server. When set,
    /// `database_url` is unused.
    pub local_db: Option<PathBuf>,
    /// Offline mode: the one-time token the app's own window uses to sign itself in.
    pub local_login_token: Option<String>,
    /// The web UI compiled into the app (offline apps); served instead of `static_dir`.
    pub assets: Option<stuby_api::Assets>,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("bind", &self.bind)
            .field("static_dir", &self.static_dir)
            .field("files_dir", &self.files_dir)
            .field("tz", &self.tz)
            .field("cookie_secure", &self.cookie_secure)
            .field("trust_proxy", &self.trust_proxy)
            .finish_non_exhaustive()
    }
}

/// The React build (`app/dist`) when it exists, otherwise the frozen legacy UI (`server/public`).
fn default_static_dir() -> PathBuf {
    let built = PathBuf::from("app/dist");
    if built.join("index.html").is_file() {
        built
    } else {
        PathBuf::from("server/public")
    }
}

impl Config {
    pub const DEFAULT_HOST: &'static str = "127.0.0.1";
    pub const DEFAULT_PORT: u16 = 8080;

    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok().filter(|v| !v.trim().is_empty()))
    }

    /// Reads a dotenv-style file (`KEY=VALUE` lines) *without* touching the process environment.
    ///
    /// Lookup order: `overrides` (values the host program must force, e.g. the desktop app's own
    /// paths), then the file, then the real environment. Used by the desktop app, which keeps its
    /// settings in the user's config folder instead of a `.env` next to the executable.
    pub fn from_env_file(
        path: &std::path::Path,
        overrides: &[(&str, String)],
    ) -> Result<Self, ConfigError> {
        let mut file_values = std::collections::HashMap::new();
        let entries = dotenvy::from_path_iter(path).map_err(|e| ConfigError::Invalid {
            name: "stuby.env",
            reason: e.to_string(),
        })?;
        for entry in entries {
            let (key, value) = entry.map_err(|e| ConfigError::Invalid {
                name: "stuby.env",
                reason: e.to_string(),
            })?;
            file_values.insert(key, value);
        }
        Self::from_lookup(|name| {
            overrides
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.clone())
                .or_else(|| file_values.get(name).cloned())
                .or_else(|| std::env::var(name).ok())
                .filter(|v| !v.trim().is_empty())
        })
    }

    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        fn parse<T: FromStr>(
            name: &'static str,
            raw: Option<String>,
            default: T,
        ) -> Result<T, ConfigError>
        where
            T::Err: std::fmt::Display,
        {
            match raw {
                None => Ok(default),
                Some(text) => text
                    .trim()
                    .parse()
                    .map_err(|e: T::Err| ConfigError::Invalid {
                        name,
                        reason: format!("{text:?} ({e})"),
                    }),
            }
        }
        let flag = |name: &str| get(name).is_some_and(|v| v.trim() == "1");

        let host: IpAddr = parse(
            "HOST",
            get("HOST"),
            IpAddr::from_str(Self::DEFAULT_HOST).expect("valid default"),
        )?;
        let port: u16 = parse("PORT", get("PORT"), Self::DEFAULT_PORT)?;

        let database_url = get("DATABASE_URL").ok_or(ConfigError::Missing("DATABASE_URL"))?;
        PgConnectOptions::from_str(&database_url).map_err(|e| ConfigError::Invalid {
            name: "DATABASE_URL",
            // sqlx's message does not echo the password; still never print the URL itself.
            reason: e.to_string(),
        })?;

        let password = match (get("APP_PASSWORD_HASH"), get("APP_PASSWORD")) {
            (Some(hash), _) => PasswordSource::Hash(hash),
            (None, Some(plain)) if plain.chars().count() >= 8 => PasswordSource::Plain(plain),
            (None, Some(_)) => {
                return Err(ConfigError::Invalid {
                    name: "APP_PASSWORD",
                    reason: "minimal 8 karakter".into(),
                });
            }
            (None, None) => {
                return Err(ConfigError::Missing(
                    "APP_PASSWORD (atau APP_PASSWORD_HASH)",
                ));
            }
        };

        let tz: Tz = parse("TIMEZONE", get("TIMEZONE"), chrono_tz::Asia::Jakarta)?;

        Ok(Self {
            bind: SocketAddr::new(host, port),
            database_url,
            database_admin_url: get("DATABASE_ADMIN_URL"),
            password,
            session_days: parse("SESSION_DAYS", get("SESSION_DAYS"), 30)?,
            cookie_secure: flag("COOKIE_SECURE"),
            trust_proxy: flag("TRUST_PROXY"),
            static_dir: get("STATIC_DIR").map_or_else(default_static_dir, PathBuf::from),
            files_dir: PathBuf::from(get("FILES_DIR").unwrap_or_else(|| "data/files".into())),
            tz,
            day_start_hour: parse("DAY_START_HOUR", get("DAY_START_HOUR"), 0)?,
            max_upload_mb: parse("MAX_UPLOAD_MB", get("MAX_UPLOAD_MB"), 40)?,
            job_workers: parse("JOB_WORKERS", get("JOB_WORKERS"), 4)?,
            local_db: None,
            local_login_token: None,
            assets: None,
        })
    }

    /// The offline apps: no settings to fill in, no database server, no password. Data lives in
    /// `data_dir` (a SQLite file plus uploaded files); the app's own window signs itself in with
    /// `login_token` (see `stuby_api::auth::LocalLogin`).
    #[must_use]
    pub fn local(data_dir: &std::path::Path, static_dir: PathBuf, port: u16, login_token: String) -> Self {
        Self {
            bind: SocketAddr::new(IpAddr::from([127, 0, 0, 1]), port),
            database_url: String::new(),
            database_admin_url: None,
            // Nobody types this: the account password of an offline app is random and never shown.
            password: PasswordSource::Plain(format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4())),
            session_days: 365,
            cookie_secure: false,
            trust_proxy: false,
            static_dir,
            files_dir: data_dir.join("files"),
            tz: chrono_tz::Asia::Jakarta,
            day_start_hour: 0,
            max_upload_mb: 40,
            job_workers: 2,
            local_db: Some(data_dir.join("stuby.db")),
            local_login_token: Some(login_token),
            assets: None,
        }
    }

    /// Serve the UI from files compiled into the app instead of a folder.
    #[must_use]
    pub fn with_assets(mut self, assets: stuby_api::Assets) -> Self {
        self.assets = Some(assets);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            pairs
                .iter()
                .find(|(k, _)| *k == name)
                .map(|(_, v)| (*v).to_owned())
        }
    }

    const BASE: [(&str, &str); 2] = [
        (
            "DATABASE_URL",
            "postgres://belajar_app:secret@localhost/belajar",
        ),
        ("APP_PASSWORD", "kata-sandi-uji-123"),
    ];

    #[test]
    fn defaults_bind_to_loopback_only() {
        let cfg = Config::from_lookup(lookup(&BASE)).expect("valid");
        assert_eq!(cfg.bind.to_string(), "127.0.0.1:8080");
        assert_eq!(cfg.tz, chrono_tz::Asia::Jakarta);
        assert_eq!(cfg.max_upload_mb, 40);
        assert!(!cfg.cookie_secure);
    }

    #[test]
    fn requires_a_database_and_a_strong_enough_password() {
        let none =
            Config::from_lookup(lookup(&[("APP_PASSWORD", "kata-sandi-uji-123")])).unwrap_err();
        assert_eq!(none, ConfigError::Missing("DATABASE_URL"));
        let short =
            Config::from_lookup(lookup(&[BASE[0], ("APP_PASSWORD", "pendek")])).unwrap_err();
        assert!(matches!(
            short,
            ConfigError::Invalid {
                name: "APP_PASSWORD",
                ..
            }
        ));
        let nopass = Config::from_lookup(lookup(&[BASE[0]])).unwrap_err();
        assert!(matches!(nopass, ConfigError::Missing(_)));
    }

    #[test]
    fn rejects_bad_values_with_a_clear_message() {
        let mut env = BASE.to_vec();
        env.push(("PORT", "http"));
        let err = Config::from_lookup(lookup(&env)).unwrap_err();
        assert!(err.to_string().contains("PORT tidak valid"));
        let mut env = BASE.to_vec();
        env.push(("TIMEZONE", "Mars/Olympus"));
        assert!(Config::from_lookup(lookup(&env)).is_err());
    }

    #[test]
    fn env_file_values_are_read_and_overrides_win() {
        let dir = std::env::temp_dir().join(format!("stuby-cfg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let file = dir.join("stuby.env");
        std::fs::write(
            &file,
            "# comment\nDATABASE_URL=postgres://u:p@localhost/db\nAPP_PASSWORD=kata-sandi-uji-123\nPORT=9000\nHOST=0.0.0.0\n",
        )
        .expect("write env file");

        let cfg = Config::from_env_file(
            &file,
            &[
                ("HOST", "127.0.0.1".into()),
                ("STATIC_DIR", "C:/web".into()),
            ],
        )
        .expect("valid");
        // The override beats the file; the file beats the defaults.
        assert_eq!(cfg.bind.to_string(), "127.0.0.1:9000");
        assert_eq!(cfg.static_dir, PathBuf::from("C:/web"));

        let missing = Config::from_env_file(&dir.join("nope.env"), &[]).unwrap_err();
        assert!(matches!(missing, ConfigError::Invalid { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn debug_output_never_contains_secrets() {
        let cfg = Config::from_lookup(lookup(&BASE)).expect("valid");
        let shown = format!("{cfg:?}");
        assert!(
            !shown.contains("secret")
                && !shown.contains("kata-sandi")
                && !shown.contains("postgres://"),
            "{shown}"
        );
    }
}
