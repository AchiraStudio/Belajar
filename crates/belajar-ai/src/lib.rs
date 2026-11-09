//! AI provider layer.
//!
//! [`Llm`] is the client for the PAF-Model gateway (an OpenAI-shaped chat API in front of
//! DeepSeek, Qwen and Grok). It is a behaviour-faithful port of the legacy `llm.py`: per-level
//! backend plans with fallback, retries with exponential backoff, server-side sessions, SSE
//! streaming (trusting `x_meta.full_text`), OpenAI tool calling with a JSON-text fallback, and
//! LaTeX-tolerant JSON repair. Credentials live only here, on the server.
//!
//! Provider abstraction for official APIs (stateless history replay, native structured output) is
//! the next step; see docs/MIGRATION_PLAN.md §5.

mod client;
pub mod json;

pub use client::{Llm, LlmConfig, LlmError, LlmResponse, OnChunk, Validate};
pub use json::extract_json;
