//! Concept mastery levels (legacy `play_director.mastery_level`).

use std::collections::HashSet;

/// Display level of a concept, derived from its score and evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MasteryLevel {
    /// No evidence yet.
    Baru,
    /// Seen, but scoring below 50.
    Dikenal,
    /// Understood: scoring 50 or more without meeting the bar for mastery.
    Paham,
    /// Mastered: score of 75+, at least 4 pieces of evidence, from at least 2 kinds of evidence.
    Kuasai,
}

impl MasteryLevel {
    /// The label stored in and shown by the app.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Baru => "baru",
            Self::Dikenal => "dikenal",
            Self::Paham => "paham",
            Self::Kuasai => "kuasai",
        }
    }
}

/// `baru | dikenal | paham | kuasai` for a concept with `score`, `evidence_n` observations and the
/// kinds of evidence they came from.
#[must_use]
pub fn mastery_level<S: AsRef<str>>(score: f64, evidence_n: i64, kinds: &[S]) -> MasteryLevel {
    if evidence_n <= 0 {
        return MasteryLevel::Baru;
    }
    if score < 50.0 {
        return MasteryLevel::Dikenal;
    }
    let distinct_kinds = kinds
        .iter()
        .map(AsRef::as_ref)
        .collect::<HashSet<&str>>()
        .len();
    if score >= 75.0 && evidence_n >= 4 && distinct_kinds >= 2 {
        MasteryLevel::Kuasai
    } else {
        MasteryLevel::Paham
    }
}
