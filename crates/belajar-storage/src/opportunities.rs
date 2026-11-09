//! Opportunities persistence models and queries (R1 & R4).

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{Db, Row, StorageError, args};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Opportunity {
    pub id: i64,
    pub creator_id: Option<String>,
    pub title: String,
    pub description: String,
    pub category: String, // 'competition' | 'scholarship'
    pub organizer: String,
    pub deadline: f64,
    pub reward: Option<String>,
    pub target_majors: Vec<String>,
    pub eligibility: Option<String>,
    pub website_url: Option<String>,
    pub guideline_url: Option<String>,
    pub guideline_text: Option<String>,
    pub is_published: i32,
    pub created_at: f64,
    pub updated_at: f64,
}

impl Opportunity {
    pub fn from_row(row: &Row) -> Result<Self, StorageError> {
        let target_majors = match row.get("target_majors") {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect(),
            _ => Vec::new(),
        };

        Ok(Self {
            id: row.get("id").and_then(Value::as_i64).unwrap_or_default(),
            creator_id: row.get("creator_id").and_then(Value::as_str).map(str::to_owned),
            title: row.get("title").and_then(Value::as_str).unwrap_or_default().to_owned(),
            description: row.get("description").and_then(Value::as_str).unwrap_or_default().to_owned(),
            category: row.get("category").and_then(Value::as_str).unwrap_or_default().to_owned(),
            organizer: row.get("organizer").and_then(Value::as_str).unwrap_or_default().to_owned(),
            deadline: row.get("deadline").and_then(Value::as_f64).unwrap_or_default(),
            reward: row.get("reward").and_then(Value::as_str).map(str::to_owned),
            target_majors,
            eligibility: row.get("eligibility").and_then(Value::as_str).map(str::to_owned),
            website_url: row.get("website_url").and_then(Value::as_str).map(str::to_owned),
            guideline_url: row.get("guideline_url").and_then(Value::as_str).map(str::to_owned),
            guideline_text: row.get("guideline_text").and_then(Value::as_str).map(str::to_owned),
            is_published: row.get("is_published").and_then(Value::as_i64).unwrap_or(1) as i32,
            created_at: row.get("created_at").and_then(Value::as_f64).unwrap_or_default(),
            updated_at: row.get("updated_at").and_then(Value::as_f64).unwrap_or_default(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOpportunityInput {
    pub title: String,
    pub description: String,
    pub category: String,
    pub organizer: String,
    pub deadline: f64,
    pub reward: Option<String>,
    pub target_majors: Vec<String>,
    pub eligibility: Option<String>,
    pub website_url: Option<String>,
    pub guideline_url: Option<String>,
    pub guideline_text: Option<String>,
    pub is_published: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateOpportunityInput {
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

#[derive(Debug, Clone, Default)]
pub struct OpportunityFilter {
    pub category: Option<String>,
    pub major: Option<String>,
    pub search: Option<String>,
    pub status: Option<String>, // "open", "closed", "all"
    pub is_published: Option<i32>,
    pub now: f64,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl Db {
    /// List opportunities matching the given filter.
    pub async fn list_opportunities(
        &self,
        filter: &OpportunityFilter,
    ) -> Result<Vec<Opportunity>, StorageError> {
        let major_json = filter.major.as_ref().map(|m| json!([m]));
        let rows = self
            .rows(
                "SELECT id, creator_id, title, description, category, organizer, deadline, reward, \
                        target_majors, eligibility, website_url, guideline_url, guideline_text, \
                        is_published, created_at, updated_at \
                 FROM opportunities \
                 WHERE ($1::text IS NULL OR category = $1::text) \
                   AND ($2::jsonb IS NULL OR target_majors @> $2::jsonb OR target_majors = '[]'::jsonb) \
                   AND ($3::text IS NULL OR title ILIKE ('%' || $3 || '%') \
                                        OR description ILIKE ('%' || $3 || '%') \
                                        OR organizer ILIKE ('%' || $3 || '%')) \
                   AND ($4::text IS NULL OR ($4 = 'open' AND deadline >= $5::float8) \
                                        OR ($4 = 'closed' AND deadline < $5::float8) \
                                        OR ($4 = 'all')) \
                   AND ($6::integer IS NULL OR is_published = $6::integer) \
                 ORDER BY deadline ASC \
                 LIMIT COALESCE($7::bigint, 100) \
                 OFFSET COALESCE($8::bigint, 0)",
                args![
                    filter.category.as_deref(),
                    major_json,
                    filter.search.as_deref(),
                    filter.status.as_deref(),
                    filter.now,
                    filter.is_published,
                    filter.limit,
                    filter.offset,
                ],
            )
            .await?;

        rows.iter().map(Opportunity::from_row).collect()
    }

    /// Retrieve a single opportunity by ID.
    pub async fn get_opportunity(&self, id: i64) -> Result<Option<Opportunity>, StorageError> {
        let row = self
            .row(
                "SELECT id, creator_id, title, description, category, organizer, deadline, reward, \
                        target_majors, eligibility, website_url, guideline_url, guideline_text, \
                        is_published, created_at, updated_at \
                 FROM opportunities WHERE id = $1",
                args![id],
            )
            .await?;

        row.as_ref().map(Opportunity::from_row).transpose()
    }

    /// Create a new opportunity (admin only).
    pub async fn create_opportunity(
        &self,
        input: &CreateOpportunityInput,
        creator_id: Option<Uuid>,
        now: f64,
    ) -> Result<i64, StorageError> {
        self.insert_id(
            "INSERT INTO opportunities ( \
                creator_id, title, description, category, organizer, deadline, reward, \
                target_majors, eligibility, website_url, guideline_url, guideline_text, \
                is_published, created_at, updated_at \
             ) VALUES ( \
                COALESCE($1::uuid, NULLIF(current_setting('app.user_id', true), '')::uuid), \
                $2, $3, $4, $5, $6, $7, \
                $8, $9, $10, $11, $12, \
                $13, $14, $14 \
             ) RETURNING id",
            args![
                creator_id,
                &input.title,
                &input.description,
                &input.category,
                &input.organizer,
                input.deadline,
                input.reward.as_deref(),
                json!(input.target_majors),
                input.eligibility.as_deref(),
                input.website_url.as_deref(),
                input.guideline_url.as_deref(),
                input.guideline_text.as_deref(),
                input.is_published.unwrap_or(1),
                now,
            ],
        )
        .await
    }

    /// Update an existing opportunity (admin only).
    pub async fn update_opportunity(
        &self,
        id: i64,
        input: &UpdateOpportunityInput,
        now: f64,
    ) -> Result<bool, StorageError> {
        let majors_json = input.target_majors.as_ref().map(|m| json!(m));
        let affected = self
            .run(
                "UPDATE opportunities SET \
                    title = COALESCE($2, title), \
                    description = COALESCE($3, description), \
                    category = COALESCE($4, category), \
                    organizer = COALESCE($5, organizer), \
                    deadline = COALESCE($6, deadline), \
                    reward = COALESCE($7, reward), \
                    target_majors = COALESCE($8, target_majors), \
                    eligibility = COALESCE($9, eligibility), \
                    website_url = COALESCE($10, website_url), \
                    guideline_url = COALESCE($11, guideline_url), \
                    guideline_text = COALESCE($12, guideline_text), \
                    is_published = COALESCE($13, is_published), \
                    updated_at = $14 \
                 WHERE id = $1",
                args![
                    id,
                    input.title.as_deref(),
                    input.description.as_deref(),
                    input.category.as_deref(),
                    input.organizer.as_deref(),
                    input.deadline,
                    input.reward.as_deref(),
                    majors_json,
                    input.eligibility.as_deref(),
                    input.website_url.as_deref(),
                    input.guideline_url.as_deref(),
                    input.guideline_text.as_deref(),
                    input.is_published,
                    now,
                ],
            )
            .await?;

        Ok(affected > 0)
    }

    /// Delete an opportunity (admin only).
    pub async fn delete_opportunity(&self, id: i64) -> Result<bool, StorageError> {
        let affected = self
            .run("DELETE FROM opportunities WHERE id = $1", args![id])
            .await?;
        Ok(affected > 0)
    }

    /// Check if the active connected user has admin privileges.
    pub async fn is_admin(&self) -> Result<bool, StorageError> {
        let admin_flag = self
            .scalar_i64(
                "SELECT is_admin FROM app_users WHERE id = $1::uuid",
                args![self.user_id()],
                0,
            )
            .await?;
        Ok(admin_flag == 1)
    }

    /// Connect competition guidelines directly into the study pipeline (R4).
    /// Creates a document entry linked to the opportunity with status 'ready' and an initial note entry.
    pub async fn create_guideline_study_document(
        &self,
        opportunity_id: i64,
        now: f64,
    ) -> Result<(i64, String), StorageError> {
        let opp = self
            .get_opportunity(opportunity_id)
            .await?
            .ok_or_else(|| StorageError::Other("Peluang tidak ditemukan.".into()))?;

        let title = format!("Panduan: {}", opp.title);
        let content = opp.guideline_text.clone().unwrap_or_else(|| {
            format!(
                "# {}\n\nPenyelenggara: {}\nBatas Waktu: {}\n\nDeskripsi:\n{}\n\nURL: {}",
                opp.title,
                opp.organizer,
                opp.deadline,
                opp.description,
                opp.website_url.as_deref().unwrap_or("-")
            )
        });

        let mut tx = self.begin().await?;
        let doc_id = tx
            .insert_id(
                "INSERT INTO documents ( \
                    title, title_locked, filename, mime, size, status, summary, style, opportunity_id, created_at, updated_at \
                 ) VALUES ( \
                    $1, 1, 'panduan.txt', 'text/plain', $2, 'ready', $3, 'competition_guidelines', $4, $5, $5 \
                 ) RETURNING id",
                args![&title, content.len() as i64, &opp.description, opportunity_id, now],
            )
            .await?;

        tx.run(
            "INSERT INTO notes (document_id, content_md, edited, version, updated_at) \
             VALUES ($1, $2, 0, 1, $3)",
            args![doc_id, &content, now],
        )
        .await?;

        tx.commit().await?;
        Ok((doc_id, title))
    }
}
