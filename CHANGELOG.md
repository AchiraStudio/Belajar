# CHANGELOG — Belajar

Semua perubahan penting pada proyek **Belajar** didokumentasikan di sini.  
Format penulisan mengikuti pedoman [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) dan prinsip [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.1] — 2026-11-07

### Ringkasan Pembaruan
Pembaruan ini menghadirkan **canvas coding** untuk materi berisikan kode program, penyeragaman aturan baku kode dan rumus matematika, pembuatan catatan berbasis skema terstruktur (**Schema-Driven Note Generation**) dengan assembler spesifik per metode mencatat, penyediaan pustaka **KaTeX 0.19.1 self-hosted** untuk perenderan notasi matematika di frontend, serta perbaikan integrasi **OpenAI Tool Calling** pada gateway PAF-Model.

### Ditambahkan
- **Canvas coding** (`server/public/codecanvas.js`, tanpa pustaka luar): setiap blok kode ``` tampil sebagai kartu dengan label bahasa, nama berkas, jumlah baris, nomor baris, dan pewarnaan sintaks (Python, JavaScript, TypeScript, Java, C, C++, C#, Go, Rust, PHP, Ruby, Kotlin, Swift, SQL, Bash, HTML/XML, CSS, JSON, YAML). Tombol **Salin** (tanpa nomor baris), **Bungkus**, **Unduh** (nama berkas dari judul, atau `kode.<ekstensi>`), dan **Perbesar** (layar penuh, Esc menutup). Kode ≥ 26 baris terlipat otomatis ("Tampilkan semua"); tersalin dan terunduh tetap lengkap. Fence tanpa nama bahasa ditebak otomatis (ditandai "?"). Tema terang/gelap dan cetak (tombol disembunyikan, lipatan dibuka). Kode > 60.000 karakter ditampilkan tanpa pewarnaan agar tidak macet.
- **Pembuatan Catatan Berbasis Skema & Assembler Terstruktur (`pipeline.py`)**:
  - Skema OpenAI Function `NOTE_SECTION_TOOL` (`generate_note_section`) untuk ekstraksi bagian catatan terstruktur: `title`, `summary`, `points`, `code_blocks` (dengan field `type`: `implementation`, `pseudocode`, `example`, `output`, `config`), `math_formulas`, `tables`, dan `relations` (koneksi antar konsep).
  - Assembler `assemble_note_section(data: dict, style: str) -> str` merakit dictionary hasil inferensi AI menjadi Markdown baku dengan tata letak khusus per metode mencatat:
    * **Cornell**: 3 bagian hierarkis (`#### Pertanyaan Kunci`, `#### Catatan Inti`, `#### Ringkasan`).
    * **Charting**: tabel perbandingan di awal (atau konversi otomatis poin menjadi tabel 2 kolom `Aspek | Penjelasan`).
    * **Outline**: baris `**Gambaran umum:**` bold diikuti hierarki bullet bersarang (tingkat 2 bila mengandung tanda `:`).
    * **Worked**: blok kode pertama ditampilkan lebih dulu sebagai deskripsi tugas/soal, diikuti poin langkah bernomor urut `1. 2. 3.`.
    * **Sentence**: butir kalimat lengkap bernomor urut `1. 2. 3.`.
    * **Ringkas, Detail, Sederhana**: susunan butir bullet terstruktur rapi.
  - Alur `_notes_stage` kini menggunakan `ask_structured` dan `assemble_note_section` dengan fallback teks mentah yang aman.
- **Helper Inferensi Terstruktur `ask_structured` (`llm.py`)**: helper terpadu yang transparan bagi pemanggil; otomatis memakai native OpenAI tools (`ask_tool`) pada backend DeepSeek, dan fallback mulus ke JSON schema (`_fallback_tool_to_json`) pada backend Qwen/Grok atau bila worker menolak tools.
- **Pustaka KaTeX 0.19.1 Self-Hosted (`server/public/vendor/katex/`)**:
  - Berkas distribusi statis `katex.min.js`, `katex.min.css`, dan seluruh bundel huruf `fonts/` disediakan langsung di server lokal untuk perenderan rumus matematika tanpa ketergantungan CDN (sesuai CSP `script-src 'self'`).
  - Berkas atribusi lisensi MIT di `server/public/vendor/LICENSES.md`.
- **Deteksi isi khusus & pseudocode** (`detect.py`): tiap bagian materi dianalisis (heuristik, tanpa AI) apakah memuat kode (dan bahasanya) dan/atau matematika. Penambahan pola algoritma/pseudocode (`_PSEUDO_MARKERS`) untuk slide kuliah. Hanya bila terdeteksi, prompt catatan ditambah **`CODE_RULES`** (salin kode persis, satu blok = satu potongan utuh, nama bahasa/berkas di baris pembuka, jangan mengarang kode, penjelasan sebelum blok dan keluaran sesudahnya, kode tidak di tabel/daftar) dan/atau **`MATH_RULES`** (semua rumus dalam LaTeX `$...$`/`$$...$$`, tabel konversi Unicode → LaTeX, blok untuk persamaan penting, `aligned`/matriks/kasus, satuan dengan `\text{}`, variabel dijelaskan, daftar periksa kurung dan `$`). Materi prosa tidak mendapat aturan tambahan (hemat token).
- Aturan dasar kode di `FORMAT_RULES` (selalu ikut), instruksi LaTeX + blok kode pada prompt **pembacaan gambar/slide** (`VISION_PROMPT`), **penjelasan kuis**, dan **tanya-jawab catatan**. Gaya Worked Examples menangani materi pemrograman (tugas → kode → keluaran).
- **Perbaikan rumus otomatis** (`sanitize.fix_math_text`, bagian dari `clean_note`): Unicode di dalam `$...$` menjadi LaTeX (`x²`→`x^{2}`, `√(a+b)`→`\sqrt{a+b}`, `≤`, `π`, ...), kurung kurawal diseimbangkan, `x²`/`x^2` lepas di teks dibungkus, baris LaTeX tanpa pembatas dibungkus (`$$` blok bila murni rumus, `$...$` bila ada label/butir daftar), dan potongan sederhana (`\frac`, `\sqrt`, huruf Yunani) di kalimat campuran dibungkus. LaTeX bersarang dalam kalimat dibiarkan utuh. `lint_math` menandai sisa masalah. Idempoten.
- **`sanitize.normalize_fences`** (bagian dari `clean_note`): baris kosong di sekeliling blok kode, ``` yang menempel di akhir kalimat dipisah, pagar menjorok dilepas, `~~~` diseragamkan, pagar tak tertutup (keluaran terpotong) ditutup, nama bahasa kanonik (`py`→`python`, `c++`→`cpp`), `title="x.py"` → nama berkas.
- **Rangkaian Pengujian Baru**:
  - `tests/test_schema_notes.py`: 47 cek pengujian skema note section, assembler per gaya catatan, helper `ask_structured`, idempotensi `clean_note`, serta trigger Code Canvas dan KaTeX.
  - `tests/test_ask_tool.py`: diperluas menjadi 38 cek (+12 cek baru) untuk function calling, DeepSeek tools, dan retry/fallback.
  - `tests/smoke_codemath.py` (72 cek) dan `tests/code_canvas_check.js` (58 cek, termasuk XSS dan performa 6.000 baris).
  - Mock gateway di `tests/mock_paf.py` diperbarui dengan skema dan data realistis `NOTE_SECTION_MOCK`.

### Diperbaiki
- **Penolakan Tool Calling HTTP 422 Gateway (`llm.py`)**: parameter `tool_choice` dikirim sebagai string `"auto"` alih-alih dictionary objek, memperbaiki penolakan validasi skema dari gateway PAF-Model.
- **Error HTTP 500 Backend Qwen saat Mengirim Tools (`llm.py`)**: upstream gateway melempar `name 'QWEN_CONFIG' is not defined` ketika Qwen menerima `tools`; `ask_tool` kini mengkhususkan perutean langsung ke DeepSeek (`[("deepseek", "instant"), ("deepseek", None)]`).
- **Rumus Matematika Tampil Mentah dengan Tanda Dollar (`$F = ma$`, `$$...$$`)**: ketiadaan berkas statis `vendor/katex/katex.min.js` di server lokal menyebabkan kegagalan pemuatan KaTeX (HTTP 404) di browser, sehingga seluruh tampilan rumus jatuh ke fallback teks mentah `<code class="math-fallback">`. Penempatan berkas vendor KaTeX 0.19.1 menyelesaikan masalah ini secara menyeluruh untuk catatan baru maupun lama.
- **Isi kode rusak oleh pembersih teks** (backend dan frontend): komentar `# ...` di dalam blok kode berubah menjadi judul `###`; baris kosong ganda antar fungsi (gaya PEP8) dirapatkan; blok yang menjadi satu-satunya isi catatan dibuka pagarnya sehingga kode tampil sebagai teks biasa; catatan yang diawali dan diakhiri dua blok kode berbeda salah dianggap pembungkus tunggal. Sekarang hanya ```markdown/``` polos yang membungkus *seluruh* jawaban yang dibuka.
- Pemisah pagar kode kini berpatok awal baris, sehingga ```tiga backtick``` di tengah kalimat tidak lagi memotong teks dan menghilangkan spasi.
- Pagar `~~~` dan pagar yang belum ditutup (streaming) tidak lagi diperlakukan sebagai teks biasa.

### Catatan
- **Tidak ada tombol "Jalankan"**: CSP server (`script-src 'self'`) memblokir skrip inline, sehingga eksekusi kode di iframe tidak aman/tidak berfungsi. Canvas bersifat tampilan, salin, dan unduh.
- Catatan lama tidak diubah di database; kodenya otomatis tampil sebagai canvas saat dibuka, dan rumusnya langsung dirender KaTeX. Perapian format (rumus, pagar, struktur) berlaku untuk catatan yang dibuat ulang.
- `config.VERSION` = `2.3.1`.

---

## [2.3.0] — 2026-11-04

### Ringkasan Pembaruan
Fokus pada kualitas catatan: **mind map** untuk menghubungkan konsep utama dengan cabang pembahasan, **empat metode mencatat baru** pada kategori Detail (backend Grok), **rumus dan struktur catatan yang rapi** (rumus LaTeX kini dirender KaTeX), serta **huruf baca yang lebih lembut**.

### Ditambahkan
- **Mind map per materi** (`mindmap.py`, `server/public/mindmap.js`):
  - Tab baru **Mind map** di halaman materi. Dibuat atas permintaan (job latar belakang), tidak menambah waktu pemrosesan dokumen.
  - AI menyusun pohon (akar = tema utama, 4-8 cabang, kedalaman maksimal 3, maksimal 70 simpul) plus hingga 8 **hubungan lintas cabang** lewat `llm.ask_tool` (skema tool bertingkat + fallback JSON). Level model `reason` (Qwen thinking, fallback DeepSeek thinking); ubah `mindmap.MINDMAP_LEVEL` untuk memakai Grok.
  - `mindmap.normalize_tree` memvalidasi keluaran model: label dibersihkan, sibling kembar dan label kosong dibuang, kedalaman/jumlah dibatasi, relasi hanya lintas cabang dan tanpa duplikat. Pohon yang tidak layak (kurang dari 2 cabang) ditolak lalu dicoba ulang/fallback.
  - UI tanpa pustaka luar (SVG): tata letak dua sisi, geser/cubit/Ctrl+scroll zoom, lipat-buka cabang, garis hubungan putus-putus, panel detail (keterangan dengan rumus), tampilan **Daftar** sebagai alternatif aksesibel, unduh **SVG/PNG**, tema terang/gelap, dan tombol **Cari di catatan** yang melompat ke bagian catatan terkait.
  - Penanda **usang** bila catatan berubah sejak mind map dibuat.
  - Tabel `mindmaps` (**skema v3**, migrasi aditif tanpa backup pra-migrasi) dan action `mindmap_get`, `mindmap_generate`, `mindmap_delete` (total 52 action).
- **Empat metode catatan baru** pada kategori Detail, semuanya lewat **Grok** (`pipeline.DETAIL_STYLES`): `sentence` (Sentence Method), `charting` (Charting Method), `outline` (Outline Notes), `worked` (Worked Examples). Gaya `detail` lama tetap ada. Pemilih gaya dikelompokkan (Umum / Detail) pada dialog unggah, "Buat ulang catatan", dan Pengaturan.
- **Rumus KaTeX** (di-host sendiri di `server/public/vendor/katex`, KaTeX 0.19.1): mendukung `$...$`, `$$...$$`, `\(...\)`, `\[...\]`. Rumus diekstrak sebelum parsing Markdown sehingga aman di dalam tabel, daftar, dan blockquote. Mata uang ("Rp5 dan $10") dan `\$` tidak dianggap rumus. Bila KaTeX gagal dimuat, sumber LaTeX tampil apa adanya.
- **Aturan format bersama untuk semua gaya** (`pipeline.FORMAT_RULES`): struktur judul, daftar, tabel, dan konvensi rumus. Prompt kini memuat judul materi dan posisi bagian ("bagian ke-N dari M").
- **`sanitize.clean_note`** (dipakai khusus catatan): menyeragamkan delimiter rumus, memberi baris kosong di sekitar judul/tabel/blok rumus, memperbaiki `###Judul`, glif bullet, dan tabel (jumlah kolom disamakan, pipa dalam rumus aman).
- **Huruf baca Nunito** (lembut, terminal membulat) sebagai bawaan, dengan pilihan **Serif** (Literata) di panel "Tampilan baca".
- Pengujian baru: `tests/smoke_notes.py` (105 cek), `tests/markdown_math_check.js` (36), `tests/mindmap_ui_harness.js` (41).

### Diubah
- **Renderer Markdown** (`app.js`): daftar bernomor tidak lagi mengulang dari 1 bila ada baris kosong antar butir, mendukung `start`, baris lanjutan, daftar tugas, dan pergantian jenis daftar; tabel mendukung `:-:` (satu strip), perataan kolom, baris pendek/panjang, dan `\|`; judul tidak lagi memotong `#` di akhir ("Bahasa C#").
- **Tipografi catatan**: kontras isi sedikit diturunkan, hierarki judul lebih jelas (H3 bergaris samping), tabel bergaris zebra tanpa header `nowrap`, blok rumus berlatar lembut, cetak tetap hitam.
- Tab dokumen tidak lagi membungkus label di layar sempit.

### Diperbaiki
- **Rumus LaTeX rusak oleh pembersih escape literal** (`\theta`, `\tan`, `\nabla`, dan perintah lain berawalan `\n`/`\t`/`\r` berubah menjadi tab/baris baru). Di dalam `$...$`/`$$...$$`, `\n \t \r` kini hanya dianggap escape bila tidak diikuti huruf. Berlaku di backend (`sanitize.unescape_literals`) dan frontend (`detox`). Sisi frontend juga memperbaiki `\n\n` literal berurutan yang hanya terkonversi satu.

### Catatan
- Migrasi `v2 -> v3` hanya menambah tabel; database lama aman.
- Belum diubah (diusulkan): catatan hasil edit pengguna masih bisa tertimpa bila ada chunk gagal saat proses ulang tanpa `force`.

---

## [2.2.0] — 2026-11-03

### Ringkasan Pembaruan
Pembaruan ini memodernisasi arsitektur pemrosesan berkas dan penggunaan model AI: pengunggahan gambar dan berkas (`attachments` / model visi OCR) kini sepenuhnya dialihkan ke **DeepSeek** menyusul penonaktifan sementara lampiran pada backend Qwen di layer upstream PAF-Model gateway, sementara backend **Grok** dikhususkan secara selektif hanya untuk tugas-tugas penalaran yang **kompleks dan mendalam (*deep*)**, serta dieliminasi dari alur rutin/cepat.

### Ditambahkan
- **Perutean Khusus Lampiran & Visi (`llm.py`)**:
  - Profil `PLANS["vision"]`: `[("deepseek", "instant"), ("deepseek", None)]` untuk ekstraksi teks/OCR gambar dan pemrosesan lampiran cepat tanpa overhead pencarian web.
  - Profil `PLANS["vision_deep"]`: `[("grok", None), ("deepseek", "thinking")]` untuk analisis lampiran dokumen/gambar yang kompleks dan membutuhkan penalaran tingkat tinggi.
  - Helper `_resolve_plan(level, attachments)`: memetakan permintaan berlampiran ke DeepSeek (atau Grok untuk tugas mendalam) secara transparan dan menjamin Qwen tidak pernah menerima lampiran.
  - Dukungan pengiriman parameter `think_mode` (misal `"instant"`, `"thinking"`, `"auto"`) ke backend DeepSeek pada `_call_response`.
- **Proteksi & Guard Lampiran Qwen (`llm.py` & `tests/mock_paf.py`)**:
  - Guard lokal pada `llm._call_response`: menolak pemanggilan Qwen dengan `attachments` menggunakan `LLMError(status=400)` untuk mencegah kebocoran request tidak valid ke jaringan.
  - Guard emulasi gateway pada `tests/mock_paf.py`: menolak request `model="qwen"` ber-lampiran dengan HTTP 400 Bad Request ("Input gambar atau file untuk backend Qwen dinonaktifkan sementara karena kendala pada web Qwen upstream.").
- **Pengujian & Verifikasi**:
  - `tests/test_ask_tool.py`: +8 uji unit baru (bagian 5) memverifikasi routing attachment biasa ke DeepSeek, attachment `ask_tool` ke DeepSeek, attachment kompleks/deep ke Grok, absennya Grok dari plan `fast` dan `normal`, serta penolakan attachment pada Qwen.
  - `tests/smoke_agent.py`: +2 verifikasi baru memastikan seluruh pemrosesan gambar/slide/scan ditangani oleh DeepSeek dan Qwen tidak pernah menerima lampiran.

### Diubah
- **`llm.py` (Restriksi Penggunaan Model Grok)**:
  - Mengeliminasi Grok dari fallback tugas rutin/cepat pada `PLANS["fast"]` dan `PLANS["normal"]`, digantikan oleh `deepseek` (`"instant"` / `None`).
  - Mengukuhkan Grok sebagai model utama khusus tugas kompleks dan mendalam (`PLANS["deep"]` untuk penjelasan kuis sulit dan `PLANS["detail"]` untuk catatan materi detail).
- **`pipeline.py` & `extract.py`**:
  - `_vision_unit`: pemanggilan OCR/baca gambar dialihkan dari `level="normal"` ke `level="vision"` (DeepSeek).
  - Sinkronisasi komentar dan docstring ekstraksi visi dari Qwen ke DeepSeek.
- **`config.py`**:
  - Versi aplikasi dinaikkan menjadi `2.2.0`.

---

## [2.1.0] — 2026-11-02

### Ringkasan Pembaruan
Pembaruan ini mengadopsi arsitektur terpadu **Hybrid Tool Calling + Stream Protocol**: pemrosesan dokumen dan pembuatan kuis non-streaming (Qwen/Grok) kini menggunakan **OpenAI-compatible Function Calling (`tools`)** yang terstruktur rapi, sementara game edukasi interaktif (DeepSeek Stream) tetap mempertahankan kecepatan streaming real-time di HP dengan protokol data yang dirapikan, bertipe TypedDict, dan bebas dari *race condition*.

### Ditambahkan
- **Fondasi Tool Calling (`llm.py`)**:
  - Parameter `tools` dan `tool_choice` pada `_post_once` dan `LLMResponse.tool_calls`.
  - Helper `llm.ask_tool(prompt, tool_spec, ...)` dengan parser aman, mekanisme retry cerdas pada format argumen, serta graceful fallback ke `chat_json` bila gateway mengembalikan HTTP 400.
  - Skema tools OpenAI: `QUIZ_TOOL` di `pipeline.py`, `DOC_SUMMARY_TOOL` di `pipeline.py`, dan `EXPAND_CONCEPTS_TOOL` di `concepts.py`.
- **Protokol Game Bertipe (`play_protocol.py`)**:
  - Skema data `TypedDict`: `RubricScores`, `JudgementData`, `NextTurnData`, `StateDeltaData`, dan `GameDataResult`.
  - Regex penanda fleksibel `<<<GAME_DATA` dan pembersih pembungkus fences/LaTeX berulang (`_clean_json_fence`).
- **Rangkaian Uji**:
  - `tests/test_ask_tool.py`: 18 pemeriksaan unit untuk function calling, retry argumen rusak, HTTP 400 fallback, dan paritas fungsi bawaan.
  - Dukungan emulasi `tools` pada `tests/mock_paf.py`.

### Diubah
- **`pipeline.py` & `concepts.py`**:
  - Pembuatan kuis (`_quiz_stage`), ekstraksi ringkasan dokumen (`_extract_concepts`), dan perluasan istilah (`expand_concepts_job`) dimigrasikan dari regex parsing `chat_json` ke `llm.ask_tool`.
- **`play_engine.py`**:
  - Memperbaiki *race condition* giliran penutup (`job_answer` dan `job_report`): `_finish(run_id, "finished")` dipanggil dan ringkasan `summary` disimpan ke SQLite **sebelum** status giliran diubah menjadi `done`, mencegah `KeyError: 'xp'` pada pembacaan respons.
  - Memperbaiki pengisian batch (`_fill_batch`): item batch lanjutan disimpan lebih dulu sebelum giliran aktif dirilis.
  - Memperkuat pembacaan `payload()` saat `ended=True`.
- **`play_prompts.py`**:
  - Memperjelas direktif keluaran `<<<GAME_DATA` agar DeepSeek selalu menghasilkan satu baris JSON murni tanpa pembungkus blok markdown tambahan.

---

## [2.0.0] — 2026-11-01

### Ringkasan Pembaruan
Game lama berbasis soal/koin/kota diganti **game belajar interaktif yang dipandu AI** (6 mode) dengan model penguasaan konsep, di atas fondasi baru: migrasi skema berversi, satu jalur HTTP ke gateway, streaming SSE generik dengan heartbeat, dan sesi DeepSeek persisten yang bisa dipulihkan.

### Ditambahkan
- Mode Ajari Aku, Detektif Salah Kaprah, Petualangan, Kasus Nyata, Kilat, Ujian Boss; direktur pemilih konsep; hint 3 tingkat; "Soal ini keliru".
- Model penguasaan (`mastery`, `evidence`), peta penguasaan, 9 lencana, misi harian.
- `schema_version` + `MIGRATIONS` (v2) dengan backup otomatis `belajar-premigrate-v2.db`; FTS5 `chunks_fts` bila SQLite mendukung.
- `llm.LLMResponse`, `LLM_CONCURRENCY_STREAM`, telemetri latensi chunk pertama, probe stream di Tes koneksi AI.
- `sseRoute()` di server.js (chat, Panel Tanya, game) + komentar `: ping` tiap 15 dtk; `flush_interval -1` di Caddyfile.
- `Belajar.sse()` generik di frontend; `tests/parity_actions.py`, `smoke_play.py`, `smoke_cards.py`, `test_play_protocol.py`, `play_ui_harness.js`, `e2e_play.js`.

### Diubah
- `llm.py`: satu jalur `requests.post`; `mode_fallback` dibaca; semaphore per-backend.
- `games.py` dipecah menjadi `cards.py`, `concepts.py` (`concepts_expand`, menggantikan `game_concepts_expand`), `profile.py`.

### Dihapus
- Game lama (boss, dungeon, wave, arcade, memory, puzzle, escape), kota, koin, cerita, `games.py`, `games.css`, `server/public/games/`.

---

## [1.2.0] — 2026-10-25

### Ringkasan Pembaruan
Pembaruan ini menghadirkan **Panel Tanya pada catatan** (blok teks di halaman catatan → tombol **Tanya** → penjelasan singkat AI dengan streaming, bisa dilanjutkan bertanya) dan **gaya catatan baru "Sederhana"** (bahasa awam + analogi/contoh sehari-hari).

---

### Ditambahkan (Added)

#### 1. Panel Tanya pada Catatan (Seleksi Teks → Tanya AI)
- **Handler RPC `notes_ask` (`handlers.py` & `pipeline.py`)**:
  - Menerima `document_id`, `quote` (teks terseleksi), `question`, dan `ask_session_id` (opsional).
  - **Bersesi ala chat**: pertanyaan pertama (tanpa `ask_session_id`) menginjeksi seluruh isi materi (ringkasan + konsep kunci + catatan, maks 16.000 karakter, via `_build_context_data`) ke sesi gateway DeepSeek baru (mode NEW) sekaligus menjawab; semua pertanyaan berikutnya — termasuk seleksi teks baru — melanjutkan sesi yang sama (mode CONTINUE) tanpa injeksi ulang. Sesi chat per materi tidak tersentuh.
  - `ask_session_id` tak dikenal / sesi gateway bermasalah → otomatis injeksi ulang (NEW) sebagai pemulihan.
  - Aturan jawaban (`NOTES_ASK_RULES`): singkat ±200 kata, bahasa sehari-hari, satu analogi/contoh, anti-prompt-injection, output Markdown murni.
- **Handler `notes_ask_delete`**: membebaskan sesi gateway dan menghapus barisnya; dipanggil otomatis saat halaman materi ditinggalkan. Sesi panel yang tak terpakai >24 jam ikut dipangkas otomatis.
- **Tabel baru `ask_sessions`** (dibuat otomatis saat agent berjalan) menyimpan pemetaan sesi panel → sesi gateway.
- **Endpoint SSE `POST /api/notes/ask` (`server/server.js`)**:
  - Format identik dengan `/api/chat/send`: event `chunk` bertahap, ditutup `done` berisi jawaban final + `ask_session_id` + `mode`; fallback RPC biasa tetap tersedia dengan timeout 120 detik.
- **Frontend (`server/public/app.js` & `style.css`)**:
  - **Tombol "Tanya" mengambang** muncul saat pengguna menyeleksi teks pada catatan (hanya tab catatan, non-edit, dokumen siap).
  - **Panel jawaban** berbentuk kartu samping (desktop) / *bottom sheet* (mobile): kutipan, jawaban streaming dengan kursor berkedip, dan input "Lanjut tanya…" untuk follow-up. Sesi dipertahankan antar-seleksi selama halaman materi terbuka (indikator "membaca materi & menjawab…" hanya muncul pada injeksi pertama).
  - *Graceful fallback* ke RPC biasa bila SSE gagal (pola yang sama dengan chat).
- **Helper bersama hasil ekstraksi (`app.js`)**:
  - `createSmoother()`: *token smoother* kini satu fungsi bersama untuk chat AI dan panel Tanya (perilaku chat dijaga identik; regresi dicek harness).
  - `selectionButton()`: tombol popover seleksi teks generik; popover kutipan chat ikut direfactor memakainya.

#### 2. Gaya Catatan "Sederhana" (Bahasa Awam & Contoh Nyata)
- **`pipeline.py`**: gaya ke-4 `"sederhana"` pada `STYLES` + `STYLE_RULES` — bahasa sehari-hari, istilah teknis dijelaskan saat pertama muncul, setiap konsep abstrak wajib punya analogi/contoh nyata, definisi formal diterjemahkan ke bahasa sederhana.
- **`FINAL_PROMPT`**: definisi `key_concepts` kini diminta singkat dan mudah dipahami (menguntungkan game Arcade/Memory yang memakai istilah tersebut).
- **Frontend**: opsi "Sederhana" pada dropdown gaya di dialog unggah, rail halaman materi, dan pengaturan gaya bawaan di Progres. Materi lama tetap utuh sampai dibuat ulang dengan gaya ini.

---

### Pengujian & Verifikasi (Testing & Verification)
- **`tests/smoke_agent.py`**: +14 pemeriksaan (validasi, mode NEW dengan injeksi konteks, streaming, mode CONTINUE pada sesi yang sama, pemulihan sesi tak dikenal, `notes_ask_delete`, regenerasi gaya sederhana). **Status: 76/76 lulus (PASS).**
- **`tests/notes_ask_harness.js` (baru)**: harness UI jsdom untuk panel Tanya — seleksi → tombol → panel → jawaban → follow-up CONTINUE → tutup. **Status: 15/15 lulus (PASS).**
- **`tests/chat_ui_harness.js`**: regresi UI chat setelah ekstraksi token smoother. **Status: 22/22 lulus (PASS).**
- **`tests/smoke_games.py`** (60/60) dan **`tests/logic.test.js`** (12/12) tetap lulus tanpa perubahan.

---

## [1.1.0] — 2026-10-25

### Ringkasan Pembaruan
Pembaruan ini mengintegrasikan **Mode Streaming SSE** pada sesi chat AI (DeepSeek) sesuai pembaruan PAF-Model gateway, menghadirkan **tampilan pengetikan halus kata-per-kata ala ChatGPT (*Token Smoother*)**, memanfaatkan **Backend Grok** untuk pembuatan materi catatan detail, serta **peningkatan kualitas prompt catatan** agar lebih komprehensif, terstruktur, dan akurat.

---

### Ditambahkan (Added)

#### 1. Streaming Chat AI (DeepSeek & SSE Gateway)
- **Endpoint SSE `POST /api/chat/send` (`server/server.js`)**:
  - Menyediakan saluran Server-Sent Events (`text/event-stream; charset=utf-8`) berlatensi rendah untuk streaming respons AI langsung ke peramban pengguna.
  - Memancarkan event `data: {"type": "chunk", "chunk": "..."}` secara bertahap dan diakhiri dengan `data: {"type": "done", "data": {...}}`.
- **Dukungan Streaming pada Klien LLM (`llm.py`)**:
  - Parameter `stream=True` dan callback `on_chunk` pada fungsi `chat_call()`.
  - Parser Server-Sent Events kompatibel OpenAI yang memproses baris `data: {...}` dan penanda selesai `data: [DONE]`.
  - Ekstraksi teks paling akurat dari metadata `x_meta.full_text` pada chunk penutup sesuai protokol PAF-Model.
  - Penanganan session persisten melalui header `X-Session-ID` dan `x_meta.session_id`.
  - *Graceful Fallback*: Otomatis mengulang tanpa mode streaming jika worker mengembalikan HTTP `400` (misalnya saat worker gateway belum mengaktifkan flag `--enable-stream`).
- **Penerusan Streaming Asinkron Bridge (`agent.py` & `server/bridge.js`)**:
  - Implementasi antrean `asyncio.Queue` pada `agent.py` untuk menjamin pengiriman pesan dan chunk stream ke WebSocket bridge bersifat *thread-safe* tanpa tabrakan konkurensi.
  - `bridge.js` kini mengenali payload pesan bertipe `chunk` (`msg.type === 'chunk'`) dan otomatis memperpanjang masa berlaku timer timeout (*keep-alive*) selama generasi jawaban panjang berlangsung.

#### 2. Tampilan Streaming Halus Kata-per-Kata (*Smooth Token Smoother*)
- **Typewriter Token Smoother (`server/public/app.js`)**:
  - Antrean buffer adaptif yang menghaluskan tampilan streaming kata demi kata (*word-by-word*) dengan ticker interval ~25ms.
  - Menghilangkan jeda lompatan kasar (*stuttering*) akibat penerimaan teks dalam blok/batch besar dari web scraper gateway.
  - Akselerasi adaptif: mempercepat pengetikan bila buffer menumpuk (>40, >90, atau >180 karakter) dan mengosongkan sisa teks secara cepat ketika stream selesai.
- **Kursor Animasi Berkedip (`server/public/style.css`)**:
  - Menambahkan styling `.chat-cursor` dengan animasi kedip `chatCursorBlink` pada ujung kata yang sedang diketik selama proses streaming aktif, dan otomatis menghilang begitu jawaban tuntas.
- **Smart Auto-Scrolling**:
  - Mengikuti pergerakan kata baru ke bawah secara mulus hanya ketika pengguna berada di bagian bawah utas (`nearBottom()`), menjaga kenyamanan saat membaca pesan lama.

#### 3. Backend Grok untuk Catatan Detail & Pembaruan Prompt
- **Rencana AI Catatan Detail (`llm.py`)**:
  - Menambahkan rencana `"detail": [("grok", None), ("qwen", "thinking"), ("qwen", "auto")]` pada tabel `PLANS`, memanfaatkan model Grok v1.1 yang cepat, akurat, dan bebas noise DOM.
- **Rute Otomatis Gaya Detail (`pipeline.py`)**:
  - Fungsi `_notes_stage()` otomatis menetapkan `level="detail"` ketika parameter gaya dokumen adalah `detail`, sehingga proses ekstraksi materi langsung ditangani oleh model Grok.
- **Peningkatan Komprehensif Prompt Catatan (`pipeline.py`)**:
  - **Gaya DETAIL (`STYLE_RULES["detail"]`)**:
    - Mewajibkan pembedahan materi menjadi 5 elemen inti:
      1. *Konsep & Definisi Kunci* (definisi presisi dan batasan istilah).
      2. *Mekanisme & Penjelasan Lengkap* (alur sebab-akibat, cara kerja, dan tahapan logis tuntas).
      3. *Rumus, Notasi, atau Prosedur Teknis Eksak*.
      4. *Contoh Penerapan & Studi Kasus* dari materi asli.
      5. *Tabel Perbandingan atau Ringkasan Markdown* bila terdapat klasifikasi.
  - **Peningkatan Prompt Utama (`NOTE_PROMPT`)**:
    - Standarisasi struktur Markdown: sub-judul `###`, bullet point hierarkis, cetak **tebal** untuk kata kunci, serta notasi rumus/kode rapi.
    - Perlindungan *anti-prompt injection* pada teks materi ajar.
    - Larangan keras membungkus seluruh dokumen dalam blok kode (mis. ````markdown ````) atau menggunakan baris baru literal `\n`.
    - Eliminasi kalimat basa-basi di awal dan akhir catatan.
  - Penyempurnaan pedoman instruksional untuk gaya `ringkas` (8-12 poin esensial) dan gaya `cornell` (Pertanyaan Kunci, Catatan Inti, Ringkasan).

---

### Diubah (Changed)
- **`chat.py`**:
  - `send_message()` kini menerima parameter callback opsional `on_chunk` dan mengaktifkan `stream=True` secara bawaan.
  - Penyiapan konteks awal (`prepare_session`) tetap menggunakan mode non-stream karena berjalan di latar belakang (*background job*).
- **`handlers.py`**:
  - Handler RPC `chat_send` meneruskan parameter `_on_chunk` ke `chat.send_message()`.
- **`server/server.js`**:
  - Timeout RPC untuk aksi `chat_send` pada `/api/rpc/:action` ditingkatkan dari 25 detik ke 120 detik untuk mengantisipasi proses reasoning model DeepSeek.
- **Dokumentasi API (`API_USAGE.md` & `API_USAGE_BELAJAR.md`)**:
  - Menambahkan rincian spesifikasi untuk endpoint streaming `POST /api/chat/send` beserta format event SSE yang dikembalikan.

---

### Pengujian & Verifikasi (Testing & Verification)
- **`tests/mock_paf.py`**:
  - Ditambahkan dukungan emulasi streaming SSE OpenAI (`Content-Type: text/event-stream`, chunk delta, metadata `x_meta.full_text`, penanda `data: [DONE]`, dan pencatatan metrik `stream: true`).
- **`tests/smoke_agent.py`**:
  - Ditambahkan pengujian verifikasi streaming `chat_send` dengan callback `_on_chunk` (berhasil menerima chunk live).
  - Ditambahkan pengujian regenerasi materi gaya `detail` (berhasil memanggil backend `grok`).
  - **Status: 62/62 pemeriksaan lulus (PASS).**
- **`tests/chat_ui_harness.js`**:
  - Verifikasi antarmuka chat browser di lingkungan virtual jsdom.
  - **Status: 22/22 pemeriksaan lulus (PASS).**
- **`tests/smoke_games.py` & `tests/logic.test.js`**:
  - Pengujian logika game edukasi, kartu SM-2, dan kota belajar.
  - **Status: 60/60 pemeriksaan game & 12/12 pengujian logika lulus (PASS).**
