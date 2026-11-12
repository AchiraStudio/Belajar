//! Tolerant JSON extraction from model output (legacy `llm.extract_json`).
//!
//! Models wrap JSON in prose, markdown fences and `<think>` blocks, and write LaTeX with raw
//! backslashes (`\frac`, `\beta`) that are invalid JSON escapes (or worse, valid ones: `\f` is a
//! form feed, so `\frac` would silently become FF + "rac"). The repairs below double those
//! backslashes before parsing.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

/// LaTeX commands whose first letters collide with JSON escapes (`\b \f \n \r \t`) and others the
/// legacy list protects. A backslash followed by exactly one of these words is doubled.
const LATEX_WORDS: [&str; 29] = [
    "beta",
    "bar",
    "begin",
    "binom",
    "bf",
    "boldsymbol",
    "frac",
    "forall",
    "footnote",
    "nu",
    "neq",
    "ne",
    "nabla",
    "not",
    "notin",
    "rho",
    "right",
    "rightarrow",
    "Rightarrow",
    "rm",
    "tau",
    "theta",
    "text",
    "textbf",
    "times",
    "to",
    "tilde",
    "top",
    "tan",
];

/// `_LATEX_CMD.sub(r"\\\\", text)`: double each protected LaTeX backslash.
///
/// The legacy regex is `(?<!\\)\\(?=(?:word|...)(?![a-zA-Z]))`: a backslash that is not itself
/// preceded by a backslash and is followed by *exactly* one listed word (the lookahead after the
/// alternation means the whole run of letters must be that word).
fn protect_latex(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len() + 8);
    for (i, &c) in chars.iter().enumerate() {
        out.push(c);
        if c != '\\' || (i > 0 && chars[i - 1] == '\\') {
            continue;
        }
        let word: String = chars[i + 1..]
            .iter()
            .take_while(|ch| ch.is_ascii_alphabetic())
            .collect();
        if LATEX_WORDS.contains(&word.as_str()) {
            out.push('\\');
        }
    }
    out
}

/// `_repair`: protect LaTeX, then double every backslash that is not a valid JSON escape
/// (`re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)`).
fn repair(text: &str) -> String {
    let protected: Vec<char> = protect_latex(text).chars().collect();
    let mut out = String::with_capacity(protected.len() + 8);
    for (i, &c) in protected.iter().enumerate() {
        out.push(c);
        if c == '\\'
            && !protected
                .get(i + 1)
                .is_some_and(|n| matches!(n, '"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' | 'u'))
        {
            out.push('\\');
        }
    }
    out
}

/// `_loads`: parse with LaTeX protected, else with the full repair.
fn loads(text: &str) -> Result<Value, serde_json::Error> {
    serde_json::from_str(&protect_latex(text)).or_else(|_| serde_json::from_str(&repair(text)))
}

/// First JSON value at the start of `snippet`, ignoring whatever follows (`raw_decode`).
fn raw_decode(snippet: &str) -> Option<Value> {
    serde_json::Deserializer::from_str(snippet)
        .into_iter::<Value>()
        .next()?
        .ok()
}

static THINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<think>.*?</think>").expect("valid regex"));
static FENCE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)^```(?:json)?\s*(.*?)\s*```$").expect("valid regex"));

/// Find a JSON object or array in model output. `Err` carries the legacy message.
pub fn extract_json(text: &str) -> Result<Value, String> {
    let without_think = THINK.replace_all(text, "");
    let mut cleaned = without_think.trim().to_owned();
    if let Some(inner) = FENCE
        .captures(&cleaned)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_owned())
    {
        cleaned = inner;
    }
    if let Ok(v) = loads(&cleaned) {
        return Ok(v);
    }
    // Scan for a JSON start in the middle of prose (at most 40 candidates, like the legacy code).
    let starts = cleaned
        .char_indices()
        .filter(|(_, c)| matches!(c, '[' | '{'))
        .map(|(i, _)| i)
        .take(40);
    for start in starts {
        let snippet = &cleaned[start..];
        for candidate in [protect_latex(snippet), repair(snippet)] {
            if let Some(v) = raw_decode(&candidate)
                && (v.is_object() || v.is_array())
            {
                return Ok(v);
            }
        }
    }
    Err("JSON tidak ditemukan dalam jawaban".to_owned())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn plain_fenced_and_prefixed_json() {
        assert_eq!(extract_json(r#"{"a": 1}"#).unwrap(), json!({"a": 1}));
        assert_eq!(
            extract_json("```json\n{\"a\": [1, 2]}\n```").unwrap(),
            json!({"a": [1, 2]})
        );
        assert_eq!(
            extract_json(r#"Tentu! Ini hasilnya: {"a": 1} semoga membantu."#).unwrap(),
            json!({"a": 1})
        );
        assert_eq!(
            extract_json("<think>hmm {\"x\":0}</think>[1,2]").unwrap(),
            json!([1, 2])
        );
    }

    #[test]
    fn latex_backslashes_survive_instead_of_becoming_control_characters() {
        // \frac and \beta are protected; without that, \f would be a form feed.
        let v = extract_json(r#"{"t": "rumus \frac{a}{b} dan \beta"}"#).unwrap();
        assert_eq!(v["t"], r"rumus \frac{a}{b} dan \beta");
        // An unknown backslash is repaired too.
        let v = extract_json(r#"{"t": "path C:\data"}"#).unwrap();
        assert_eq!(v["t"], r"path C:\data");
    }

    #[test]
    fn garbage_is_an_error() {
        assert_eq!(
            extract_json("tidak ada json di sini").unwrap_err(),
            "JSON tidak ditemukan dalam jawaban"
        );
    }
}
