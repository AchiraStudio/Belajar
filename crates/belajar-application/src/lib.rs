//! Application layer: the actions the (unchanged) frontend calls, and the workflows behind them.
//! Knows nothing about HTTP. Coordinates `belajar-core` (pure rules), `belajar-storage`
//! (PostgreSQL) and `belajar-ai` (model providers).

pub mod app;
pub mod config;
pub mod error;
pub mod handlers;
pub mod jobs;
pub mod params;
pub mod pipeline;
pub mod profile;
pub mod rowx;
pub mod settings;
pub mod stats_queries;
pub mod util;

pub use app::{App, Emit};
pub use config::AppConfig;
pub use error::{AppError, HResult};
pub use handlers::{ACTIONS, dispatch, is_known};
