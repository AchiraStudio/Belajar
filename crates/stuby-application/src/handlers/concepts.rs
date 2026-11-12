//! Concepts ("istilah"): seeded from a document's `key_concepts`, the basis of mastery and cards.
//! (Legacy `concepts.py`; `concepts_expand` needs the AI layer and is not ported yet.)

use stuby_storage::{Row, args};
use serde_json::{Value, json};

use super::documents::doc_ids;
use crate::app::App;
use crate::error::{AppError, HResult};
use crate::params::{clip, opt_int};
use crate::rowx::json_of;

/// Fill `concepts` from the document's `key_concepts` (no AI). Returns how many are new.
pub async fn ensure_concepts(app: &App, doc_id: i64) -> Result<u64, AppError> {
    let Some(doc) = app
        .db
        .row(
            "SELECT key_concepts, topics FROM documents WHERE id = $1",
            args![doc_id],
        )
        .await?
    else {
        return Ok(0);
    };
    let items = match json_of(&doc, "key_concepts", json!([])) {
        Value::Array(items) => items,
        _ => Vec::new(),
    };
    let topics = match json_of(&doc, "topics", json!([])) {
        Value::Array(topics) => topics,
        _ => Vec::new(),
    };
    // Legacy: `clip(topics[0], 60) if topics else None` (an empty clip stays an empty string).
    let topic = topics.first().map(|t| clip(Some(t), 60));

    let mut terms = Vec::new();
    let mut definitions = Vec::new();
    for item in &items {
        let Some(item) = item.as_object() else {
            continue;
        };
        let term = clip(item.get("term"), 100);
        let definition = clip(item.get("definition"), 400);
        if term.chars().count() < 2 || definition.chars().count() < 3 {
            continue;
        }
        terms.push(term);
        definitions.push(definition);
    }
    if terms.is_empty() {
        return Ok(0);
    }
    if app.db.is_local() {
        // On-device SQLite has no `unnest`, and a local write costs microseconds, so insert one by
        // one inside a single transaction.
        let mut tx = app.db.begin().await?;
        let mut added = 0;
        for (term, definition) in terms.iter().zip(&definitions) {
            added += tx
                .run(
                    "INSERT INTO concepts(document_id, term, definition, topic) VALUES ($1, $2, $3, $4) \
                     ON CONFLICT (document_id, term) DO NOTHING",
                    args![doc_id, term.clone(), definition.clone(), topic.clone()],
                )
                .await?;
        }
        tx.commit().await?;
        return Ok(added);
    }
    // One statement for the whole document (it used to be a transaction plus one INSERT per
    // concept, i.e. dozens of round trips to the remote database). `unnest` keeps the order, so
    // identity ids are assigned exactly as before, and a repeated term is ignored by the conflict.
    Ok(app
        .db
        .run(
            "INSERT INTO concepts(document_id, term, definition, topic) \
             SELECT $1::bigint, x.term, x.definition, $4::text FROM unnest($2::text[], $3::text[]) AS x(term, definition) \
             ON CONFLICT (document_id, term) DO NOTHING",
            args![doc_id, terms, definitions, topic],
        )
        .await?)
}

/// The concepts of the given documents with their titles and mastery (`concept_rows`).
pub async fn concept_rows(app: &App, ids: &[i64]) -> Result<Vec<Row>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    // Independent per-document reads/writes: run them together instead of one round trip each.
    futures_util::future::try_join_all(ids.iter().map(|id| ensure_concepts(app, *id))).await?;
    Ok(app
        .db
        .rows(
            "SELECT c.id, c.document_id, c.term, c.definition, c.topic, d.title AS doc_title, \
                    COALESCE(m.score, 0)::float8 AS score, COALESCE(m.evidence_n, 0)::bigint AS evidence_n, \
                    m.kinds AS kinds, m.last_at AS last_at \
             FROM concepts c JOIN documents d ON d.id = c.document_id \
             LEFT JOIN mastery m ON m.concept_id = c.id \
             WHERE c.document_id = ANY($1) ORDER BY c.id",
            args![ids.to_vec()],
        )
        .await?)
}

/// Terms per document or subject, with their mastery.
pub async fn concepts_list(app: &App, p: &Value) -> HResult {
    let ids = doc_ids(app, opt_int(p, "document_id")?, opt_int(p, "subject_id")?).await?;
    let mut rows = concept_rows(app, &ids).await?;
    for row in &mut rows {
        let kinds = json_of(row, "kinds", json!([]));
        row.insert("kinds".to_owned(), kinds);
    }
    let count = rows.len();
    Ok(json!({"concepts": rows, "count": count}))
}
