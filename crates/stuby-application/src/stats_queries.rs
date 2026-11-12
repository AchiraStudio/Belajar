//! Database side of `stats.py`: event logging, daily totals and quiz progress queries.
//! The calendar/streak arithmetic itself lives in `stuby_core::stats`.

use stuby_core::numeric::py_round;
use stuby_core::stats::{self, DayTotals, StreakInfo, Totals};
use stuby_storage::args;
use chrono::NaiveDate;
use serde_json::{Value, json};

use crate::app::App;
use crate::error::AppError;
use crate::settings;
use crate::util::now;

/// Today's date in the configured zone, honouring `day_start_hour`.
#[must_use]
pub fn today(app: &App) -> NaiveDate {
    stats::day_of(now(), app.cfg.tz, app.cfg.day_start_hour)
}

/// Record a study event (`stats.log_event`).
pub async fn log_event(
    app: &App,
    kind: &str,
    document_id: Option<i64>,
    seconds: i64,
    quizzes: i64,
) -> Result<(), AppError> {
    let ts = now();
    let day = stats::day_of(ts, app.cfg.tz, app.cfg.day_start_hour).to_string();
    app.db
        .run(
            "INSERT INTO study_events(ts, day, kind, document_id, seconds, quizzes) VALUES ($1, $2, $3, $4, $5, $6)",
            args![ts, day, kind, document_id, seconds, quizzes],
        )
        .await?;
    Ok(())
}

pub async fn daily_totals(app: &App) -> Result<Totals, AppError> {
    let rows = app
        .db
        .rows(
            "SELECT day, COALESCE(SUM(seconds), 0)::bigint AS s, COALESCE(SUM(quizzes), 0)::bigint AS q \
             FROM study_events GROUP BY day",
            args![],
        )
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|r| {
            let day: NaiveDate = r.get("day")?.as_str()?.parse().ok()?;
            Some((
                day,
                DayTotals {
                    seconds: r.get("s")?.as_i64()?,
                    quizzes: r.get("q")?.as_i64()?,
                },
            ))
        })
        .collect())
}

pub async fn goal_seconds(app: &App) -> Result<i64, AppError> {
    let setting = settings::get(&app.db, "daily_goal_min", Some("10")).await?;
    Ok(stats::goal_seconds(setting.as_deref()))
}

/// Everything the calendar-based views (streak, heatmap, weekly, study days) derive from.
///
/// Fetched once, concurrently, then shared: the dashboard used to re-read the same daily totals
/// and settings once per widget, one query after another, which over a remote database was
/// seconds of pure waiting.
pub struct Daily {
    totals: Totals,
    goal: i64,
    weekly_goal_setting: Option<String>,
    today: NaiveDate,
}

pub async fn daily(app: &App) -> Result<Daily, AppError> {
    let (totals, goal, weekly_goal_setting) = tokio::try_join!(
        daily_totals(app),
        goal_seconds(app),
        settings::get(&app.db, "weekly_goal_min", Some("120")),
    )?;
    Ok(Daily {
        totals,
        goal,
        weekly_goal_setting,
        today: today(app),
    })
}

impl Daily {
    #[must_use]
    pub fn streak_info(&self) -> StreakInfo {
        stats::streak_info(&self.totals, self.goal, self.today)
    }

    #[must_use]
    pub fn heatmap(&self, days: u32) -> Value {
        json!(stats::heatmap(&self.totals, self.goal, self.today, days))
    }

    #[must_use]
    pub fn weekly(&self) -> Value {
        json!(stats::weekly(
            &self.totals,
            self.today,
            self.weekly_goal_setting.as_deref()
        ))
    }

    #[must_use]
    pub fn study_days(&self, days: u32) -> Value {
        json!(stats::study_days(&self.totals, self.today, days))
    }
}

pub async fn streak_info(app: &App) -> Result<StreakInfo, AppError> {
    let (totals, goal) = tokio::try_join!(daily_totals(app), goal_seconds(app))?;
    Ok(stats::streak_info(&totals, goal, today(app)))
}

/// Questions whose latest finished answer was wrong, oldest answer first (`weak_question_ids`).
pub async fn weak_question_ids(
    app: &App,
    subject_id: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<i64>, AppError> {
    let rows = app
        .db
        .rows(
            "SELECT q.id FROM questions q \
             JOIN quizzes z ON z.id = q.quiz_id \
             LEFT JOIN documents d ON d.id = z.document_id \
             JOIN answers a ON a.question_id = q.id \
             JOIN attempts t ON t.id = a.attempt_id AND t.finished_at IS NOT NULL \
             WHERE a.correct = 0 \
               AND a.id = (SELECT MAX(a2.id) FROM answers a2 \
                           JOIN attempts t2 ON t2.id = a2.attempt_id AND t2.finished_at IS NOT NULL \
                           WHERE a2.question_id = q.id) \
               AND ($1::bigint IS NULL OR COALESCE(d.subject_id, z.subject_id) = $1::bigint) \
             ORDER BY a.ts ASC \
             LIMIT $2::bigint",
            args![subject_id, limit],
        )
        .await?;
    Ok(rows
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_i64))
        .collect())
}

fn pct(ok: i64, n: i64) -> i64 {
    if n == 0 {
        0
    } else {
        py_round(100.0 * ok as f64 / n as f64)
    }
}

pub async fn topic_stats(app: &App) -> Result<Vec<Value>, AppError> {
    let rows = app
        .db
        .rows(
            "SELECT COALESCE(NULLIF(q.topic, ''), 'Umum') AS topic, COUNT(*) AS n, \
                    COALESCE(SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END), 0)::bigint AS ok \
             FROM answers a \
             JOIN attempts t ON t.id = a.attempt_id AND t.finished_at IS NOT NULL \
             JOIN questions q ON q.id = a.question_id \
             WHERE a.correct IS NOT NULL \
             GROUP BY 1 ORDER BY 1",
            args![],
        )
        .await?;
    let mut out: Vec<(i64, i64, Value)> = rows
        .iter()
        .map(|r| {
            let n = r.get("n").and_then(Value::as_i64).unwrap_or(0);
            let ok = r.get("ok").and_then(Value::as_i64).unwrap_or(0);
            let acc = pct(ok, n);
            let level = if n >= 3 && acc < 60 {
                "weak"
            } else if n >= 3 && acc >= 80 {
                "strong"
            } else {
                "mid"
            };
            (
                acc,
                n,
                json!({"topic": r.get("topic"), "n": n, "ok": ok, "acc": acc, "level": level}),
            )
        })
        .collect();
    // Legacy: out.sort(key=lambda x: (x["acc"], -x["n"])) — stable, so ties keep the SQL order.
    out.sort_by_key(|(acc, n, _)| (*acc, -*n));
    Ok(out.into_iter().map(|(_, _, v)| v).collect())
}

pub async fn document_stats(app: &App) -> Result<Vec<Value>, AppError> {
    let rows = app
        .db
        .rows(
            "SELECT d.id, d.title, COUNT(a.id) AS n, \
                    COALESCE(SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END), 0)::bigint AS ok \
             FROM answers a \
             JOIN attempts t ON t.id = a.attempt_id AND t.finished_at IS NOT NULL \
             JOIN questions q ON q.id = a.question_id \
             JOIN quizzes z ON z.id = q.quiz_id \
             JOIN documents d ON d.id = z.document_id \
             WHERE a.correct IS NOT NULL \
             GROUP BY d.id ORDER BY d.title",
            args![],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let n = r.get("n").and_then(Value::as_i64).unwrap_or(0);
            let ok = r.get("ok").and_then(Value::as_i64).unwrap_or(0);
            json!({"id": r.get("id"), "title": r.get("title"), "n": n, "acc": pct(ok, n)})
        })
        .collect())
}

pub async fn score_trend(app: &App, limit: i64) -> Result<Vec<Value>, AppError> {
    let mut rows = app
        .db
        .rows(
            "SELECT t.id, t.finished_at AS ts, t.score, t.total, t.mode, \
                    COALESCE(z.title, 'Ulangi soal lemah') AS title \
             FROM attempts t LEFT JOIN quizzes z ON z.id = t.quiz_id \
             WHERE t.finished_at IS NOT NULL AND t.total > 0 \
             ORDER BY t.finished_at DESC LIMIT $1",
            args![limit],
        )
        .await?;
    rows.reverse();
    Ok(rows
        .into_iter()
        .map(|mut r| {
            let score = r.get("score").and_then(Value::as_i64).unwrap_or(0);
            let total = r.get("total").and_then(Value::as_i64).unwrap_or(1);
            r.insert("pct".to_owned(), json!(pct(score, total)));
            Value::Object(r)
        })
        .collect())
}

pub async fn overall(app: &App) -> Result<Value, AppError> {
    // One statement instead of seven round trips (this runs on every home/progress load).
    let row = app
        .db
        .row(
            "SELECT                (SELECT COUNT(*) FROM attempts t WHERE t.finished_at IS NOT NULL)::bigint AS attempts,                (SELECT COUNT(*) FROM answers a JOIN attempts t ON t.id = a.attempt_id AND t.finished_at IS NOT NULL                  WHERE a.correct IS NOT NULL)::bigint AS n,                (SELECT COALESCE(SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END), 0)                   FROM answers a JOIN attempts t ON t.id = a.attempt_id AND t.finished_at IS NOT NULL                  WHERE a.correct IS NOT NULL)::bigint AS ok,                (SELECT COALESCE(SUM(seconds), 0) FROM study_events)::bigint AS study_seconds,                (SELECT COUNT(*) FROM documents)::bigint AS documents,                (SELECT COUNT(*) FROM quizzes)::bigint AS quizzes,                (SELECT COUNT(*) FROM questions)::bigint AS questions",
            args![],
        )
        .await?
        .ok_or_else(|| AppError::internal("overall returned no row"))?;
    let get = |key: &str| row.get(key).and_then(Value::as_i64).unwrap_or(0);
    let (n, ok) = (get("n"), get("ok"));
    Ok(json!({
        "attempts": get("attempts"),
        "answers": n,
        "accuracy": if n > 0 { json!(pct(ok, n)) } else { Value::Null },
        "study_seconds": get("study_seconds"),
        "documents": get("documents"),
        "quizzes": get("quizzes"),
        "questions": get("questions"),
    }))
}
