//! Save-to-Track persistence models and queries (R2).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Db, Row, StorageError, args};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrackingStatus {
    Saved,
    Applied,
    Done,
}

impl TrackingStatus {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "Saved" => Some(Self::Saved),
            "Applied" => Some(Self::Applied),
            "Done" => Some(Self::Done),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Saved => "Saved",
            Self::Applied => "Applied",
            Self::Done => "Done",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpportunitySummary {
    pub id: i64,
    pub title: String,
    pub category: String,
    pub organizer: String,
    pub deadline: f64,
    pub reward: Option<String>,
    pub target_majors: Vec<String>,
    pub website_url: Option<String>,
    pub guideline_url: Option<String>,
    pub guideline_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedOpportunityWithDetails {
    pub id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    pub opportunity_id: i64,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
    pub applied_at: Option<f64>,
    pub completed_at: Option<f64>,
    pub opportunity: OpportunitySummary,
    pub countdown_seconds: f64,
    pub is_overdue: bool,
    pub remind: bool,
}

impl TrackedOpportunityWithDetails {
    pub fn from_row(row: &Row, now: f64) -> Result<Self, StorageError> {
        let user_id = row
            .get("user_id")
            .or_else(|| row.get("user_uuid"))
            .and_then(Value::as_str)
            .map(str::to_owned);

        let target_majors = match row.get("opp_target_majors") {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect(),
            _ => Vec::new(),
        };

        let deadline = row.get("opp_deadline").and_then(Value::as_f64).unwrap_or_default();
        let status = row.get("status").and_then(Value::as_str).unwrap_or("Saved").to_owned();
        let countdown_seconds = deadline - now;
        let is_overdue = now > deadline;
        let remind = status == "Saved" && !is_overdue;

        Ok(Self {
            id: row.get("id").and_then(Value::as_i64).unwrap_or_default(),
            user_id,
            opportunity_id: row.get("opportunity_id").and_then(Value::as_i64).unwrap_or_default(),
            status,
            notes: row.get("notes").and_then(Value::as_str).map(str::to_owned),
            created_at: row.get("created_at").and_then(Value::as_f64).unwrap_or_default(),
            updated_at: row.get("updated_at").and_then(Value::as_f64).unwrap_or_default(),
            applied_at: row.get("applied_at").and_then(Value::as_f64),
            completed_at: row.get("completed_at").and_then(Value::as_f64),
            opportunity: OpportunitySummary {
                id: row.get("opportunity_id").and_then(Value::as_i64).unwrap_or_default(),
                title: row.get("opp_title").and_then(Value::as_str).unwrap_or_default().to_owned(),
                category: row.get("opp_category").and_then(Value::as_str).unwrap_or_default().to_owned(),
                organizer: row.get("opp_organizer").and_then(Value::as_str).unwrap_or_default().to_owned(),
                deadline,
                reward: row.get("opp_reward").and_then(Value::as_str).map(str::to_owned),
                target_majors,
                website_url: row.get("opp_website_url").and_then(Value::as_str).map(str::to_owned),
                guideline_url: row.get("opp_guideline_url").and_then(Value::as_str).map(str::to_owned),
                guideline_text: row.get("opp_guideline_text").and_then(Value::as_str).map(str::to_owned),
            },
            countdown_seconds,
            is_overdue,
            remind,
        })
    }
}

impl Db {
    /// Save an opportunity to student tracker with initial status 'Saved'.
    pub async fn track_opportunity(
        &self,
        opportunity_id: i64,
        notes: Option<&str>,
        now: f64,
    ) -> Result<i64, StorageError> {
        self.insert_id(
            "INSERT INTO tracked_opportunities ( \
                user_id, opportunity_id, status, notes, created_at, updated_at \
             ) VALUES ( \
                NULLIF(current_setting('app.user_id', true), '')::uuid, \
                $1, 'Saved', $2, $3, $3 \
             ) \
             ON CONFLICT (user_id, opportunity_id) DO UPDATE SET \
                status = 'Saved', \
                notes = COALESCE(EXCLUDED.notes, tracked_opportunities.notes), \
                updated_at = EXCLUDED.updated_at \
             RETURNING id",
            args![opportunity_id, notes, now],
        )
        .await
    }

    /// List all tracked opportunities for the current student.
    pub async fn list_tracked_opportunities(
        &self,
        status_filter: Option<&str>,
        now: f64,
    ) -> Result<Vec<TrackedOpportunityWithDetails>, StorageError> {
        let rows = self
            .rows(
                "SELECT \
                    t.id, t.user_id::text AS user_uuid, t.opportunity_id, t.status, t.notes, \
                    t.created_at, t.updated_at, t.applied_at, t.completed_at, \
                    o.title AS opp_title, o.category AS opp_category, o.organizer AS opp_organizer, \
                    o.deadline AS opp_deadline, o.reward AS opp_reward, o.target_majors AS opp_target_majors, \
                    o.website_url AS opp_website_url, o.guideline_url AS opp_guideline_url, \
                    o.guideline_text AS opp_guideline_text \
                 FROM tracked_opportunities t \
                 JOIN opportunities o ON o.id = t.opportunity_id \
                 WHERE ($1::text IS NULL OR t.status = $1::text) \
                 ORDER BY \
                    CASE WHEN t.status = 'Saved' THEN 1 WHEN t.status = 'Applied' THEN 2 ELSE 3 END, \
                    o.deadline ASC",
                args![status_filter],
            )
            .await?;

        rows.iter().map(|r| TrackedOpportunityWithDetails::from_row(r, now)).collect()
    }

    /// Get a single tracked opportunity item by tracking ID.
    pub async fn get_tracked_opportunity(
        &self,
        id: i64,
        now: f64,
    ) -> Result<Option<TrackedOpportunityWithDetails>, StorageError> {
        let row = self
            .row(
                "SELECT \
                    t.id, t.user_id::text AS user_uuid, t.opportunity_id, t.status, t.notes, \
                    t.created_at, t.updated_at, t.applied_at, t.completed_at, \
                    o.title AS opp_title, o.category AS opp_category, o.organizer AS opp_organizer, \
                    o.deadline AS opp_deadline, o.reward AS opp_reward, o.target_majors AS opp_target_majors, \
                    o.website_url AS opp_website_url, o.guideline_url AS opp_guideline_url, \
                    o.guideline_text AS opp_guideline_text \
                 FROM tracked_opportunities t \
                 JOIN opportunities o ON o.id = t.opportunity_id \
                 WHERE t.id = $1",
                args![id],
            )
            .await?;

        row.as_ref()
            .map(|r| TrackedOpportunityWithDetails::from_row(r, now))
            .transpose()
    }

    /// Check owner of a tracked opportunity by tracking ID, returning user UUID if found.
    pub async fn check_tracked_owner(&self, id: i64) -> Result<Option<uuid::Uuid>, StorageError> {
        let mut tx = self.begin().await?;
        let _ = tx.run("SET LOCAL row_security = off", args![]).await;
        let row = tx
            .row(
                "SELECT user_id::text AS uid FROM tracked_opportunities WHERE id = $1",
                args![id],
            )
            .await?;
        tx.commit().await?;
        Ok(row.and_then(|r| {
            r.get("uid")
                .and_then(Value::as_str)
                .and_then(|s| uuid::Uuid::parse_str(s).ok())
        }))
    }

    /// Update tracking status ('Saved' -> 'Applied' -> 'Done') with timestamp transitions.
    pub async fn update_tracked_status(
        &self,
        id: i64,
        new_status: &str,
        notes: Option<&str>,
        now: f64,
    ) -> Result<bool, StorageError> {
        let affected = self
            .run(
                "UPDATE tracked_opportunities SET \
                    status = $2, \
                    notes = COALESCE($3, notes), \
                    applied_at = CASE \
                        WHEN $2 = 'Applied' AND applied_at IS NULL THEN $4 \
                        WHEN $2 = 'Saved' THEN NULL \
                        ELSE applied_at \
                    END, \
                    completed_at = CASE \
                        WHEN $2 = 'Done' AND completed_at IS NULL THEN $4 \
                        WHEN $2 = 'Saved' THEN NULL \
                        ELSE completed_at \
                    END, \
                    updated_at = $4 \
                 WHERE id = $1",
                args![id, new_status, notes, now],
            )
            .await?;

        Ok(affected > 0)
    }

    /// Remove an opportunity from student tracker.
    pub async fn delete_tracked_opportunity(&self, id: i64) -> Result<bool, StorageError> {
        let affected = self
            .run("DELETE FROM tracked_opportunities WHERE id = $1", args![id])
            .await?;
        Ok(affected > 0)
    }
}
