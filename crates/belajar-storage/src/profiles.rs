//! Peer profiles and teammate matching persistence (R3).

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{Db, Row, StorageError, args};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerProfile {
    pub id: i64,
    pub user_id: Option<String>, // aliased from user_uuid in SELECT
    pub full_name: String,
    pub major: String,
    pub batch_year: Option<i32>,
    pub bio: Option<String>,
    pub academic_interests: Vec<String>,
    pub skills: Vec<String>,
    pub contact_info: Value,
    pub is_looking_for_team: i32,
    pub created_at: f64,
    pub updated_at: f64,
}

impl PeerProfile {
    pub fn from_row(row: &Row) -> Result<Self, StorageError> {
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

        Ok(Self {
            id: row.get("id").and_then(Value::as_i64).unwrap_or_default(),
            user_id: row.get("user_uuid").and_then(Value::as_str).map(str::to_owned),
            full_name: row.get("full_name").and_then(Value::as_str).unwrap_or_default().to_owned(),
            major: row.get("major").and_then(Value::as_str).unwrap_or_default().to_owned(),
            batch_year: row.get("batch_year").and_then(Value::as_i64).map(|y| y as i32),
            bio: row.get("bio").and_then(Value::as_str).map(str::to_owned),
            academic_interests,
            skills,
            contact_info,
            is_looking_for_team: row.get("is_looking_for_team").and_then(Value::as_i64).unwrap_or(1) as i32,
            created_at: row.get("created_at").and_then(Value::as_f64).unwrap_or_default(),
            updated_at: row.get("updated_at").and_then(Value::as_f64).unwrap_or_default(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertProfileInput {
    pub full_name: String,
    pub major: String,
    pub batch_year: Option<i32>,
    pub bio: Option<String>,
    pub academic_interests: Vec<String>,
    pub skills: Vec<String>,
    pub contact_info: Option<Value>,
    pub is_looking_for_team: Option<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct ProfileFilter {
    pub major: Option<String>,
    pub skill: Option<String>,
    pub interest: Option<String>,
    pub looking_for_team: Option<i32>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl Db {
    /// Retrieve the authenticated student's own peer profile.
    pub async fn get_my_profile(&self) -> Result<Option<PeerProfile>, StorageError> {
        let row = self
            .row(
                "SELECT id, user_id::text AS user_uuid, full_name, major, batch_year, bio, \
                        academic_interests, skills, contact_info, is_looking_for_team, \
                        created_at, updated_at \
                 FROM peer_profiles \
                 WHERE user_id = NULLIF(current_setting('app.user_id', true), '')::uuid",
                args![],
            )
            .await?;

        row.as_ref().map(PeerProfile::from_row).transpose()
    }

    /// Retrieve a peer profile by ID.
    pub async fn get_profile_by_id(&self, id: i64) -> Result<Option<PeerProfile>, StorageError> {
        let row = self
            .row(
                "SELECT id, user_id::text AS user_uuid, full_name, major, batch_year, bio, \
                        academic_interests, skills, contact_info, is_looking_for_team, \
                        created_at, updated_at \
                 FROM peer_profiles WHERE id = $1",
                args![id],
            )
            .await?;

        row.as_ref().map(PeerProfile::from_row).transpose()
    }

    /// Upsert the authenticated student's own peer profile.
    pub async fn upsert_my_profile(
        &self,
        input: &UpsertProfileInput,
        now: f64,
    ) -> Result<i64, StorageError> {
        let interests_json = json!(input.academic_interests);
        let skills_json = json!(input.skills);
        let contact_json = input.contact_info.clone().unwrap_or_else(|| json!({}));
        let looking = input.is_looking_for_team.unwrap_or(1);

        self.insert_id(
            "INSERT INTO peer_profiles ( \
                user_id, full_name, major, batch_year, bio, \
                academic_interests, skills, contact_info, is_looking_for_team, \
                created_at, updated_at \
             ) VALUES ( \
                NULLIF(current_setting('app.user_id', true), '')::uuid, \
                $1, $2, $3, $4, \
                $5, $6, $7, $8, \
                $9, $9 \
             ) \
             ON CONFLICT (user_id) DO UPDATE SET \
                full_name = EXCLUDED.full_name, \
                major = EXCLUDED.major, \
                batch_year = EXCLUDED.batch_year, \
                bio = EXCLUDED.bio, \
                academic_interests = EXCLUDED.academic_interests, \
                skills = EXCLUDED.skills, \
                contact_info = EXCLUDED.contact_info, \
                is_looking_for_team = EXCLUDED.is_looking_for_team, \
                updated_at = EXCLUDED.updated_at \
             RETURNING id",
            args![
                &input.full_name,
                &input.major,
                input.batch_year,
                input.bio.as_deref(),
                interests_json,
                skills_json,
                contact_json,
                looking,
                now,
            ],
        )
        .await
    }

    /// Search and filter peer profiles in the teammate directory.
    pub async fn list_profiles(
        &self,
        filter: &ProfileFilter,
    ) -> Result<Vec<PeerProfile>, StorageError> {
        let rows = self
            .rows(
                "SELECT id, user_id::text AS user_uuid, full_name, major, batch_year, bio, \
                        academic_interests, skills, contact_info, is_looking_for_team, \
                        created_at, updated_at \
                 FROM peer_profiles \
                 WHERE ($1::text IS NULL OR major ILIKE ('%' || $1 || '%')) \
                   AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(skills) AS elem WHERE elem ILIKE ('%' || $2 || '%'))) \
                   AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(academic_interests) AS elem WHERE elem ILIKE ('%' || $3 || '%'))) \
                   AND ($4::integer IS NULL OR is_looking_for_team = $4::integer) \
                   AND ($5::text IS NULL OR full_name ILIKE ('%' || $5 || '%') \
                                        OR bio ILIKE ('%' || $5 || '%') \
                                        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(skills) AS elem WHERE elem ILIKE ('%' || $5 || '%'))) \
                 ORDER BY is_looking_for_team DESC, updated_at DESC \
                 LIMIT COALESCE($6::bigint, 50) \
                 OFFSET COALESCE($7::bigint, 0)",
                args![
                    filter.major.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                    filter.skill.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                    filter.interest.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                    filter.looking_for_team,
                    filter.search.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                    filter.limit,
                    filter.offset,
                ],
            )
            .await?;

        rows.iter().map(PeerProfile::from_row).collect()
    }

    /// Convenience alias for `list_profiles` matching search directory terminology.
    pub async fn search_profiles(
        &self,
        filter: &ProfileFilter,
    ) -> Result<Vec<PeerProfile>, StorageError> {
        self.list_profiles(filter).await
    }
}
