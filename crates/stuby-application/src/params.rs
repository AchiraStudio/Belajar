//! Request-parameter helpers that reproduce the coercion rules of the legacy Python handlers
//! (`need_int`, `opt_int`, `clip`, truthiness), because the unchanged frontend relies on them.

use serde_json::Value;

use crate::error::AppError;

/// Python `int(value)`: ints, floats (truncated), numeric strings and bools; `None` where Python raises.
#[must_use]
pub fn py_int(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64().or_else(|| {
            n.as_f64()
                .filter(|f| f.is_finite())
                .map(|f| f.trunc() as i64)
        }),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        Value::Bool(b) => Some(i64::from(*b)),
        _ => None,
    }
}

/// Python `int(float(value))`.
#[must_use]
pub fn py_int_of_float(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n
            .as_f64()
            .filter(|f| f.is_finite())
            .map(|f| f.trunc() as i64),
        Value::String(s) => s
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|f| f.is_finite())
            .map(|f| f.trunc() as i64),
        Value::Bool(b) => Some(i64::from(*b)),
        _ => None,
    }
}

/// `common.clamp`: `int(float(value))` limited to `[lo, hi]`, or `default` when it is not a number.
#[must_use]
pub fn clamp(v: Option<&Value>, lo: i64, hi: i64, default: i64) -> i64 {
    v.and_then(py_int_of_float)
        .map_or(default, |n| n.clamp(lo, hi))
}

/// Python `str(value)` for the JSON types a client can send.
#[must_use]
pub fn py_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "None".to_owned(),
        Value::Bool(true) => "True".to_owned(),
        Value::Bool(false) => "False".to_owned(),
        other => other.to_string(),
    }
}

/// Python truthiness of a JSON value (`None`, `0`, `""`, `[]`, `{}` and `false` are falsy).
#[must_use]
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

/// Required integer parameter, optionally range-checked (`need_int`).
pub fn need_int(p: &Value, key: &str, lo: Option<i64>, hi: Option<i64>) -> Result<i64, AppError> {
    let value = p
        .get(key)
        .and_then(py_int)
        .ok_or_else(|| AppError::user(format!("Parameter '{key}' tidak valid.")))?;
    if lo.is_some_and(|l| value < l) || hi.is_some_and(|h| value > h) {
        return Err(AppError::user(format!("Parameter '{key}' di luar batas.")));
    }
    Ok(value)
}

/// Optional integer: `None` for missing, `null`, `""`, `0` and `"0"` (`opt_int`).
pub fn opt_int(p: &Value, key: &str) -> Result<Option<i64>, AppError> {
    match p.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if s.is_empty() || s == "0" => Ok(None),
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => Ok(None),
        Some(_) => need_int(p, key, None, None).map(Some),
    }
}

/// `str(value or "").strip()[:n]` — truncation counts characters, never bytes.
#[must_use]
pub fn clip(v: Option<&Value>, n: usize) -> String {
    let text = match v {
        Some(value) if truthy(Some(value)) => py_str(value),
        _ => String::new(),
    };
    text.trim().chars().take(n).collect()
}

/// `str(value)[:n]` without the strip (used for answers).
#[must_use]
pub fn head_chars(text: &str, n: usize) -> String {
    text.chars().take(n).collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn need_int_coerces_like_python() {
        let p = json!({"a": 5, "b": "7", "c": 3.9, "d": " 9 ", "e": true, "f": "x", "g": null});
        assert_eq!(need_int(&p, "a", None, None).unwrap(), 5);
        assert_eq!(need_int(&p, "b", None, None).unwrap(), 7);
        assert_eq!(need_int(&p, "c", None, None).unwrap(), 3);
        assert_eq!(need_int(&p, "d", None, None).unwrap(), 9);
        assert_eq!(need_int(&p, "e", None, None).unwrap(), 1);
        for bad in ["f", "g", "missing"] {
            assert_eq!(
                need_int(&p, bad, None, None).unwrap_err().to_string(),
                format!("Parameter '{bad}' tidak valid.")
            );
        }
        assert_eq!(
            need_int(&p, "a", Some(6), None).unwrap_err().to_string(),
            "Parameter 'a' di luar batas."
        );
    }

    #[test]
    fn opt_int_treats_empty_values_as_absent() {
        let p = json!({"a": 0, "b": "0", "c": "", "d": null, "e": 4, "f": "x"});
        for key in ["a", "b", "c", "d", "missing"] {
            assert_eq!(opt_int(&p, key).unwrap(), None, "{key}");
        }
        assert_eq!(opt_int(&p, "e").unwrap(), Some(4));
        assert!(opt_int(&p, "f").is_err());
    }

    #[test]
    fn clamp_limits_or_falls_back_like_python() {
        assert_eq!(clamp(Some(&json!(500)), 1, 100, 20), 100);
        assert_eq!(clamp(Some(&json!("7.9")), 1, 100, 20), 7);
        assert_eq!(clamp(Some(&json!(-3)), 1, 100, 20), 1);
        assert_eq!(clamp(Some(&json!(1e30)), 1, 100, 20), 100);
        assert_eq!(clamp(Some(&json!("abc")), 1, 100, 20), 20);
        assert_eq!(clamp(Some(&json!(null)), 1, 100, 20), 20);
        assert_eq!(clamp(None, 1, 100, 20), 20);
    }

    #[test]
    fn clip_counts_characters_not_bytes() {
        assert_eq!(clip(Some(&json!("  halo dunia  ")), 4), "halo");
        assert_eq!(clip(Some(&json!("éééé")), 2), "éé");
        assert_eq!(clip(Some(&json!(0)), 5), "");
        assert_eq!(clip(None, 5), "");
        assert_eq!(clip(Some(&json!(42)), 5), "42");
    }

    #[test]
    fn truthiness_matches_python() {
        assert!(
            !truthy(None)
                && !truthy(Some(&json!(0)))
                && !truthy(Some(&json!("")))
                && !truthy(Some(&json!([])))
        );
        assert!(truthy(Some(&json!(1))) && truthy(Some(&json!("0"))) && truthy(Some(&json!([0]))));
    }
}
