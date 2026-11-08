# CONTEXT.md — Belajar (repo `FiePaw/MyLearn`)

Dokumen konteks komprehensif untuk asisten AI dan kontributor. Diperbarui untuk **Update v2.3.1** (`2.3.1`: canvas coding untuk kode, aturan kode/rumus pada prompt, perbaikan rumus otomatis; sebelumnya 2.3.0: mind map, metode catatan Detail, rumus KaTeX, huruf Nunito). Seluruh rangkaian uji pada Bagian 2 telah dijalankan dan lulus.

---

## 1. Gambaran Umum Proyek & Tech Stack

**Belajar** adalah webapp belajar pribadi (*single user*). Pengguna mengunggah materi (PDF, DOCX, PPTX, gambar, TXT/MD), lalu AI membuat catatan, kuis, penjelasan mendalam, chat per materi, dan **game edukasi interaktif berbasis AI**. Terdapat pelacakan streak harian, peta penguasaan konsep (*mastery*), misi harian, serta kartu belajar berjarak SM-2 (*spaced repetition*).

**Arsitektur hibrida "VPS + agent lokal":**

```
Browser ──HTTPS──▶ VPS: server/server.js (login, allowlist API, frontend statis) + bridge WebSocket (/bridge)
                              ▲
                              │ WebSocket, dibuka OLEH PC lokal (tanpa public IP)
                              │
                   PC lokal: agent.py ── SQLite (WAL) + folder file asli
                              │
                              └─ HTTP ─▶ PAF-Model gateway (DeepSeek Stream / Qwen / Grok)
```

- Seluruh data (SQLite `data/belajar.db`, berkas materi) dan seluruh pemanggilan AI berada di **agent lokal**. VPS tidak menyimpan data dan tidak memegang token PAF.
- Bila agent mati/offline, antarmuka web tetap menyala dan menampilkan status "PC lokal sedang offline".
- Hanya **satu agent** yang boleh terhubung ke VPS secara bersamaan (koneksi kedua memutus yang pertama dengan close code `4000`).
- **Game Interaktif (v2.0)**: AI (DeepSeek Stream) bertindak dinamis sebagai murid, detektif, narator RPG, analis kasus, atau penguji, sedangkan **agent lokal tetap bertindak sebagai wasit** yang menyimpan kunci jawaban, rubrik rahasia, menghitung skor, XP, dan tingkat penguasaan konsep.

| Lapisan | Teknologi |
|---|---|
| Agent (Backend sebenarnya) | Python 3.10+ (dev: 3.13), `asyncio`, `websockets>=12`, `requests`, `pymupdf`, `python-docx`, `python-pptx`, `Pillow`, `tzdata` |
| Database | SQLite 3 (mode WAL), berkas `data/belajar.db`, skema berversi (v3) |
| Server VPS | Node.js 18+, Express `^4.19.2`, `multer`, `ws` |
| Frontend | Vanilla JS SPA (tanpa framework, tanpa build step, mobile-first), router berbasis `#/hash`, CSS modern |
| AI Gateway | PAF-Model gateway (OpenAI Chat Completions-like): DeepSeek (stream instant, image/files upload, chat), Qwen (auto/thinking), Grok (khusus tugas kompleks & deep) |
| Deploy opsional | Caddy (HTTPS + WebSocket reverse proxy), systemd, `start_agent.bat` / `install_autostart.bat` (Windows) |

Bahasa antarmuka, pesan error, komentar kode, docstring, dan prompt AI semuanya menggunakan **Bahasa Indonesia**.

---

## 2. Perintah Eksekusi (Build, Run & Test)

Tidak ada langkah build. Tidak ada linter/formatter eksternal.

### Agent (Python)

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip
# Buat berkas .env di root repo:
python agent.py
```

- `.env` minimal: `BRIDGE_URL` (misal `wss://belajar.domainmu.com/bridge`), `BRIDGE_TOKEN` (minimal 16 karakter, sama dengan di server), `PAF_API_TOKEN`.
- Windows: jalankan `start_agent.bat` untuk inisialisasi lingkungan otomatis dan loop restart.

### Server (Node.js)

```bash
cd server
npm install
cp .env.example .env        # Isi APP_PASSWORD, SESSION_SECRET, BRIDGE_TOKEN
node server.js              # Atau: npm start
```

### Variabel Lingkungan Agent (`.env`, dibaca oleh `config.py`)

| Variabel | Bawaan | Fungsi |
|---|---|---|
| `PAF_BASE_URL` | `http://20.239.192.10:9000` | Alamat gateway PAF-Model |
| `PAF_TIMEOUT` | 340 | Detik batas tunggu (gateway butuh minimal 330) |
| `LLM_CONCURRENCY` | 2 | Request AI paralel untuk dokumen & kuis (Qwen/Grok) |
| `LLM_CONCURRENCY_STREAM` | 1 | Semaphore independen pemanggilan streaming DeepSeek (game & chat) |
| `LLM_RETRIES` / `LLM_BACKOFF_BASE` | 2 / 4.0 | Retry dan backoff eksponensial (maks 30 dtk) |
| `LLM_FALLBACK` | `1` | Pindah backend otomatis saat 429/504 |
| `CHUNK_CHARS` | 7000 | Ukuran teks per chunk dokumen |
| `MAX_UPLOAD_MB` / `MAX_VISION_PAGES` | 40 / 80 | Batas ukuran berkas dan batas pembacaan model visi |
| `TIMEZONE` / `DAY_START_HOUR` | `Asia/Jakarta` / 0 | Batas pergantian hari untuk streak dan misi harian |
| `DATA_DIR` | `./data` | Lokasi DB SQLite, berkas materi, dan backup |

### Rangkaian Pengujian (Test Suite v2.2)

Jalankan dari **root repo** menggunakan interpreter `.venv`:

```bash
.venv/Scripts/python tests/smoke_agent.py          # 78 cek: pipeline dokumen, visi DeepSeek, kuis, streak, chat AI, panel Tanya
.venv/Scripts/python tests/smoke_play.py           # 111 cek: siklus game AI, streaming, idempotensi, scoring, mastery, quests
.venv/Scripts/python tests/smoke_cards.py          # 38 cek: kartu SM-2, ekspansi istilah AI, ekspor Anki TSV
.venv/Scripts/python tests/test_play_protocol.py   # 30 cek: unit parser stream penanda, LaTeX parser, skema TypedDict
.venv/Scripts/python tests/test_ask_tool.py        # 26 cek: OpenAI tools, upload attachment DeepSeek/Grok, retry argumen, fallback HTTP 400
.venv/Scripts/python tests/smoke_notes.py          # 105 cek: gaya Detail (Grok), clean_note (rumus/struktur), normalize_tree, job mind map
.venv/Scripts/python tests/smoke_codemath.py       # 69 cek: detect, pagar kode, perbaikan rumus, aturan prompt, e2e materi berisi kode/rumus
.venv/Scripts/python tests/parity_actions.py       # Paritas 100% allowlist ACTIONS (server.js) <-> HANDLERS (Python)  [52 action]
NODE_PATH=... node tests/markdown_math_check.js    # 36 cek: renderer Markdown + KaTeX, tabel, daftar, keamanan
NODE_PATH=... node tests/code_canvas_check.js      # 58 cek: render, pewarnaan, XSS, perlindungan isi kode, interaksi
NODE_PATH=... node tests/mindmap_ui_harness.js     # 41 cek: tab, job, peta SVG, lipat, cari di catatan, daftar, ekspor, tata letak
```

Seluruh pengujian menggunakan `tests/mock_paf.py` sehingga **tidak mengonsumsi kuota atau token asli**.

### Catatan v2.3 untuk kontributor
- **Gaya catatan**: `pipeline.STYLES = (ringkas, cornell, sederhana) + DETAIL_STYLES`. Semua `DETAIL_STYLES` memakai level `detail` (Grok -> DeepSeek thinking -> Qwen thinking). Aturan per gaya ada di `STYLE_RULES`; aturan format/rumus bersama di `FORMAT_RULES`. Daftar gaya di UI ada di `NOTE_STYLES` (`app.js`), harus selaras.
- **Rumus**: model diminta memakai `$...$` / `$$...$$`. `sanitize.clean_note` menyeragamkan, frontend merender KaTeX (`vendor/katex`, tanpa CDN karena CSP `'self'`). Jangan memakai regex lookbehind di `app.js` (Safari lama).
- **Mind map**: `mindmap.py` (job `generate_mindmap`) + `mindmap.js`. Level model di `mindmap.MINDMAP_LEVEL`.
- **Kode & rumus (v2.3.1)**: `detect.analyze()` memutuskan aturan tambahan per bagian materi (`pipeline.extra_rules`). Hasil model dirapikan `sanitize.clean_note` = `clean_md` -> `normalize_fences` -> `normalize_math` -> `fix_math_text` -> `normalize_structure`. Aturan keras: isi pagar kode TIDAK BOLEH disentuh langkah mana pun (judul, baris kosong, escape literal, rumus); gunakan `_outside_fences`. Frontend: blok kode dirender `CodeCanvas.render(info, code)`; tanpa modul itu kembali ke `<pre><code>`. Tidak ada eksekusi kode (CSP).
- Mock gateway mengembalikan pohon mind map "kotor" dan catatan dengan rumus/tabel tak rapi agar jalur normalisasi ikut teruji.

---

## 3. Struktur Direktori & Arsitektur

```
.
├── agent.py               Entry point agent: koneksi WebSocket ke VPS, loop backup harian
├── config.py              Konfigurasi: membaca .env, konstanta global, VERSION="2.2.0"
├── common.py              UserError, JSON helpers (jdump/jload), clamp, doc_ids, source_info
├── db.py                  Skema SQLite v3, migrasi berversi, query helper (tx/rows/row/run/scalar), backup, FTS5
├── jobs.py                Job latar belakang asinkron (ThreadPoolExecutor) & pelacak status di tabel jobs
├── handlers.py            Semua handler RPC inti dokumen, kuis, chat, dan pendaftaran modul di baris terakhir
├── profile.py             Profil pengguna, kurva level, perhitungan XP, 14 lencana, dan 3 misi harian
├── cards.py               Algoritma SM-2, antrean kartu jatuh tempo, ulasan berjarak, dan ekspor TSV Anki
├── concepts.py            Pengelolaan istilah/konsep materi, seeding otomatis, job AI expand concepts (ask_tool)
├── play.py                Handler RPC game interaktif: play_hub, play_turn, play_get, mastery_map, quests_get, dsb.
├── play_engine.py         Pelari giliran game: streaming chunk, idempotensi client_key, pemulihan sesi, penilaian
├── play_protocol.py       Penanda data (<<<GAME_DATA), stream parser dengan tail-hold, skema TypedDict, validator
├── play_director.py       Direktur materi: pemilihan konsep fokus berbobot, pencarian FTS5/LIKE, kalkulasi mastery
├── play_prompts.py        Persona per mode, preamble sistem, direktif giliran, tangga petunjuk sokratik
├── play_games.py          Metadata 6 mode permainan, penilai jawaban lokal, reducer state petualangan aman
├── pipeline.py            Pipeline AI: pemrosesan dokumen (ask_tool), kuis (ask_tool), penjelasan, panel Tanya
├── llm.py                 Klien terpadu PAF-Model: _post() -> LLMResponse, ask(), chat_call(), ask_tool(), JSON extraction
├── chat.py                Chat per dokumen (DeepSeek): prepare_session, send_message
├── extract.py             Ekstraktor teks PDF/DOCX/PPTX/gambar/TXT/MD -> Unit -> chunks
├── detect.py              Deteksi kode (+bahasa) dan matematika pada bagian materi (heuristik) -> aturan prompt tambahan
├── mindmap.py             Mind map: skema tool, prompt, normalize_tree, job generate_mindmap, tabel mindmaps
├── sanitize.py            Sanitasi teks keluaran model (think tags, code fences, inline clean, clean_note: rumus & struktur)
├── stats.py               Streak harian, freeze streak, heatmap aktivitas, tren skor kuis
├── requirements.txt       Dependensi agent Python
├── start_agent.bat        Script startup otomatis Windows
├── server/
│   ├── server.js          Express: otentikasi sesi, allowlist ACTIONS, rute SSE (chat, tanya, play), upload, statis
│   ├── bridge.js          AgentBridge: WebSocket server untuk koneksi agent tunggal
│   ├── public/            Frontend statis Vanilla JS:
│   │   ├── index.html     Halaman SPA utama
│   │   ├── app.js         Router, shell, view dokumen/kuis/chat, renderer Markdown + rumus KaTeX, Belajar.sse, Belajar.createSmoother
│   │   ├── codecanvas.js  Canvas coding: pewarna sintaks, kartu kode, salin/unduh/layar penuh (window.CodeCanvas)
│   │   ├── mindmap.js     Komponen mind map (SVG, pan/zoom, lipat, daftar, ekspor SVG/PNG)
│   │   ├── vendor/katex/  KaTeX 0.19.1 (di-host sendiri; lihat vendor/LICENSES.md)
│   │   ├── style.css      Gaya utama aplikasi
│   │   ├── play.css       Gaya game interaktif mobile-first, peta penguasaan, komposer
│   │   └── play/          Modul frontend game interaktif:
│   │       ├── hub.js     Game Hub (pilihan mode, scope materi/mapel, kartu aktif, misi)
│   │       ├── run.js     Layar permainan (streaming narasi, render tantangan, smoother, auto-scroll)
│   │       ├── peta.js    Peta Penguasaan Konsep visual (mastery map)
│   │       ├── cards.js   Kartu belajar SM-2 (flashcards & ekspor TSV)
│   │       └── modes/     Renderer tantangan spesifik per mode:
│   │           ├── ajari.js        Tantangan penjelasan Feynman
│   │           ├── detektif.js     Ketukan kalimat salah
│   │           ├── petualangan.js  RPG naratif, HP, inventaris kartu
│   │           ├── kasus.js        Studi kasus dunia nyata
│   │           ├── kilat.js        Latihan cepat pilihan & isian
│   │           └── boss.js         Ujian evaluasi boss & rapor diagnosis
│   └── *.example          Contoh .env, Caddyfile (flush_interval -1), systemd service
├── tests/                 Rangkaian pengujian: smoke_agent.py, smoke_play.py, smoke_cards.py, test_play_protocol.py, parity_actions.py, mock_paf.py
└── data/                  Data lokal (belajar.db, files/, backup/) — diabaikan dari git tracking (.gitignore)
```

---

## 4. Logika Bisnis Inti & Alur Data

### 4.1 Alur RPC & Streaming (Bridge)

1. **RPC Standar**: Klien memanggil `rpc(action, body)` -> `POST /api/rpc/:action`. Server Express memeriksa sesi cookie dan memastikan `action` ada dalam allowlist `ACTIONS`. Bridge meneruskan pesan `{...body, action, req_id}` lewat WebSocket ke agent. Handler Python dieksekusi di thread executor dan membalas `{ok, data, req_id}`.
2. **Streaming SSE (`POST /api/play/turn`, `/api/chat/send`, `/api/notes/ask`)**:
   - Dikelola oleh helper terpusat `sseRoute`.
   - Mengirimkan komentar heartbeat `: ping` tiap 15 detik untuk menjaga stabilitas koneksi pada jaringan seluler/proxy.
   - Deteksi pemutusan klien (`res.on('close')`) tidak mematikan agent; proses giliran tetap selesai dan tersimpan di database.
   - Frontend memanfaatkan *token smoother* adaptif (`createSmoother`) untuk menghasilkan ketikan kata demi kata yang mengalir halus.

### 4.2 Game Interaktif AI (DeepSeek Stream v2.0)

Game interaktif bertujuan memastikan **pengguna benar-benar memahami dan menguasai konsep materi**:

- **6 Mode Permainan**:
  1. **Ajari Aku**: Murid AI polos dan kritis; meminta penjelasan konsep dengan kata-kata sendiri dan analogi (Feynman Technique).
  2. **Detektif Salah Kaprah**: Artikel penjelasan materi dengan 1–2 kalimat keliru; pengguna mengetuk kalimat yang salah (penilaian lokal presisi/recall).
  3. **Petualangan**: Cerita RPG bercabang bertema di mana tantangan pintu/ruangan adalah konsep materi; dilengkapi HP dan kartu item SM-2.
  4. **Kasus Nyata**: Skenario studi kasus dunia nyata tanpa penyebutan langsung istilah materi; menuntut transfer konsep.
  5. **Kilat**: Pelatih cepat latihan pilihan ganda, benar/salah, dan isian singkat satu tangan.
  6. **Ujian Boss**: Pengujian komprehensif tanpa petunjuk; diakhiri dengan streaming narasi Rapor Diagnosis akhir.
- **Agent sebagai Wasit**:
  - Seluruh kunci jawaban, rubrik penilaian, dan status giliran disimpan di tabel `game_turns.secret`. Rahasia **tidak pernah dikirim ke browser** sebelum giliran dinilai/selesai.
  - Perhitungan skor, XP, dan status penguasaan dikendalikan penuh oleh agent lokal.
- **Protokol Keluaran AI (`<<<GAME_DATA`)**:
  - Narasi Markdown mengalir ke pengguna secara streaming.
  - Tepat di akhir, AI menyertakan satu blok data tertutup:
    `<<<GAME_DATA {"judgement": {...}|null, "next": {"public": {...}, "secret": {...}}|null, "state_delta": {...}, "end": false} GAME_DATA>>>`
  - Parser streaming `PlayStreamParser` menahan ekor potongan teks agar penanda tidak bocor ke antarmuka pengguna.
- **Model Penguasaan Konsep (Mastery)**:
  - Setiap konsep memiliki skor 0–100 pada tabel `mastery`.
  - Diperbarui dari bukti performa tiap giliran:
    `obs = skor * (1 - 0.15 * hint_level)`
    `skor_baru = skor_lama + w * (100 * obs - skor_lama)`
  - 4 level penguasaan: **Baru**, **Dikenal** (<50%), **Paham** (50–74%), **Kuasai** (≥75%, ≥4 bukti, dari ≥2 mode berbeda).
  - Konsep dengan skor rendah otomatis dijadikan kartu SM-2.
  - Tombol **Soal Ini Keliru** (`play_flag`): menandai giliran keliru, membatalkan baris buktinya di tabel `evidence`, dan menghitung ulang skor penguasaan konsep secara otomatis.
- **Gamifikasi Terukur**:
  - XP giliran: `round(15 * obs * bobot_jenis) + min(combo, 5) * 2 - 3 * hint_level`.
  - Bonus akhir permainan: +25 bila selesai, +15 bila akurasi ≥80% (maks 300 XP per permainan).
  - 14 lencana pencapaian (*achievements*) dan 3 misi harian (*daily quests*).
- **Ketahanan Jaringan Seluler (Mobile-First)**:
  - `client_key` (UUID) menjamin idempotensi jika terjadi ketukan ganda atau retry jaringan.
  - Progres sementara ditulis ke `game_turns.partial` tiap ~1 detik. Jika koneksi putus atau tab dibuka kembali, klien memanggil `play_turn_get` untuk melanjutkan tanpa kehilangan status.
  - Jika sesi gateway terputus (`x_meta.mode_fallback: true`), sesi otomatis dipulihkan sebagai sesi `NEW` dengan injeksi rangkuman status SQLite.

### 4.3 Kartu Belajar SM-2 (`cards.py`)
- Algoritma SuperMemo SM-2 (`sm2()`): nilai 1 (lagi), 3 (sulit), 4 (baik), 5 (mudah).
- Antrean kartu jatuh tempo per hari (`due_day <= stats.today()`).
- Ekspor TSV 3-kolom yang kompatibel langsung dengan Anki Desktop/Mobile.

---

## 5. Skema Database SQLite (`db.py`)

Database menggunakan SQLite mode WAL dengan skema berversi (versi saat ini: `3`).

| Tabel | Fungsi / Kolom Utama |
|---|---|
| `schema_version` | Kolom `version INTEGER NOT NULL` (nilai: 3) |
| `mindmaps` | Mind map per materi (v3): `document_id` PK (CASCADE), `tree` (JSON akar + relasi), `node_count`, `source_ts` (= `notes.updated_at` saat dibuat; dipakai menandai usang) |
| `subjects` | Mata pelajaran (`name` unik, `color`) |
| `documents` | Materi belajar: `subject_id`, `title`, `summary`, `key_concepts`, `topics`, `status`, `file_path` |
| `chunks` | Potongan teks materi (`label`, `text`, `note_md`); berelasi CASCADE |
| `notes` | Catatan rakitan final per dokumen (`content_md`, `edited`, `version`) |
| `quizzes` -> `questions` | Kuis materi/mapel -> bank soal (`qtype`, `options`, `answer`, `keywords`, `explanation`, `deep_explanation`) |
| `attempts` -> `answers` | Percobaan kuis (`mode`: practice/exam/review) -> jawaban pengguna (`correct`, `feedback`, `graded_by`) |
| `study_events` | Log aktivitas harian (`day`, `kind`, `seconds`, `quizzes`) — sumber perhitungan streak |
| `jobs` | Pelacak job latar belakang (`kind`, `progress`, `message`, `result`, `error`) |
| `settings` | Pengaturan key/value (`daily_goal_min`, `notes_style`, `language`, `fts5`) |
| `chat_sessions` -> `chat_messages` | Sesi chat DeepSeek per dokumen + `gateway_session_id` |
| `ask_sessions` | Sesi panel Tanya catatan -> pemetaan sesi gateway |
| `player` | Baris tunggal (`id=1`): `xp` total pengguna |
| `game_runs` | Sesi permainan v2: `game`, `scope_kind`, `scope_id`, `status`, `state`, `gateway_session_id`, `turn_count`, `correct`, `xp` |
| `game_turns` | Riwayat giliran: `idx`, `client_key`, `status`, `concept_ids`, `kind`, `narration`, `partial`, `public`, `secret`, `answer`, `judgement`, `hint_level`, `flagged` |
| `mastery` | Tingkat penguasaan konsep: `concept_id`, `score` (0-100), `evidence_n`, `kinds`, `last_at` |
| `evidence` | Bukti performa per giliran: `concept_id`, `run_id`, `turn_id`, `kind`, `obs`, `hint_level`, `ts` |
| `quests` | Status misi harian (`day`, `key`, `done_at`) |
| `achievements` | Lencana terbuka (`key`, `unlocked_at`) |
| `concepts` | Daftar konsep materi: `document_id`, `term`, `definition`, `topic`, `seen`, `hits` |
| `cards` | Kartu belajar SM-2: `document_id`, `front`, `back`, `ease`, `interval`, `reps`, `lapses`, `due_day` |
| `chunks_fts` | Tabel virtual FTS5 untuk pencarian bahan sumber cepat berbasis kata kunci |

---

## 6. Standar Penulisan & Aturan Perilaku AI

1. **Agent adalah Wasit**: AI diizinkan menyusun narasi dan memberikan pertimbangan penilaian, namun kunci jawaban, rubrik, status rahasia, kalkulasi skor, XP, dan penguasaan konsep **selalu dikendalikan oleh kode Python di agent lokal**.
2. **Bahasa**: Seluruh teks antarmuka pengguna, pesan `UserError`, prompt AI, komentar, dan entri `CHANGELOG.md` menggunakan **Bahasa Indonesia**.
3. **Allowlist Sinkron**: Setiap penambahan action RPC baru wajib didaftarkan dengan `@register` di Python **dan** dicantumkan di Set `ACTIONS` pada `server/server.js`. Uji dengan `python tests/parity_actions.py`.
4. **Sanitasi Output**: Semua keluaran narasi dari AI wajib dilewatkan `sanitize.clean_md` sebelum disimpan atau dirender.
5. **Keamanan Data**:
   - Direktori `data/` tidak boleh dilacak oleh Git (`.gitignore`).
   - Jangan pernah mencetak atau membocorkan kredensial (`PAF_API_TOKEN`, `BRIDGE_TOKEN`, `APP_PASSWORD`, `SESSION_SECRET`) ke dalam commit, log, atau antarmuka web.
6. **Mobile-First Experience**:
   - Seluruh elemen interaksi game wajib memiliki target sentuh minimal 44 px.
   - Textarea input menggunakan ukuran font minimal 16 px untuk mencegah zoom otomatis pada browser perangkat seluler.
7. **Verifikasi Uji**: Setelah melakukan modifikasi kode, jalankan seluruh rangkaian uji Bagian 2 untuk memastikan integritas sistem tetap terjaga.
