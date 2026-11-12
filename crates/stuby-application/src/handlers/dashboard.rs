//! Home and progress pages. Each page needs a dozen independent reads; they run concurrently
//! (`try_join!`) because with a remote database the page time is the *longest* round trip, not the
//! sum of all of them.

use stuby_storage::args;
use serde_json::{Value, json};

use crate::app::App;
use crate::error::{AppError, HResult};
use crate::{settings, stats_queries as sq};

/// The home page data. `{"streak_only": true}` returns just the streak: the sidebar refreshes it
/// on every navigation and must not pay for the whole page each time.
pub async fn dashboard(app: &App, p: &Value) -> HResult {
    if p.get("streak_only").and_then(Value::as_bool) == Some(true) {
        return Ok(json!({ "streak": sq::streak_info(app).await? }));
    }
    let recent_docs = async {
        Ok::<_, AppError>(app
            .db
            .rows(
                "SELECT d.id, d.title, d.status, d.page_count, d.updated_at, s.name AS subject_name, s.color AS subject_color \
                 FROM documents d LEFT JOIN subjects s ON s.id = d.subject_id \
                 ORDER BY d.updated_at DESC LIMIT 6",
                args![],
            )
            .await?)
    };
    let (recent_docs, topics, mut recent_attempts, daily, overall, weak_ids) = tokio::try_join!(
        recent_docs,
        sq::topic_stats(app),
        sq::score_trend(app, 5),
        sq::daily(app),
        sq::overall(app),
        sq::weak_question_ids(app, None, None),
    )?;
    let weak_topics: Vec<&Value> = topics
        .iter()
        .filter(|t| t["level"] == "weak")
        .take(4)
        .collect();
    recent_attempts.reverse(); // legacy: list(reversed(score_trend(5)))
    Ok(json!({
        "streak": daily.streak_info(),
        "heatmap": daily.heatmap(140),
        "weekly": daily.weekly(),
        "overall": overall,
        "recent_docs": recent_docs,
        "recent_attempts": recent_attempts,
        "weak_topics": weak_topics,
        "weak_count": weak_ids.len(),
    }))
}

pub async fn progress(app: &App) -> HResult {
    let (overall, daily, trend, topics, documents, weak_ids, settings) = tokio::try_join!(
        sq::overall(app),
        sq::daily(app),
        sq::score_trend(app, 30),
        sq::topic_stats(app),
        sq::document_stats(app),
        sq::weak_question_ids(app, None, None),
        settings::all(&app.db),
    )?;
    Ok(json!({
        "overall": overall,
        "streak": daily.streak_info(),
        "weekly": daily.weekly(),
        "trend": trend,
        "topics": topics,
        "documents": documents,
        "study_days": daily.study_days(14),
        "weak_count": weak_ids.len(),
        "settings": settings,
    }))
}
