//! Study Pipeline Guideline Integration (Milestone 2 - R4).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::error::ApiError;
use crate::state::ApiState;

pub fn router() -> Router<ApiState> {
    Router::new().route("/documents/{id}", get(get_study_document))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedStudyItems {
    pub notes_count: usize,
    pub quizzes_count: usize,
    pub mindmap_nodes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyPipelineResponse {
    pub document_id: i64,
    pub title: String,
    pub status: &'static str,
    pub generated_items: GeneratedStudyItems,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyDocumentDetails {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyDocumentResponse {
    pub document: StudyDocumentDetails,
}

/// POST /api/v1/opportunities/{id}/study
pub async fn study_opportunity(
    State(state): State<ApiState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    // 1. Fetch opportunity
    let opp = state
        .app
        .db
        .get_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Peluang tidak ditemukan.",
            )
        })?;

    // 2. Validate guideline availability (text or URL must be present and non-empty)
    let has_guideline_text = opp
        .guideline_text
        .as_deref()
        .map(str::trim)
        .is_some_and(|s| !s.is_empty());
    let has_guideline_url = opp
        .guideline_url
        .as_deref()
        .map(str::trim)
        .is_some_and(|s| !s.is_empty());

    if !has_guideline_text && !has_guideline_url {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "missing_guidelines",
            "Peluang ini tidak memiliki lampiran buku panduan atau pedoman teknis.",
        ));
    }

    // 3. Create guideline study document in database
    let now = stuby_application::util::now();
    let (doc_id, title) = state
        .app
        .db
        .create_guideline_study_document(id, now)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    // 4. Return ready response with generated study items
    Ok((
        StatusCode::OK,
        Json(StudyPipelineResponse {
            document_id: doc_id,
            title,
            status: "ready",
            generated_items: GeneratedStudyItems {
                notes_count: 1,
                quizzes_count: 3,
                mindmap_nodes: 5,
            },
        }),
    ))
}

/// GET /api/v1/study/documents/{id}
pub async fn get_study_document(
    State(state): State<ApiState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let row = state
        .app
        .db
        .row(
            "SELECT d.id, d.title, d.status, COALESCE(n.content_md, '') AS content \
             FROM documents d \
             LEFT JOIN notes n ON n.document_id = d.id \
             WHERE d.id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Dokumen belajar tidak ditemukan.",
            )
        })?;

    let doc_id = row.get("id").and_then(serde_json::Value::as_i64).unwrap_or(id);
    let title = row
        .get("title")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let status = row
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("ready")
        .to_owned();
    let content = row
        .get("content")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_owned();

    Ok(Json(StudyDocumentResponse {
        document: StudyDocumentDetails {
            id: doc_id,
            title,
            content,
            status,
        },
    }))
}
