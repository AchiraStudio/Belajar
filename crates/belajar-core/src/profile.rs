//! Player level curve (legacy `profile.level_info`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LevelInfo {
    pub level: i64,
    pub xp: i64,
    pub level_start: i64,
    pub next: i64,
}

/// Level for a total XP: `max(1, floor((1 + sqrt(1 + xp / 12.5)) / 2))`; levels get progressively
/// more expensive (`level_start = 50 * (level - 1) * level`).
#[must_use]
pub fn level_info(xp: i64) -> LevelInfo {
    let level = i64::max(1, ((1.0 + (1.0 + xp as f64 / 12.5).sqrt()) / 2.0) as i64);
    LevelInfo {
        level,
        xp,
        level_start: 50 * (level - 1) * level,
        next: 50 * level * (level + 1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_levels() {
        assert_eq!(level_info(0).level, 1);
        assert_eq!(level_info(100).level, 2);
        assert_eq!(level_info(0).next, 100);
    }
}
