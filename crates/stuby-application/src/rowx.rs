//! Convenience accessors for [`stuby_storage::Row`] (a JSON object).

use stuby_storage::Row;
use serde_json::Value;

#[must_use]
pub fn str_of<'a>(row: &'a Row, key: &str) -> Option<&'a str> {
    row.get(key).and_then(Value::as_str)
}

#[must_use]
pub fn i64_of(row: &Row, key: &str) -> Option<i64> {
    row.get(key).and_then(Value::as_i64)
}

#[must_use]
pub fn f64_of(row: &Row, key: &str) -> Option<f64> {
    row.get(key).and_then(Value::as_f64)
}

/// A JSON column that may be NULL, an array/object, or (legacy double-encoded) a JSON string.
#[must_use]
pub fn json_of(row: &Row, key: &str, default: Value) -> Value {
    match row.get(key) {
        None | Some(Value::Null) => default,
        Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(default),
        Some(other) => other.clone(),
    }
}

/// Strings of a JSON array column (non-strings are skipped).
#[must_use]
pub fn string_list(row: &Row, key: &str) -> Vec<String> {
    match json_of(row, key, Value::Array(Vec::new())) {
        Value::Array(items) => items
            .into_iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}
