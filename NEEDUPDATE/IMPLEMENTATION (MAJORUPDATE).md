# IMPLEMENTATION — Major Update v2.0: Game Interaktif Berbasis AI (DeepSeek Stream)

> **Status: DRAFT untuk didiskusikan, lalu diimplementasi.** Dokumen ini satu-satunya perubahan pada tahap ini; **tidak ada kode yang diubah**.
> Basis: branch `main`, commit `b29748c`, CHANGELOG `1.2.0`. Baseline uji: `smoke_agent` 76/76, `smoke_games` 60/60, `logic.test` 12/12.
> Isi §1–§3 adalah **fakta/keputusan**; §4–§12 adalah **rancangan usulan** yang bisa dipangkas; §13 daftar hal yang perlu kamu putuskan.

## 1. Ringkasan

**Hapus** seluruh sistem game lama (7 game, Kota, koin, cerita, pencapaian lama) dan **bangun ulang** sebagai game yang tujuannya satu: **pengguna benar-benar paham dan menguasai materi**. Game dijalankan **langsung oleh model DeepSeek lewat mode stream**: AI menjadi murid, detektif, narator, pemberi kasus, dan penguji, sementara **agent lokal tetap menjadi wasit** (menyimpan kunci jawaban, menghitung skor, XP, dan penguasaan).

### Keputusan pemilik (dari pesan terakhir)

| # | Keputusan | Dampak |
|---|---|---|
| D1 | Hapus semua game lama | §9 |
| D2 | Game baru: interaktif langsung via DeepSeek, **mode stream** | §4–§7 |
| D3 | **Pertahankan** Kartu SM-2, ekspor Anki, tabel `concepts` | §9.2 (diekstrak dulu sebelum `games.py` dihapus) |
| D4 | Data lama **dihapus** | §6.3 |
| D5 | Input pengguna **harus nyaman di HP** | §8 |
| D6 | Worker gateway **selalu** berjalan dengan `--enable-stream` | §5.5 |
| D7 | Game bisa dibuat **per materi** atau **per mata pelajaran** | §4.5 |
| D8 | Gamifikasi tetap ada | §4.4 |

### Asumsi saya (koreksi bila salah)

| # | Asumsi |
|---|---|
| A1 | Pesan "semua game yang kamu sarankan" merujuk pada usulan yang belum pernah saya tulis di percakapan ini, jadi **§4 adalah usulan itu sendiri**: 6 mode + tangga petunjuk. Pangkas/ganti sesukamu. |
| A2 | "Data lama" = data **game** (XP, koin, kota, cerita, pencapaian, riwayat permainan, attempt `mode='game'`). Isi tabel `concepts` dan `cards` **tetap**, karena tabelnya dipertahankan; hanya penghitung lama di `concepts` (`seen`, `hits`) di-nol-kan. **Riwayat belajar (`study_events`) tidak dihapus** agar streak tidak rusak. |
| A3 | **Koin dan Kota dihapus** bersama game lama. Gamifikasi = XP, level, lencana, misi harian, kombo, dan peta penguasaan. |
| A4 | Satu pengguna, satu agent → **satu permainan aktif** pada satu waktu. |

---

## 2. Konteks teknis yang tetap berlaku

```
Browser ──HTTPS──▶ VPS  server.js (allowlist RPC, SSE, upload) + bridge.js (WebSocket, 1 agent)
                              ▲ dibuka OLEH PC lokal
                  PC Windows  agent.py ─ handlers ─ SQLite (WAL) ─ HTTP ▶ Gateway PAF-Model (deepseek/qwen/grok)
```

### 2.1 Kontrak gateway yang relevan untuk game (dari `API_USAGE.md`)

| Fakta | Konsekuensi rancangan |
|---|---|
| Stream hanya untuk **`deepseek`**, **tanpa `tools`** | Tidak ada function-calling. Struktur data dikirim **dalam teks** (protokol §5.2) |
| Chunk datang **±2×/detik**, bukan per token | UI wajib memakai *smoother* (ketik halus), bukan menampilkan chunk apa adanya |
| `think_mode:"thinking"` → chunk pertama muncul **setelah** berpikir selesai | Gameplay memakai **`instant` (eksplisit)**; `thinking` hanya opsional |
| **`x_meta.full_text`** pada chunk terakhir = teks paling akurat; chunk tengah bisa terlewat | Hasil akhir **selalu di-parse dari `full_text`**; UI mengganti teks tampil dengan versi final |
| Error di tengah stream = `data:{"error":…}` **tanpa** `[DONE]` | Giliran ditandai gagal-bisa-diulang (§5.6) |
| Hanya pesan `user` terakhir diteruskan; riwayat ada di **sesi** (`X-Session-ID`) | Satu sesi gateway per permainan (NEW lalu CONTINUE) |
| Sesi terikat ke **akun**; sesi hilang → `x_meta.mode_fallback:true` | **Wajib** dideteksi dan dipulihkan (§5.4) — saat ini **tidak dibaca** (temuan T5) |
| Sesi **tidak kedaluwarsa otomatis** | Hapus saat selesai/ditinggalkan + pemangkasan berkala |
| Timeout bisa ≥ 330 dtk | `PAF_TIMEOUT=340` sudah sesuai |

### 2.2 Yang sudah ada dan dipakai ulang

`llm.chat_call` (sesi NEW/CONTINUE + parser SSE + pengutamaan `full_text`), `bridge.js` (chunk memperpanjang timer), `sanitize.clean_md`, `pipeline.grade_short_local`, `pipeline._norm`, `llm.extract_json`, `jobs`, `stats.log_event`/`streak_info`, `createSmoother` (pengetikan halus di `app.js`), pola komposer chat (`visualViewport`, `safe-area`).

### 2.3 Temuan yang menjadi **prasyarat** (diverifikasi di kode)

| ID | Temuan | Mengapa wajib untuk v2.0 |
|---|---|---|
| T5 | `x_meta.mode_fallback` **tidak dibaca** (`grep` kosong) | Game bersesi panjang; kehilangan sesi tanpa deteksi = AI lupa peran/cerita tanpa disadari |
| T7 | Migrasi skema ad-hoc (satu `ALTER TABLE … try/except`), tanpa nomor versi | v2.0 **menghapus dan membuat** tabel; butuh migrasi berversi + backup |
| T8 | Dua jalur HTTP LLM (`_call` dan `chat_call`) | Telemetri, `think_mode`, dan semaphore per-backend harus diubah di satu tempat |
| T9′ | Semaphore `_sem` **global** (`LLM_CONCURRENCY=2`) dipakai `ask` dan `chat_call` | Satu giliran game (stream puluhan detik) akan **menghambat pemrosesan dokumen** |
| T11 | Dua rute SSE identik di `server.js`, **tanpa heartbeat**; paritas `ACTIONS`↔`HANDLERS` hanya dijaga manual | Tambah rute SSE ketiga + heartbeat untuk jaringan seluler |
| T1 | `data/` (DB, backup, PDF ±7,4 MB) **ter-track di git** meski ada di `.gitignore` | Berhubungan dengan D4; lihat §10 Fase 0 |
| T4 | `PLANS["chat"]` tidak pernah dipakai; chat/Panel Tanya **tanpa fallback** | Game juga DeepSeek-only → kegagalan DeepSeek harus ditangani anggun (§5.6), bukan diam |

---

## 3. Invarian (revisi)

Invarian dari dokumen sebelumnya **tetap**, kecuali dua yang **diubah secara sadar**:

| Lama | Baru | Alasan |
|---|---|---|
| #10 "Game tidak memanggil AI saat berjalan" | **Game memanggil AI saat berjalan**, tetapi AI **tidak pernah** memegang kunci jawaban, skor, XP, atau status penguasaan. Semua itu hidup di agent/SQLite | Inti update ini |
| #8 "Skema hanya bertambah" | Berlaku **kecuali** migrasi v2 yang **menghapus tabel game lama** (§6.3), selalu didahului backup | D4 |

Invarian baru khusus game:

1. **Agent adalah wasit.** Kunci jawaban, rubrik, dan status disimpan di SQLite (`game_turns.secret`). **Tidak pernah dikirim ke browser** sebelum giliran selesai dinilai.
2. **Keluaran AI = data tak tepercaya.** Skor AI di-*clamp* ke [0,1]; XP dan penguasaan dihitung agent; field di luar skema dibuang; perubahan `state` hanya lewat daftar putih.
3. **Jawaban pengguna dan materi = data, bukan perintah.** Dibungkus penanda (`<<<JAWABAN … JAWABAN>>>`, `<<<BAHAN … BAHAN>>>`) + klausa anti-injeksi di preamble.
4. **Generasi giliran tidak terikat koneksi HTTP.** Agent menyelesaikan dan menyimpan giliran walau browser terputus (HP tidur); klien bisa mengambil ulang (§5.6).
5. **Setiap sesi gateway yang dibuat harus dihapus** (selesai, ditinggalkan, atau dipangkas > 6 jam).
6. **Satu giliran = satu `client_key` idempoten.** Ketukan ganda atau retry tidak boleh membuat dua giliran.
7. **Bahan hanya dari materi pengguna.** AI diminta menyebut `sumber` (label halaman/slide); bila bahan tidak cukup, AI harus bilang, bukan mengarang.

---

## 4. Desain game

### 4.1 Prinsip belajar yang dipakai

| Prinsip | Diwujudkan oleh |
|---|---|
| **Retrieval practice** (mengingat aktif) | Kilat, Boss, tantangan di Petualangan |
| **Spaced repetition** | Kartu SM-2 (dipertahankan) + direktur memprioritaskan konsep jatuh tempo |
| **Self-explanation / protégé effect** | Ajari Aku |
| **Belajar dari kesalahan (refutation)** | Detektif Salah Kaprah; konsep yang salah otomatis jadi kartu |
| **Transfer ke situasi baru** | Kasus Nyata |
| **Interleaving** | Direktur mencampur konsep lemah, baru, dan yang sudah dikuasai; mode mata pelajaran menyilangkan materi |
| **Scaffolding** | Tangga petunjuk 3 tingkat di semua mode |

### 4.2 Enam mode + tangga petunjuk

| Mode | Peran AI | Cara main (HP) | Penilaian | Memakai stream untuk |
|---|---|---|---|---|
| **1. Ajari Aku** (Feynman) | Murid polos yang kritis | Pengguna **menjelaskan** konsep dengan kata sendiri (teks atau dikte keyboard). 3–5 giliran per konsep; murid bertanya "kenapa?" dan "contohnya?" | **AI**, rubrik 4 dimensi (akurat, lengkap, jelas, contoh) × skala 0–3 terhadap `poin_kunci` | Murid mengetik balasan secara hidup |
| **2. Detektif Salah Kaprah** | Penulis penjelasan yang **menyelipkan 1–2 kalimat salah** yang meyakinkan | **Ketuk** kalimat yang dicurigai, lalu (opsional) ketik koreksinya | **Lokal** untuk ketukan (presisi/recall); **AI** untuk koreksi | Penjelasan tampil mengalir; vonis dan pembahasan di-stream |
| **3. Petualangan** | Game master cerita bercabang bertema (fantasi/detektif/sci-fi/kantor, dipilih pengguna) | Rintangan = tantangan dari konsep fokus: **pilih aksi** (tombol besar) atau jawab singkat. Ada HP dan inventaris; item = **kartu SM-2** | **Lokal** untuk pilihan; **AI** untuk jawaban singkat | Narasi adalah inti permainannya |
| **4. Kasus Nyata** | Pembuat skenario dunia nyata **tanpa menyebut istilah materi** | Pengguna memilih keputusan / mengenali konsep yang berlaku, lalu menjelaskan alasannya | **Lokal** (pilihan) + **AI** (alasan) | Konsekuensi keputusan di-stream |
| **5. Kilat** | Pelatih singkat | Sesi 5–10 menit: serangkaian soal cepat (pilihan/benar-salah/isian singkat), satu tangan | **Lokal** (`grade_short_local`; isian ambigu → AI) | Sapaan/komentar pelatih; **batch berikutnya di-prefetch** saat pengguna menjawab |
| **6. Ujian Boss** | Penguji + pembuat rapor | 8–10 soal campuran **tanpa petunjuk dan tanpa umpan balik instan**, lintas topik | **Lokal** + **AI** untuk isian | **Rapor akhir** di-stream: peta kekuatan, miskonsepsi, rencana belajar |
| **Tangga petunjuk** (semua mode) | Tutor Sokratik | Tombol **Petunjuk** 3 tingkat: ① arah ② pertanyaan pemandu ③ separuh jawaban | — | Petunjuk di-stream; tiap tingkat **mengurangi** bobot skor (§4.3) |

> Mode 3 menggantikan Dungeon, Escape Room, Boss Battle, Wave Defense lama; mode 5 menggantikan Arcade/Memory/Teka-teki. **Alasan tidak ada permainan "mengetik istilah yang jatuh" dan teka-teki silang:** keduanya menilai ingatan kata, bukan pemahaman, dan sulit dimainkan di HP.

### 4.3 Model penguasaan (menggerakkan semuanya)

Satu skor per **konsep** (baris `concepts`), 0–100, diperbarui dari bukti tiap giliran:

```
obs       = skor_giliran × (1 − 0.15 × tingkat_petunjuk)          # 0..1
w         = {recall: 0.25, explain: 0.35, apply: 0.35, boss: 0.45}[jenis_bukti]
skor_baru = skor_lama + w × (100 × obs − skor_lama)
```

| Level | Syarat |
|---|---|
| Baru | belum ada bukti |
| Dikenal | skor < 50 |
| Paham | 50 ≤ skor < 75 |
| **Kuasai** | skor ≥ 75 **dan** ≥ 4 bukti **dan** bukti dari ≥ 2 jenis mode (agar tidak "hafal satu format") |

- Konsep dengan obs rendah **otomatis menjadi kartu SM-2** (memakai `INSERT OR IGNORE` ke `cards`, mekanisme yang sudah ada).
- Penguasaan topik = rata-rata konsep pada topik itu; penguasaan materi/mapel = rata-rata topik.
- Tombol **"Soal ini keliru"** pada tiap giliran menandai `flagged=1`: bukti giliran itu **dibatalkan** dan skor konsep dihitung ulang dari tabel `evidence`.

### 4.4 Gamifikasi (dihitung di agent, klien tidak dipercaya)

| Elemen | Aturan |
|---|---|
| **XP giliran** | `round(15 × obs × bobot_jenis) + min(kombo,5)×2 − 3×tingkat_petunjuk`, minimum 0. Bobot jenis: recall 1,0 · explain 1,4 · apply 1,4 · boss 1,6 |
| **XP permainan** | + 25 bila selesai, + 15 bila akurasi ≥ 80%; **maks 300 XP/permainan** (batas lama dipertahankan) |
| **Level** | Kurva `level_info` yang ada dipindah apa adanya; membuka tema Petualangan baru |
| **Kombo** | Jawaban benar beruntun dalam satu permainan; reset saat salah; ditampilkan di layar |
| **Lencana** (±14, tabel `achievements` dikosongkan) | Penjelas Pertama · Detektif Jeli · Penjelajah · Terapan · Kilat Sempurna · Penakluk Boss (≥70%) · Tanpa Petunjuk (≥6 giliran) · Kuasai 5 Konsep · Kuasai Satu Materi · Semua Mode · Penyelamat Kartu (kartu jatuh tempo habis) · Streak 7 · Level 5 · Level 10 |
| **Misi harian** (3, deterministik dari data) | "Kuasai 1 konsep lemah" · "Selesaikan 1 permainan" · "Ulas semua kartu jatuh tempo" → bonus XP kecil; tabel `quests` |
| **Peta penguasaan** | Kisi konsep per topik, 4 level dengan **warna + ikon + label** (tidak mengandalkan warna saja) |
| **Streak** | Permainan menulis `study_events(kind='game')` dan dihitung "satu kuis" bila ≥ 5 giliran ternilai (aturan lama dipertahankan) |

### 4.5 Cakupan: per materi atau per mata pelajaran (D7)

| | Per materi (`document`) | Per mata pelajaran (`subject`) |
|---|---|---|
| Kandidat konsep | `concepts` milik dokumen | `concepts` seluruh dokumen **berstatus `ready`** pada mapel itu |
| Paket sesi AI | ringkasan + daftar konsep | judul + ringkasan tiap materi + daftar konsep (dipangkas) |
| Pemilihan fokus | berdasar penguasaan | sama, plus **interleaving antar-materi** (tidak dua giliran berturut dari materi yang sama bila ada pilihan lain) |
| Boss | soal dari satu materi | soal **lintas materi** |
| Syarat | ≥ 5 konsep | ≥ 5 konsep total |

Bila konsep kurang, tombol **"Perbanyak istilah (AI)"** (job yang sudah ada, dipindah ke `concepts.py`) tetap tersedia.

---

## 5. Arsitektur teknis

### 5.1 Pembagian peran

```
Direktur (agent, deterministik)         AI DeepSeek (kreatif, stream)           Klien (HP)
 pilih konsep fokus + bahan sumber  ──▶  menulis narasi/soal/umpan balik  ──▶   tampilkan stream,
 nilai jawaban lokal                      + blok data terstruktur                 terima input
 simpan kunci/rubrik (rahasia)      ◀──  (kunci masuk blok data, DISIMPAN       kirim jawaban
 hitung skor, XP, penguasaan               agent, dibuang dari tampilan)
```

### 5.2 Protokol keluaran AI (tanpa tools, tanpa mode JSON)

Setiap giliran AI membalas **narasi Markdown** (di-stream ke pengguna) diikuti **satu blok data** (tidak ditampilkan):

```
Narasi untuk pengguna… (Markdown, boleh panjang)

<<<GAME_DATA
{"judgement": {...} | null, "next": {"public": {...}, "secret": {...}} | null, "state_delta": {...}, "end": false}
GAME_DATA>>>
```

- `judgement` (hanya bila AI diminta menilai): `{"skor": 0..1, "umpan_balik": "1–2 kalimat", "rubrik": {...}, "miskonsepsi": "opsional"}`.
- `next.public` = apa yang boleh dilihat klien (teks tantangan, opsi, kalimat detektif…). `next.secret` = kunci, `poin_kunci`, indeks kalimat salah, dst. → **hanya ke SQLite**.
- Skema `public`/`secret`/penilai lokal per mode didefinisikan di `play_games.py` (§7.3) dan divalidasi.

**Parser stream** (`play_protocol.py`, fungsi murni, diuji unit):

1. `feed(delta)` menahan **ekor sepanjang `len(MARK)-1`** agar penanda yang terpotong antar-chunk tidak bocor; teks sebelum penanda diteruskan ke klien; setelah penanda ditemukan, tidak ada lagi yang diteruskan.
2. `finalize(full_text)` memakai **`full_text`** (bukan gabungan delta): pisahkan di penanda → `narasi` (dibersihkan `sanitize.clean_md`) dan JSON (`llm.extract_json`, toleran terhadap LaTeX).
3. Validasi skema per mode. Gagal → **koreksi diam-diam** lewat CONTINUE ("FORMAT SALAH: … kirim ulang LENGKAP"), maks 2×; klien hanya melihat status "merapikan…".
4. Event `done` membawa `narasi` final; klien **mengganti** teks yang sudah tampil bila berbeda.

### 5.3 Satu sesi gateway per permainan

| Tahap | Panggilan |
|---|---|
| **Mulai** | `chat_call(mode="new")` berisi **preamble** (peran, aturan, protokol §5.2, anti-injeksi) + **paket materi** (≤ 6.000 karakter) + **direktif giliran 1**. Tidak ada giliran sapaan terpisah (hemat satu putaran) |
| **Tiap giliran** | `chat_call(mode="continue")` berisi **direktif**: hasil jawaban sebelumnya (verdict lokal, atau "NILAI SENDIRI dengan rubrik" untuk jawaban bebas) + `<<<JAWABAN…>>>` + **fokus berikutnya** + `<<<BAHAN…>>>` (1–2 potongan) + pengingat format satu baris |
| **Selesai/tinggalkan** | `DELETE /v1/sessions/{id}` |

Direktif dibuat **mandiri** (memuat bahan dan format) sehingga bisa dikirim ulang apa adanya saat pemulihan sesi.

### 5.4 Direktur: memilih fokus dan bahan sumber (`play_director.py`)

- **Bobot kandidat:** kartu jatuh tempo ×3 · konsep lemah (skor < 50) ×2 · belum pernah dilihat ×1,5 · sudah dikuasai ×0,3 (pemeliharaan); penalti bagi konsep dari 3 giliran terakhir. Pengambilan sampel berbobot tanpa pengembalian. Mode mapel menambah penalti materi yang sama berturut-turut.
- **Bahan sumber:** pencarian **SQLite FTS5 (BM25)** pada `chunks` dengan token dari istilah + definisi → 1–2 potongan, dipotong ≤ 2.500 karakter di sekitar kecocokan, berlabel (`[Halaman 12]`). Tidak ada hasil → bahan = ringkasan + definisi konsep, dan AI diberi tahu "bahan terbatas, jangan menambah fakta".
- **FTS5:** tersedia di SQLite 3.45 (diuji). **Probe di Python PC target saat agent start**, simpan `settings.fts5`; bila tidak ada, pakai `LIKE` (lebih lambat, tetap berfungsi).
- **Pemulihan sesi** (`x_meta.mode_fallback:true` pada CONTINUE, atau galat sesi): buang balasan itu → kirim ulang direktif yang sama sebagai **NEW** dengan preamble + paket materi + **ringkasan status dari SQLite** (nomor giliran, HP/adegan, 3 giliran terakhir ringkas). Toast "Sesi AI dipulihkan"; `game_runs.resumes += 1`. Status permainan **tidak pernah bergantung pada ingatan AI**.

### 5.5 Stream selalu aktif (D6)

- Game **tidak punya jalur non-stream**. Bila gateway membalas `400` ("stream tidak didukung"), tampilkan galat jelas: *"Worker gateway belum dijalankan dengan `--enable-stream`."* (jalur fallback non-stream di `chat_call` tidak dipakai game).
- "Tes koneksi AI" (Progres) ditambah **probe stream** (permintaan kecil) → `stream_ok`.
- `README` dan `server/.env.example`/dokumen pemasangan mencatat `--enable-stream` sebagai **prasyarat**.
- Gameplay memakai `think_mode:"instant"`; `chat_call` diberi parameter `think_mode` (saat ini tidak mengirimnya untuk DeepSeek).

### 5.6 Ketahanan untuk HP dan jaringan seluler (invarian 4 dan 6)

| Masalah | Rancangan |
|---|---|
| Browser HP mematikan `fetch` stream saat layar mati / tab di latar | Agent menyelesaikan giliran di threadnya sendiri dan **menulis `partial` narasi ke `game_turns` ±tiap 1 dtk**. Saat tab kembali aktif (`visibilitychange`) atau stream putus, klien memanggil **`play_turn_get(turn_id)`** dan polling tiap 1,5 dtk sampai `done`; tidak ada generasi ulang |
| Proxy/operator seluler menutup koneksi diam | `sseRoute` mengirim komentar **`: ping` tiap 15 dtk** (independen dari chunk agent). `Caddyfile.example` ditambah `flush_interval -1` pada `reverse_proxy` |
| Ketukan ganda / retry jaringan | `client_key` (UUID) per jawaban; agent mengembalikan giliran yang sudah ada |
| Dua permintaan bersamaan pada run yang sama | Kunci per-run (`threading.Lock`); permintaan kedua **menempel** ke giliran yang sedang berjalan |
| Gagal format 2× atau DeepSeek 429/5xx | Giliran `status='error'`, `retryable:true`; UI: **"Coba lagi giliran ini"** (direktif sama). Tidak ada kehilangan status |
| Streaming menghambat pemrosesan dokumen | **Semaphore per-backend** (`LLM_CONCURRENCY` untuk qwen/grok tetap; `LLM_CONCURRENCY_STREAM`, bawaan 1, untuk DeepSeek) |
| Permainan terbengkalai | Agent start + `backup_loop` menandai `active` > 6 jam tanpa aktivitas sebagai `abandoned` dan menghapus sesi gateway-nya |

---

## 6. Data

### 6.1 Dipertahankan

`subjects`, `documents`, `chunks`, `notes`, `quizzes`, `questions`, `attempts`, `answers` (kecuali baris `mode='game'`), `study_events`, `jobs`, `settings`, `chat_*`, `ask_sessions`, **`concepts`**, **`cards`** (+ SM-2).

### 6.2 Skema baru (migrasi v2)

```sql
CREATE TABLE schema_version(version INTEGER NOT NULL);

CREATE TABLE game_runs(            -- menggantikan tabel lama bernama sama
  id INTEGER PRIMARY KEY,
  game TEXT NOT NULL,              -- ajari|detektif|petualangan|kasus|kilat|boss
  scope_kind TEXT NOT NULL,        -- document|subject
  scope_id INTEGER NOT NULL,
  options TEXT,                    -- JSON: tema, jumlah_giliran, tingkat
  status TEXT NOT NULL DEFAULT 'active',   -- active|finished|abandoned
  gateway_session_id TEXT,
  state TEXT,                      -- JSON status permainan (HP, adegan, kombo…) — SUMBER KEBENARAN
  turn_count INTEGER NOT NULL DEFAULT 0, max_turns INTEGER NOT NULL DEFAULT 8,
  resumes INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
  summary TEXT,                    -- JSON hasil akhir
  started_at REAL NOT NULL, updated_at REAL NOT NULL, finished_at REAL);

CREATE TABLE game_turns(
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, client_key TEXT UNIQUE,
  status TEXT NOT NULL,            -- generating|awaiting|judging|done|error
  concept_ids TEXT,                -- JSON fokus
  kind TEXT,                       -- recall|explain|apply|boss
  directive TEXT,                  -- direktif terakhir (untuk retry/pemulihan)
  narration TEXT, partial TEXT,    -- final / sementara
  public TEXT, secret TEXT,        -- JSON; secret TIDAK PERNAH ke klien sebelum giliran selesai
  answer TEXT, judgement TEXT,     -- JSON; jawaban pengguna & penilaian
  hint_level INTEGER NOT NULL DEFAULT 0, flagged INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0, error TEXT,
  created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE INDEX idx_turns_run ON game_turns(run_id, idx);

CREATE TABLE mastery(concept_id INTEGER PRIMARY KEY REFERENCES concepts(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0, evidence_n INTEGER NOT NULL DEFAULT 0, kinds TEXT, last_at REAL);
CREATE TABLE evidence(id INTEGER PRIMARY KEY, concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  run_id INTEGER, turn_id INTEGER, kind TEXT NOT NULL, obs REAL NOT NULL, hint_level INTEGER NOT NULL DEFAULT 0, ts REAL NOT NULL);
CREATE TABLE quests(day TEXT NOT NULL, key TEXT NOT NULL, done_at REAL, PRIMARY KEY(day,key));

CREATE VIRTUAL TABLE chunks_fts USING fts5(label, text, content='chunks', content_rowid='id',
                                           tokenize='unicode61 remove_diacritics 2');
-- + trigger AFTER INSERT/UPDATE/DELETE pada chunks; backfill: INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')
```

`achievements` dipertahankan strukturnya (`key`, `unlocked_at`) tetapi **dikosongkan**; `player` dipertahankan dan **di-reset** (`xp=0`; kolom `coins`/`city_collected_at` tidak dipakai lagi).

### 6.3 Penghapusan data lama (D4, A2) — migrasi v2

Urutan dalam **satu transaksi**, **didahului backup `belajar-premigrate-v2.db`** dan **log jumlah baris yang dihapus**:

1. `DELETE FROM attempts WHERE mode='game'` (cascade ke `answers`).
2. `DROP TABLE` `city`, `stories`, `game_runs` (lama).
3. `DELETE FROM achievements`; `UPDATE player SET xp=0, coins=0, city_collected_at=NULL`.
4. `UPDATE concepts SET seen=0, hits=0`.
5. Buat tabel baru §6.2, isi `schema_version=2`.

`study_events` **tidak** disentuh. DB lama tanpa `schema_version` dianggap v1.

---

## 7. Kontrak

### 7.1 RPC dan SSE (semua masuk `ACTIONS`, kecuali dinyatakan lain)

| Action | Fungsi |
|---|---|
| `play_hub` | Mode, permainan aktif (untuk **Lanjutkan**), profil XP/level, kartu jatuh tempo, konsep lemah, misi, ringkasan penguasaan |
| `play_scope_info` | `{document_id|subject_id}` → jumlah konsep, kesiapan, penguasaan per topik |
| `play_turn` **(+ SSE `POST /api/play/turn`)** | `op: start | answer | hint | retry`. Mengembalikan stream `status/chunk/done/error` |
| `play_turn_get` | Ambil/pantau satu giliran (pemulihan setelah koneksi putus) |
| `play_get` | Status run + riwayat giliran (tanpa `secret` untuk giliran belum selesai) |
| `play_finish`, `play_abandon` | Menutup run (hitung hadiah / buang sesi) |
| `play_flag` | Tandai soal keliru → batalkan bukti |
| `play_history` | Riwayat permainan |
| `mastery_map` | Kisi penguasaan per mapel/materi/topik |
| `quests_get` | Misi harian |
| `concepts_list`, `concepts_expand` | Daftar istilah; job "Perbanyak istilah" |
| `cards_due`, `cards_review`, `cards_build`, `cards_stats`, `cards_export` | **Tetap**, dipindah ke `cards.py` |

**Dihapus dari `ACTIONS` (12):** `game_hub`, `game_start_quiz`, `game_answer`, `game_hint`, `game_concepts`, `game_concepts_expand`, `game_finish`, `game_story_generate`, `city_get`, `city_collect`, `city_build`, `city_upgrade`.

Event SSE:
```
data: {"type":"status","stage":"menyusun|merapikan|memulihkan_sesi"}
data: {"type":"chunk","chunk":"…"}
data: {"type":"done","data":{"turn_id":…,"status":"awaiting","narration":"…","public":{…},"judgement":{…}|null,"rewards":{…}|null,"run":{…}}}
data: {"type":"error","error":"…","retryable":true}
: ping
```

### 7.2 Aturan penilaian

| Jenis jawaban | Penilai |
|---|---|
| Pilihan (mcq/tf/aksi) | **Lokal**, deterministik |
| Isian singkat | `grade_short_local` → `True/False`; `None` (ambigu) → **AI** dalam panggilan yang sama |
| Ketukan kalimat (Detektif) | **Lokal**: `skor = clamp((TP − 0.5·FP) / jumlah_salah, 0, 1)` |
| Penjelasan bebas / alasan / koreksi | **AI** dengan rubrik; skor di-*clamp* [0,1]; agent menghitung `obs` |

### 7.3 Modul baru (gaya datar seperti repo)

| Berkas | Isi |
|---|---|
| `play.py` | Handler RPC, siklus hidup run, rute `play_*` |
| `play_engine.py` | Pelari giliran: bangun direktif, panggil `chat_call` stream, parse, koreksi, pemulihan sesi, simpan `partial` |
| `play_protocol.py` | Penanda, parser stream, validator (murni; diuji unit) |
| `play_director.py` | Pemilihan fokus, bahan sumber (FTS5/LIKE), pembaruan penguasaan |
| `play_prompts.py` | Preamble, persona per mode, templat direktif |
| `play_games.py` | Per mode: skema `public/secret`, penilai lokal, reducer `state` |
| `profile.py` | XP, level (`level_info` dipindah), lencana, misi |
| `cards.py` | `sm2`, `cards_*`, `_collect_cards`, ekspor Anki (dari `games.py`) |
| `concepts.py` | `ensure_concepts`, `_seed_all`, `_concept_rows`, `expand_concepts_job` (dari `games.py`) |

---

## 8. Frontend mobile-first (D5)

Tanpa build; modul baru mendaftar lewat `Belajar.addRoute`. Rute: `#/game` (hub) · `#/game/main/:runId` · `#/game/peta` · `#/kartu` (tetap). Tautan lama `#/game/<nama>?…` dialihkan ke `#/game`.

| Aspek | Aturan |
|---|---|
| **Target sentuh** | ≥ **44 px** (tombol `.btn` sekarang 42 px → 44 px di layar game); jarak antar-tombol ≥ 8 px |
| **Input** | `textarea` tumbuh otomatis, `font-size ≥ 16px` (mencegah zoom iOS), `enterkeyhint="send"`, `autocomplete="off"`; **Enter = baris baru** di HP, tombol **Kirim** eksplisit (Ctrl/Cmd+Enter di desktop) |
| **Keyboard layar** | Pakai pola chat yang ada: `visualViewport` + `safe-area-inset-bottom`; komposer **tetap terlihat** saat keyboard terbuka |
| **Tanpa interaksi sulit di HP** | Tidak ada drag-and-drop, hover, atau pintasan keyboard sebagai satu-satunya cara. Pilihan = tombol besar; Detektif = ketuk kalimat; `touch-action: manipulation` |
| **Stream** | `createSmoother` diekspos lewat `Belajar`; autoscroll hanya bila pengguna dekat dasar (`nearBottom`); area `aria-live="polite"`; hormati `prefers-reduced-motion` |
| **Putus-sambung** | Banner status agent yang ada; saat kembali aktif → `play_turn_get`; tombol **Coba lagi giliran ini** |
| **Layar menyala** | `navigator.wakeLock` selama giliran berjalan (peningkatan bertahap; abaikan bila tak didukung) |
| **Aksesibilitas** | Level penguasaan = warna **+ ikon + teks**; fokus keyboard terlihat; kontras mengikuti tema terang/gelap yang ada |
| **Berkas** | `server/public/play/{hub,run,peta,cards}.js`, `play/modes/{ajari,detektif,petualangan,kasus,kilat,boss}.js`, `play.css`; helper **`Belajar.sse(url, body, handlers)`** menggantikan duplikasi pembaca SSE (chat dan Panel Tanya **tidak diubah** pada v2.0) |

---

## 9. Penghapusan dan ekstraksi

### 9.1 Disposisi berkas

| Berkas | Nasib |
|---|---|
| `games.py` (791 baris) | **Hapus** setelah §9.2 selesai |
| `server/public/games/*.js` (9 berkas, 1616 baris), `games.css` (223) | **Hapus**; bagian Kartu dipindah (§9.2); audit kelas CSS umum (`.center`, `.actions.center`, dll.) yang masih dipakai `app.js` → pindah ke `style.css` |
| `handlers.py` | Ganti `import games` (baris 746) dengan `cards`, `concepts`, `play`; hapus cabang `mode=="game"` (baris 426) |
| `stats.py` baris 221 | Hapus cabang `t.mode='game'` pada `COALESCE` judul |
| `server/server.js` | Hapus 12 action (§7.1), tambah action baru + rute SSE `/api/play/turn`; heartbeat di `sseRoute` |
| `server/public/index.html` | Hapus tag `games/*.js` dan `games.css`; tambah `play/*` |
| `server/public/app.js` | Item nav "Game" tetap; ekspos `createSmoother` dan `sse` |
| `tests/smoke_games.py`, `seed_games.py`, `e2e_games.py`, `logic.test.js` (menguji `games/logic.js`), `demo_seed.py` bagian game | **Hapus/ubah** setelah ujinya dipindah (§11) |
| `README.md`, `API_USAGE*.md`, `CHANGELOG.md` | Tulis ulang bagian Game; entri `2.0.0` |

### 9.2 Ekstraksi **sebelum** menghapus `games.py` (jangan memutus Kartu/Anki)

`cards_*` bergantung pada helper di `games.py`; UI Kartu (`cardsView`, ±baris 369–465 `games/core.js`) memanggil `game_hub`.

| Dari | Ke | Catatan |
|---|---|---|
| `sm2`, `_card_counts`, `_collect_cards`, `cards_*` | `cards.py` | perilaku **identik**; uji SM-2 dan ekspor TSV dipindah |
| `ensure_concepts`, `_seed_all`, `_concept_rows`, `EXPAND_PROMPT`, `expand_concepts_job`, `game_concepts_expand` | `concepts.py` | `game_concepts_expand` → `concepts_expand` |
| `_clamp`, `_doc_ids`, `_source` | `common.py` | helper umum cakupan |
| `level_info`, `player`, `profile`, `_add_rewards` | `profile.py` | **tanpa koin**; `unlock_achievements` ditulis ulang untuk lencana baru |
| `cardsView` | `server/public/play/cards.js` | ganti `rpc('game_hub')` dengan `cards_stats`; rute `#/kartu` tetap |

---

## 10. Fase implementasi

> Estimasi: S ≤ 1 hari · M 2–4 hari · L ≈ 1 minggu. Tiap fase = satu PR di cabang `major/v2`, tag `v2.0.0-alphaN`, entri CHANGELOG.

### Fase 0 — Fondasi (tanpa fitur baru)

| # | Tugas | Ukuran |
|---|---|:-:|
| 0.1 | **Migrasi berversi** (`schema_version`, daftar `MIGRATIONS`, backup pra-migrasi otomatis) | M |
| 0.2 | **Satu jalur HTTP LLM**: `_post() → LLMResponse(text, session_id, meta)` dipakai `ask` dan `chat_call`; baca **`x_meta.mode_fallback`**, `account`, `response_time`; parameter **`think_mode`** untuk DeepSeek; ubah 4 pemanggil `chat_call` | M |
| 0.3 | **Semaphore per-backend** (`LLM_CONCURRENCY_STREAM`) | S |
| 0.4 | **`sseRoute(path, action, pick)`** + heartbeat `: ping`; deteksi klien terputus **tanpa** membatalkan agent; `flush_interval -1` di `Caddyfile.example` | S |
| 0.5 | **Tes paritas** `tests/parity_actions.py` (`HANDLERS` ↔ `ACTIONS`) | S |
| 0.6 | **Higiene repo (T1)**: `git rm -r --cached data/`; bila repo pernah publik/dibagikan → bersihkan riwayat dan rotasi kredensial | S |

**Selesai bila:** baseline 76/60/12 tetap hijau; `mode_fallback` terbaca dan teruji di `mock_paf`; `git ls-files data` kosong.

### Fase 1 — Ekstraksi dan penghapusan game lama

| # | Tugas | Ukuran |
|---|---|:-:|
| 1.1 | Buat `cards.py`, `concepts.py`, `profile.py`, pindahkan helper (§9.2); pindahkan UI Kartu ke `play/cards.js`; `#/kartu` tetap berfungsi | M |
| 1.2 | **Port uji** (SM-2, `cards_build`, `cards_export`, `concepts_expand`, migrasi DB lama) ke `tests/smoke_cards.py` **sebelum** menghapus apa pun | M |
| 1.3 | Hapus `games.py`, `games/*.js`, `games.css`, 12 action, uji game; audit CSS umum | M |
| 1.4 | **Migrasi v2 destruktif** (§6.3) + uji pada **salinan** DB lama di folder sementara | M |

**Selesai bila:** aplikasi berjalan **tanpa** game; Kartu, ekspor Anki, `concepts` utuh dan teruji; DB lama bermigrasi bersih; `grep -ri "game_\|city_\|coins" --include=*.py --include=*.js` hanya tersisa di CHANGELOG/dokumen.

### Fase 2 — Mesin game + satu irisan vertikal (**Ajari Aku**)

| # | Tugas | Ukuran |
|---|---|:-:|
| 2.1 | `play_protocol.py` (parser/validator) + **uji unit**: penanda terpotong antar-chunk, `full_text` ≠ gabungan delta, JSON rusak, penanda hilang, LaTeX di JSON | M |
| 2.2 | `play_director.py` (FTS5/LIKE, bobot fokus, penguasaan, `evidence`) | M |
| 2.3 | `play_engine.py` + `play.py` (run/turn, `client_key`, kunci per-run, `partial`, koreksi, pemulihan sesi, `play_turn_get`) | L |
| 2.4 | Mode **Ajari Aku** end-to-end + UI minimal | M |
| 2.5 | Perluas `mock_paf.py`: SSE bermarker, `x_meta.full_text`, `mode_fallback`, galat tengah-stream tanpa `[DONE]`, 429, penanda hilang | M |

**Gerbang go/no-go (ukur sebelum lanjut):** (a) ≥ **95%** giliran valid pada percobaan pertama di gateway nyata; (b) latensi chunk pertama P50/P95 tercatat; (c) pemulihan sesi berhasil; (d) bahan tidak dikarang (periksa manual 20 giliran). **Bila (a) < 90%**, sederhanakan protokol (skema lebih kecil/penanda per-baris) sebelum menambah mode.

### Fase 3 — Antarmuka, gamifikasi, dan peta penguasaan

| # | Tugas | Ukuran |
|---|---|:-:|
| 3.1 | `hub.js`, `run.js` (komposer mobile, tombol petunjuk, "Soal ini keliru", Coba lagi), `Belajar.sse`, ekspos `createSmoother` | L |
| 3.2 | XP, level, kombo, lencana, misi (`profile.py`, tabel `quests`) | M |
| 3.3 | `peta.js` (peta penguasaan) + bagian "Penguasaan" di halaman Progres | M |
| 3.4 | Pemilih cakupan **materi / mata pelajaran** + pemeriksaan kesiapan konsep | S |

### Fase 4 — Mode lain (urutan menurut risiko)

| # | Mode | Catatan teknis | Ukuran |
|---|---|---|:-:|
| 4.1 | **Kilat** | Batch 5 soal per panggilan, **prefetch batch berikutnya** saat pengguna menjawab; penilai lokal | M |
| 4.2 | **Detektif Salah Kaprah** | Penilai lokal ketukan + AI untuk koreksi; UI ketuk-kalimat | M |
| 4.3 | **Kasus Nyata** | Validasi bahwa skenario **tidak memuat istilah materi** (cek `_norm` terhadap daftar konsep) | M |
| 4.4 | **Petualangan** | `state` (HP, inventaris, adegan) dengan reducer daftar-putih; item → kartu SM-2; tema | L |
| 4.5 | **Ujian Boss** | Soal batch tanpa umpan balik; rapor akhir di-stream; hadiah lencana | M |

### Fase 5 — Pengerasan dan rilis

| # | Tugas |
|---|---|
| 5.1 | QA mobile: Playwright emulasi 390×844 dan 360×640, sentuh, keyboard layar terbuka, tab di latar → kembali |
| 5.2 | Uji beban kecil: 20 giliran beruntun, putus-sambung 5×, sesi hilang 3× |
| 5.3 | Dokumentasi: README (prasyarat `--enable-stream`), `API_USAGE_BELAJAR.md`, CHANGELOG `2.0.0`; `config.VERSION` = `2.0.0` |
| 5.4 | Tag `v2.0.0`; urutan deploy: **agent dulu, lalu server + frontend** |

---

## 11. Pengujian

| Lapisan | Uji |
|---|---|
| Unit murni | `play_protocol` (parser/validator), penilai lokal, rumus penguasaan/XP, `sm2` |
| Agent | `smoke_play.py`: siklus run, idempotensi `client_key`, kunci per-run, `secret` tidak bocor, pemulihan sesi, `flagged` membatalkan bukti, pemangkasan sesi, migrasi v2 dari DB lama |
| Kartu/Anki | `smoke_cards.py` (port dari `smoke_games`) |
| Paritas | `parity_actions.py` |
| UI | harness jsdom `play_ui_harness.js` (stream → ganti teks final → opsi → jawab); harness chat/Panel Tanya lama tetap hijau |
| E2E | `run_e2e.sh` + Playwright mobile (§10 Fase 5) |
| Gateway tiruan | Semua kegagalan §5.6 dapat disimulasikan di `mock_paf.py`; **uji tidak memakai token/kuota asli** |

Tidak ada fase digabung bila baseline merah.

## 12. Risiko

| Risiko | Mitigasi |
|---|---|
| Latensi DeepSeek (scraping web, bisa 5–20 dtk/giliran) merusak rasa "game" | `instant`; narasi di-stream; **prefetch** untuk mode tak-adaptif; skeleton + status; ukur P50/P95 di gerbang Fase 2 |
| AI melanggar format | Parser toleran + koreksi diam-diam 2× + gerbang ≥ 95% |
| AI mengarang fakta di luar materi | Bahan sumber berlabel + aturan "hanya dari BAHAN" + tombol **Soal ini keliru** (bukti dibatalkan) |
| Penilaian AI tidak konsisten | Rubrik numerik; `w` membatasi pengaruh satu giliran; kunci/skor tidak pernah di tangan AI |
| Prompt injection (materi/jawaban) | Penanda data + klausa anti-injeksi + `clamp` + daftar putih `state_delta` |
| Sesi gateway hilang/akun kena limit | Pemulihan §5.4; run tunggal; galat bisa diulang |
| Migrasi destruktif | Backup pra-migrasi, transaksi, log jumlah baris, uji pada salinan |
| Kuota akun (±8–12 panggilan/permainan) | `max_turns` dapat diatur; telemetri panggilan (usulan lanjutan) |

## 13. Keputusan yang masih dibutuhkan

1. **Daftar mode (A1):** setuju 6 mode + tangga petunjuk? Ada yang ingin dibuang atau ditukar sebelum Fase 4?
2. **Data lama (A2):** apakah tafsiran "data game saja dihapus; `concepts`/`cards` isi tetap; `study_events` tetap" benar? Bila ingin `cards` juga kosong, itu perubahan satu baris di §6.3.
3. **Koin/Kota (A3):** setuju dihapus total? (Jika ingin ekonomi koin untuk petunjuk, saya sarankan **tidak**, agar petunjuk tidak dikunci di balik koin.)
4. **Akun gateway:** berapa akun DeepSeek aktif? Satu akun = satu permainan aktif (A4); dua akun memungkinkan rotasi `deepseek(n)` (di luar scope v2.0, jadi backlog).
5. **Repo:** apakah repo pernah publik/dibagikan? (menentukan 0.6: sekadar `git rm --cached` atau pembersihan riwayat + rotasi kredensial)

**Di luar scope v2.0 (backlog):** rotasi akun `deepseek(n)`, fallback chat ke Qwen (T4), render rumus KaTeX, gambar dalam DOCX, Tanya-dokumen bersumber (RAG), multi-pengguna, PWA offline.
