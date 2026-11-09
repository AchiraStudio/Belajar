//! Quizzes and quiz attempts (practice / exam / review). Quiz *generation* and AI grading are in
//! `pipeline`; this module is everything that works from stored questions.

use belajar_core::grading;
use belajar_core::numeric::py_round;
use belajar_storage::{Row, args};
use serde_json::{Map, Value, json};

use crate::app::App;
use crate::error::{AppError, HResult};
use crate::params::{head_chars, need_int, opt_int, py_str, truthy};
use crate::rowx::{i64_of, json_of, str_of, string_list};
use crate::stats_queries;
use crate::util::{now, shuffle};
use crate::{jobs, pipeline};

pub async fn list_quizzes(app: &App) -> HResult {
    let mut quizzes = app
        .db
        .rows(
            "SELECT z.id, z.title, z.difficulty, z.created_at, z.document_id, \
                    COALESCE(d.title, s.name) AS source_title, \
                    (SELECT COUNT(*) FROM questions q WHERE q.quiz_id = z.id) AS question_count, \
                    (SELECT COUNT(*) FROM attempts t WHERE t.quiz_id = z.id AND t.finished_at IS NOT NULL) AS attempt_count, \
                    (SELECT 100.0::float8 * t.score / t.total FROM attempts t \
                      WHERE t.quiz_id = z.id AND t.finished_at IS NOT NULL AND t.total > 0 \
                      ORDER BY t.finished_at DESC LIMIT 1) AS last_pct \
             FROM quizzes z LEFT JOIN documents d ON d.id = z.document_id LEFT JOIN subjects s ON s.id = z.subject_id \
             ORDER BY z.created_at DESC LIMIT 100",
            args![],
        )
        .await?;
    for quiz in &mut quizzes {
        if let Some(v) = quiz.get("last_pct").and_then(Value::as_f64) {
            quiz.insert("last_pct".to_owned(), json!(py_round(v)));
        }
    }
    Ok(json!({"quizzes": quizzes}))
}

pub async fn delete_quiz(app: &App, p: &Value) -> HResult {
    app.db
        .run(
            "DELETE FROM quizzes WHERE id = $1",
            args![need_int(p, "id", None, None)?],
        )
        .await?;
    Ok(json!({}))
}

// ---------------------------------------------------------------- question helpers
/// Python-style list index: negative counts from the end.
fn py_index(len: usize, idx: i64) -> Option<usize> {
    let i = if idx < 0 { idx + len as i64 } else { idx };
    usize::try_from(i).ok().filter(|i| *i < len)
}

/// Display text of an answer value (`pipeline.answer_text`): the option text for multiple choice,
/// Benar/Salah for true-false, else the value itself.
#[must_use]
pub fn answer_text(q: &Row, value: Option<&str>) -> String {
    let Some(value) = value else {
        return String::new();
    };
    match str_of(q, "qtype") {
        Some("mcq") => {
            let options = json_of(q, "options", json!([]));
            let picked = value.trim().parse::<i64>().ok().and_then(|i| {
                options
                    .as_array()
                    .and_then(|a| py_index(a.len(), i).map(|i| &a[i]))
            });
            picked.map_or_else(|| value.to_owned(), py_str)
        }
        Some("tf") => if value.to_lowercase() == "true" {
            "Benar"
        } else {
            "Salah"
        }
        .to_owned(),
        _ => value.to_owned(),
    }
}

fn public_question(q: &Row) -> Map<String, Value> {
    let options = match q.get("options") {
        Some(Value::Null) | None => Value::Null,
        Some(_) => json_of(q, "options", json!([])),
    };
    let mut out = Map::new();
    out.insert("id".into(), q.get("id").cloned().unwrap_or(Value::Null));
    for key in ["qtype", "question"] {
        out.insert(key.into(), q.get(key).cloned().unwrap_or(Value::Null));
    }
    out.insert("options".into(), options);
    for key in ["topic", "source", "position"] {
        out.insert(key.into(), q.get(key).cloned().unwrap_or(Value::Null));
    }
    out
}

pub async fn questions_by_ids(app: &App, ids: &[i64]) -> Result<Vec<Row>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows = app
        .db
        .rows(
            "SELECT * FROM questions WHERE id = ANY($1)",
            args![ids.to_vec()],
        )
        .await?;
    let mut by_id: std::collections::HashMap<i64, Row> = rows
        .into_iter()
        .filter_map(|r| Some((i64_of(&r, "id")?, r)))
        .collect();
    Ok(ids.iter().filter_map(|id| by_id.remove(id)).collect())
}

/// Grade without the AI (`_grade_basic`): `Some(verdict)` or `None` when the AI should decide.
fn grade_basic(q: &Row, given: Option<&str>) -> Option<bool> {
    let given = given.filter(|g| !g.trim().is_empty());
    let Some(given) = given else {
        return Some(false);
    };
    let answer = str_of(q, "answer").unwrap_or("");
    match str_of(q, "qtype") {
        Some("mcq" | "tf") => Some(given.trim().to_lowercase() == answer.to_lowercase()),
        _ => grading::grade_short_local(given, answer, &string_list(q, "keywords")),
    }
}

fn reveal(q: &Row, a: Option<&Row>) -> Map<String, Value> {
    let correct = match a {
        None => Value::Null,
        Some(a) => match a.get("correct").and_then(Value::as_i64) {
            None => Value::Null,
            Some(c) => json!(c != 0),
        },
    };
    let mut out = Map::new();
    out.insert(
        "answer".into(),
        q.get("answer").cloned().unwrap_or(Value::Null),
    );
    out.insert(
        "answer_text".into(),
        json!(answer_text(q, str_of(q, "answer"))),
    );
    out.insert(
        "explanation".into(),
        q.get("explanation").cloned().unwrap_or(Value::Null),
    );
    out.insert(
        "deep_explanation".into(),
        q.get("deep_explanation").cloned().unwrap_or(Value::Null),
    );
    out.insert("correct".into(), correct);
    out.insert(
        "feedback".into(),
        a.and_then(|a| a.get("feedback").cloned())
            .unwrap_or(Value::Null),
    );
    if str_of(q, "qtype") == Some("mcq")
        && let Some(given) = a.and_then(|a| str_of(a, "given")).filter(|g| !g.is_empty())
    {
        out.insert("given_text".into(), json!(answer_text(q, Some(given))));
    }
    out
}

// ---------------------------------------------------------------- attempts
async fn new_attempt(
    app: &App,
    quiz_id: Option<i64>,
    mode: &str,
    qids: &[i64],
    time_limit: Option<i64>,
) -> HResult {
    let id = app
        .db
        .insert_id(
            "INSERT INTO attempts(quiz_id, mode, question_ids, time_limit, started_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            args![quiz_id, mode, json!(qids), time_limit, now()],
        )
        .await?;
    get_attempt(app, &json!({"attempt_id": id})).await
}

pub async fn start_attempt(app: &App, p: &Value) -> HResult {
    let quiz_id = need_int(p, "quiz_id", None, None)?;
    if app
        .db
        .row("SELECT id FROM quizzes WHERE id = $1", args![quiz_id])
        .await?
        .is_none()
    {
        return Err(AppError::user("Kuis tidak ditemukan."));
    }
    let mode = if p.get("mode").and_then(Value::as_str) == Some("exam") {
        "exam"
    } else {
        "practice"
    };
    let mut qids: Vec<i64> = app
        .db
        .rows(
            "SELECT id FROM questions WHERE quiz_id = $1 ORDER BY position",
            args![quiz_id],
        )
        .await?
        .iter()
        .filter_map(|r| i64_of(r, "id"))
        .collect();
    if qids.is_empty() {
        return Err(AppError::user("Kuis ini belum memiliki soal."));
    }
    if truthy(p.get("shuffle")) {
        shuffle(&mut qids);
    }
    let limit = (mode == "exam").then(|| {
        let minutes = if truthy(p.get("time_limit_min")) {
            need_int(p, "time_limit_min", Some(1), Some(240))
        } else {
            Ok(i64::max(1, qids.len() as i64))
        };
        minutes.map(|m| m * 60)
    });
    let limit = limit.transpose()?;
    new_attempt(app, Some(quiz_id), mode, &qids, limit).await
}

pub async fn start_review(app: &App, p: &Value) -> HResult {
    let count = if truthy(p.get("count")) {
        need_int(p, "count", Some(1), Some(40))?
    } else {
        10
    };
    let mut qids =
        stats_queries::weak_question_ids(app, opt_int(p, "subject_id")?, Some(count)).await?;
    if qids.is_empty() {
        return Err(AppError::user(
            "Belum ada soal lemah. Kerjakan kuis dulu, soal yang salah akan masuk ke sini.",
        ));
    }
    shuffle(&mut qids);
    new_attempt(app, None, "review", &qids, None).await
}

async fn attempt_row(app: &App, id: i64) -> Result<Row, AppError> {
    app.db
        .row("SELECT * FROM attempts WHERE id = $1", args![id])
        .await?
        .ok_or_else(|| AppError::user("Percobaan kuis tidak ditemukan."))
}

fn question_ids_of(attempt: &Row) -> Vec<i64> {
    json_of(attempt, "question_ids", json!([]))
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default()
}

pub async fn get_attempt(app: &App, p: &Value) -> HResult {
    let attempt_id = need_int(p, "attempt_id", None, None)?;
    let t = attempt_row(app, attempt_id).await?;
    let questions = questions_by_ids(app, &question_ids_of(&t)).await?;
    let answers: std::collections::HashMap<i64, Row> = app
        .db
        .rows(
            "SELECT * FROM answers WHERE attempt_id = $1",
            args![attempt_id],
        )
        .await?
        .into_iter()
        .filter_map(|a| Some((i64_of(&a, "question_id")?, a)))
        .collect();
    let finished = t.get("finished_at").is_some_and(|v| !v.is_null());
    let exam = str_of(&t, "mode") == Some("exam");

    let items: Vec<Value> = questions
        .iter()
        .map(|q| {
            let mut item = public_question(q);
            let a = i64_of(q, "id").and_then(|id| answers.get(&id));
            if let Some(a) = a {
                item.insert(
                    "given".into(),
                    a.get("given").cloned().unwrap_or(Value::Null),
                );
            }
            if finished || (!exam && a.is_some()) {
                item.extend(reveal(q, a));
                item.insert("revealed".into(), json!(true));
            }
            Value::Object(item)
        })
        .collect();

    let mut title = "Ulangi soal lemah".to_owned();
    if let Some(quiz_id) = i64_of(&t, "quiz_id") {
        let quiz = app
            .db
            .row(
                "SELECT title, document_id FROM quizzes WHERE id = $1",
                args![quiz_id],
            )
            .await?;
        title = quiz
            .and_then(|z| str_of(&z, "title").map(str::to_owned))
            .unwrap_or_else(|| "Kuis".to_owned());
    }
    let mut attempt = Map::new();
    for key in [
        "id",
        "quiz_id",
        "mode",
        "time_limit",
        "started_at",
        "finished_at",
        "score",
        "total",
        "duration",
        "grading",
        "grading_job",
    ] {
        attempt.insert(key.into(), t.get(key).cloned().unwrap_or(Value::Null));
    }
    attempt.insert("title".into(), json!(title));
    Ok(json!({"attempt": attempt, "questions": items}))
}

pub async fn check_answer(app: &App, p: &Value) -> HResult {
    let attempt_id = need_int(p, "attempt_id", None, None)?;
    let qid = need_int(p, "question_id", None, None)?;
    let t = app
        .db
        .row("SELECT * FROM attempts WHERE id = $1", args![attempt_id])
        .await?;
    let Some(t) = t.filter(|t| t.get("finished_at").is_none_or(Value::is_null)) else {
        return Err(AppError::user(
            "Percobaan kuis sudah selesai atau tidak ditemukan.",
        ));
    };
    if str_of(&t, "mode") == Some("exam") {
        return Err(AppError::user(
            "Mode ujian tidak menampilkan jawaban sebelum selesai.",
        ));
    }
    if !question_ids_of(&t).contains(&qid) {
        return Err(AppError::user("Soal bukan bagian dari percobaan ini."));
    }
    let q = app
        .db
        .row("SELECT * FROM questions WHERE id = $1", args![qid])
        .await?
        .ok_or_else(|| AppError::user("Soal tidak ditemukan."))?;
    let mut existing = app
        .db
        .row(
            "SELECT * FROM answers WHERE attempt_id = $1 AND question_id = $2",
            args![attempt_id, qid],
        )
        .await?;
    if existing.is_none() {
        let given = head_chars(
            &p.get("given").map_or_else(String::new, |v| {
                if v.is_null() {
                    "None".into()
                } else {
                    py_str(v)
                }
            }),
            500,
        );
        let verdict = grade_basic(&q, Some(&given));
        app.db
            .run(
                "INSERT INTO answers(attempt_id, question_id, given, correct, graded_by, ts) VALUES ($1, $2, $3, $4, $5, $6) \
                 ON CONFLICT (attempt_id, question_id) DO NOTHING",
                args![attempt_id, qid, given, verdict.map(i64::from), if verdict.is_some() { "auto" } else { "pending" }, now()],
            )
            .await?;
        existing = app
            .db
            .row(
                "SELECT * FROM answers WHERE attempt_id = $1 AND question_id = $2",
                args![attempt_id, qid],
            )
            .await?;
    }
    Ok(Value::Object(reveal(&q, existing.as_ref())))
}

async fn recompute(app: &App, attempt_id: i64) -> Result<(), AppError> {
    let score = app
        .db
        .scalar_i64(
            "SELECT COUNT(*) FROM answers WHERE attempt_id = $1 AND correct = 1",
            args![attempt_id],
            0,
        )
        .await?;
    app.db
        .run(
            "UPDATE attempts SET score = $1 WHERE id = $2",
            args![score, attempt_id],
        )
        .await?;
    Ok(())
}

pub async fn finish_attempt(app: &App, p: &Value) -> HResult {
    let attempt_id = need_int(p, "attempt_id", None, None)?;
    let t = attempt_row(app, attempt_id).await?;
    if t.get("finished_at").is_some_and(|v| !v.is_null()) {
        return get_attempt(app, &json!({"attempt_id": attempt_id})).await;
    }
    let qids = question_ids_of(&t);
    let provided = p.get("answers").and_then(Value::as_object);
    let started_at = t
        .get("started_at")
        .and_then(Value::as_f64)
        .unwrap_or_else(now);

    // One transaction: the legacy code issued these as separate statements, so a crash or a
    // double submit could leave a half-finished attempt (audit A-03).
    let mut tx = app.db.begin().await?;
    let have: std::collections::HashMap<i64, Row> = tx
        .rows(
            "SELECT * FROM answers WHERE attempt_id = $1",
            args![attempt_id],
        )
        .await?
        .into_iter()
        .filter_map(|a| Some((i64_of(&a, "question_id")?, a)))
        .collect();
    let mut answered = 0_i64;
    for q in questions_by_ids(app, &qids).await? {
        let Some(qid) = i64_of(&q, "id") else {
            continue;
        };
        if let Some(existing) = have.get(&qid) {
            if str_of(existing, "given").is_some_and(|g| !g.is_empty()) {
                answered += 1;
            }
            continue;
        }
        let given: Option<String> = provided
            .and_then(|m| m.get(&qid.to_string()))
            .filter(|v| !v.is_null())
            .map(|v| head_chars(&py_str(v), 500));
        if given.as_deref().is_some_and(|g| !g.is_empty()) {
            answered += 1;
        }
        let verdict = grade_basic(&q, given.as_deref());
        let graded_by = if given.as_deref().is_none_or(str::is_empty) {
            "skip"
        } else if verdict.is_some() {
            "auto"
        } else {
            "pending"
        };
        tx.run(
            "INSERT INTO answers(attempt_id, question_id, given, correct, graded_by, ts) VALUES ($1, $2, $3, $4, $5, $6)",
            args![attempt_id, qid, given, verdict.map(i64::from), graded_by, now()],
        )
        .await?;
    }

    let finished = now();
    let elapsed = finished - started_at;
    let claimed = p
        .get("duration")
        .filter(|v| truthy(Some(v)))
        .and_then(crate::params::py_int)
        .map_or(0, |c| c.max(0));
    let base = if claimed != 0 {
        claimed as f64
    } else {
        elapsed
    };
    let duration = base.min(elapsed + 2.0).min(6.0 * 3600.0) as i64;
    let uncertain = tx
        .scalar_i64(
            "SELECT COUNT(*) FROM answers WHERE attempt_id = $1 AND correct IS NULL AND given <> ''",
            args![attempt_id],
            0,
        )
        .await?;
    tx.run(
        "UPDATE attempts SET finished_at = $1, total = $2, duration = $3, grading = $4 WHERE id = $5",
        args![finished, qids.len(), duration, if uncertain > 0 { "pending" } else { "done" }, attempt_id],
    )
    .await?;
    tx.run(
        "UPDATE answers SET correct = 0, graded_by = 'skip' WHERE attempt_id = $1 AND correct IS NULL AND (given IS NULL OR given = '')",
        args![attempt_id],
    )
    .await?;
    let score = tx
        .scalar_i64(
            "SELECT COUNT(*) FROM answers WHERE attempt_id = $1 AND correct = 1",
            args![attempt_id],
            0,
        )
        .await?;
    tx.run(
        "UPDATE attempts SET score = $1 WHERE id = $2",
        args![score, attempt_id],
    )
    .await?;
    tx.commit().await?;

    if uncertain > 0 {
        let app2 = app.clone();
        let job_id = jobs::start(app, "grade_attempt", Some(attempt_id), move |ctx| {
            let app = app2.clone();
            async move { pipeline::grade_attempt_job(&app, ctx, attempt_id).await }
        })
        .await?;
        app.db
            .run(
                "UPDATE attempts SET grading_job = $1 WHERE id = $2",
                args![job_id, attempt_id],
            )
            .await?;
    }

    let doc_id = match i64_of(&t, "quiz_id") {
        Some(quiz_id) => app
            .db
            .row(
                "SELECT document_id FROM quizzes WHERE id = $1",
                args![quiz_id],
            )
            .await?
            .and_then(|z| i64_of(&z, "document_id")),
        None => None,
    };
    let counts_for_streak = answered >= i64::min(3, qids.len() as i64);
    stats_queries::log_event(
        app,
        "quiz",
        doc_id,
        i64::min(duration, 3600),
        i64::from(counts_for_streak),
    )
    .await?;
    get_attempt(app, &json!({"attempt_id": attempt_id})).await
}

pub async fn recompute_score(app: &App, attempt_id: i64) -> Result<(), AppError> {
    recompute(app, attempt_id).await
}
