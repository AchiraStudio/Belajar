use std::sync::Arc;

use belajar_storage::Db;
use serde_json::Value;
use tokio::sync::Semaphore;

use crate::config::AppConfig;

/// Sink for streaming events (`{"stage": ..}` or `{"chunk": ..}`), used by the SSE routes.
pub type Emit = Arc<dyn Fn(Value) + Send + Sync>;

/// Everything a handler needs. Cheap to clone.
#[derive(Clone)]
pub struct App {
    pub db: Db,
    pub cfg: Arc<AppConfig>,
    pub(crate) job_slots: Arc<Semaphore>,
}

impl App {
    #[must_use]
    pub fn new(db: Db, cfg: AppConfig) -> Self {
        let slots = cfg.job_workers.max(1);
        Self {
            db,
            cfg: Arc::new(cfg),
            job_slots: Arc::new(Semaphore::new(slots)),
        }
    }
}
