//! Pure learning logic for Stuby.
//!
//! Nothing in this crate performs I/O. Every deterministic rule that must behave exactly like the
//! legacy Python implementation lives here and is checked against golden corpora generated from the
//! Python code (see `parity/`).

pub mod cards;
pub mod difflib;
pub mod grading;
pub mod mastery;
pub mod numeric;
pub mod profile;
pub mod pyrandom;
pub mod spaced_repetition;
pub mod stats;
