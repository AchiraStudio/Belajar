//! Numeric helpers that reproduce Python semantics.
//!
//! Python's `round()` rounds exact halves to the nearest **even** integer ("banker's rounding"),
//! while `f64::round` rounds them away from zero. The legacy app uses `round()` in 14 places
//! (SM-2 intervals, mastery, XP, every percentage), so a plain `f64::round` silently changes
//! results: `round(100 * 5 / 8)` is 62 in Python and 63 with `f64::round`.
//!
//! `f64::round` is therefore banned workspace-wide by `clippy.toml`.

/// Python's `round(x)` for a float: nearest integer, exact halves to even.
///
/// Like Python (which raises), non-finite input is a caller bug; here it saturates to `0`/`i64`
/// limits via Rust's `as` conversion instead of panicking.
#[must_use]
pub fn py_round(x: f64) -> i64 {
    x.round_ties_even() as i64
}

/// Python's `round(x, ndigits)` for a float and `ndigits >= 0`.
///
/// Python rounds the **exact decimal value** of the binary float, so `round(2.675, 2)` is `2.67`
/// (2.675 is really 2.67499999...). Rust's `{:.N}` formatting is exact in the same way, and an
/// exact tie is resolved to even by both, so formatting then parsing reproduces Python.
/// Equality with Python is asserted over a golden corpus (`parity/golden/py_round.jsonl`).
#[must_use]
pub fn py_round_ndigits(x: f64, ndigits: u32) -> f64 {
    if !x.is_finite() {
        return x;
    }
    format!("{x:.prec$}", prec = ndigits as usize)
        .parse()
        .unwrap_or(x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_halves_round_to_even_like_python() {
        // Values printed by CPython 3.14: [round(x) for x in (0.5, 1.5, 2.5, 7.5, 12.5)]
        assert_eq!(py_round(0.5), 0);
        assert_eq!(py_round(1.5), 2);
        assert_eq!(py_round(2.5), 2);
        assert_eq!(py_round(7.5), 8);
        assert_eq!(py_round(12.5), 12);
        assert_eq!(py_round(-0.5), 0);
        assert_eq!(py_round(-1.5), -2);
        assert_eq!(py_round(-2.5), -2);
    }

    #[test]
    fn percentages_from_the_audit() {
        // The examples in docs/TECHNICAL_RISKS.md R-P1: Python gives 62, 12, 88.
        assert_eq!(py_round(100.0 * 5.0 / 8.0), 62);
        assert_eq!(py_round(100.0 * 1.0 / 8.0), 12);
        assert_eq!(py_round(100.0 * 7.0 / 8.0), 88);
    }

    #[test]
    fn non_ties_are_ordinary_rounding() {
        assert_eq!(py_round(2.4999), 2);
        assert_eq!(py_round(2.5001), 3);
        assert_eq!(py_round(-2.5001), -3);
    }

    #[test]
    fn ndigits_rounds_the_exact_binary_value() {
        // CPython: round(2.675, 2) == 2.67, round(0.125, 2) == 0.12, round(0.375, 2) == 0.38
        assert_eq!(py_round_ndigits(2.675, 2), 2.67);
        assert_eq!(py_round_ndigits(0.125, 2), 0.12);
        assert_eq!(py_round_ndigits(0.375, 2), 0.38);
        assert_eq!(py_round_ndigits(2.5, 0), 2.0);
    }

    #[test]
    fn ndigits_preserves_special_values() {
        assert!(py_round_ndigits(f64::NAN, 3).is_nan());
        assert_eq!(py_round_ndigits(f64::INFINITY, 3), f64::INFINITY);
        assert!(py_round_ndigits(-0.0001, 2).is_sign_negative());
    }
}
