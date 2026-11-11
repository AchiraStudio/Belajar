# Belajar

Webapp belajar pribadi: unggah materi (PDF, DOCX, PPTX, gambar, TXT/MD), lalu AI membuat catatan dan kuis. Ada streak harian dan halaman progres. Data (database dan file) tinggal di PC lokal; VPS hanya menjadi pintu masuk.

## Cara kerjanya

```
Browser ──HTTPS──▶ VPS: server.js (login, API, frontend) + bridge WebSocket (/bridge)
                              ▲
                              │ WebSocket, dibuka OLEH PC lokal (tanpa public IP)
                              │
                   PC Windows: agent.py ── SQLite + folder file
                              │
                              └─ HTTP ─▶ PAF-Model (Qwen utama, Grok untuk penjelasan mendalam)
```

- Semua pemanggilan AI dilakukan **agent di PC lokal**, jadi API token PAF tidak pernah ada di VPS.
- Bila PC mati, halaman tetap terbuka tetapi menampilkan "PC lokal sedang offline". Begitu agent menyala, ia tersambung sendiri.
- Hanya satu agent yang boleh terhubung. Agent kedua akan memutus yang pertama, dan agent memberi peringatan jelas di log.

## Fitur

| Fitur | Keterangan |
|---|---|
| Catatan otomatis | PDF, DOCX, PPTX, gambar, TXT/MD. Halaman/slide berisi gambar atau hasil scan dibaca model visi. Gaya Umum: ringkas, Cornell, sederhana. Gaya Detail (model Grok): detail, Sentence Method, Charting Method, Outline Notes, Worked Examples. Rumus LaTeX dirender KaTeX dan kode tampil sebagai canvas coding (nomor baris, warna sintaks, salin/unduh/layar penuh). Bisa diedit, diunduh `.md`, dicetak, dan dibuat ulang. |
| Mind map | Konsep utama, cabang pembahasan, dan hubungan lintas cabang disusun AI dari catatan. Peta SVG yang bisa digeser/di-zoom, dilipat, ditampilkan sebagai daftar, dan diunduh SVG/PNG. |
| Chat AI per materi | Tanya-jawab interaktif menggunakan model DeepSeek. Mendukung mode **NEW** (merangkai seluruh konteks materi) dan **CONTINUE** (melanjutkan obrolan yang sudah ada). |
| Materi besar | Teks dipecah per bagian (±7000 karakter), tiap bagian satu request. Bagian yang gagal bisa diulang tanpa mengulang yang sudah berhasil. |
| Kuis | Pilihan ganda, benar/salah, isian singkat. Soal diambil merata dari seluruh materi, dengan sumber (slide/halaman) dan penjelasan. Mode **latihan** (umpan balik langsung) dan **ujian** (timer, jawaban tersimpan walau halaman dimuat ulang). Kuis gabungan per mata pelajaran. |
| Soal lemah | Soal yang jawaban terakhirnya salah masuk antrean "Ulangi soal lemah". |
| Penjelasan mendalam | Tombol "Jelaskan lebih dalam" memakai Grok (fallback Qwen berpikir). |
| Streak harian | Hari dihitung bila target menit tercapai **atau** satu kuis selesai. Cadangan streak (freeze) didapat tiap kelipatan 7 hari, maksimal 2, dipakai otomatis. Peta aktivitas 20 minggu. |
| Progres | Skor per kuis, penguasaan per topik (lemah/kuat), per materi, waktu belajar 14 hari, target mingguan. |
| Backup | Salinan database harian di `agent/data/backup/` (7 terakhir). |

### Pembagian model AI

| Tugas | Backend |
|---|---|
| Catatan, ringkasan, soal, baca gambar | Qwen `auto` |
| Penilaian isian singkat | Qwen `thinking` |
| Kuis mode "Teliti" | Qwen `thinking` |
| "Jelaskan lebih dalam" | Grok, lalu Qwen `thinking` bila Grok gagal |
| Chat AI per materi | DeepSeek (fallback Qwen `auto`) |

Bila satu backend terkena `429`/`504`, agent mencoba ulang dengan jeda, lalu pindah ke backend lain (matikan dengan `LLM_FALLBACK=0`).

## Game belajar (v2)

Menu **Game** adalah permainan belajar interaktif yang dipandu AI dari materimu sendiri. Dua peran dipisah tegas: **AI menulis** narasi dan tantangan (DeepSeek, sesi persisten, di-stream), sedangkan **agent menjadi wasit**: kunci jawaban disimpan di SQLite dan tidak pernah dikirim ke browser sebelum giliran dinilai, skor dihitung di agent, dan keluaran AI selalu dianggap data tak tepercaya (di-clamp dan divalidasi).

| Mode | Inti | Penilaian |
|---|---|---|
| **Ajari Aku** | Jelaskan konsep ke murid AI yang kritis (metode Feynman) | AI memberi rubrik 4 dimensi (0–3); agent menghitung skor dari rubrik |
| **Detektif Salah Kaprah** | Temukan 1–2 kalimat keliru dalam penjelasan yang meyakinkan | lokal (tebakan vs kunci), koreksi opsional dinilai AI |
| **Petualangan** | Cerita bercabang dengan 3 nyawa; item = kartu SM-2 | lokal; isian ambigu dinilai AI |
| **Kasus Nyata** | Skenario tanpa menyebut istilah materi | pilihan lokal + alasan opsional dinilai AI |
| **Kilat** | Soal cepat 5–20, batch 5 diprefetch | lokal; isian ambigu ke model cepat, lalu fuzzy lokal |
| **Ujian Boss** | Ujian lintas topik tanpa petunjuk dan tanpa umpan balik, ditutup rapor | lokal, rapor akhir oleh AI |

- **Penguasaan konsep** (`mastery`/`evidence` di SQLite): `skor_baru = skor_lama + w × (100·obs − skor_lama)` dengan `w` menurut jenis bukti (recall 0,25; jelas 0,35; terapan 0,35; boss 0,45) dan `obs` dipotong 15% per tingkat petunjuk. **Kuasai** butuh skor ≥ 75, ≥ 4 bukti, dan ≥ 2 jenis bukti. Konsep yang lemah otomatis menjadi kartu SM-2.
- **Direktur** memilih konsep fokus (kartu jatuh tempo ×3, lemah ×2, baru ×1,5, dikuasai ×0,3, penalti bila baru dipakai) dan menyiapkan bahan sumber dari materi (FTS5/BM25 bila SQLite mendukung, jika tidak LIKE).
- **Tangguh**: tiap giliran punya `client_key` idempoten (kirim ulang tidak menggandakan), teks parsial disimpan sehingga browser yang putus bisa menyambung ulang, generasi berjalan di thread terpisah, blok data yang rusak diperbaiki otomatis (maks 2 kali), dan sesi gateway yang hilang (`mode_fallback`) dipulihkan dari ringkasan status SQLite.
- **Gamifikasi**: XP, level, kombo, 9 lencana, misi harian (3/hari), dan peta penguasaan (`#/game/peta`). Tanpa koin. Satu permainan paling banyak 300 XP.
- **Petunjuk** 3 tingkat (arah, pertanyaan pemandu, separuh jawaban) mengurangi skor; tombol **Soal ini keliru** membuang bukti giliran itu.
- **Kartu belajar** (`#/kartu`): ulangan berjarak SM-2 dan ekspor TSV untuk Anki.
- Game membutuhkan stream DeepSeek: jalankan worker gateway dengan `--enable-stream`. Tombol **Tes koneksi AI** di Pengaturan ikut menguji stream.
- Upgrade dari v1: saat agent pertama kali berjalan, DB dicadangkan ke `data/backup/belajar-premigrate-v2.db`, lalu data game lama (kota, cerita, XP, koin, lencana, riwayat game) dihapus; materi, soal, kartu, dan statistik belajar tidak disentuh.

Struktur kode: `play_protocol.py` (protokol stream), `play_games.py` (skema dan penilai per mode), `play_prompts.py`, `play_director.py`, `play_engine.py` (giliran, pemulihan, hadiah), `play.py` (handler RPC), `profile.py` (XP, lencana, misi), `cards.py`, `concepts.py`; frontend di `server/public/play/` dengan gaya `play.css`. Aturan impor: `handlers` harus dimuat paling dulu.

- Gateway mengotomasi antarmuka web DeepSeek/Qwen/Grok. Itu bisa putus bila tampilan mereka berubah dan mungkin melanggar ketentuan layanan penyedia; cukup untuk pemakaian pribadi, tetapi jangan dijadikan satu-satunya andalan.

## Catatan desain (perilaku gateway PAF)

- Hanya pesan `user` terakhir yang dikirim, jadi tiap request memuat instruksi dan materi sekaligus.
- Pekerjaan dokumen (Qwen/Grok) tidak di-stream dan bisa lama, jadi berjalan sebagai **job** (progres disimpan di SQLite, browser polling), bukan request yang menggantung.
- Sesi gateway tidak kedaluwarsa otomatis, jadi agent memakai sesi baru per request lalu menghapusnya (`DELETE /v1/sessions/{id}`).
- DeepSeek di-stream (SSE) untuk chat, Panel Tanya, dan game; `x_meta.full_text` dipakai sebagai teks final dan `x_meta.mode_fallback` dideteksi.
- Tidak ada mode JSON: jawaban divalidasi, dan bila rusak agent meminta ulang dengan catatan perbaikan. Rumus LaTeX (`\frac`, `\beta`, dst.) dilindungi agar tidak terbaca sebagai karakter kontrol JSON.

## Pengujian

```bash
pip install -r requirements.txt && (cd server && npm install)
python tests/smoke_agent.py          # logika agent dengan gateway PAF tiruan
python tests/smoke_cards.py          # migrasi v2 dari DB lama sintetis, SM-2, kartu, istilah
python tests/test_play_protocol.py   # parser stream dan validasi keluaran AI
python tests/smoke_play.py           # mesin game: 6 mode, koreksi format, pemulihan sesi, idempoten, mastery
python tests/smoke_notes.py          # gaya catatan Detail (Grok), rumus & struktur, mind map
python tests/smoke_codemath.py       # deteksi kode/matematika, pagar kode, perbaikan rumus, aturan prompt
python tests/parity_actions.py       # handler agent = ACTIONS server.js, dan impor mandiri modul
NODE_PATH=/path/ke/node_modules node tests/markdown_math_check.js   # renderer Markdown + KaTeX (jsdom)
NODE_PATH=/path/ke/node_modules node tests/code_canvas_check.js     # canvas coding (jsdom)
NODE_PATH=/path/ke/node_modules node tests/mindmap_ui_harness.js    # UI mind map (jsdom)
NODE_PATH=/path/ke/node_modules node tests/play_ui_harness.js   # UI game (jsdom)
npm install jsdom                    # di folder mana saja, lalu atur NODE_PATH ke node_modules-nya
NODE_PATH=/path/ke/node_modules bash tests/run_e2e.sh   # server + bridge + agent + UI
```

`tests/mock_paf.py` meniru gateway sehingga uji tidak memakai token atau kuota asli.

## Klien React (`app/`) dan Android

Klien baru (React 19 + Vite + Tauri 2, desain Frost UI) ada di `app/`. Status layar dan kontrak yang dipakai: `docs/FRONTEND_REDESIGN_STATUS.md`.

```bash
cd app && npm install
npm run dev            # Vite di :5173, proxy /api ke server :8080
npm run typecheck && npm test && npm run build
# Sajikan klien baru lewat server Rust (default-nya masih server/public):
STATIC_DIR=app/dist cargo run -p belajar-server
```

Aplikasi Android (APK debug, memuat UI dari alamat server agar cookie sesi tetap satu origin): `npm run android:build`, lihat `docs/ANDROID.md`.

## Batasan saat ini

- Format `.doc` dan `.ppt` lama belum didukung (simpan ulang sebagai `.docx`/`.pptx`).
- Gambar di dalam DOCX tidak dibaca; PPTX hanya slide yang hampir tanpa teks.
- Rumus ditampilkan sebagai teks LaTeX, belum dirender.
- Satu pengguna dan satu agent.

## Rencana berikutnya

Tanya-jawab dengan dokumen (menyebut halaman/slide sumber). Flashcard SM-2 dan ekspor Anki tersedia lewat menu Game.
