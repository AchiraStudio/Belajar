//! SM-2 spaced-repetition scheduling.
//!
//! Faithful port of `sm2()` in the legacy `cards.py`. Behaviour is intentionally identical,
//! including the order of float operations and Python's round-half-to-even.

use chrono::{Days, NaiveDate};

use crate::numeric::{py_round, py_round_ndigits};

/// Lowest ease factor SM-2 will ever assign.
pub const MIN_EASE: f64 = 1.3;

/// Scheduling state of one card.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CardState {
    pub ease: f64,
    pub interval: i64,
    pub reps: i64,
    pub lapses: i64,
}

impl CardState {
    /// State of a card that has never been reviewed (legacy column defaults).
    #[must_use]
    pub const fn new_card() -> Self {
        Self {
            ease: 2.5,
            interval: 0,
            reps: 0,
            lapses: 0,
        }
    }
}

/// Result of reviewing a card: the new state plus the next due day.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Review {
    pub state: CardState,
    pub due_day: NaiveDate,
}

/// Apply one review.
///
/// `grade`: 1 = again, 3 = hard, 4 = good, 5 = easy (any value below 3 counts as a lapse).
/// An interval large enough to overflow the calendar saturates at the latest representable date.
#[must_use]
pub fn sm2(card: CardState, grade: i64, today: NaiveDate) -> Review {
    let CardState {
        mut ease,
        mut interval,
        mut reps,
        mut lapses,
    } = card;

    if grade < 3 {
        reps = 0;
        interval = 1;
        lapses += 1;
        ease = f64::max(MIN_EASE, ease - 0.2);
    } else {
        interval = match reps {
            0 => 1,
            1 => 6,
            _ => i64::max(1, py_round(interval as f64 * ease)),
        };
        if grade == 3 {
            interval = i64::max(1, py_round(interval as f64 * 0.8));
        }
        reps += 1;
        let miss = (5 - grade) as f64;
        ease = f64::max(MIN_EASE, ease + 0.1 - miss * (0.08 + miss * 0.02));
    }

    let due_day = u64::try_from(interval)
        .ok()
        .and_then(|days| today.checked_add_days(Days::new(days)))
        .unwrap_or(NaiveDate::MAX);

    Review {
        state: CardState {
            ease: py_round_ndigits(ease, 3),
            interval,
            reps,
            lapses,
        },
        due_day,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        s.parse().expect("valid date")
    }

    #[test]
    fn first_reviews_follow_the_fixed_ladder() {
        let today = day("2026-11-09");
        let r1 = sm2(CardState::new_card(), 4, today);
        assert_eq!((r1.state.interval, r1.state.reps), (1, 1));
        assert_eq!(r1.due_day, day("2026-11-10"));

        let r2 = sm2(r1.state, 4, today);
        assert_eq!((r2.state.interval, r2.state.reps), (6, 2));
        assert_eq!(r2.due_day, day("2026-11-15"));
    }

    #[test]
    fn lapse_resets_and_lowers_ease_but_not_below_the_floor() {
        let today = day("2026-11-09");
        let card = CardState {
            ease: 1.35,
            interval: 30,
            reps: 5,
            lapses: 1,
        };
        let r = sm2(card, 1, today);
        assert_eq!(
            r.state,
            CardState {
                ease: 1.3,
                interval: 1,
                reps: 0,
                lapses: 2
            }
        );
    }

    #[test]
    fn exact_half_interval_rounds_to_even_like_python() {
        // 5 * 2.5 = 12.5 -> Python round() gives 12 (f64::round would give 13).
        let card = CardState {
            ease: 2.5,
            interval: 5,
            reps: 2,
            lapses: 0,
        };
        let r = sm2(card, 4, day("2026-11-09"));
        assert_eq!(r.state.interval, 12);
    }

    #[test]
    fn hard_grade_shortens_the_interval() {
        let card = CardState {
            ease: 2.5,
            interval: 10,
            reps: 3,
            lapses: 0,
        };
        // 10 * 2.5 = 25, then * 0.8 = 20
        let r = sm2(card, 3, day("2026-11-09"));
        assert_eq!(r.state.interval, 20);
        assert_eq!(r.state.ease, 2.36);
    }

    #[test]
    fn calendar_overflow_saturates_instead_of_panicking() {
        let card = CardState {
            ease: 3.0,
            interval: i64::MAX / 4,
            reps: 9,
            lapses: 0,
        };
        let r = sm2(card, 5, day("2026-11-09"));
        assert_eq!(r.due_day, NaiveDate::MAX);
    }
}
