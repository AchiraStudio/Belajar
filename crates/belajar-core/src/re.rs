//! Thin helpers over `fancy-regex` that mimic Python's `re` conveniences (`sub` with a callback,
//! `split` that keeps captured separators). Lookaround is why `fancy-regex` is used at all: the
//! standard `regex` crate has none (docs/TECHNICAL_RISKS.md R-P3).

use fancy_regex::{Captures, Regex};

/// A compiled pattern. Matching errors (e.g. the backtracking limit) are treated as "no match"
/// instead of panicking: the cleaners must never take the server down on odd model output.
pub struct Re(Regex);

impl Re {
    /// Compile a pattern known at build time.
    ///
    /// # Panics
    /// If the pattern is invalid, which is a programming error caught by the tests.
    #[must_use]
    pub fn new(pattern: &str) -> Self {
        Self(Regex::new(pattern).unwrap_or_else(|e| panic!("invalid regex {pattern:?}: {e}")))
    }

    #[must_use]
    pub fn is_match(&self, text: &str) -> bool {
        self.0.is_match(text).unwrap_or(false)
    }

    /// Leftmost match as `(start, end)` byte offsets.
    #[must_use]
    pub fn find(&self, text: &str) -> Option<(usize, usize)> {
        self.0.find(text).ok().flatten().map(|m| (m.start(), m.end()))
    }

    #[must_use]
    pub fn captures<'t>(&self, text: &'t str) -> Option<Captures<'t>> {
        self.0.captures(text).ok().flatten()
    }

    /// Number of non-overlapping matches.
    #[must_use]
    pub fn count(&self, text: &str) -> usize {
        self.0.find_iter(text).filter_map(Result::ok).count()
    }

    /// `re.sub(pattern, callback, text)`.
    pub fn sub(&self, text: &str, mut replacement: impl FnMut(&Captures<'_>) -> String) -> String {
        let mut out = String::with_capacity(text.len());
        let mut last = 0;
        for caps in self.0.captures_iter(text).filter_map(Result::ok) {
            let Some(whole) = caps.get(0) else { continue };
            out.push_str(&text[last..whole.start()]);
            out.push_str(&replacement(&caps));
            last = whole.end();
        }
        out.push_str(&text[last..]);
        out
    }

    /// `re.sub(pattern, literal, text)` (no group references).
    #[must_use]
    pub fn replace(&self, text: &str, literal: &str) -> String {
        self.sub(text, |_| literal.to_owned())
    }

    /// `re.split` for a pattern with one capturing group: `[text, group, text, group, ..., text]`.
    #[must_use]
    pub fn split_keep(&self, text: &str) -> Vec<String> {
        let mut parts = Vec::new();
        let mut last = 0;
        for caps in self.0.captures_iter(text).filter_map(Result::ok) {
            let Some(whole) = caps.get(0) else { continue };
            parts.push(text[last..whole.start()].to_owned());
            parts.push(caps.get(1).map_or_else(String::new, |g| g.as_str().to_owned()));
            last = whole.end();
        }
        parts.push(text[last..].to_owned());
        parts
    }

    /// `re.split` without capturing groups: just the pieces between matches.
    #[must_use]
    pub fn split(&self, text: &str) -> Vec<String> {
        let mut parts = Vec::new();
        let mut last = 0;
        for m in self.0.find_iter(text).filter_map(Result::ok) {
            parts.push(text[last..m.start()].to_owned());
            last = m.end();
        }
        parts.push(text[last..].to_owned());
        parts
    }

    /// All non-overlapping matches as strings.
    #[must_use]
    pub fn find_all(&self, text: &str) -> Vec<String> {
        self.0.find_iter(text).filter_map(Result::ok).map(|m| m.as_str().to_owned()).collect()
    }
}

/// Group `i` of a match as `&str` (`""` when it did not participate).
#[must_use]
pub fn group<'t>(caps: &Captures<'t>, i: usize) -> &'t str {
    caps.get(i).map_or("", |m| m.as_str())
}
