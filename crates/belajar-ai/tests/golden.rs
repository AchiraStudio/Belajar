//! `extract_json` must behave exactly like the legacy `llm.extract_json` on messy model output
//! (corpus: parity/golden/extract_json.jsonl, generated from the Python implementation).

use std::fs;
use std::path::PathBuf;

use belajar_ai::extract_json;
use serde_json::Value;

#[test]
fn extract_json_matches_python_on_every_golden_case() {
    let path: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "..",
        "..",
        "parity",
        "golden",
        "extract_json.jsonl",
    ]
    .iter()
    .collect();
    let text =
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    assert!(
        lines.len() >= 900,
        "golden corpus unexpectedly small: {}",
        lines.len()
    );

    let (mut parsed, mut failed) = (0, 0);
    for line in lines {
        let case: Value = serde_json::from_str(line).expect("valid golden line");
        let input = case["text"].as_str().expect("text");
        let got = extract_json(input);
        if case["ok"].as_bool().expect("ok") {
            assert_eq!(
                got.as_ref().ok(),
                Some(&case["value"]),
                "input: {input:?}\nrust: {got:?}"
            );
            parsed += 1;
        } else {
            assert!(
                got.is_err(),
                "Python rejects {input:?} but Rust returned {got:?}"
            );
            failed += 1;
        }
    }
    assert!(
        parsed > 500 && failed > 50,
        "parsed={parsed} failed={failed}"
    );
}
