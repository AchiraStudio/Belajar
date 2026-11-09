//! The game hub (`play_hub`): which modes exist, the player's level, today's quests, weak concepts
//! and the run that can be resumed. Everything here is read from the database; the actual game
//! turns (`play_turn` ...) need the model and are not ported yet, so starting a game still answers
//! "AI not configured" while the hub itself loads.

use belajar_core::mastery::{MasteryLevel, mastery_level};
use belajar_core::numeric::py_round;
use belajar_storage::{Row, args};
use serde_json::{Value, json};

use super::cards::card_counts;
use super::concepts::concept_rows;
use crate::app::App;
use crate::error::{AppError, HResult};
use crate::rowx::{f64_of, i64_of, json_of, str_of};
use crate::{profile, stats_queries as sq};

/// One game mode (`play_games.MODES`).
struct Mode {
    key: &'static str,
    title: &'static str,
    kind: &'static str,
    /// Turns: default, minimum, maximum.
    turns: (i64, i64, i64),
    hints: bool,
    desc: &'static str,
}

const MODES: [Mode; 6] = [
    Mode {
        key: "ajari",
        title: "Ajari Aku",
        kind: "explain",
        turns: (6, 3, 10),
        hints: true,
        desc: "Jelaskan konsep dengan kata-katamu kepada murid yang kritis.",
    },
    Mode {
        key: "detektif",
        title: "Detektif Salah Kaprah",
        kind: "explain",
        turns: (4, 2, 8),
        hints: true,
        desc: "Temukan kalimat yang keliru di dalam penjelasan yang tampak meyakinkan.",
    },
    Mode {
        key: "petualangan",
        title: "Petualangan",
        kind: "apply",
        turns: (8, 4, 12),
        hints: true,
        desc: "Cerita bercabang: tiap rintangan adalah tantangan dari materimu.",
    },
    Mode {
        key: "kasus",
        title: "Kasus Nyata",
        kind: "apply",
        turns: (5, 3, 8),
        hints: true,
        desc: "Terapkan konsep pada situasi dunia nyata tanpa disebut istilahnya.",
    },
    Mode {
        key: "kilat",
        title: "Kilat",
        kind: "recall",
        turns: (10, 5, 20),
        hints: true,
        desc: "Soal cepat 5–10 menit, satu tangan.",
    },
    Mode {
        key: "boss",
        title: "Ujian Boss",
        kind: "boss",
        turns: (8, 6, 12),
        hints: false,
        desc: "Ujian lintas topik tanpa petunjuk dan tanpa umpan balik, ditutup rapor.",
    },
];

fn modes() -> Vec<Value> {
    MODES
        .iter()
        .map(|m| {
            json!({"key": m.key, "title": m.title, "desc": m.desc, "kind": m.kind, "hints": m.hints,
                   "turns": {"default": m.turns.0, "min": m.turns.1, "max": m.turns.2}})
        })
        .collect()
}

fn mode_title(game: &str) -> &str {
    MODES
        .iter()
        .find(|m| m.key == game)
        .map_or(game, |m| m.title)
}

fn kinds_of(row: &Row) -> Vec<String> {
    match json_of(row, "kinds", json!([])) {
        Value::Array(items) => items
            .into_iter()
            .filter_map(|k| k.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

/// Concept counts per mastery level (`_levels`).
fn levels(rows: &[Row]) -> Value {
    let mut counts = [0i64; 4];
    for r in rows {
        let level = mastery_level(
            f64_of(r, "score").unwrap_or(0.0),
            i64_of(r, "evidence_n").unwrap_or(0),
            &kinds_of(r),
        );
        counts[match level {
            MasteryLevel::Baru => 0,
            MasteryLevel::Dikenal => 1,
            MasteryLevel::Paham => 2,
            MasteryLevel::Kuasai => 3,
        }] += 1;
    }
    json!({"baru": counts[0], "dikenal": counts[1], "paham": counts[2], "kuasai": counts[3]})
}

/// Up to six concepts to revisit: due for a card review, or practised and still below 50.
/// Due ones first, then the lowest score (stable, like the legacy sort).
fn weak_concepts(rows: &[Row], due: &[(i64, String)]) -> Vec<Value> {
    let is_due = |r: &Row| {
        let doc = i64_of(r, "document_id").unwrap_or(0);
        let term = str_of(r, "term").unwrap_or("");
        due.iter().any(|(d, t)| *d == doc && t == term)
    };
    let score = |r: &Row| f64_of(r, "score").unwrap_or(0.0);
    let mut weak: Vec<&Row> = rows
        .iter()
        .filter(|r| (i64_of(r, "evidence_n").unwrap_or(0) > 0 && score(r) < 50.0) || is_due(r))
        .collect();
    weak.sort_by(|a, b| {
        (!is_due(a))
            .cmp(&!is_due(b))
            .then(score(a).total_cmp(&score(b)))
    });
    weak.into_iter()
        .take(6)
        .map(|r| {
            json!({"id": r.get("id"), "term": r.get("term"), "doc_title": r.get("doc_title"),
                   "score": py_round(score(r))})
        })
        .collect()
}

pub async fn play_hub(app: &App) -> HResult {
    let today = sq::today(app).to_string();
    let db = &app.db;
    // Everything that does not depend on the document list, concurrently.
    let (ready, subjects, due, counts, daily, level, quests, achievements, active) = tokio::try_join!(
        async {
            Ok::<_, AppError>(
                db.rows(
                    "SELECT d.id, d.title, d.subject_id, s.name AS subject                      FROM documents d LEFT JOIN subjects s ON s.id = d.subject_id                      WHERE d.status = 'ready' ORDER BY d.title",
                    args![],
                )
                .await?,
            )
        },
        async {
            Ok::<_, AppError>(
                db.rows("SELECT id, name FROM subjects ORDER BY name", args![])
                    .await?,
            )
        },
        async {
            Ok::<_, AppError>(
                db.rows(
                    "SELECT document_id, front FROM cards WHERE due_day <= $1",
                    args![today.clone()],
                )
                .await?,
            )
        },
        card_counts(app),
        sq::daily(app),
        profile::level(app),
        profile::daily_quests(app),
        profile::achievements_list(app),
        active_run(app),
    )?;

    let ids: Vec<i64> = ready.iter().filter_map(|d| i64_of(d, "id")).collect();
    // Seeds missing concepts first (as the legacy `seed_all()` did), so the per-document count below
    // is right even on the very first visit.
    let rows = concept_rows(app, &ids).await?;
    let mut ready = ready;
    for doc in &mut ready {
        let id = i64_of(doc, "id");
        let n = rows
            .iter()
            .filter(|r| i64_of(r, "document_id") == id)
            .count();
        doc.insert("concepts".to_owned(), json!(n));
    }
    let due: Vec<(i64, String)> = due
        .iter()
        .filter_map(|r| Some((i64_of(r, "document_id")?, str_of(r, "front")?.to_owned())))
        .collect();

    Ok(json!({
        "profile": level,
        "streak": daily.streak_info(),
        "quests": quests,
        "modes": modes(),
        "documents": ready,
        "subjects": subjects,
        "levels": levels(&rows),
        "weak": weak_concepts(&rows, &due),
        "cards": counts,
        "active": active,
        "achievements": achievements,
    }))
}

/// The newest unfinished run, shaped like the legacy `run_public`. (The legacy hub also closed
/// runs untouched for 6 hours first; that needs the reward logic of the game engine and arrives
/// with it. No new runs can start until then, so nothing goes stale in the meantime.)
async fn active_run(app: &App) -> Result<Value, AppError> {
    let Some(run) = app
        .db
        .row(
            "SELECT r.id, r.game, r.scope_kind, r.scope_id, r.status, r.turn_count, r.max_turns, \
                    r.correct, r.total, r.xp, r.state, r.options, r.started_at, \
                    CASE r.scope_kind \
                      WHEN 'document' THEN COALESCE((SELECT title FROM documents WHERE id = r.scope_id), '') \
                      WHEN 'subject' THEN COALESCE((SELECT name FROM subjects WHERE id = r.scope_id), '') \
                      ELSE 'Semua materi' END AS scope_title \
             FROM game_runs r WHERE r.status = 'active' ORDER BY r.updated_at DESC LIMIT 1",
            args![],
        )
        .await?
    else {
        return Ok(Value::Null);
    };
    let game = str_of(&run, "game").unwrap_or("").to_owned();
    Ok(json!({
        "id": run.get("id"), "game": game, "title": mode_title(&game),
        "scope_kind": run.get("scope_kind"), "scope_id": run.get("scope_id"),
        "scope_title": run.get("scope_title"), "status": run.get("status"),
        "turn_count": run.get("turn_count"), "max_turns": run.get("max_turns"),
        "correct": run.get("correct"), "total": run.get("total"), "xp": run.get("xp"),
        "state": json_of(&run, "state", json!({})), "options": json_of(&run, "options", json!({})),
        "started_at": run.get("started_at"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn concept(id: i64, score: f64, evidence: i64) -> Row {
        let mut r = Row::new();
        r.insert("id".into(), json!(id));
        r.insert("document_id".into(), json!(1));
        r.insert("term".into(), json!(format!("t{id}")));
        r.insert("doc_title".into(), json!("Doc"));
        r.insert("score".into(), json!(score));
        r.insert("evidence_n".into(), json!(evidence));
        r
    }

    #[test]
    fn six_modes_with_legacy_turn_ranges() {
        let m = modes();
        assert_eq!(m.len(), 6);
        assert_eq!(m[0]["key"], "ajari");
        assert_eq!(m[5]["hints"], json!(false));
        assert_eq!(m[4]["turns"], json!({"default": 10, "min": 5, "max": 20}));
    }

    #[test]
    fn weak_lists_due_first_then_lowest_score() {
        let rows = vec![
            concept(1, 40.0, 2), // practised and weak
            concept(2, 90.0, 5), // fine, not due
            concept(3, 80.0, 1), // fine score, but its card is due
            concept(4, 10.0, 0), // never practised: not weak by score
            concept(5, 20.0, 3), // practised and weaker
        ];
        let due = vec![(1, "t3".to_owned())];
        let order: Vec<i64> = weak_concepts(&rows, &due)
            .iter()
            .filter_map(|w| w["id"].as_i64())
            .collect();
        assert_eq!(order, [3, 5, 1]);
    }

    #[test]
    fn levels_count_every_concept_once() {
        let rows = vec![concept(1, 0.0, 0), concept(2, 30.0, 2), concept(3, 60.0, 2)];
        assert_eq!(
            levels(&rows),
            json!({"baru": 1, "dikenal": 1, "paham": 1, "kuasai": 0})
        );
    }
}
