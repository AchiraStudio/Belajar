//! Port of Python's `difflib.SequenceMatcher(None, a, b).ratio()`.
//!
//! It is the Ratcliff/Obershelp "longest contiguous matching block" algorithm, *not* a diff or an
//! LCS, so crates such as `similar` or `strsim` return different ratios and would flip grading
//! verdicts near the thresholds (0.88 / 0.6 / 0.3 / 0.93). Including the `autojunk` heuristic:
//! for `b` of 200+ items, items occurring in more than 1 % of positions are ignored when seeding
//! matches. Sequences are `char`s (Python iterates code points).

use std::collections::HashMap;

/// Similarity in `[0, 1]`: `2 * M / T`, `M` = total size of matching blocks, `T` = `len(a) + len(b)`.
/// Two empty strings are identical (1.0), as in Python.
#[must_use]
pub fn ratio(a: &str, b: &str) -> f64 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let total = a.len() + b.len();
    if total == 0 {
        return 1.0;
    }
    let matches = matching_size(&a, &b);
    2.0 * matches as f64 / total as f64
}

fn matching_size(a: &[char], b: &[char]) -> usize {
    let b2j = index_b(b);
    let mut matches = 0;
    let mut queue = vec![(0, a.len(), 0, b.len())];
    while let Some((alo, ahi, blo, bhi)) = queue.pop() {
        let (i, j, k) = find_longest_match(a, b, &b2j, alo, ahi, blo, bhi);
        if k > 0 {
            matches += k;
            if alo < i && blo < j {
                queue.push((alo, i, blo, j));
            }
            if i + k < ahi && j + k < bhi {
                queue.push((i + k, ahi, j + k, bhi));
            }
        }
    }
    matches
}

/// `b2j`: for every item of `b` the ascending list of positions, minus "popular" items (autojunk).
fn index_b(b: &[char]) -> HashMap<char, Vec<usize>> {
    let mut b2j: HashMap<char, Vec<usize>> = HashMap::new();
    for (j, &c) in b.iter().enumerate() {
        b2j.entry(c).or_default().push(j);
    }
    let n = b.len();
    if n >= 200 {
        let ntest = n / 100 + 1;
        b2j.retain(|_, positions| positions.len() <= ntest);
    }
    b2j
}

/// Longest matching block of `a[alo..ahi]` and `b[blo..bhi]`; earliest in `a`, then earliest in `b`
/// among equals. (`isjunk` is always `None` in Belajar, so no explicit junk set exists.)
fn find_longest_match(
    a: &[char],
    b: &[char],
    b2j: &HashMap<char, Vec<usize>>,
    alo: usize,
    ahi: usize,
    blo: usize,
    bhi: usize,
) -> (usize, usize, usize) {
    let (mut besti, mut bestj, mut bestsize) = (alo, blo, 0_usize);
    let mut j2len: HashMap<usize, usize> = HashMap::new();
    for (i, ch) in a.iter().enumerate().take(ahi).skip(alo) {
        let mut newj2len: HashMap<usize, usize> = HashMap::new();
        if let Some(positions) = b2j.get(ch) {
            for &j in positions {
                if j < blo {
                    continue;
                }
                if j >= bhi {
                    break;
                }
                let k = j2len.get(&j.wrapping_sub(1)).copied().unwrap_or(0) + 1;
                newj2len.insert(j, k);
                if k > bestsize {
                    besti = i + 1 - k;
                    bestj = j + 1 - k;
                    bestsize = k;
                }
            }
        }
        j2len = newj2len;
    }

    // Extend the match over equal neighbours that the popular-item purge may have hidden.
    while besti > alo && bestj > blo && a[besti - 1] == b[bestj - 1] {
        besti -= 1;
        bestj -= 1;
        bestsize += 1;
    }
    while besti + bestsize < ahi
        && bestj + bestsize < bhi
        && a[besti + bestsize] == b[bestj + bestsize]
    {
        bestsize += 1;
    }
    (besti, bestj, bestsize)
}

#[cfg(test)]
mod tests {
    use super::ratio;

    #[test]
    fn matches_the_documented_python_examples() {
        // From the difflib docs: SequenceMatcher(None, "abcd", "bcde").ratio() == 0.75
        assert_eq!(ratio("abcd", "bcde"), 0.75);
        assert_eq!(ratio("", ""), 1.0);
        assert_eq!(ratio("abc", ""), 0.0);
        assert_eq!(ratio("abc", "abc"), 1.0);
    }
}
