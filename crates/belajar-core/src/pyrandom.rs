//! CPython's `random.Random(<str>).sample(population, k)`, reproduced bit for bit.
//!
//! The legacy daily quests were chosen with `random.Random(day).sample(sorted(QUESTS), 3)`, so the
//! same date must keep picking the same three quests. That needs CPython's exact algorithm:
//! a string seed is extended with its SHA-512 digest and read as one big integer (the `version=2`
//! seeding), the integer feeds MT19937's `init_by_array`, and `sample` draws with
//! `getrandbits`-based rejection sampling. Golden values in the tests come from CPython itself.

use sha2::{Digest, Sha512};

const N: usize = 624;
const M: usize = 397;

/// MT19937, as used by CPython's `_random` module.
struct Mt19937 {
    state: [u32; N],
    index: usize,
}

impl Mt19937 {
    fn init_genrand(seed: u32) -> Self {
        let mut state = [0u32; N];
        state[0] = seed;
        for i in 1..N {
            let prev = state[i - 1];
            state[i] = 1_812_433_253u32
                .wrapping_mul(prev ^ (prev >> 30))
                .wrapping_add(i as u32);
        }
        Self { state, index: N }
    }

    fn init_by_array(key: &[u32]) -> Self {
        let mut mt = Self::init_genrand(19_650_218);
        let (mut i, mut j) = (1usize, 0usize);
        for _ in 0..N.max(key.len()) {
            let prev = mt.state[i - 1];
            mt.state[i] = (mt.state[i] ^ (prev ^ (prev >> 30)).wrapping_mul(1_664_525))
                .wrapping_add(key[j])
                .wrapping_add(j as u32);
            i += 1;
            j += 1;
            if i >= N {
                mt.state[0] = mt.state[N - 1];
                i = 1;
            }
            if j >= key.len() {
                j = 0;
            }
        }
        for _ in 0..N - 1 {
            let prev = mt.state[i - 1];
            mt.state[i] = (mt.state[i] ^ (prev ^ (prev >> 30)).wrapping_mul(1_566_083_941))
                .wrapping_sub(i as u32);
            i += 1;
            if i >= N {
                mt.state[0] = mt.state[N - 1];
                i = 1;
            }
        }
        mt.state[0] = 0x8000_0000;
        mt
    }

    fn next_u32(&mut self) -> u32 {
        if self.index >= N {
            for k in 0..N {
                let y = (self.state[k] & 0x8000_0000) | (self.state[(k + 1) % N] & 0x7fff_ffff);
                let mut next = self.state[(k + M) % N] ^ (y >> 1);
                if y & 1 == 1 {
                    next ^= 0x9908_b0df;
                }
                self.state[k] = next;
            }
            self.index = 0;
        }
        let mut y = self.state[self.index];
        self.index += 1;
        y ^= y >> 11;
        y ^= (y << 7) & 0x9d2c_5680;
        y ^= (y << 15) & 0xefc6_0000;
        y ^ (y >> 18)
    }

    /// `getrandbits(k)` for `1 <= k <= 32`.
    fn getrandbits(&mut self, k: u32) -> u32 {
        self.next_u32() >> (32 - k)
    }

    /// `_randbelow_with_getrandbits(n)` for `n >= 1`.
    fn randbelow(&mut self, n: usize) -> usize {
        let k = usize::BITS - n.leading_zeros();
        loop {
            let r = self.getrandbits(k) as usize;
            if r < n {
                return r;
            }
        }
    }
}

/// `random.Random(seed)` for a `str` seed.
fn seeded(seed: &str) -> Mt19937 {
    let mut bytes = seed.as_bytes().to_vec();
    let digest = Sha512::digest(&bytes);
    bytes.extend_from_slice(&digest);
    // `int.from_bytes(bytes, "big")`, then CPython splits |n| into 32-bit words, least significant
    // first. Leading zero bytes do not count towards the integer.
    let start = bytes.iter().position(|b| *b != 0).unwrap_or(bytes.len());
    let significant = &bytes[start..];
    let mut key: Vec<u32> = significant
        .rchunks(4)
        .map(|chunk| chunk.iter().fold(0u32, |acc, b| (acc << 8) | u32::from(*b)))
        .collect();
    if key.is_empty() {
        key.push(0);
    }
    Mt19937::init_by_array(&key)
}

/// `random.Random(seed).sample(population, k)` for a population small enough that CPython uses its
/// "pool" strategy (at most 21 items for `k <= 5`). Returns `None` outside that range.
#[must_use]
pub fn sample<T: Clone>(seed: &str, population: &[T], k: usize) -> Option<Vec<T>> {
    let n = population.len();
    if k > n || k > 5 || n > 21 {
        return None;
    }
    let mut rng = seeded(seed);
    let mut pool = population.to_vec();
    let mut result = Vec::with_capacity(k);
    for i in 0..k {
        let j = rng.randbelow(n - i);
        result.push(pool[j].clone());
        pool[j] = pool[n - i - 1].clone();
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUESTS: [&str; 6] = ["acc80", "ajari", "cards_5", "goal", "play_1", "two_modes"];

    /// Generated with CPython 3.14: `random.Random(day).sample(sorted(QUESTS), 3)`.
    #[test]
    fn matches_cpython_for_daily_quests() {
        let golden: [(&str, [&str; 3]); 6] = [
            ("2026-11-09", ["acc80", "goal", "two_modes"]),
            ("2026-11-10", ["cards_5", "acc80", "play_1"]),
            ("2026-01-01", ["goal", "two_modes", "play_1"]),
            ("2025-12-31", ["acc80", "goal", "two_modes"]),
            ("2024-02-29", ["play_1", "ajari", "acc80"]),
            ("2026-06-15", ["ajari", "two_modes", "play_1"]),
        ];
        for (day, expected) in golden {
            let got = sample(day, &QUESTS, 3).expect("supported population");
            assert_eq!(got, expected, "seed {day}");
        }
    }

    #[test]
    fn rejects_populations_outside_the_pool_strategy() {
        assert!(sample("x", &QUESTS, 7).is_none());
        assert!(sample("x", &[1; 30], 3).is_none());
    }
}
