use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use belajar_core::numeric::{py_round, py_round_ndigits};
use futures_util::StreamExt;
use serde_json::{Value, json};
use tokio::sync::Semaphore;

use crate::json::extract_json;

/// Gateway client configuration (legacy `config.PAF_*` / `LLM_*`).
#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub base_url: String,
    pub api_token: String,
    /// Maximum silence while waiting for the gateway (the gateway needs 330 s+ for documents).
    pub timeout: Duration,
    /// Parallel requests to Qwen/Grok (document processing and quizzes).
    pub concurrency: usize,
    /// Parallel streaming requests to DeepSeek (chat and games).
    pub concurrency_stream: usize,
    pub retries: u32,
    pub backoff_base: f64,
    /// Move to the next backend on 429/504 and similar.
    pub fallback: bool,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            base_url: "http://20.239.192.10:9000".to_owned(),
            api_token: String::new(),
            timeout: Duration::from_secs(340),
            concurrency: 2,
            concurrency_stream: 1,
            retries: 2,
            backoff_base: 4.0,
            fallback: true,
        }
    }
}

/// A failed model call. `fatal` aborts immediately, `retryable` allows another attempt on the same
/// backend; otherwise the next backend of the plan is tried.
#[derive(Debug, Clone)]
pub struct LlmError {
    pub message: String,
    pub status: Option<u16>,
    pub retryable: bool,
    pub fatal: bool,
    pub raw_text: Option<String>,
}

impl LlmError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: None,
            retryable: false,
            fatal: false,
            raw_text: None,
        }
    }

    fn retryable(message: impl Into<String>) -> Self {
        Self {
            retryable: true,
            ..Self::new(message)
        }
    }

    fn status(message: impl Into<String>, status: u16) -> Self {
        Self {
            status: Some(status),
            ..Self::new(message)
        }
    }
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for LlmError {}

/// Result of one model call.
#[derive(Debug, Clone, Default)]
pub struct LlmResponse {
    pub text: String,
    pub session_id: Option<String>,
    pub meta: Value,
    pub first_chunk_s: Option<f64>,
    pub total_s: f64,
    pub tool_calls: Option<Value>,
}

impl LlmResponse {
    /// The gateway lost the session and started a fresh conversation (`x_meta.mode_fallback`).
    #[must_use]
    pub fn mode_fallback(&self) -> bool {
        self.meta
            .get("mode_fallback")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }
}

/// Callback receiving each streamed text piece.
pub type OnChunk<'a> = &'a (dyn Fn(&str) + Send + Sync);
/// Validates/repairs a parsed JSON answer; `Err` triggers a retry with a correction note.
pub type Validate<'a> = &'a (dyn Fn(Value) -> Result<Value, String> + Send + Sync);

type Plan = Vec<(&'static str, Option<&'static str>)>;

fn plan_for(level: &str) -> Plan {
    match level {
        "fast" => vec![("qwen", Some("fast")), ("deepseek", Some("instant"))],
        "reason" => vec![("qwen", Some("thinking")), ("deepseek", Some("thinking"))],
        "deep" | "detail" => vec![
            ("grok", None),
            ("deepseek", Some("thinking")),
            ("qwen", Some("thinking")),
        ],
        "chat" => vec![("deepseek", None), ("qwen", Some("auto"))],
        "vision" => vec![("deepseek", Some("instant")), ("deepseek", None)],
        "vision_deep" => vec![("grok", None), ("deepseek", Some("thinking"))],
        // "normal" and anything unknown (legacy `PLANS.get(level, PLANS["normal"])`)
        _ => vec![("qwen", Some("auto")), ("deepseek", None)],
    }
}

struct Latency {
    first: Option<f64>,
    total: f64,
}

pub struct Llm {
    http: reqwest::Client,
    cfg: LlmConfig,
    semaphores: HashMap<&'static str, Arc<Semaphore>>,
    latency: Mutex<VecDeque<Latency>>,
}

impl Llm {
    pub fn new(cfg: LlmConfig) -> Result<Self, LlmError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(cfg.timeout)
            .build()
            .map_err(|e| LlmError::new(format!("HTTP client: {e}")))?;
        let semaphores = HashMap::from([
            (
                "deepseek",
                Arc::new(Semaphore::new(cfg.concurrency_stream.max(1))),
            ),
            ("qwen", Arc::new(Semaphore::new(cfg.concurrency.max(1)))),
            ("grok", Arc::new(Semaphore::new(cfg.concurrency.max(1)))),
        ]);
        Ok(Self {
            http,
            cfg,
            semaphores,
            latency: Mutex::new(VecDeque::with_capacity(300)),
        })
    }

    /// Whether an API token is configured (reported by `ping`).
    #[must_use]
    pub fn configured(&self) -> bool {
        !self.cfg.api_token.is_empty()
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.cfg.base_url.trim_end_matches('/'))
    }

    async fn sleep_backoff(&self, attempt: u32) {
        let seconds = (self.cfg.backoff_base * 2_f64.powi(attempt as i32)).min(30.0);
        tokio::time::sleep(Duration::from_secs_f64(seconds)).await;
    }

    /// Backends (with think modes) to try, honouring attachments and the fallback switch.
    fn resolve_plan(&self, level: &str, attachments: Option<&[Value]>) -> Plan {
        let plan = if attachments.is_some_and(|a| !a.is_empty()) {
            // Qwen rejects attachments upstream: images/files go to DeepSeek, deep tasks to Grok.
            if matches!(level, "deep" | "detail" | "vision_deep") {
                plan_for("vision_deep")
            } else {
                plan_for("vision")
            }
        } else {
            plan_for(level)
        };
        if self.cfg.fallback {
            plan
        } else {
            plan.into_iter().take(1).collect()
        }
    }

    fn record_latency(&self, first: Option<f64>, total: f64) {
        if let Ok(mut q) = self.latency.lock() {
            if q.len() >= 300 {
                q.pop_front();
            }
            q.push_back(Latency { first, total });
        }
    }

    fn latency_stats(&self) -> Value {
        fn percentile(values: &[f64], pct: f64) -> Value {
            if values.is_empty() {
                return Value::Null;
            }
            let mut ordered = values.to_vec();
            ordered.sort_by(f64::total_cmp);
            let k = py_round(pct / 100.0 * (ordered.len() as f64 - 1.0))
                .clamp(0, ordered.len() as i64 - 1) as usize;
            json!(py_round_ndigits(ordered[k], 2))
        }
        let (first, total): (Vec<f64>, Vec<f64>) = self
            .latency
            .lock()
            .map(|q| {
                (
                    q.iter().filter_map(|l| l.first).collect(),
                    q.iter().map(|l| l.total).collect(),
                )
            })
            .unwrap_or_default();
        json!({
            "n": total.len(),
            "first_p50": percentile(&first, 50.0), "first_p95": percentile(&first, 95.0),
            "total_p50": percentile(&total, 50.0), "total_p95": percentile(&total, 95.0),
        })
    }

    /// Delete a gateway session (best effort; sessions never expire on their own).
    pub async fn delete_session(&self, session_id: Option<&str>) {
        let Some(id) = session_id.filter(|s| !s.is_empty()) else {
            return;
        };
        let _ = self
            .http
            .delete(self.url(&format!("/v1/sessions/{id}")))
            .bearer_auth(&self.cfg.api_token)
            .timeout(Duration::from_secs(10))
            .send()
            .await;
    }

    /// Map a non-200 gateway answer to the right kind of error.
    async fn status_error(resp: reqwest::Response, backend: &str) -> LlmError {
        let code = resp.status().as_u16();
        let www_authenticate = resp.headers().contains_key("www-authenticate");
        let text = resp.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("detail").cloned())
            .filter(|d| !d.is_null() && d != &json!(""))
            .map(|d| d.as_str().map_or_else(|| d.to_string(), str::to_owned))
            .or_else(|| (!text.is_empty()).then(|| text.chars().take(200).collect()))
            .unwrap_or_else(|| format!("HTTP {code}"));
        match code {
            401 if www_authenticate => LlmError {
                fatal: true,
                ..LlmError::status("API token PAF-Model salah atau sudah kedaluwarsa", code)
            },
            503 => LlmError {
                fatal: true,
                ..LlmError::status(
                    format!("Gateway PAF-Model belum memiliki API token: {detail}"),
                    code,
                )
            },
            400 | 422 => LlmError {
                fatal: true,
                ..LlmError::status(format!("Request ditolak gateway: {detail}"), code)
            },
            429 | 500 | 502 | 504 => LlmError {
                retryable: true,
                ..LlmError::status(format!("{backend}: {detail}"), code)
            },
            _ => LlmError::status(format!("{backend}: {detail}"), code),
        }
    }

    /// Read an SSE answer. The final text is `x_meta.full_text` when present: middle chunks can be
    /// missed by the gateway, the last frame carries the authoritative text.
    async fn read_stream(
        resp: reqwest::Response,
        on_chunk: Option<OnChunk<'_>>,
        started: Instant,
    ) -> Result<LlmResponse, LlmError> {
        let header_session = resp
            .headers()
            .get("x-session-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let mut session_id = header_session;
        let mut meta = serde_json::Map::new();
        let mut accumulated = String::new();
        let mut full_text: Option<String> = None;
        let mut first: Option<f64> = None;
        let mut buffer = String::new();
        let mut stream = resp.bytes_stream();
        let mut raw: Vec<u8> = Vec::new();

        'outer: while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| {
                LlmError::retryable(format!("Gagal membaca stream ({})", classify(&e)))
            })?;
            raw.extend_from_slice(&bytes);
            // Decode only complete UTF-8 prefixes; keep a split multi-byte tail for the next chunk.
            let valid = match std::str::from_utf8(&raw) {
                Ok(s) => s.len(),
                Err(e) => e.valid_up_to(),
            };
            buffer.push_str(&String::from_utf8_lossy(&raw[..valid]));
            raw.drain(..valid);

            while let Some(pos) = buffer.find('\n') {
                let line: String = buffer.drain(..=pos).collect();
                let line = line.trim();
                if line.is_empty() || line.starts_with(':') {
                    continue; // SSE comment (ping) or blank separator
                }
                if line == "data: [DONE]" {
                    break 'outer;
                }
                let Some(payload) = line.strip_prefix("data: ") else {
                    continue;
                };
                let Ok(obj) = serde_json::from_str::<Value>(payload.trim()) else {
                    continue;
                };

                if let Some(err) = obj.get("error") {
                    let detail = err
                        .get("message")
                        .and_then(Value::as_str)
                        .map_or_else(|| err.to_string(), str::to_owned);
                    return Err(LlmError::retryable(format!(
                        "Streaming error dari model: {detail}"
                    )));
                }
                if let Some(m) = obj.get("x_meta").and_then(Value::as_object) {
                    for (k, v) in m.iter().filter(|(k, _)| *k != "full_text") {
                        meta.insert(k.clone(), v.clone());
                    }
                    if let Some(id) = m
                        .get("session_id")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        session_id = Some(id.to_owned());
                    }
                    if let Some(text) = m
                        .get("full_text")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        full_text = Some(text.to_owned());
                    }
                }
                let piece = obj
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
                    .filter(|p| !p.is_empty());
                if let Some(piece) = piece {
                    first.get_or_insert_with(|| started.elapsed().as_secs_f64());
                    accumulated.push_str(piece);
                    if let Some(cb) = on_chunk {
                        cb(piece);
                    }
                }
            }
        }

        let text = full_text.unwrap_or(accumulated).trim().to_owned();
        if text.is_empty() {
            return Err(LlmError::retryable("Balasan kosong dari model"));
        }
        Ok(LlmResponse {
            text,
            session_id,
            meta: Value::Object(meta),
            first_chunk_s: first,
            ..LlmResponse::default()
        })
    }

    /// One HTTP request to the gateway, no retry. The only place the network is touched for chat.
    #[allow(clippy::too_many_arguments)]
    async fn post_once(
        &self,
        mut body: Value,
        backend: &str,
        stream: bool,
        session_id: Option<&str>,
        on_chunk: Option<OnChunk<'_>>,
        tools: Option<&Value>,
        tool_choice: Option<&str>,
    ) -> Result<LlmResponse, LlmError> {
        let obj = body
            .as_object_mut()
            .ok_or_else(|| LlmError::new("body harus berupa objek"))?;
        if let Some(sid) = session_id {
            obj.insert("session_id".into(), json!(sid));
        }
        if let Some(tools) = tools {
            obj.insert("tools".into(), tools.clone());
        }
        match tool_choice {
            Some(choice) => obj.insert("tool_choice".into(), json!(choice)),
            None => obj.remove("tool_choice"),
        };

        let semaphore = self
            .semaphores
            .get(backend)
            .or_else(|| self.semaphores.get("qwen"))
            .cloned();
        let _permit = match &semaphore {
            Some(s) => Some(
                s.acquire()
                    .await
                    .map_err(|_| LlmError::new("antrean AI ditutup"))?,
            ),
            None => None,
        };
        let started = Instant::now();
        let mut request = self
            .http
            .post(self.url("/v1/chat/completions"))
            .bearer_auth(&self.cfg.api_token)
            .json(&body);
        if let Some(sid) = session_id {
            request = request.header("X-Session-ID", sid);
        }
        let resp = request.send().await.map_err(|e| {
            if e.is_timeout() {
                LlmError::retryable("Gateway PAF-Model tidak membalas tepat waktu")
            } else {
                LlmError::retryable(format!(
                    "Tidak dapat menghubungi PAF-Model ({})",
                    classify(&e)
                ))
            }
        })?;
        if resp.status().as_u16() != 200 {
            return Err(Self::status_error(resp, backend).await);
        }

        let header_session = resp
            .headers()
            .get("x-session-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let is_sse = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|ct| ct.contains("text/event-stream"));

        let mut out = if stream && is_sse {
            let mut out = Self::read_stream(resp, on_chunk, started).await?;
            out.session_id = out
                .session_id
                .or(header_session.or_else(|| session_id.map(str::to_owned)));
            out
        } else {
            let data: Value = resp
                .json()
                .await
                .map_err(|_| LlmError::retryable("Balasan gateway tidak dikenali"))?;
            let message = data
                .pointer("/choices/0/message")
                .ok_or_else(|| LlmError::retryable("Balasan gateway tidak dikenali"))?;
            let text = message
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_owned();
            let tool_calls = message
                .get("tool_calls")
                .filter(|t| !t.is_null() && *t != &json!([]))
                .cloned();
            if text.is_empty() && tool_calls.is_none() {
                return Err(LlmError::retryable("Balasan kosong dari model"));
            }
            let meta = data
                .get("x_meta")
                .filter(|m| m.is_object())
                .cloned()
                .unwrap_or_else(|| json!({}));
            let session = meta
                .get("session_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or(header_session)
                .or_else(|| session_id.map(str::to_owned));
            if let (Some(cb), false) = (on_chunk, text.is_empty()) {
                cb(&text);
            }
            LlmResponse {
                text,
                session_id: session,
                meta,
                tool_calls,
                ..LlmResponse::default()
            }
        };
        out.total_s = py_round_ndigits(started.elapsed().as_secs_f64(), 2);
        self.record_latency(out.first_chunk_s, out.total_s);
        Ok(out)
    }

    #[allow(clippy::too_many_arguments)]
    async fn call_response(
        &self,
        backend: &str,
        think: Option<&str>,
        prompt: &str,
        attachments: Option<&[Value]>,
        tools: Option<&Value>,
        tool_choice: Option<&str>,
    ) -> Result<LlmResponse, LlmError> {
        let has_attachments = attachments.is_some_and(|a| !a.is_empty());
        if backend == "qwen" && has_attachments {
            return Err(LlmError::status(
                "Lampiran gambar/file tidak didukung oleh backend Qwen upstream",
                400,
            ));
        }
        let mut body = json!({"model": backend, "messages": [{"role": "user", "content": prompt}]});
        if let Some(think) = think.filter(|_| matches!(backend, "qwen" | "deepseek")) {
            body["think_mode"] = json!(think);
        }
        if has_attachments {
            body["attachments"] = json!(attachments);
        }
        let out = self
            .post_once(body, backend, false, None, None, tools, tool_choice)
            .await?;
        // One-shot session: release it so sessions do not pile up in the gateway.
        self.delete_session(out.session_id.as_deref()).await;
        Ok(out)
    }

    /// Send one self-contained prompt and return the reply text.
    pub async fn ask(
        &self,
        prompt: &str,
        level: &str,
        attachments: Option<&[Value]>,
    ) -> Result<String, LlmError> {
        let mut last: Option<LlmError> = None;
        for (backend, think) in self.resolve_plan(level, attachments) {
            for attempt in 0..=self.cfg.retries {
                match self
                    .call_response(backend, think, prompt, attachments, None, None)
                    .await
                {
                    Ok(out) => return Ok(out.text),
                    Err(e) => {
                        tracing::warn!(backend, attempt = attempt + 1, error = %e, "LLM call failed");
                        if e.fatal {
                            return Err(e);
                        }
                        let retry = e.retryable && attempt < self.cfg.retries;
                        last = Some(e);
                        if retry {
                            self.sleep_backoff(attempt).await;
                            continue;
                        }
                        break;
                    }
                }
            }
        }
        Err(last.unwrap_or_else(|| LlmError::new("Gagal menghubungi model")))
    }

    /// Ask for JSON; on a malformed answer ask again with a correction note (up to `tries`).
    pub async fn chat_json(
        &self,
        prompt: &str,
        level: &str,
        validate: Option<Validate<'_>>,
        attachments: Option<&[Value]>,
        tries: u32,
    ) -> Result<Value, LlmError> {
        let mut current = prompt.to_owned();
        let mut last_error = String::new();
        let mut last_raw = None;
        for _ in 0..tries.max(1) {
            let out = self.ask(&current, level, attachments).await?;
            last_raw = Some(out.clone());
            match extract_json(&out).and_then(|obj| validate.map_or(Ok(obj.clone()), |v| v(obj))) {
                Ok(value) => return Ok(value),
                Err(reason) => {
                    current = format!(
                        "{prompt}\n\nCATATAN: jawaban sebelumnya tidak valid ({}). Kirim ulang HANYA JSON valid sesuai format, \
                         tanpa teks lain dan tanpa blok kode.",
                        reason.chars().take(120).collect::<String>()
                    );
                    last_error = reason;
                }
            }
        }
        Err(LlmError {
            raw_text: last_raw,
            ..LlmError::new(format!("Format jawaban AI tidak valid: {last_error}"))
        })
    }

    /// Fallback when the gateway refuses tools: describe the schema in the prompt and parse JSON text.
    async fn fallback_tool_to_json(
        &self,
        prompt: &str,
        tool_spec: &Value,
        level: &str,
        attachments: Option<&[Value]>,
        tries: u32,
        validate: Option<Validate<'_>>,
    ) -> Result<Value, LlmError> {
        let params = tool_spec
            .get("parameters")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let name = tool_spec
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("output");
        let mut extra = format!(
            "\n\nPENTING: Hasilkan balasan HANYA sebagai JSON valid yang memenuhi skema parameter fungsi '{name}':\n{}\n",
            serde_json::to_string_pretty(&params).unwrap_or_default()
        );
        if let Some(desc) = tool_spec
            .get("description")
            .and_then(Value::as_str)
            .filter(|d| !d.is_empty())
        {
            extra.push_str(&format!("Deskripsi fungsi: {desc}\n"));
        }
        extra.push_str(
            "Kirim HANYA JSON murni tanpa teks pengantar atau blok markdown di luar JSON.",
        );
        self.chat_json(
            &format!("{prompt}{extra}"),
            level,
            validate,
            attachments,
            tries,
        )
        .await
    }

    /// Structured output through OpenAI tool calling (DeepSeek only); falls back to JSON text when
    /// the gateway rejects tools (HTTP 400/422).
    pub async fn ask_tool(
        &self,
        prompt: &str,
        tool_spec: &Value,
        level: &str,
        attachments: Option<&[Value]>,
        tries: u32,
        validate: Option<Validate<'_>>,
    ) -> Result<Value, LlmError> {
        if tool_spec.get("name").and_then(Value::as_str).is_none() {
            return Err(LlmError::new(
                "tool_spec harus berupa dictionary dengan kunci 'name'",
            ));
        }
        let tools = json!([{"type": "function", "function": tool_spec}]);
        let mut plan: Plan = vec![("deepseek", Some("instant")), ("deepseek", None)];
        if !self.cfg.fallback {
            plan.truncate(1);
        }
        let attempts = tries.max(1);
        let mut last: Option<LlmError> = None;

        for (backend, think) in plan {
            for attempt in 0..attempts {
                match self
                    .call_response(
                        backend,
                        think,
                        prompt,
                        attachments,
                        Some(&tools),
                        Some("auto"),
                    )
                    .await
                {
                    Ok(resp) => {
                        if let Some(calls) = &resp.tool_calls {
                            let raw = calls
                                .pointer("/0/function/arguments")
                                .cloned()
                                .unwrap_or_else(|| json!("{}"));
                            let parsed = match raw {
                                Value::String(s) => extract_json(&s),
                                Value::Object(_) | Value::Array(_) => Ok(raw),
                                other => {
                                    Err(format!("Tipe arguments tool_calls tidak valid: {other}"))
                                }
                            };
                            match parsed
                                .and_then(|data| validate.map_or(Ok(data.clone()), |v| v(data)))
                            {
                                Ok(data) => return Ok(data),
                                Err(reason) => {
                                    tracing::warn!(attempt = attempt + 1, %reason, "ask_tool: tool arguments rejected");
                                    last = Some(LlmError::new(reason));
                                    if attempt + 1 < attempts {
                                        self.sleep_backoff(attempt).await;
                                        continue;
                                    }
                                    break;
                                }
                            }
                        }
                        // The model answered in text instead of calling the tool.
                        if !resp.text.is_empty()
                            && let Ok(v) = extract_json(&resp.text)
                                .and_then(|d| validate.map_or(Ok(d.clone()), |v| v(d)))
                        {
                            return Ok(v);
                        }
                        let e = LlmError {
                            raw_text: Some(resp.text),
                            ..LlmError::retryable(format!(
                                "{backend}: Model tidak memanggil tool '{}'",
                                tool_spec["name"].as_str().unwrap_or("")
                            ))
                        };
                        last = Some(e);
                        if attempt + 1 < attempts {
                            self.sleep_backoff(attempt).await;
                            continue;
                        }
                        break;
                    }
                    Err(e) => {
                        if matches!(e.status, Some(400 | 422)) {
                            tracing::warn!(error = %e, "tool calling rejected by the gateway; falling back to JSON text");
                            return self
                                .fallback_tool_to_json(
                                    prompt,
                                    tool_spec,
                                    level,
                                    attachments,
                                    tries,
                                    validate,
                                )
                                .await;
                        }
                        tracing::warn!(backend, attempt = attempt + 1, error = %e, "ask_tool failed");
                        if e.fatal {
                            return Err(e);
                        }
                        let retry = e.retryable && attempt + 1 < attempts;
                        last = Some(e);
                        if retry {
                            self.sleep_backoff(attempt).await;
                            continue;
                        }
                        break;
                    }
                }
            }
        }
        Err(last.unwrap_or_else(|| LlmError::new("Gagal memperoleh balasan tool dari model")))
    }

    /// Unified structured inference: tools where the primary backend is DeepSeek, JSON text otherwise.
    pub async fn ask_structured(
        &self,
        prompt: &str,
        tool_spec: &Value,
        level: &str,
        attachments: Option<&[Value]>,
        tries: u32,
        validate: Option<Validate<'_>>,
    ) -> Result<Value, LlmError> {
        let primary = self
            .resolve_plan(level, attachments)
            .first()
            .map_or("qwen", |(b, _)| *b);
        if primary == "deepseek" {
            match self
                .ask_tool(prompt, tool_spec, level, attachments, tries, validate)
                .await
            {
                Ok(v) => return Ok(v),
                Err(e) if e.fatal => return Err(e),
                Err(e) => {
                    tracing::warn!(error = %e, "ask_tool (DeepSeek) failed; trying the JSON fallback")
                }
            }
        }
        self.fallback_tool_to_json(prompt, tool_spec, level, attachments, tries, validate)
            .await
    }

    /// DeepSeek with a persistent session (NEW / CONTINUE) and SSE streaming.
    ///
    /// If the worker refuses streaming (HTTP 400 mentioning "stream") and `allow_nonstream` is
    /// false (games), the error is reported clearly instead of silently degrading. The gateway
    /// session is NOT deleted: the caller owns it.
    pub async fn chat_stream(
        &self,
        prompt: &str,
        gateway_session_id: Option<&str>,
        mode: &str,
        on_chunk: Option<OnChunk<'_>>,
        think_mode: Option<&str>,
        allow_nonstream: bool,
    ) -> Result<LlmResponse, LlmError> {
        let mut body = json!({"model": "deepseek", "messages": [{"role": "user", "content": prompt}], "mode": mode, "stream": true});
        if let Some(think) = think_mode {
            body["think_mode"] = json!(think);
        }
        let mut last: Option<LlmError> = None;
        for attempt in 0..=self.cfg.retries {
            match self
                .post_once(
                    body.clone(),
                    "deepseek",
                    true,
                    gateway_session_id,
                    on_chunk,
                    None,
                    None,
                )
                .await
            {
                Ok(out) => return Ok(out),
                Err(e) => {
                    if e.status == Some(400) && e.message.to_lowercase().contains("stream") {
                        if allow_nonstream {
                            tracing::info!(
                                "stream mode unsupported by the worker; falling back to non-stream"
                            );
                            return self
                                .chat_nonstream(
                                    prompt,
                                    gateway_session_id,
                                    mode,
                                    on_chunk,
                                    think_mode,
                                )
                                .await;
                        }
                        return Err(LlmError {
                            fatal: true,
                            ..LlmError::status(
                                "Worker gateway belum dijalankan dengan --enable-stream. Mulai ulang worker dengan flag tersebut lalu coba lagi.",
                                400,
                            )
                        });
                    }
                    if e.fatal || !e.retryable || attempt >= self.cfg.retries {
                        return Err(e);
                    }
                    last = Some(e);
                    self.sleep_backoff(attempt).await;
                }
            }
        }
        Err(last.unwrap_or_else(|| LlmError::new("Gagal menghubungi DeepSeek")))
    }

    async fn chat_nonstream(
        &self,
        prompt: &str,
        gateway_session_id: Option<&str>,
        mode: &str,
        on_chunk: Option<OnChunk<'_>>,
        think_mode: Option<&str>,
    ) -> Result<LlmResponse, LlmError> {
        let mut body = json!({"model": "deepseek", "messages": [{"role": "user", "content": prompt}], "mode": mode});
        if let Some(think) = think_mode {
            body["think_mode"] = json!(think);
        }
        let mut last: Option<LlmError> = None;
        for attempt in 0..=self.cfg.retries {
            match self
                .post_once(
                    body.clone(),
                    "deepseek",
                    false,
                    gateway_session_id,
                    on_chunk,
                    None,
                    None,
                )
                .await
            {
                Ok(out) => return Ok(out),
                Err(e) => {
                    if e.fatal || !e.retryable || attempt >= self.cfg.retries {
                        return Err(e);
                    }
                    last = Some(e);
                    self.sleep_backoff(attempt).await;
                }
            }
        }
        Err(last.unwrap_or_else(|| LlmError::new("Gagal menghubungi DeepSeek")))
    }

    /// Chat / "Tanya" path: `(text, gateway_session_id)`. `mode` "new" injects context, "continue"
    /// resumes the session.
    pub async fn chat_call(
        &self,
        prompt: &str,
        gateway_session_id: Option<&str>,
        mode: &str,
        stream: bool,
        on_chunk: Option<OnChunk<'_>>,
    ) -> Result<(String, Option<String>), LlmError> {
        let out = if stream {
            self.chat_stream(prompt, gateway_session_id, mode, on_chunk, None, true)
                .await?
        } else {
            self.chat_nonstream(prompt, gateway_session_id, mode, on_chunk, None)
                .await?
        };
        if out.mode_fallback() {
            tracing::warn!(session = ?gateway_session_id, "gateway reported mode_fallback: the session was lost");
        }
        Ok((out.text, out.session_id))
    }

    /// Tiny streaming request to confirm the worker runs with `--enable-stream`.
    pub async fn probe_stream(&self) -> Value {
        let got = Mutex::new(Vec::<String>::new());
        let push = |piece: &str| {
            if let Ok(mut g) = got.lock() {
                g.push(piece.to_owned());
            }
        };
        let result = self
            .chat_stream(
                "Balas dengan satu kata: siap.",
                None,
                "new",
                Some(&push),
                Some("instant"),
                false,
            )
            .await;
        match result {
            Ok(out) => {
                self.delete_session(out.session_id.as_deref()).await;
                json!({"stream_ok": true, "first_chunk_s": out.first_chunk_s, "total_s": out.total_s})
            }
            Err(e) => json!({"stream_ok": false, "error": e.message}),
        }
    }

    /// Gateway reachability and available models (`llm_check`).
    pub async fn health(&self, probe: bool) -> Value {
        let resp = match self
            .http
            .get(self.url("/v1/models"))
            .bearer_auth(&self.cfg.api_token)
            .timeout(Duration::from_secs(8))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return json!({"ok": false, "error": format!("Tidak dapat terhubung ({})", classify(&e))});
            }
        };
        if resp.status().as_u16() != 200 {
            let status = resp.status().as_u16();
            let err = Self::status_error(resp, "gateway").await;
            return json!({"ok": false, "error": err.message, "status": status});
        }
        let models: Vec<Value> = resp
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| v.get("data").and_then(Value::as_array).cloned())
            .map(|a| {
                a.iter()
                    .map(|m| m.get("id").cloned().unwrap_or(Value::Null))
                    .collect()
            })
            .unwrap_or_default();
        let mut out = json!({"ok": true, "models": models, "latency": self.latency_stats()});
        if probe
            && let (Some(o), Some(p)) = (out.as_object_mut(), self.probe_stream().await.as_object())
        {
            o.extend(p.clone());
        }
        out
    }
}

/// Short class name of a network error, for messages (legacy printed the exception class).
fn classify(e: &reqwest::Error) -> &'static str {
    if e.is_timeout() {
        "Timeout"
    } else if e.is_connect() {
        "ConnectionError"
    } else if e.is_decode() {
        "DecodeError"
    } else {
        "RequestException"
    }
}
