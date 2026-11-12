//! Save-to-Track REST API endpoints (Milestone 2 - R2).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, patch};
use axum::{Json, Router};
use stuby_storage::{Row, TrackingStatus};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;
use crate::routes::auth_extract::AuthUser;
use crate::state::ApiState;

pub fn router() -> Router<ApiState> {
    Router::new()
        .route("/", get(list_tracked).post(create_tracked))
        .route(
            "/{id}",
            patch(update_tracked_status).delete(delete_tracked),
        )
}

#[derive(Debug, Deserialize)]
pub struct ListTrackedQuery {
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTrackedRequest {
    pub opportunity_id: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackedStatusRequest {
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpportunitySummaryDto {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub category: String,
    pub organizer: String,
    pub deadline: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward: Option<String>,
    pub target_majors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guideline_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guideline_text: Option<String>,
    pub is_published: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedOpportunityDto {
    pub id: i64,
    pub user_id: String,
    pub opportunity_id: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
    pub applied_at: Option<f64>,
    pub completed_at: Option<f64>,
    pub countdown_seconds: f64,
    pub is_overdue: bool,
    pub remind: bool,
    pub opportunity: Option<OpportunitySummaryDto>,
}

#[derive(Serialize)]
pub struct TrackedListResponse {
    pub tracked: Vec<TrackedOpportunityDto>,
}

#[derive(Serialize)]
pub struct TrackedItemResponse {
    pub tracked: TrackedOpportunityDto,
}

#[derive(Serialize)]
pub struct DeleteResponse {
    pub ok: bool,
}

fn map_tracked_dto(row: &Row, now: f64, fallback_user_id: &str) -> TrackedOpportunityDto {
    let target_majors = match row.get("opp_target_majors") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    };

    let deadline = row.get("opp_deadline").and_then(Value::as_f64).unwrap_or_default();
    let status = row
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("Saved")
        .to_owned();
    let countdown_seconds = deadline - now;
    let is_overdue = now > deadline;
    let remind = status == "Saved" && !is_overdue;

    let user_id = row
        .get("user_label")
        .or_else(|| row.get("user_uuid"))
        .or_else(|| row.get("user_id"))
        .and_then(Value::as_str)
        .unwrap_or(fallback_user_id)
        .to_owned();

    let opp = if row.get("opp_title").is_some() {
        Some(OpportunitySummaryDto {
            id: row
                .get("opp_id")
                .or_else(|| row.get("opportunity_id"))
                .and_then(Value::as_i64)
                .unwrap_or_default(),
            title: row
                .get("opp_title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            description: row
                .get("opp_desc")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            category: row
                .get("opp_category")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            organizer: row
                .get("opp_organizer")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            deadline,
            reward: row.get("opp_reward").and_then(Value::as_str).map(str::to_owned),
            target_majors,
            website_url: row.get("opp_website_url").and_then(Value::as_str).map(str::to_owned),
            guideline_url: row.get("opp_guideline_url").and_then(Value::as_str).map(str::to_owned),
            guideline_text: row.get("opp_guideline_text").and_then(Value::as_str).map(str::to_owned),
            is_published: row
                .get("opp_is_published")
                .and_then(Value::as_i64)
                .unwrap_or(1) as i32,
            created_at: row.get("opp_created_at").and_then(Value::as_f64),
            updated_at: row.get("opp_updated_at").and_then(Value::as_f64),
        })
    } else {
        None
    };

    TrackedOpportunityDto {
        id: row.get("id").and_then(Value::as_i64).unwrap_or_default(),
        user_id,
        opportunity_id: row.get("opportunity_id").and_then(Value::as_i64).unwrap_or_default(),
        status,
        notes: row.get("notes").and_then(Value::as_str).map(str::to_owned),
        created_at: row.get("created_at").and_then(Value::as_f64).unwrap_or_default(),
        updated_at: row.get("updated_at").and_then(Value::as_f64).unwrap_or_default(),
        applied_at: row.get("applied_at").and_then(Value::as_f64),
        completed_at: row.get("completed_at").and_then(Value::as_f64),
        countdown_seconds,
        is_overdue,
        remind,
        opportunity: opp,
    }
}

/// GET /api/v1/tracked-opportunities?status=
pub async fn list_tracked(
    State(state): State<ApiState>,
    auth: AuthUser,
    Query(query): Query<ListTrackedQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let now = stuby_application::util::now();
    let status_filter = query.status.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let normalized_status = status_filter.and_then(TrackingStatus::parse).map(|s| s.as_str());

    let rows = state
        .app
        .db
        .rows(
            "SELECT \
                t.id, t.user_id::text AS user_uuid, u.label AS user_label, t.opportunity_id, t.status, t.notes, \
                t.created_at, t.updated_at, t.applied_at, t.completed_at, \
                o.id AS opp_id, o.title AS opp_title, o.description AS opp_desc, o.category AS opp_category, \
                o.organizer AS opp_organizer, o.deadline AS opp_deadline, o.reward AS opp_reward, \
                o.target_majors AS opp_target_majors, o.website_url AS opp_website_url, \
                o.guideline_url AS opp_guideline_url, o.guideline_text AS opp_guideline_text, \
                o.is_published AS opp_is_published, o.created_at AS opp_created_at, o.updated_at AS opp_updated_at \
             FROM tracked_opportunities t \
             JOIN opportunities o ON o.id = t.opportunity_id \
             LEFT JOIN app_users u ON u.id = t.user_id \
             WHERE t.user_id = $1::uuid \
               AND ($2::text IS NULL OR t.status = $2::text) \
             ORDER BY \
                CASE WHEN t.status = 'Saved' THEN 1 WHEN t.status = 'Applied' THEN 2 ELSE 3 END, \
                o.deadline ASC",
            stuby_storage::args![auth.user_id.to_string(), normalized_status],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let items: Vec<TrackedOpportunityDto> = rows
        .into_iter()
        .map(|r| map_tracked_dto(&r, now, &auth.user_id_str))
        .collect();

    Ok(Json(TrackedListResponse { tracked: items }))
}

/// POST /api/v1/tracked-opportunities
pub async fn create_tracked(
    State(state): State<ApiState>,
    auth: AuthUser,
    Json(body): Json<CreateTrackedRequest>,
) -> Result<(StatusCode, Json<TrackedItemResponse>), ApiError> {
    let now = stuby_application::util::now();

    // 1. Verify opportunity exists and is published (or admin)
    let opp = state
        .app
        .db
        .get_opportunity(body.opportunity_id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Peluang yang ingin dilacak tidak ditemukan.",
            )
        })?;

    if opp.is_published == 0 && !auth.is_admin {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "Peluang yang ingin dilacak tidak ditemukan.",
        ));
    }

    // 2. Check duplicate tracking -> 409 Conflict
    let existing = state
        .app
        .db
        .row(
            "SELECT id FROM tracked_opportunities WHERE user_id = $1::uuid AND opportunity_id = $2",
            stuby_storage::args![auth.user_id.to_string(), body.opportunity_id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    if existing.is_some() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "already_tracked",
            "Peluang ini sudah disimpan di pelacak.",
        ));
    }

    // 3. Insert new tracked item with status 'Saved'
    let inserted_id = state
        .app
        .db
        .insert_id(
            "INSERT INTO tracked_opportunities ( \
                user_id, opportunity_id, status, notes, created_at, updated_at \
             ) VALUES ($1::uuid, $2, 'Saved', $3, $4, $4) RETURNING id",
            stuby_storage::args![
                auth.user_id.to_string(),
                body.opportunity_id,
                body.notes.as_deref(),
                now
            ],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let row = state
        .app
        .db
        .row(
            "SELECT \
                t.id, t.user_id::text AS user_uuid, u.label AS user_label, t.opportunity_id, t.status, t.notes, \
                t.created_at, t.updated_at, t.applied_at, t.completed_at, \
                o.id AS opp_id, o.title AS opp_title, o.description AS opp_desc, o.category AS opp_category, \
                o.organizer AS opp_organizer, o.deadline AS opp_deadline, o.reward AS opp_reward, \
                o.target_majors AS opp_target_majors, o.website_url AS opp_website_url, \
                o.guideline_url AS opp_guideline_url, o.guideline_text AS opp_guideline_text, \
                o.is_published AS opp_is_published, o.created_at AS opp_created_at, o.updated_at AS opp_updated_at \
             FROM tracked_opportunities t \
             JOIN opportunities o ON o.id = t.opportunity_id \
             LEFT JOIN app_users u ON u.id = t.user_id \
             WHERE t.id = $1",
            stuby_storage::args![inserted_id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Gagal memuat item pelacak.",
            )
        })?;

    let dto = map_tracked_dto(&row, now, &auth.user_id_str);
    Ok((StatusCode::CREATED, Json(TrackedItemResponse { tracked: dto })))
}

/// PATCH /api/v1/tracked-opportunities/{id}
pub async fn update_tracked_status(
    State(state): State<ApiState>,
    auth: AuthUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateTrackedStatusRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // 1. Validate status string
    let new_status = TrackingStatus::parse(&body.status).ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_status",
            format!("Status tidak valid: {}", body.status),
        )
    })?;

    // 2. Fetch existing item to distinguish 404 vs 403
    let existing = state
        .app
        .db
        .row(
            "SELECT id, user_id::text AS owner_uuid, status, notes, applied_at, completed_at \
             FROM tracked_opportunities WHERE id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Item pelacak tidak ditemukan.",
            )
        })?;

    let owner_uuid = existing
        .get("owner_uuid")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if owner_uuid != auth.user_id.to_string() && !auth.is_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Tidak dapat mengubah pelacak milik pengguna lain.",
        ));
    }

    let current_status = existing
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("Saved");
    if current_status == "Done" && new_status == TrackingStatus::Saved {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_transition",
            "Item yang sudah Done tidak dapat dikembalikan ke Saved.",
        ));
    }

    // 3. Compute updated timestamps
    let now = stuby_application::util::now();
    let current_applied = existing.get("applied_at").and_then(|v| v.as_f64());
    let current_completed = existing.get("completed_at").and_then(|v| v.as_f64());

    let updated_applied = if new_status == TrackingStatus::Applied && current_applied.is_none() {
        Some(now)
    } else {
        current_applied
    };

    let updated_completed = if new_status == TrackingStatus::Done && current_completed.is_none() {
        Some(now)
    } else {
        current_completed
    };

    state
        .app
        .db
        .run(
            "UPDATE tracked_opportunities SET \
                status = $2, \
                notes = COALESCE($3, notes), \
                applied_at = $4, \
                completed_at = $5, \
                updated_at = $6 \
             WHERE id = $1",
            stuby_storage::args![
                id,
                new_status.as_str(),
                body.notes.as_deref(),
                updated_applied,
                updated_completed,
                now
            ],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let row = state
        .app
        .db
        .row(
            "SELECT \
                t.id, t.user_id::text AS user_uuid, u.label AS user_label, t.opportunity_id, t.status, t.notes, \
                t.created_at, t.updated_at, t.applied_at, t.completed_at, \
                o.id AS opp_id, o.title AS opp_title, o.description AS opp_desc, o.category AS opp_category, \
                o.organizer AS opp_organizer, o.deadline AS opp_deadline, o.reward AS opp_reward, \
                o.target_majors AS opp_target_majors, o.website_url AS opp_website_url, \
                o.guideline_url AS opp_guideline_url, o.guideline_text AS opp_guideline_text, \
                o.is_published AS opp_is_published, o.created_at AS opp_created_at, o.updated_at AS opp_updated_at \
             FROM tracked_opportunities t \
             JOIN opportunities o ON o.id = t.opportunity_id \
             LEFT JOIN app_users u ON u.id = t.user_id \
             WHERE t.id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Item pelacak tidak ditemukan.",
            )
        })?;

    let dto = map_tracked_dto(&row, now, &auth.user_id_str);
    Ok(Json(TrackedItemResponse { tracked: dto }))
}

/// DELETE /api/v1/tracked-opportunities/{id}
pub async fn delete_tracked(
    State(state): State<ApiState>,
    auth: AuthUser,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let existing = state
        .app
        .db
        .row(
            "SELECT user_id::text AS owner_uuid FROM tracked_opportunities WHERE id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Item pelacak tidak ditemukan.",
            )
        })?;

    let owner_uuid = existing
        .get("owner_uuid")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if owner_uuid != auth.user_id.to_string() && !auth.is_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Tidak dapat menghapus pelacak pengguna lain.",
        ));
    }

    state
        .app
        .db
        .run(
            "DELETE FROM tracked_opportunities WHERE id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    Ok(Json(DeleteResponse { ok: true }))
}
