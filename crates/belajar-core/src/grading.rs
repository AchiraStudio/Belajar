//! Short-answer grading (legacy `pipeline.grade_short_local`, `pipeline._norm`,
//! `handlers._fuzzy_fallback`).

use unicode_normalization::UnicodeNormalization;

use crate::difflib;

/// Normalise text for comparison: NFKD, drop non-ASCII, lowercase, non-alphanumerics to spaces,
/// collapse whitespace. ("é" matches "e"; text in non-Latin scripts becomes empty, as in legacy.)
#[must_use]
pub fn norm(text: &str) -> String {
    let ascii: String = text.nfkd().filter(char::is_ascii).collect();
    let spaced: String = ascii
        .to_ascii_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c == ' ' {
                c
            } else {
                ' '
            }
        })
        .collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Every number in `text` (`-?\d+(?:[.,]\d+)?`, comma read as decimal point), left to right.
/// Only ASCII digits are recognised (Python's `\d` also accepts other scripts' digits).
#[must_use]
pub fn numbers(text: &str) -> Vec<f64> {
    let chars: Vec<char> = text.chars().collect();
    let digit = |i: usize| chars.get(i).is_some_and(char::is_ascii_digit);
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let start = i;
        let mut j = i;
        if chars[j] == '-' {
            j += 1;
        }
        if digit(j) {
            while digit(j) {
                j += 1;
            }
            if matches!(chars.get(j), Some('.' | ',')) && digit(j + 1) {
                j += 1;
                while digit(j) {
                    j += 1;
                }
            }
            let literal: String = chars[start..j]
                .iter()
                .map(|&c| if c == ',' { '.' } else { c })
                .collect();
            if let Ok(v) = literal.parse::<f64>() {
                out.push(v);
            }
            i = j;
        } else {
            i = start + 1;
        }
    }
    out
}

/// Whether the whole (trimmed) answer is one number, optionally followed by `%`.
fn is_numeric_answer(answer: &str) -> bool {
    let chars: Vec<char> = answer.trim().chars().collect();
    let digit = |i: usize| chars.get(i).is_some_and(char::is_ascii_digit);
    let mut j = usize::from(chars.first() == Some(&'-'));
    if !digit(j) {
        return false;
    }
    while digit(j) {
        j += 1;
    }
    if matches!(chars.get(j), Some('.' | ',')) && digit(j + 1) {
        j += 1;
        while digit(j) {
            j += 1;
        }
    }
    while chars.get(j).is_some_and(|c| c.is_whitespace()) {
        j += 1;
    }
    if chars.get(j) == Some(&'%') {
        j += 1;
    }
    j == chars.len()
}

/// Grade a short answer without the AI. `Some(true/false)` when sure, `None` when the AI must judge.
#[must_use]
pub fn grade_short_local(given: &str, answer: &str, keywords: &[String]) -> Option<bool> {
    let g = norm(given);
    let a = norm(answer);
    if g.is_empty() {
        return Some(false);
    }
    if g == a {
        return Some(true);
    }
    if is_numeric_answer(answer) {
        // The key is a number: compare numerically, ignoring formatting and surrounding words.
        let target = *numbers(answer).first()?;
        return Some(numbers(given).iter().any(|x| (x - target).abs() < 1e-9));
    }
    let (a_len, g_len) = (a.chars().count(), g.chars().count());
    if !a.is_empty() && a_len >= 3 && g.contains(&a) && g_len <= a_len * 3 {
        return Some(true);
    }
    let ratio = difflib::ratio(&g, &a);
    if ratio >= 0.88 {
        return Some(true);
    }
    let kws: Vec<String> = keywords
        .iter()
        .map(|k| norm(k))
        .filter(|k| !k.is_empty())
        .collect();
    if !kws.is_empty() {
        let hits = kws.iter().filter(|k| g.contains(k.as_str())).count();
        if hits == kws.len() {
            return Some(true);
        }
        if hits == 0 && ratio < 0.4 {
            return Some(false);
        }
    }
    if ratio < 0.3 {
        return Some(false);
    }
    None
}

/// Lenient grading used when the AI grader is unavailable (legacy `handlers._fuzzy_fallback`).
#[must_use]
pub fn fuzzy_fallback(given: &str, answer: &str, keywords: &[String]) -> bool {
    let g = norm(given);
    let a = norm(answer);
    if difflib::ratio(&g, &a) >= 0.6 {
        return true;
    }
    let kws: Vec<String> = keywords
        .iter()
        .map(|k| norm(k))
        .filter(|k| !k.is_empty())
        .collect();
    !kws.is_empty() && kws.iter().filter(|k| g.contains(k.as_str())).count() * 2 >= kws.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn norm_strips_accents_and_punctuation() {
        assert_eq!(norm("  Café,  NAÏVE!! "), "cafe naive");
        assert_eq!(norm("日本語"), "");
    }

    #[test]
    fn numbers_reads_decimal_commas_and_negatives() {
        assert_eq!(numbers("sekitar 12,5 dan -3"), vec![12.5, -3.0]);
        assert_eq!(numbers("1-2"), vec![1.0, -2.0]);
        assert!(numbers("tidak ada").is_empty());
    }

    #[test]
    fn numeric_keys_compare_numerically() {
        assert_eq!(grade_short_local("12.5", "12,5", &[]), Some(true));
        assert_eq!(
            grade_short_local("sekitar 80 persen", "80%", &[]),
            Some(true)
        );
        assert_eq!(grade_short_local("81", "80%", &[]), Some(false));
    }
}
