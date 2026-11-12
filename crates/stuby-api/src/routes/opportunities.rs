//! Opportunities REST API endpoints (Milestone 2 - R1 & R4).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use stuby_storage::{CreateOpportunityInput, Opportunity, OpportunityFilter, UpdateOpportunityInput};
use serde::{Deserialize, Serialize};

use crate::error::ApiError;
use crate::routes::auth_extract::OptionalAuthUser;
use crate::routes::study;
use crate::state::ApiState;

pub fn router() -> Router<ApiState> {
    Router::new()
        .route("/", get(list_opportunities).post(create_opportunity))
        .route(
            "/{id}",
            get(get_opportunity)
                .put(update_opportunity)
                .delete(delete_opportunity),
        )
        .route("/{id}/study", axum::routing::post(study::study_opportunity))
}

#[derive(Debug, Deserialize)]
pub struct ListOpportunitiesQuery {
    pub category: Option<String>,
    pub major: Option<String>,
    pub search: Option<String>,
    pub status: Option<String>,
    pub is_published: Option<i32>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct OpportunitiesResponse {
    pub opportunities: Vec<Opportunity>,
}

#[derive(Debug, Serialize)]
pub struct OpportunityResponse {
    pub opportunity: Opportunity,
}

#[derive(Debug, Serialize)]
pub struct DeleteResponse {
    pub ok: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateOpportunityRequest {
    pub title: String,
    pub description: Option<String>,
    pub category: String,
    pub organizer: Option<String>,
    pub deadline: f64,
    pub reward: Option<String>,
    #[serde(default)]
    pub target_majors: Vec<String>,
    pub eligibility: Option<String>,
    pub website_url: Option<String>,
    pub guideline_url: Option<String>,
    pub guideline_text: Option<String>,
    pub is_published: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOpportunityRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub organizer: Option<String>,
    pub deadline: Option<f64>,
    pub reward: Option<String>,
    pub target_majors: Option<Vec<String>>,
    pub eligibility: Option<String>,
    pub website_url: Option<String>,
    pub guideline_url: Option<String>,
    pub guideline_text: Option<String>,
    pub is_published: Option<i32>,
}

pub async fn list_opportunities(
    State(state): State<ApiState>,
    OptionalAuthUser(auth): OptionalAuthUser,
    Query(query): Query<ListOpportunitiesQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let is_admin = auth.as_ref().map(|a| a.is_admin).unwrap_or(false);

    // Non-admin can only see published opportunities
    let is_published = if is_admin {
        query.is_published
    } else {
        Some(1)
    };

    // Category filter validation: non-standard categories return empty array
    if let Some(cat) = &query.category {
        let cat_clean = cat.trim().to_lowercase();
        if cat_clean != "competition" && cat_clean != "scholarship" {
            return Ok(Json(OpportunitiesResponse {
                opportunities: Vec::new(),
            }));
        }
    }

    let filter = OpportunityFilter {
        category: query.category.map(|c| c.trim().to_lowercase()),
        major: query.major.map(|m| m.trim().to_string()).filter(|m| !m.is_empty()),
        search: query.search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        status: query.status.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        is_published,
        now: stuby_application::util::now(),
        limit: query.limit,
        offset: query.offset,
    };

    let opportunities = state
        .app
        .db
        .list_opportunities(&filter)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    Ok(Json(OpportunitiesResponse { opportunities }))
}

pub async fn get_opportunity(
    State(state): State<ApiState>,
    OptionalAuthUser(auth): OptionalAuthUser,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let is_admin = auth.as_ref().map(|a| a.is_admin).unwrap_or(false);

    let opp = state
        .app
        .db
        .get_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(StatusCode::NOT_FOUND, "not_found", "Peluang tidak ditemukan.")
        })?;

    if opp.is_published == 0 && !is_admin {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "Peluang tidak ditemukan.",
        ));
    }

    Ok(Json(OpportunityResponse { opportunity: opp }))
}

pub async fn create_opportunity(
    State(state): State<ApiState>,
    OptionalAuthUser(auth): OptionalAuthUser,
    Json(payload): Json<CreateOpportunityRequest>,
) -> Result<(StatusCode, Json<OpportunityResponse>), ApiError> {
    let is_admin = auth.as_ref().map(|a| a.is_admin).unwrap_or(false);
    if !is_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Hanya administrator yang dapat membuat peluang.",
        ));
    }

    let title = payload.title.trim().to_string();
    let category = payload.category.trim().to_lowercase();
    if title.is_empty()
        || (category != "competition" && category != "scholarship")
        || payload.deadline <= 0.0
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "bad_request",
            "Judul, kategori, dan tenggat waktu wajib diisi.",
        ));
    }

    let target_majors = payload
        .target_majors
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();

    let organizer = payload
        .organizer
        .map(|o| o.trim().to_string())
        .filter(|o| !o.is_empty())
        .unwrap_or_else(|| "Universitas".to_string());

    let now = stuby_application::util::now();
    let input = CreateOpportunityInput {
        title,
        description: payload.description.unwrap_or_default().trim().to_string(),
        category,
        organizer,
        deadline: payload.deadline,
        reward: payload.reward,
        target_majors,
        eligibility: payload.eligibility,
        website_url: payload.website_url,
        guideline_url: payload.guideline_url,
        guideline_text: payload.guideline_text,
        is_published: payload.is_published.or(Some(1)),
    };

    let creator_id = auth.map(|a| a.user_id);
    let new_id = state
        .app
        .db
        .create_opportunity(&input, creator_id, now)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let opp = state
        .app
        .db
        .get_opportunity(new_id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Gagal memuat peluang yang baru dibuat.",
            )
        })?;

    Ok((StatusCode::CREATED, Json(OpportunityResponse { opportunity: opp })))
}

pub async fn update_opportunity(
    State(state): State<ApiState>,
    OptionalAuthUser(auth): OptionalAuthUser,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateOpportunityRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let is_admin = auth.as_ref().map(|a| a.is_admin).unwrap_or(false);
    if !is_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Hanya administrator yang dapat mengubah peluang.",
        ));
    }

    let existing = state
        .app
        .db
        .get_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;
    if existing.is_none() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "Peluang tidak ditemukan.",
        ));
    }

    if let Some(cat) = &payload.category {
        let clean = cat.trim().to_lowercase();
        if clean != "competition" && clean != "scholarship" {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "bad_request",
                "Kategori harus 'competition' atau 'scholarship'.",
            ));
        }
    }

    let target_majors = payload.target_majors.map(|majors| {
        majors
            .into_iter()
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty())
            .collect()
    });

    let now = stuby_application::util::now();
    let input = UpdateOpportunityInput {
        title: payload.title.map(|t| t.trim().to_string()),
        description: payload.description.map(|d| d.trim().to_string()),
        category: payload.category.map(|c| c.trim().to_lowercase()),
        organizer: payload.organizer.map(|o| o.trim().to_string()),
        deadline: payload.deadline,
        reward: payload.reward,
        target_majors,
        eligibility: payload.eligibility,
        website_url: payload.website_url,
        guideline_url: payload.guideline_url,
        guideline_text: payload.guideline_text,
        is_published: payload.is_published,
    };

    state
        .app
        .db
        .update_opportunity(id, &input, now)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let updated = state
        .app
        .db
        .get_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "not_found", "Peluang tidak ditemukan."))?;

    Ok(Json(OpportunityResponse { opportunity: updated }))
}

pub async fn delete_opportunity(
    State(state): State<ApiState>,
    OptionalAuthUser(auth): OptionalAuthUser,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let is_admin = auth.as_ref().map(|a| a.is_admin).unwrap_or(false);
    if !is_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Hanya administrator yang dapat menghapus peluang.",
        ));
    }

    let existing = state
        .app
        .db
        .get_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;
    if existing.is_none() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "Peluang tidak ditemukan.",
        ));
    }

    state
        .app
        .db
        .delete_opportunity(id)
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    Ok(Json(DeleteResponse { ok: true }))
}
