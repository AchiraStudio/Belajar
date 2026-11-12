use std::path::PathBuf;
use std::sync::Arc;

use stuby_application::App;
use stuby_storage::SessionStore;

use crate::auth::{Auth, LocalLogin, LoginLimiter};

/// Looks up one embedded file of the web UI by relative path (`index.html`, `assets/app.js`) and
/// returns its bytes and MIME type. The offline apps use it because the UI is compiled into them.
pub type Assets = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;

/// Shared state of the HTTP layer. Cheap to clone.
#[derive(Clone)]
pub struct ApiState {
    pub app: App,
    pub sessions: SessionStore,
    pub auth: Arc<Auth>,
    pub limiter: Arc<LoginLimiter>,
    /// One-time sign-in for the app's own window (offline apps). `None` on a server.
    pub local_login: Option<Arc<LocalLogin>>,
    /// The web UI compiled into the app. When set it is served instead of `static_dir`.
    pub assets: Option<Assets>,
    /// Directory with the (unchanged) frontend: `index.html`, `app.js`, ...
    pub static_dir: PathBuf,
    /// Upload limit in bytes.
    pub max_upload_bytes: usize,
}
