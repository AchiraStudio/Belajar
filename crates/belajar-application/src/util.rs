//! Small helpers: wall clock and a dependency-free shuffle.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Seconds since the UNIX epoch as a float, like Python's `time.time()`.
#[must_use]
pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64())
}

fn next_random() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0x9E37_79B9_7F4A_7C15);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos());
    let mut x = COUNTER.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed)
        ^ u64::from(nanos).rotate_left(17);
    // xorshift64* — plenty for shuffling quiz questions; not for anything security related.
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// Uniform-enough Fisher–Yates shuffle (Python's `random.shuffle`; order is not reproducible).
pub fn shuffle<T>(items: &mut [T]) {
    for i in (1..items.len()).rev() {
        let j = (next_random() % (i as u64 + 1)) as usize;
        items.swap(i, j);
    }
}

/// A random index below `n` (`n` must be non-zero).
#[must_use]
pub fn random_below(n: usize) -> usize {
    (next_random() % n.max(1) as u64) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shuffle_keeps_every_element() {
        let mut v: Vec<u32> = (0..50).collect();
        shuffle(&mut v);
        let mut sorted = v.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..50).collect::<Vec<_>>());
        assert_ne!(
            v,
            (0..50).collect::<Vec<_>>(),
            "50 items virtually never stay in order"
        );
    }
}
