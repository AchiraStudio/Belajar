//! Peer profiles & teammate matching REST API endpoints (Milestone 2 - R3).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use stuby_storage::Row;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::ApiError;
use crate::routes::auth_extract::AuthUser;
use crate::state::ApiState;

pub fn router() -> Router<ApiState> {
    Router::new()
        .route("/me", get(get_my_profile).put(update_my_profile))
        .route("/", get(list_profiles))
        .route("/{id}", get(get_profile_by_id))
}

#[derive(Debug, Deserialize)]
pub struct ListProfilesQuery {
    pub major: Option<String>,
    pub skill: Option<String>,
    pub search: Option<String>,
    pub looking_for_team: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub full_name: Option<String>,
    pub major: Option<String>,
    pub batch_year: Option<i32>,
    pub bio: Option<String>,
    pub academic_interests: Option<Vec<String>>,
    pub skills: Option<Vec<String>>,
    pub contact_info: Option<Value>,
    pub is_looking_for_team: Option<i32>,
}

/// Largest accepted `contact_info`, serialised. The profile photo (a small data URL) is the bulk of it.
const MAX_CONTACT_INFO_BYTES: usize = 160_000;
/// Largest accepted profile photo, as the data URL text. The app downsizes to ~256 px before sending.
const MAX_AVATAR_CHARS: usize = 120_000;
const MAX_LINKS: usize = 6;
const BANNER_TONES: [&str; 5] = ["bamboo", "sun", "ink", "cream", "leaf"];
const AVATAR_PREFIXES: [&str; 3] = ["data:image/webp;base64,", "data:image/jpeg;base64,", "data:image/png;base64,"];

/// `peer_profiles.contact_info` is free-form JSON that the profile page uses for the parts of a
/// profile the table has no column for: `handle`, `headline`, `location`, `banner`, `avatar` and
/// `links`. Whatever the client sends is rendered back to the owner (and a link becomes an `href`), so
/// it is checked here rather than trusted: only `http(s)` links, only image data URLs for the photo,
/// bounded lengths everywhere. Unknown keys are allowed (older clients) but count toward the size cap.
fn validate_contact_info(value: &Value) -> Result<(), &'static str> {
    let obj = value.as_object().ok_or("Info profil harus berupa objek.")?;
    if value.to_string().len() > MAX_CONTACT_INFO_BYTES {
        return Err("Info profil terlalu besar.");
    }

    let text = |key: &str| -> Result<Option<&str>, &'static str> {
        match obj.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.as_str())),
            Some(_) => Err("Info profil berisi nilai yang tidak valid."),
        }
    };

    if let Some(h) = text("handle")? {
        let n = h.chars().count();
        let ok_chars = h.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '.');
        // an empty handle means "none"
        if !h.is_empty() && (!(3..=24).contains(&n) || !ok_chars) {
            return Err("Nama pengguna harus 3 sampai 24 karakter: huruf kecil, angka, titik, atau garis bawah.");
        }
    }
    if text("headline")?.is_some_and(|s| s.chars().count() > 80) {
        return Err("Tagline maksimal 80 karakter.");
    }
    if text("location")?.is_some_and(|s| s.chars().count() > 60) {
        return Err("Lokasi maksimal 60 karakter.");
    }
    if let Some(b) = text("banner")? {
        if !BANNER_TONES.contains(&b) {
            return Err("Warna sampul tidak dikenal.");
        }
    }
    if let Some(a) = text("avatar")? {
        if !a.is_empty() {
            let payload = AVATAR_PREFIXES
                .iter()
                .find_map(|p| a.strip_prefix(p))
                .ok_or("Foto profil harus berupa gambar WebP, JPEG, atau PNG.")?;
            let b64 = payload.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/' || c == b'=');
            if a.len() > MAX_AVATAR_CHARS || payload.is_empty() || !b64 {
                return Err("Foto profil tidak valid atau terlalu besar.");
            }
        }
    }
    match obj.get("links") {
        None | Some(Value::Null) => {}
        Some(Value::Array(links)) => {
            if links.len() > MAX_LINKS {
                return Err("Maksimal 6 tautan.");
            }
            for l in links {
                let label = l.get("label").and_then(Value::as_str).unwrap_or_default();
                let url = l.get("url").and_then(Value::as_str).unwrap_or_default();
                if label.trim().is_empty() || label.chars().count() > 40 {
                    return Err("Nama tautan wajib diisi, maksimal 40 karakter.");
                }
                let scheme_ok = url.starts_with("https://") || url.starts_with("http://");
                if !scheme_ok || url.chars().count() > 300 || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
                    return Err("Tautan harus diawali http:// atau https:// dan tidak boleh berisi spasi.");
                }
            }
        }
        Some(_) => return Err("Info profil berisi nilai yang tidak valid."),
    }
    Ok(())
}

/// The peer directory lists many profiles at once, so the photo is left out of those answers.
fn without_avatar(mut dto: PeerProfileDto) -> PeerProfileDto {
    if let Some(obj) = dto.contact_info.as_object_mut() {
        obj.remove("avatar");
    }
    dto
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerProfileDto {
    pub id: i64,
    pub user_id: String,
    pub full_name: String,
    pub major: String,
    pub batch_year: Option<i32>,
    pub bio: Option<String>,
    pub academic_interests: Vec<String>,
    pub skills: Vec<String>,
    pub contact_info: Value,
    pub is_looking_for_team: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<f64>,
}

#[derive(Serialize)]
pub struct ProfileResponse {
    pub profile: PeerProfileDto,
}

#[derive(Serialize)]
pub struct ProfilesListResponse {
    pub profiles: Vec<PeerProfileDto>,
}

fn map_profile_dto(row: &Row, fallback_user_id: &str) -> PeerProfileDto {
    let academic_interests = match row.get("academic_interests") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    };

    let skills = match row.get("skills") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    };

    let contact_info = row
        .get("contact_info")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let user_id = row
        .get("user_label")
        .or_else(|| row.get("user_uuid"))
        .or_else(|| row.get("user_id"))
        .and_then(Value::as_str)
        .unwrap_or(fallback_user_id)
        .to_owned();

    PeerProfileDto {
        id: row.get("id").and_then(Value::as_i64).unwrap_or_default(),
        user_id,
        full_name: row
            .get("full_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        major: row
            .get("major")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        batch_year: row.get("batch_year").and_then(Value::as_i64).map(|y| y as i32),
        bio: row.get("bio").and_then(Value::as_str).map(str::to_owned),
        academic_interests,
        skills,
        contact_info,
        is_looking_for_team: row
            .get("is_looking_for_team")
            .and_then(Value::as_i64)
            .unwrap_or(1) as i32,
        created_at: row.get("created_at").and_then(Value::as_f64),
        updated_at: row.get("updated_at").and_then(Value::as_f64),
    }
}

/// GET /api/v1/profiles/me
pub async fn get_my_profile(
    State(state): State<ApiState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, ApiError> {
    let row = state
        .app
        .db
        .row(
            "SELECT p.id, p.user_id::text AS user_uuid, u.label AS user_label, p.full_name, p.major, p.batch_year, p.bio, \
                    p.academic_interests, p.skills, p.contact_info, p.is_looking_for_team, \
                    p.created_at, p.updated_at \
             FROM peer_profiles p \
             LEFT JOIN app_users u ON u.id = p.user_id \
             WHERE p.user_id = $1::uuid",
            stuby_storage::args![auth.user_id.to_string()],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let profile = if let Some(r) = row {
        map_profile_dto(&r, &auth.user_id_str)
    } else {
        // Auto-initialize default profile for authenticated student
        let now = stuby_application::util::now();
        let inserted_id = state
            .app
            .db
            .insert_id(
                "INSERT INTO peer_profiles ( \
                    user_id, full_name, major, batch_year, bio, \
                    academic_interests, skills, contact_info, is_looking_for_team, \
                    created_at, updated_at \
                 ) VALUES ($1::uuid, 'Mahasiswa Belajar', 'Informatika', 2024, '', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, $2, $2) \
                 ON CONFLICT (user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at \
                 RETURNING id",
                stuby_storage::args![auth.user_id.to_string(), now],
            )
            .await
            .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

        PeerProfileDto {
            id: inserted_id,
            user_id: auth.user_id_str.clone(),
            full_name: "Mahasiswa Belajar".to_string(),
            major: "Informatika".to_string(),
            batch_year: Some(2024),
            bio: Some("".to_string()),
            academic_interests: vec![],
            skills: vec![],
            contact_info: json!({}),
            is_looking_for_team: 1,
            created_at: Some(now),
            updated_at: Some(now),
        }
    };

    Ok(Json(ProfileResponse { profile }))
}

/// PUT /api/v1/profiles/me
pub async fn update_my_profile(
    State(state): State<ApiState>,
    auth: AuthUser,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // 1. Validation boundaries
    if body.skills.as_ref().is_some_and(|s| s.len() > 20) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "skill_limit_exceeded",
            "Maksimal 20 keahlian diperbolehkan.",
        ));
    }

    if body.bio.as_ref().is_some_and(|b| b.chars().count() > 2000) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "bio_too_long",
            "Bio maksimal 2000 karakter.",
        ));
    }

    if body.batch_year.is_some_and(|y| !(1950..=2100).contains(&y)) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_batch_year",
            "Tahun angkatan harus antara 1950 dan 2100.",
        ));
    }

    if let Some(info) = body.contact_info.as_ref() {
        validate_contact_info(info)
            .map_err(|m| ApiError::new(StatusCode::BAD_REQUEST, "invalid_contact_info", m))?;
    }

    // 2. Fetch existing row to merge fields
    let existing = state
        .app
        .db
        .row(
            "SELECT full_name, major, batch_year, bio, academic_interests, skills, contact_info, is_looking_for_team \
             FROM peer_profiles WHERE user_id = $1::uuid",
            stuby_storage::args![auth.user_id.to_string()],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let full_name = body
        .full_name
        .or_else(|| existing.as_ref().and_then(|r| r.get("full_name").and_then(Value::as_str).map(str::to_owned)))
        .unwrap_or_else(|| "Mahasiswa Belajar".to_string());

    let major = body
        .major
        .or_else(|| existing.as_ref().and_then(|r| r.get("major").and_then(Value::as_str).map(str::to_owned)))
        .unwrap_or_else(|| "Informatika".to_string());

    let batch_year = body
        .batch_year
        .or_else(|| existing.as_ref().and_then(|r| r.get("batch_year").and_then(Value::as_i64).map(|y| y as i32)))
        .or(Some(2024));

    let bio = body
        .bio
        .or_else(|| existing.as_ref().and_then(|r| r.get("bio").and_then(Value::as_str).map(str::to_owned)))
        .unwrap_or_default();

    let academic_interests = body
        .academic_interests
        .or_else(|| {
            existing.as_ref().and_then(|r| match r.get("academic_interests") {
                Some(Value::Array(arr)) => Some(arr.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect()),
                _ => None,
            })
        })
        .unwrap_or_default();

    let skills = body
        .skills
        .or_else(|| {
            existing.as_ref().and_then(|r| match r.get("skills") {
                Some(Value::Array(arr)) => Some(arr.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect()),
                _ => None,
            })
        })
        .unwrap_or_default();

    let contact_info = body
        .contact_info
        .or_else(|| existing.as_ref().and_then(|r| r.get("contact_info").cloned()))
        .unwrap_or_else(|| json!({}));

    let is_looking_for_team = body
        .is_looking_for_team
        .or_else(|| existing.as_ref().and_then(|r| r.get("is_looking_for_team").and_then(Value::as_i64).map(|v| v as i32)))
        .unwrap_or(1);

    let now = stuby_application::util::now();

    // 3. Upsert into database
    state
        .app
        .db
        .run(
            "INSERT INTO peer_profiles ( \
                user_id, full_name, major, batch_year, bio, \
                academic_interests, skills, contact_info, is_looking_for_team, \
                created_at, updated_at \
             ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) \
             ON CONFLICT (user_id) DO UPDATE SET \
                full_name = EXCLUDED.full_name, \
                major = EXCLUDED.major, \
                batch_year = EXCLUDED.batch_year, \
                bio = EXCLUDED.bio, \
                academic_interests = EXCLUDED.academic_interests, \
                skills = EXCLUDED.skills, \
                contact_info = EXCLUDED.contact_info, \
                is_looking_for_team = EXCLUDED.is_looking_for_team, \
                updated_at = EXCLUDED.updated_at",
            stuby_storage::args![
                auth.user_id.to_string(),
                full_name,
                major,
                batch_year,
                bio,
                json!(academic_interests),
                json!(skills),
                contact_info,
                is_looking_for_team,
                now
            ],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let row = state
        .app
        .db
        .row(
            "SELECT p.id, p.user_id::text AS user_uuid, u.label AS user_label, p.full_name, p.major, p.batch_year, p.bio, \
                    p.academic_interests, p.skills, p.contact_info, p.is_looking_for_team, \
                    p.created_at, p.updated_at \
             FROM peer_profiles p \
             LEFT JOIN app_users u ON u.id = p.user_id \
             WHERE p.user_id = $1::uuid",
            stuby_storage::args![auth.user_id.to_string()],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Gagal membaca profil.",
            )
        })?;

    let profile = map_profile_dto(&row, &auth.user_id_str);
    Ok(Json(ProfileResponse { profile }))
}

/// GET /api/v1/profiles
pub async fn list_profiles(
    State(state): State<ApiState>,
    Query(query): Query<ListProfilesQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let major_filter = query.major.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let skill_filter = query.skill.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let search_filter = query.search.as_deref().map(str::trim).filter(|s| !s.is_empty());

    let looking_for_team: Option<i32> = match query.looking_for_team.as_deref() {
        Some("1") | Some("true") => Some(1),
        Some("0") | Some("false") => Some(0),
        _ => None,
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let offset = query.offset.unwrap_or(0).max(0);

    let rows = state
        .app
        .db
        .rows(
            "SELECT p.id, p.user_id::text AS user_uuid, u.label AS user_label, p.full_name, p.major, p.batch_year, p.bio, \
                    p.academic_interests, p.skills, p.contact_info, p.is_looking_for_team, \
                    p.created_at, p.updated_at \
             FROM peer_profiles p \
             LEFT JOIN app_users u ON u.id = p.user_id \
             WHERE ($1::text IS NULL OR p.major ILIKE ('%' || $1 || '%')) \
               AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.skills) AS elem WHERE elem ILIKE ('%' || $2 || '%'))) \
               AND ($3::integer IS NULL OR p.is_looking_for_team = $3::integer) \
               AND ($4::text IS NULL OR p.full_name ILIKE ('%' || $4 || '%') \
                                    OR p.bio ILIKE ('%' || $4 || '%') \
                                    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.skills) AS elem WHERE elem ILIKE ('%' || $4 || '%'))) \
             ORDER BY p.is_looking_for_team DESC, p.updated_at DESC \
             LIMIT $5 OFFSET $6",
            stuby_storage::args![major_filter, skill_filter, looking_for_team, search_filter, limit, offset],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?;

    let profiles: Vec<PeerProfileDto> = rows.into_iter().map(|r| without_avatar(map_profile_dto(&r, ""))).collect();
    Ok(Json(ProfilesListResponse { profiles }))
}

/// GET /api/v1/profiles/{id}
pub async fn get_profile_by_id(
    State(state): State<ApiState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let row = state
        .app
        .db
        .row(
            "SELECT p.id, p.user_id::text AS user_uuid, u.label AS user_label, p.full_name, p.major, p.batch_year, p.bio, \
                    p.academic_interests, p.skills, p.contact_info, p.is_looking_for_team, \
                    p.created_at, p.updated_at \
             FROM peer_profiles p \
             LEFT JOIN app_users u ON u.id = p.user_id \
             WHERE p.id = $1",
            stuby_storage::args![id],
        )
        .await
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", e.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "Profil teman tim tidak ditemukan.",
            )
        })?;

    let profile = without_avatar(map_profile_dto(&row, ""));
    Ok(Json(ProfileResponse { profile }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(v: Value) {
        assert_eq!(validate_contact_info(&v), Ok(()), "{v}");
    }
    fn bad(v: Value) {
        assert!(validate_contact_info(&v).is_err(), "should be rejected: {v}");
    }

    #[test]
    fn accepts_a_normal_profile() {
        ok(json!({}));
        ok(json!({
            "handle": "pelajar_01", "headline": "Belajar fisika", "location": "Bandung", "banner": "sun",
            "avatar": "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=",
            "links": [{"label": "GitHub", "url": "https://github.com/x"}],
        }));
        ok(json!({ "handle": "" }));
        ok(json!({ "avatar": null, "links": null }));
    }

    #[test]
    fn rejects_dangerous_or_malformed_links() {
        for url in ["javascript:alert(1)", "data:text/html,<script>", "//evil.test", "ftp://x.test", "https://a b.test", "https://x.test/\u{0}"] {
            bad(json!({ "links": [{ "label": "x", "url": url }] }));
        }
        bad(json!({ "links": [{ "label": "", "url": "https://x.test" }] }));
        bad(json!({ "links": [{ "label": "x" }] }));
        bad(json!({ "links": "https://x.test" }));
        let too_many: Vec<Value> = (0..7).map(|i| json!({ "label": format!("l{i}"), "url": "https://x.test" })).collect();
        bad(json!({ "links": too_many }));
    }

    #[test]
    fn rejects_non_image_or_oversized_avatars() {
        bad(json!({ "avatar": "https://x.test/a.png" }));
        bad(json!({ "avatar": "data:text/html;base64,PHNjcmlwdD4=" }));
        bad(json!({ "avatar": "data:image/svg+xml;base64,PHN2Zz4=" }));
        bad(json!({ "avatar": "data:image/png;base64,not base64!" }));
        bad(json!({ "avatar": "data:image/png;base64," }));
        bad(json!({ "avatar": format!("data:image/png;base64,{}", "A".repeat(MAX_AVATAR_CHARS)) }));
    }

    #[test]
    fn rejects_bad_scalars() {
        bad(json!([]));
        bad(json!({ "handle": "Ab" }));
        bad(json!({ "handle": "has space" }));
        bad(json!({ "handle": "UPPER_CASE" }));
        bad(json!({ "handle": "a".repeat(25) }));
        bad(json!({ "headline": "x".repeat(81) }));
        bad(json!({ "location": "x".repeat(61) }));
        bad(json!({ "banner": "neon" }));
        bad(json!({ "handle": 5 }));
    }

    #[test]
    fn the_directory_never_carries_the_photo() {
        let dto = PeerProfileDto {
            id: 1,
            user_id: "u".into(),
            full_name: "A".into(),
            major: "B".into(),
            batch_year: None,
            bio: None,
            academic_interests: vec![],
            skills: vec![],
            contact_info: json!({ "avatar": "data:image/png;base64,AAAA", "handle": "abc" }),
            is_looking_for_team: 1,
            created_at: None,
            updated_at: None,
        };
        let out = without_avatar(dto);
        assert!(out.contact_info.get("avatar").is_none());
        assert_eq!(out.contact_info["handle"], "abc");
    }
}
