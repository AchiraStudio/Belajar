//! Study streaks, activity heatmap and weekly totals.
//!
//! Faithful port of the pure parts of the legacy `stats.py`. The database reads stay outside: the
//! caller passes the per-day totals, the goal and "today". Outputs serialise to exactly the JSON
//! the unchanged frontend consumes.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Datelike, Days, Duration, NaiveDate};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

/// A streak freeze is earned every this many streak days.
pub const FREEZE_EVERY: i64 = 7;
/// At most this many freezes can be banked.
pub const MAX_FREEZES: i64 = 2;

/// Seconds studied and quizzes finished on one day.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DayTotals {
    pub seconds: i64,
    pub quizzes: i64,
}

pub type Totals = BTreeMap<NaiveDate, DayTotals>;

/// The local calendar day of a UNIX timestamp, shifted so a "day" starts at `day_start_hour`
/// (legacy `stats.day_of`).
///
/// Python subtracts the shift from the *wall-clock* time (`aware_datetime - timedelta`), not from
/// the absolute instant, so the two differ around DST changes. We subtract from the local naive
/// time to match.
#[must_use]
pub fn day_of(ts: f64, tz: Tz, day_start_hour: i64) -> NaiveDate {
    let secs = ts.floor();
    let nanos = ((ts - secs) * 1e9) as u32;
    let local = DateTime::from_timestamp(secs as i64, nanos)
        .unwrap_or_default()
        .with_timezone(&tz)
        .naive_local();
    (local - Duration::hours(day_start_hour)).date()
}

/// Parse a number the way Python's `int(float(text))` does; `None` where Python would raise.
fn int_of_float(text: &str) -> Option<i64> {
    let v: f64 = text.trim().parse().ok()?;
    v.is_finite().then_some(v.trunc() as i64)
}

/// Daily goal in seconds from the `daily_goal_min` setting (legacy `stats.goal_seconds`).
#[must_use]
pub fn goal_seconds(setting: Option<&str>) -> i64 {
    let text = setting.unwrap_or("10");
    match text.trim().parse::<f64>() {
        Ok(minutes) if minutes.is_finite() => i64::max(60, (minutes * 60.0).trunc() as i64),
        _ => 600,
    }
}

/// An active day has at least one finished quiz or reached the goal.
#[must_use]
pub fn is_active(day: Option<&DayTotals>, goal: i64) -> bool {
    day.is_some_and(|d| d.quizzes >= 1 || d.seconds >= goal)
}

/// Current streak, best streak and freeze bookkeeping (legacy `stats.compute_streak`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Streak {
    pub current: i64,
    pub longest: i64,
    pub freezes: i64,
    pub freeze_used: Vec<NaiveDate>,
}

/// Walk every day from the first active day to today. Missed days are bridged by a freeze (earned
/// every 7 streak days, max 2) or reset the streak; today itself is never judged.
#[must_use]
pub fn compute_streak(active: &BTreeSet<NaiveDate>, today: NaiveDate) -> Streak {
    let Some(&first) = active.iter().next() else {
        return Streak {
            current: 0,
            longest: 0,
            freezes: 0,
            freeze_used: Vec::new(),
        };
    };
    let (mut streak, mut longest, mut freezes) = (0_i64, 0_i64, 0_i64);
    let mut used: Vec<NaiveDate> = Vec::new();
    let mut day = first;
    while day <= today {
        if active.contains(&day) {
            streak += 1;
            longest = longest.max(streak);
            if streak % FREEZE_EVERY == 0 && freezes < MAX_FREEZES {
                freezes += 1;
            }
        } else if day < today {
            if freezes > 0 {
                freezes -= 1;
                used.push(day);
            } else {
                streak = 0;
            }
        }
        let Some(next) = day.checked_add_days(Days::new(1)) else {
            break;
        };
        day = next;
    }
    let keep_from = used.len().saturating_sub(5);
    Streak {
        current: streak,
        longest,
        freezes,
        freeze_used: used.split_off(keep_from),
    }
}

/// Today's progress block inside [`StreakInfo`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TodayInfo {
    pub day: NaiveDate,
    pub seconds: i64,
    pub quizzes: i64,
    pub goal_seconds: i64,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StreakInfo {
    #[serde(flatten)]
    pub streak: Streak,
    pub today: TodayInfo,
    pub at_risk: bool,
}

#[must_use]
pub fn streak_info(totals: &Totals, goal: i64, today: NaiveDate) -> StreakInfo {
    let active: BTreeSet<NaiveDate> = totals
        .iter()
        .filter(|(_, d)| is_active(Some(d), goal))
        .map(|(day, _)| *day)
        .collect();
    let streak = compute_streak(&active, today);
    let today_totals = totals.get(&today).copied().unwrap_or_default();
    let done = is_active(Some(&today_totals), goal);
    let at_risk = !done && streak.current > 0;
    StreakInfo {
        streak,
        today: TodayInfo {
            day: today,
            seconds: today_totals.seconds,
            quizzes: today_totals.quizzes,
            goal_seconds: goal,
            done,
        },
        at_risk,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeatCell {
    pub day: NaiveDate,
    pub seconds: i64,
    pub quizzes: i64,
    pub level: u8,
}

fn heat_level(seconds: i64, quizzes: i64, goal: i64) -> u8 {
    let (s, g) = (seconds as f64, goal as f64);
    if seconds == 0 && quizzes == 0 {
        0
    } else if quizzes == 0 && s < g / 2.0 {
        1
    } else if quizzes == 0 && seconds < goal {
        2
    } else if seconds >= goal * 2 || quizzes >= 2 {
        4
    } else {
        3
    }
}

/// The last `days` days ending today, oldest first, with a 0-4 intensity level.
#[must_use]
pub fn heatmap(totals: &Totals, goal: i64, today: NaiveDate, days: u32) -> Vec<HeatCell> {
    (0..days)
        .rev()
        .filter_map(|back| today.checked_sub_days(Days::new(u64::from(back))))
        .map(|day| {
            let t = totals.get(&day).copied().unwrap_or_default();
            HeatCell {
                day,
                seconds: t.seconds,
                quizzes: t.quizzes,
                level: heat_level(t.seconds, t.quizzes, goal),
            }
        })
        .collect()
}

/// Monday of the week containing `today`.
#[must_use]
pub fn week_start(today: NaiveDate) -> NaiveDate {
    let back = u64::from(today.weekday().num_days_from_monday());
    today.checked_sub_days(Days::new(back)).unwrap_or(today)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Weekly {
    pub start: NaiveDate,
    pub seconds: i64,
    pub quizzes: i64,
    pub goal_min: i64,
}

/// `weekly_goal_min_setting` is the raw setting text (default 120 when missing or not a number).
#[must_use]
pub fn weekly(totals: &Totals, today: NaiveDate, weekly_goal_min_setting: Option<&str>) -> Weekly {
    let start = week_start(today);
    let (seconds, quizzes) = totals
        .iter()
        .filter(|(day, _)| **day >= start)
        .fold((0, 0), |(s, q), (_, t)| (s + t.seconds, q + t.quizzes));
    let goal_min = weekly_goal_min_setting
        .and_then(int_of_float)
        .unwrap_or(120);
    Weekly {
        start,
        seconds,
        quizzes,
        goal_min,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StudyDay {
    pub day: NaiveDate,
    pub seconds: i64,
    pub quizzes: i64,
}

#[must_use]
pub fn study_days(totals: &Totals, today: NaiveDate, days: u32) -> Vec<StudyDay> {
    (0..days)
        .rev()
        .filter_map(|back| today.checked_sub_days(Days::new(u64::from(back))))
        .map(|day| {
            let t = totals.get(&day).copied().unwrap_or_default();
            StudyDay {
                day,
                seconds: t.seconds,
                quizzes: t.quizzes,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        s.parse().expect("date")
    }

    #[test]
    fn goal_seconds_follows_python_int_of_float() {
        assert_eq!(goal_seconds(None), 600);
        assert_eq!(goal_seconds(Some("10")), 600);
        assert_eq!(goal_seconds(Some("0.5")), 60); // floor of 30 seconds is raised to the 60 s minimum
        assert_eq!(goal_seconds(Some("1.5")), 90);
        assert_eq!(goal_seconds(Some("abc")), 600);
        assert_eq!(goal_seconds(Some("")), 600);
    }

    #[test]
    fn a_missed_day_without_a_freeze_resets_the_streak() {
        let active: BTreeSet<_> = [d("2026-11-01"), d("2026-11-02"), d("2026-11-04")].into();
        let s = compute_streak(&active, d("2026-11-05"));
        assert_eq!((s.current, s.longest), (1, 2));
    }

    #[test]
    fn seven_days_earn_a_freeze_that_bridges_the_next_gap() {
        let active: BTreeSet<_> = (1..=7)
            .map(|n| d(&format!("2026-11-0{n}")))
            .chain([d("2026-11-09")])
            .collect();
        let s = compute_streak(&active, d("2026-11-09"));
        assert_eq!(s.current, 8);
        assert_eq!(s.freeze_used, vec![d("2026-11-08")]);
    }
}
