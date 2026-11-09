//! The legacy RPC actions. `dispatch` is the single entry point used by the HTTP layer.

use serde_json::Value;

use crate::app::{App, Emit};
use crate::error::{AppError, HResult};
use crate::pipeline::ai_unavailable;

pub mod cards;
pub mod concepts;
pub mod dashboard;
pub mod documents;
pub mod play;
pub mod quizzes;
pub mod system;

/// Every action the unchanged frontend may call (identical to the `ACTIONS` set in the legacy
/// `server/server.js`; a test keeps the two in sync until the Node server is removed).
pub const ACTIONS: [&str; 52] = [
    "ping",
    "llm_check",
    "get_job",
    "get_settings",
    "save_settings",
    "list_subjects",
    "create_subject",
    "delete_subject",
    "list_documents",
    "get_document",
    "update_document",
    "delete_document",
    "reprocess_document",
    "save_note",
    "log_study",
    "mindmap_get",
    "mindmap_generate",
    "mindmap_delete",
    "generate_quiz",
    "list_quizzes",
    "delete_quiz",
    "start_attempt",
    "start_review",
    "get_attempt",
    "check_answer",
    "finish_attempt",
    "explain_question",
    "dashboard",
    "progress",
    "chat_start",
    "chat_get",
    "chat_send",
    "chat_delete",
    "notes_ask",
    "notes_ask_delete",
    "cards_due",
    "cards_review",
    "cards_build",
    "cards_stats",
    "cards_export",
    "concepts_list",
    "concepts_expand",
    "play_hub",
    "play_turn",
    "play_turn_get",
    "play_get",
    "play_finish",
    "play_abandon",
    "play_flag",
    "play_map",
    "play_runs",
    "play_profile",
];

#[must_use]
pub fn is_known(action: &str) -> bool {
    ACTIONS.contains(&action)
}

/// Run one action. `emit` is `Some` for streaming routes and receives `{"stage"|"chunk": ..}` events.
pub async fn dispatch(app: &App, action: &str, p: &Value, emit: Option<Emit>) -> HResult {
    let _ = &emit;
    match action {
        "ping" => system::ping(app, false).await,
        "get_job" => system::get_job(app, p).await,
        "get_settings" => system::get_settings(app).await,
        "save_settings" => system::save_settings(app, p).await,

        "list_subjects" => system::list_subjects(app).await,
        "create_subject" => system::create_subject(app, p).await,
        "delete_subject" => system::delete_subject(app, p).await,

        "list_documents" => documents::list_documents(app, p).await,
        "get_document" => documents::get_document(app, p).await,
        "update_document" => documents::update_document(app, p).await,
        "delete_document" => documents::delete_document(app, p).await,
        "save_note" => documents::save_note(app, p).await,
        "log_study" => documents::log_study(app, p).await,

        "list_quizzes" => quizzes::list_quizzes(app).await,
        "delete_quiz" => quizzes::delete_quiz(app, p).await,
        "start_attempt" => quizzes::start_attempt(app, p).await,
        "start_review" => quizzes::start_review(app, p).await,
        "get_attempt" => quizzes::get_attempt(app, p).await,
        "check_answer" => quizzes::check_answer(app, p).await,
        "finish_attempt" => quizzes::finish_attempt(app, p).await,

        "cards_due" => cards::cards_due(app, p).await,
        "cards_review" => cards::cards_review(app, p).await,
        "cards_build" => cards::cards_build(app, p).await,
        "cards_stats" => cards::cards_stats(app).await,
        "cards_export" => cards::cards_export(app).await,
        "concepts_list" => concepts::concepts_list(app, p).await,

        // The page-sized handlers fan out many queries; box their (large) futures so `dispatch`'s own
        // state machine stays small and cannot overflow a thread stack in debug builds.
        "play_hub" => Box::pin(play::play_hub(app)).await,

        "dashboard" => Box::pin(dashboard::dashboard(app, p)).await,
        "progress" => Box::pin(dashboard::progress(app)).await,

        // Known to the frontend but not ported yet.
        a if is_known(a) => Err(ai_unavailable()),
        other => Err(AppError::UnknownAction(other.to_owned())),
    }
}
