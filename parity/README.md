# parity/ — proving the Rust port behaves like the legacy Python

The legacy implementation is the specification. For every deterministic rule that is ported to
`crates/belajar-core`, we record what the **legacy code** returns for a large set of inputs
(`golden/*.jsonl`) and require the Rust code to reproduce it exactly.

```
parity/gen_golden.py      runs the legacy Python (cards.sm2, round(), ...) and writes golden/*.jsonl
parity/golden/*.jsonl     committed corpora: one JSON object per line, input + legacy output
parity/golden/META.json   legacy commit, Python version, case counts
crates/belajar-core/tests/golden.rs   Rust comparators (floats compared bit-for-bit)
```

## Rules

1. **Golden files come from the legacy code only.** Never edit them by hand and never generate them
   from the Rust implementation. CI re-runs the generator and fails if the files change.
2. **Legacy behaviour wins**, including quirks, unless the change is listed as intentional in
   `docs/FEATURE_INVENTORY.md` §4 and approved. An intentional difference gets an explicit test
   that documents it; it is not hidden by loosening a comparison.
3. **No tolerances on floats.** One ULP of `ease` eventually moves a due date.
4. **Prove the corpus can fail.** Each module has a guard test showing the corpus contains inputs
   a naive port gets wrong (see `corpus_distinguishes_python_rounding_from_f64_round`).

## Adding a module (checklist)

1. Add a `*_cases()` function to `gen_golden.py` that calls the real legacy function. Include
   exhaustive small grids, boundary values, and randomised/replayed inputs (fixed seeds).
2. Run `python parity/gen_golden.py` with the legacy dependencies installed
   (`pip install -r requirements.txt`) and commit the new `.jsonl` and `META.json`.
3. Write the Rust module in `belajar-core` and a comparator in `tests/golden.rs`.
4. Mutation-check: break the Rust implementation on purpose and confirm the golden test fails.

## Modules and status

| Module | Legacy source | Corpus | Rust | Status |
|---|---|---|---|---|
| `py_round`, `py_round_ndigits` | Python `round()` (14 call sites) | `py_round.jsonl` (18 851) | `numeric.rs` | **done, bit-exact** |
| SM-2 | `cards.sm2` | `sm2.jsonl` (4 508) | `spaced_repetition.rs` | **done, bit-exact** |
| streaks / stats | `stats.compute_streak`, `day_of` | — | — | Stage 5 |
| level / XP / achievements / quests | `profile.py`, `play_engine._finalize` | — | — | Stage 5 |
| mastery replay | `play_director._replay` | — | — | Stage 5 |
| quiz allocate / normalise / scoring | `pipeline.py`, `handlers.py` | — | — | Stage 5 |
| short-answer grading + `difflib` port | `pipeline.grade_short_local` | — | — | Stage 5 |
| game graders / reducers / protocol parser | `play_games.py`, `play_protocol.py` | — | — | Stage 5 |
| sanitize / detect / assemblers / `normalize_tree` | `sanitize.py`, `detect.py`, `pipeline.py`, `mindmap.py` | — | — | Stage 5 |
