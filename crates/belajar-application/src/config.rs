use std::path::PathBuf;

use chrono_tz::Tz;

/// Settings the handlers need (a subset of the legacy `config.py`).
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// Time zone that defines "today" for streaks and daily quests.
    pub tz: Tz,
    /// Hour at which a new study day begins (legacy `DAY_START_HOUR`).
    pub day_start_hour: i64,
    /// Reported by `ping`; the legacy value is kept so nothing that keys on it changes.
    pub version: String,
    /// Upload size limit.
    pub max_upload_mb: u64,
    /// Directory holding uploaded files; `documents.file_path` is relative to it.
    pub files_dir: PathBuf,
    /// Characters of source text sent to the model per request.
    pub chunk_chars: usize,
    /// How many image-only pages may be read by the vision model.
    pub max_vision_pages: usize,
    /// Parallel background jobs.
    pub job_workers: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            tz: chrono_tz::Asia::Jakarta,
            day_start_hour: 0,
            version: "2.3.1".to_owned(),
            max_upload_mb: 40,
            files_dir: PathBuf::from("data/files"),
            chunk_chars: 7000,
            max_vision_pages: 80,
            job_workers: 4,
        }
    }
}

/// Legacy defaults for the settings editable from the UI (`config.DEFAULT_SETTINGS`).
pub const DEFAULT_SETTINGS: [(&str, &str); 4] = [
    ("daily_goal_min", "10"),
    ("weekly_goal_min", "120"),
    ("notes_style", "ringkas"),
    ("language", "auto"),
];

/// Note styles (`pipeline.STYLES`): three general ones followed by the five "detail" ones.
pub const STYLES: [&str; 8] = [
    "ringkas",
    "cornell",
    "sederhana",
    "detail",
    "sentence",
    "charting",
    "outline",
    "worked",
];
