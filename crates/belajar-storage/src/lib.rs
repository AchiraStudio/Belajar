//! Persistence layer: PostgreSQL (Supabase) through `sqlx`.
//!
//! Design (docs/MIGRATION_PLAN.md ADR-1, ADR-9, ADR-11 rev. 3):
//!
//! * [`Db`] is a thin helper shaped like the legacy `db.py` (`rows`, `row`, `run`, `scalar`, plus
//!   transactions) so the ~240 legacy SQL call sites can be ported mechanically.
//! * Every connection carries the owner in the session variable `app.user_id`; row-level security
//!   policies in `migrations/0001_baseline.sql` make other owners' rows invisible and fill
//!   `user_id` on insert. Application code never writes `WHERE user_id = ...`.
//! * Results are JSON maps ([`Row`]) because the unchanged frontend consumes exactly the shapes
//!   the Python handlers produced.

mod db;
mod migrate;
pub mod opportunities;
pub mod profiles;
mod sessions;
pub mod tracking;

#[cfg(feature = "testing")]
pub mod testing;

pub use db::{Arg, Db, Row, StorageError, Tx};
pub use migrate::{ensure_owner, migrate};
pub use opportunities::{
    CreateOpportunityInput, Opportunity, OpportunityFilter, UpdateOpportunityInput,
};
pub use profiles::{PeerProfile, ProfileFilter, UpsertProfileInput};
pub use sessions::SessionStore;
pub use tracking::{
    OpportunitySummary, TrackedOpportunityWithDetails, TrackingStatus,
};

pub use sqlx::postgres::PgConnectOptions;
pub use uuid::Uuid;

impl From<Option<&str>> for Arg {
    fn from(v: Option<&str>) -> Self {
        Arg::Text(v.map(str::to_owned))
    }
}

impl From<Option<&String>> for Arg {
    fn from(v: Option<&String>) -> Self {
        Arg::Text(v.cloned())
    }
}

/// Build a `&[Arg]` from heterogeneous values: `args![id, "text", 2.5, Some(7_i64)]`.
#[macro_export]
macro_rules! args {
    () => { &[] as &[$crate::Arg] };
    ($($a:expr),+ $(,)?) => { &[$($crate::Arg::from($a)),+] as &[$crate::Arg] };
}
