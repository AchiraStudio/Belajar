use std::path::PathBuf;
use std::sync::Arc;

use belajar_application::App;
use belajar_storage::SessionStore;

use crate::auth::{Auth, LoginLimiter};

/// Shared state of the HTTP layer. Cheap to clone.
#[derive(Clone)]
pub struct ApiState {
    pub app: App,
    pub sessions: SessionStore,
    pub auth: Arc<Auth>,
    pub limiter: Arc<LoginLimiter>,
    /// Directory with the (unchanged) frontend: `index.html`, `app.js`, ...
    pub static_dir: PathBuf,
    /// Upload limit in bytes.
    pub max_upload_bytes: usize,
}
