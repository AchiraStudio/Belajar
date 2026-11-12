//! Player profile: achievements ("lencana"). Computed from stored data, never from the AI, and
//! idempotent: unlocking twice never rewards twice. (Legacy `profile.py`.)

use std::collections::HashSet;

use stuby_core::mastery::{MasteryLevel, mastery_level};
use stuby_storage::args;
use serde_json::{Value, json};

use crate::app::App;
use crate::error::AppError;
use crate::rowx::{f64_of, i64_of, json_of, str_of};
use crate::stats_queries;
use crate::util::now;

/// `(key, title, description)` of every achievement, in legacy display order.
pub const ACHIEVEMENTS: [(&str, &str, &str); 9] = [
    (
        "first_play",
        "Langkah Pertama",
        "Selesaikan permainan pertamamu.",
    ),
    ("mastery_1", "Penguasa Pertama", "Kuasai 1 konsep."),
    ("mastery_10", "Kolektor Konsep", "Kuasai 10 konsep."),
    ("streak_7", "Konsisten", "Belajar 7 hari beruntun."),
    (
        "perfect",
        "Tanpa Cela",
        "Selesaikan permainan 5+ giliran dengan akurasi 100%.",
    ),
    (
        "no_hint",
        "Mandiri",
        "Akurasi 80%+ pada permainan 5+ giliran tanpa petunjuk.",
    ),
    (
        "boss_win",
        "Penakluk Boss",
        "Lulus Ujian Boss dengan akurasi 80%+.",
    ),
    (
        "explorer",
        "Penjelajah",
        "Selesaikan semua 6 jenis permainan.",
    ),
    ("cards_20", "Rajin Mengulang", "Punya 20 kartu belajar."),
];

/// A finished game run, as far as achievements care.
struct Run {
    id: i64,
    game: String,
    correct: i64,
    total: i64,
}

impl Run {
    /// Accuracy in `[0, 1]`; 0 for a run without answers (`profile._acc`).
    fn accuracy(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            self.correct as f64 / self.total as f64
        }
    }
}

async fn finished_runs(app: &App) -> Result<Vec<Run>, AppError> {
    let rows = app
        .db
        .rows(
            "SELECT id, game, correct, total FROM game_runs WHERE status = 'finished' ORDER BY id",
            args![],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| Run {
            id: i64_of(r, "id").unwrap_or(0),
            game: str_of(r, "game").unwrap_or("").to_owned(),
            correct: i64_of(r, "correct").unwrap_or(0),
            total: i64_of(r, "total").unwrap_or(0),
        })
        .collect())
}

async fn mastered_count(app: &App) -> Result<usize, AppError> {
    let rows = app
        .db
        .rows("SELECT score, evidence_n, kinds FROM mastery", args![])
        .await?;
    Ok(rows
        .iter()
        .filter(|r| {
            let kinds: Vec<String> = match json_of(r, "kinds", json!([])) {
                Value::Array(items) => items
                    .into_iter()
                    .filter_map(|k| k.as_str().map(str::to_owned))
                    .collect(),
                _ => Vec::new(),
            };
            mastery_level(
                f64_of(r, "score").unwrap_or(0.0),
                i64_of(r, "evidence_n").unwrap_or(0),
                &kinds,
            ) == MasteryLevel::Kuasai
        })
        .count())
}

async fn hint_total(app: &App, run_id: i64) -> Result<i64, AppError> {
    Ok(app
        .db
        .scalar_i64(
            "SELECT COALESCE(SUM(hint_level), 0)::bigint FROM game_turns WHERE run_id = $1",
            args![run_id],
            0,
        )
        .await?)
}

/// Does the player currently meet the condition of achievement `key`?
async fn is_met(app: &App, key: &str) -> Result<bool, AppError> {
    Ok(match key {
        "first_play" => !finished_runs(app).await?.is_empty(),
        "mastery_1" => mastered_count(app).await? >= 1,
        "mastery_10" => mastered_count(app).await? >= 10,
        // The legacy code read a key (`best`) that `streak_info` never returns, so this badge could
        // not be earned. The intent was the longest streak; FEATURE_INVENTORY C-1.
        "streak_7" => stats_queries::streak_info(app).await?.streak.longest >= 7,
        "perfect" => finished_runs(app)
            .await?
            .iter()
            .any(|r| r.total >= 5 && r.accuracy() == 1.0),
        "no_hint" => {
            for run in finished_runs(app).await? {
                if run.total >= 5 && run.accuracy() >= 0.8 && hint_total(app, run.id).await? == 0 {
                    return Ok(true);
                }
            }
            false
        }
        "boss_win" => finished_runs(app)
            .await?
            .iter()
            .any(|r| r.game == "boss" && r.accuracy() >= 0.8),
        "explorer" => {
            finished_runs(app)
                .await?
                .iter()
                .map(|r| r.game.as_str())
                .collect::<HashSet<_>>()
                .len()
                >= 6
        }
        "cards_20" => {
            app.db
                .scalar_i64("SELECT COUNT(*) FROM cards", args![], 0)
                .await?
                >= 20
        }
        _ => false,
    })
}

/// Check every achievement and return the ones unlocked just now. A check that fails counts as
/// "not met", so badges can never break the action that triggered them.
pub async fn unlock_achievements(app: &App) -> Result<Vec<Value>, AppError> {
    let mut fresh = Vec::new();
    for (key, title, desc) in ACHIEVEMENTS {
        let have = app
            .db
            .scalar_i64(
                "SELECT COUNT(*) FROM achievements WHERE key = $1",
                args![key],
                0,
            )
            .await?;
        if have > 0 {
            continue;
        }
        let met = match is_met(app, key).await {
            Ok(met) => met,
            Err(e) => {
                tracing::warn!(key, error = %e, "achievement check failed");
                false
            }
        };
        if !met {
            continue;
        }
        // Only the insert that really created the row announces the unlock.
        let inserted = app
            .db
            .run(
                "INSERT INTO achievements(key, unlocked_at) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                args![key, now()],
            )
            .await?;
        if inserted == 1 {
            fresh.push(json!({"key": key, "title": title, "desc": desc}));
        }
    }
    Ok(fresh)
}

// ---------------------------------------------------------------- level, achievements list, daily quests

/// Total XP of the player (0 before the first reward). Reading never creates the row.
pub async fn xp(app: &App) -> Result<i64, AppError> {
    Ok(app
        .db
        .scalar_i64("SELECT xp FROM player", args![], 0)
        .await?)
}

/// The player's level progress (legacy `profile.profile()`).
pub async fn level(app: &App) -> Result<stuby_core::profile::LevelInfo, AppError> {
    Ok(stuby_core::profile::level_info(xp(app).await?))
}

/// Every achievement with its unlock state, in legacy display order (`achievements_list`).
pub async fn achievements_list(app: &App) -> Result<Vec<Value>, AppError> {
    let rows = app
        .db
        .rows("SELECT key, unlocked_at FROM achievements", args![])
        .await?;
    Ok(list_achievements(&rows))
}

fn list_achievements(unlocked: &[stuby_storage::Row]) -> Vec<Value> {
    ACHIEVEMENTS
        .iter()
        .map(|(key, title, desc)| {
            let at = unlocked
                .iter()
                .find(|r| str_of(r, "key") == Some(key))
                .and_then(|r| f64_of(r, "unlocked_at"));
            json!({"key": key, "title": title, "desc": desc, "unlocked": at.is_some(), "at": at})
        })
        .collect()
}

/// `(key, title, xp)` of every daily quest, sorted by key like the legacy `sorted(QUESTS)`.
/// (The conditions that complete a quest belong to the game engine, which is not ported yet.)
pub const QUESTS: [(&str, &str, i64); 6] = [
    ("acc80", "Capai akurasi 80%+ dalam satu permainan", 30),
    ("ajari", "Selesaikan Ajari Aku", 25),
    ("cards_5", "Ulas 5 kartu", 20),
    ("goal", "Capai target belajar hari ini", 20),
    ("play_1", "Selesaikan 1 permainan", 20),
    ("two_modes", "Mainkan 2 jenis permainan berbeda", 25),
];

/// The three quests of `day`, chosen deterministically from the date exactly like the legacy
/// `random.Random(day).sample(sorted(QUESTS), 3)`.
fn quests_for(day: &str) -> Vec<&'static (&'static str, &'static str, i64)> {
    let indexes: Vec<usize> = (0..QUESTS.len()).collect();
    stuby_core::pyrandom::sample(day, &indexes, 3)
        .unwrap_or_else(|| indexes.iter().take(3).copied().collect())
        .into_iter()
        .map(|i| &QUESTS[i])
        .collect()
}

/// Today's three quests and whether each is done (`daily_quests`).
pub async fn daily_quests(app: &App) -> Result<Vec<Value>, AppError> {
    let day = stats_queries::today(app).to_string();
    let done = app
        .db
        .rows(
            "SELECT key FROM quests WHERE day = $1 AND done_at IS NOT NULL",
            args![day.clone()],
        )
        .await?;
    Ok(quests_for(&day)
        .into_iter()
        .map(|(key, title, xp)| {
            let finished = done.iter().any(|r| str_of(r, "key") == Some(key));
            json!({"key": key, "title": title, "xp": xp, "done": finished})
        })
        .collect())
}

#[cfg(test)]
mod quest_tests {
    use super::*;

    #[test]
    fn quests_are_sorted_like_python() {
        let keys: Vec<&str> = QUESTS.iter().map(|q| q.0).collect();
        let mut sorted = keys.clone();
        sorted.sort_unstable();
        assert_eq!(keys, sorted);
    }

    /// CPython: `random.Random("2026-11-09").sample(sorted(QUESTS), 3)`.
    #[test]
    fn same_day_picks_the_same_quests_as_legacy() {
        let picked: Vec<&str> = quests_for("2026-11-09").iter().map(|q| q.0).collect();
        assert_eq!(picked, ["acc80", "goal", "two_modes"]);
    }

    #[test]
    fn locked_achievements_have_no_timestamp() {
        let list = list_achievements(&[]);
        assert_eq!(list.len(), ACHIEVEMENTS.len());
        assert_eq!(list[0]["unlocked"], json!(false));
        assert_eq!(list[0]["at"], Value::Null);
    }
}
