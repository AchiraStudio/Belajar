# CHANGELOG

Semua perubahan penting pada proyek PAF-Model didokumentasikan di sini.  
Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — Sinkronisasi & Pembaruan Menyeluruh Selector UI / DOM (DeepSeek, Grok, Qwen)

> **Pembaruan Selector Live DOM (November 2026):**
> Pembaruan menyeluruh pada seluruh konfigurasi selector UI/DOM dan helper scraper untuk ketiga backend secara simultan berdasarkan analisis dan rekaman live capture terbaru pada direktori `NEEDUPDATE/`:
> 1. **DeepSeek**: Pembaruan container hash toolbar bawah dari `bf38813a` ke `div.ec4f5d61`, pembaruan send button aktif (`.ds-button--circle.ds-button--primary:not(.ds-button--disabled)`), input textarea (`textarea[name="search"]`, `textarea[placeholder="Message DeepSeek"]`, `div.ds-scroll-area`), toggles DeepThink/Search (`.ds-toggle-button.ds-toggle-button--m:nth-of-type(1/2)`), attach button, new chat, dan virtual list printable.
> 2. **Grok**: Integrasi golden anchor berkeandalan tinggi (skor 100) `button[data-testid="chat-submit"]`, TipTap ProseMirror input editor dengan `[aria-label="Ask Grok anything"]`, scroller percakapan `[data-testid="chat-transcript-scroller"]`, container utama `#grok-page-content`, input attachment `input[name="files"][type="file"]`, dan tombol hapus lampiran `button[aria-label="Remove this attachment"]`.
> 3. **Qwen**: Dukungan transparan terhadap domain aktif baru `https://chat.qwen.com` (di samping fallback `chat.qwen.ai`), textarea dengan placeholder `"How can I help you today?"`, send button `button[aria-label="Send"]:not([disabled])`, stop button `button[data-aes-exp="expInputStop"]`, container dropzone `#dropzone-container`, input direct file `#filesUpload`, think mode options, dan sinkronisasi form login password.

### 1. Perubahan
- **DeepSeek (`config/deepseek.py`, `scrapers/deepseek_scraper.py`, `scrapers/base_deepseek.py`)**:
  - `selectors["chat_input"]`: Menambahkan `'textarea[name="search"]'`, `'textarea[placeholder="Message DeepSeek"]'`, `'role=textbox[name="Message DeepSeek"]'`, `'div.ds-scroll-area'`, dan `'textarea.ds-scroll-area'` sebelum fallback lama.
  - `selectors["send_button"]`: Menyelaraskan container ke `div.ec4f5d61`, menambahkan selector aktif scoped dan generic (`div.ec4f5d61 div[role="button"].ds-button--circle.ds-button--primary:not(.ds-button--disabled)`).
  - `selectors["attach_button"]`: Menambahkan `div.ec4f5d61 > div > div[role="button"]`, `div.ds-button--iconLabelPrimary`, dan `input[type="file"]`.
  - `selectors["new_chat_button"]`: Menambahkan `div._5a8ac7a.a084f19e` dan `div.f8d1e4c0.the-header`.
  - `selectors["deep_think_toggle"]` & `selectors["web_search_toggle"]`: Memastikan urutan selector mendukung nth-of-type(1) untuk DeepThink dan nth-of-type(2) untuk Search.
  - `selectors["virtual_list_response"]`: Mendukung `div.ds-virtual-list.ds-virtual-list--printable`.
- **Grok (`config/grok.py`, `debug_dom_grok.py`, `scrapers/grok_scraper.py`, `scrapers/base_grok.py`)**:
  - `selectors["send_button"]`: Menempatkan `'button[data-testid="chat-submit"]'` sebagai prioritas utama (skor 100), diikuti `'button[type="submit"][aria-label*="Submit" i]'` dan `'button[aria-label="Submit"]'`.
  - `selectors["prompt_textarea"]`: Menambahkan `'div.tiptap.ProseMirror[contenteditable="true"]'`, `'[aria-label="Ask Grok anything"][contenteditable="true"]'`, `'div[role="combobox"][aria-label*="Ask Grok" i]'`, dan `'div[role="textbox"][aria-label*="Ask Grok" i]'`.
  - `selectors["file_input"]` & `selectors["attachment_preview"]`: Mendukung `'input[name="files"][type="file"]'` dan tombol chip `'button[aria-label="Remove this attachment"]'`.
  - `selectors["main_area"]` & `selectors["response_container"]`: Menambahkan `'[data-testid="chat-transcript-scroller"]'` dan `'#grok-page-content'`.
  - `debug_dom_grok.py`: Sinkronisasi `GROK_SELECTOR_REGISTRY` dan penambahan probe `attachment_preview`.
  - Scraper Grok: `_find_first` mendukung `state="attached"` untuk penanganan input file tersembunyi.
  - **Optimasi Latensi & Kecepatan Grok (2x - 3x faster)**:
    - *Skip-Goto Fast Path*: Melewati reload `page.goto` pada `mode == "continue"` jika browser sudah berada di URL percakapan aktif yang sama (`/c/<id>`), menghemat 2.5s – 4.5s per turn.
    - *Eliminasi Dead Sleep*: Menghapus penundaan mati 0.8s – 1.8s (`sleep(0.3) + sleep(0.5/1.5)`) pasca pengiriman prompt dan menggantinya dengan micro settle pause (100ms), karena baseline guard sudah memfilter teks lama secara aman.
    - *In-Browser JS Evaluation*: `_extract_current_text()` kini mengevaluasi seluruh cascade selector dalam 1 pemanggilan V8 JavaScript tunggal (`page.evaluate`) alih-alih ~15 roundtrip IPC sekuensial.
    - *Fast Positive Completion Detection*: `_is_generating()` mendeteksi kemunculan tombol aksi (`Copy`, `Share`, `Regenerate`) pada bubble terakhir, mengeliminasi penantian `stall_grace` (5 detik) saat web search / reasoning.
    - *Tuning Waktu & Auth Cache*: `between_actions` diturunkan ke 100ms, `stability_check` ke 300ms, dan `ensure_authenticated` memanfaatkan cache slot warm untuk langsung melanjutkan task.
- **Qwen (`config/qwen.py`, `scrapers/qwen_scraper.py`, `scrapers/base_qwen.py`, `public_qwen.py`, `browser_pool_qwen.py`)**:
  - Konfigurasi URL: `base_url`, `new_chat_url`, dan `login_url` diarahkan ke `https://chat.qwen.com`, dengan URL pattern matching yang mengenali domain `.com` maupun `.ai`.
  - `selectors["prompt_textarea"]`: Menambahkan `textarea.message-input-textarea[placeholder="How can I help you today?"]` dan `role=textbox[name="How can I help you today?"]`.
  - `selectors["send_button"]`: Menambahkan `button[aria-label="Send"]:not([disabled])`, `role=button[name="Send"]`, dan `button:has-text("Send")`.
  - `selectors["stop_button"]`: Menambahkan `button[data-aes-exp="expInputStop"]` dan `button.stop-button[aria-label="Stop"]`.
  - Mode & Attachment: Menambahkan `dropzone_container: '#dropzone-container'`, `file_input: '#filesUpload, input#filesUpload, input[type="file"]'`, `remove_attachment: 'button[aria-label="Remove file"]'`.
  - Think mode: Mendukung trigger `div.qwen-thinking-selector` dan opsi dropdown semantik berbasis teks (`span:has-text(...)` dan `div[role="menuitem"]:has-text(...)`).
  - Scraper Qwen: Mendukung input file langsung `#filesUpload` di samping clipboard paste.

### 2. Verifikasi & Pengujian
- Unit & E2E Tests:
  - `tests/test_vps_smoke.py`: PASSED
  - `tests/test_protocol_scrapers.py`: ALL 51 CHECKS PASSED
  - `tests/test_stream_scrapers.py`: ALL 44 CHECKS PASSED
  - `tests/test_debug_dom_grok.py`: ALL 35 CHECKS PASSED
  - `tests/test_grok_tools_e2e.py`: ALL CHECKS PASSED
  - `tests/test_tool_protocol.py`: ALL 57 CHECKS PASSED
  - `tests/test_extraction_noise.py`: ALL 34 CHECKS PASSED
  - `tests/test_qwen_guest_protector.py`: ALL CHECKS PASSED (kedua domain `.com` dan `.ai`)
  - `tests/test_qwen_think_mode.py`: ALL CHECKS PASSED
  - `tests/test_ip_manager.py`: ALL 13 CHECKS PASSED
  - `tests/test_backend_security_update.py`: ALL 11 CHECKS PASSED
  - `tests/test_admin_panel.py`: ALL CHECKS PASSED

---

## [Unreleased] — Major Update: Guard Attachment Qwen, IP Auto-Block Engine, Hapus Sesi Admin & Full Antislop SVG Icon Redesign

> **Pembaruan Sistem & Keamanan:**
> 1. **Guard Attachment Qwen**: Penonaktifan sementara pengunggahan file/gambar pada backend Qwen di layer gateway (`vps_server.py`), worker (`public_qwen.py`), dan UI Studio (`fixie.html`) karena kendala pada situs Qwen upstream.
> 2. **Auto-Block IP Mencurigakan**: Deteksi otomatis bot scanner terhadap path URL berbahaya (`SUSPICIOUS_PATH_PATTERNS`: `wp-`, `.env`, `.git`, `phpmyadmin`, `xmlrpc`, `actuator`, `.aws`, dll.) serta brute-force error (10x berturut-turut) pada `IPTracker` dan `ApiTokenMiddleware`. IP private/loopback kebal dari auto-block.
> 3. **Redesign UI/UX Admin Studio & IPs (Standar Penuh Antislop)**:
>    - Eliminasi 100% karakter emoji dari seluruh antarmuka dan penggantian dengan 42 inline SVG icons (16×16 / 14×14 px, `currentColor`, stroke 1.5).
>    - Backend badge solid warna berhuruf singkatan 2 karakter (`DS` blue, `QW` slate, `GK` emerald) tanpa emoji.
>    - Hirarki visual flat dengan batas 1px bersih, radius terstandar (8px panel, 6px button, 4px tag, max 12px status pill), dan elevasi bayangan hanya pada modal dialog dan toast notification.
>    - Status indikator real-time berbasis state murni (CSS spinner untuk sesi `Running`, tag teks semantik untuk `Waiting`, `Deleted`, `Idle`).
>    - Tab IPs informatif dengan 5 metric cards (`Tracked`, `Auto-Blocked` merah tegas, `Manual Blocked`, `Active 1h`, `Private`), filter status, kode negara teks kapital 2-letter (`ID`, `US`), dan tabel detail status badge SVG (`AUTO-BLOCKED` / `BLOCKED` / `Active`).
> 4. **Hapus Sesi via Panel Admin**: Penambahan endpoint `DELETE /fixie/api/sessions/{session_id}` dan tombol aksi hapus pada header dan daftar sesi dengan modal dialog konfirmasi.

### 1. Perubahan
- **Backend & Gateway (`vps_server.py`, `public_qwen.py`)**:
  - `_chat_impl` dan `StudioBridge.validate` menolak request ber-attachment dengan model Qwen menggunakan `HTTP 400 Bad Request` ("Input gambar atau file untuk backend Qwen dinonaktifkan sementara karena kendala pada web Qwen upstream.").
  - `LocalWorker._handle_task` dan `TaskProcessor.process` di `public_qwen.py` menolak payload dengan attachment sebelum mengeksekusi browser scraper.
  - Penambahan exception handler 404 pada FastAPI untuk meneruskan akses URL tidak dikenal ke `IPTracker.check_and_auto_block`.
  - Integrasi `_admin_audit` pada middleware gateway untuk mencatat aksi `ip.auto_block`.
- **IP Auto-Block Engine (`admin_store.py`)**:
  - `IPTracker` diperkaya dengan `SUSPICIOUS_PATH_PATTERNS`, `_is_private_or_loopback(ip)` immunity check, serta metode `check_and_auto_block(ip, path, is_error, status_code)`.
  - Memblokir otomatis secara instan jika IP mengakses path probe mencurigakan atau mengumpulkan 10 error berturut-turut tanpa token valid.
  - `IPTracker.stats()` dan endpoint `/fixie/api/ips` kini mengekspos `auto_blocked_count` dan flag `auto_blocked` per IP.
- **Hapus Sesi Admin Panel (`admin_panel.py`)**:
  - Endpoint baru `DELETE /fixie/api/sessions/{session_id}` di balik autentikasi `require_admin` dan header `X-Fixie: 1`.
  - Menyiarkan penghapusan ke workers via `worker_mgr.delete_session(session_id)`, menandai deleted di `store.mark_deleted(session_id)`, dan mencatat ke audit trail (`session.delete`).
- **Frontend UI/UX (`fixie.html`)**:
  - Standar Antislop: 0 emoji di seluruh kode antarmuka. 42 SVG icon symbols beresolusi tajam digunakan untuk seluruh aksi navigasi, header, status, tool, dan dialog.
  - Guard UI Qwen: input file `#oFiles` otomatis disabled dan menampilkan badge peringatan SVG saat model Qwen aktif; file terlampir otomatis dibersihkan saat beralih ke Qwen.
  - Tata letak sesi rapi: segmented tabs filter status dengan counter badge, kartu sesi dengan badge backend teks 2-huruf solid (`DS`, `QW`, `GK`), ID yang dapat disalin dengan feedback ikon centang SVG, relative time helper, dan status badge.
  - Tab IPs informatif: 5 kartu metrik dengan highlight khusus `Auto-Blocked`, filter status, kolom lokasi teks kapital, ISP/ASN, trafik dengan badge error, last path pill, status badge SVG shield/lock, dan alasan blokir.
  - UI Hapus Sesi: Tombol `.del-sess-btn` pada header sesi dan aksi hapus pada kartu sesi dengan modal konfirmasi dan toast feedback.

### 2. Verifikasi & Pengujian
- Unit test baru `tests/test_backend_security_update.py` (11 checks): verifikasi penolakan attachment Qwen di gateway & worker, kebalnya IP private dari auto-block, auto-block path scanner, auto-block brute-force, dan endpoint delete session.
- End-to-end browser test baru `tests/test_fixie_frontend_features.py`: verifikasi guard Qwen di DOM, filter tab sesi, kartu metrik IPs, alur modal konfirmasi penghapusan sesi, dan update composer state.
- Seluruh rangkaian test suite (`pytest tests/`) lulus 100% (49 passed).

---

## [Unreleased] — Major Update Admin Panel `/fixie`: Redesign UI/UX Responsive Studio (Desktop & Mobile), 10 Example Tests, IP Lookup Rinci & Block/Unblock

> **Pembaruan Besar Panel Admin `/fixie`:**
> 1. Desain ulang menyeluruh UI/UX panel admin menjadi tampilan AI Studio yang modern, rapih, dan responsif baik pada Desktop maupun Mobile (drawer toggle, compact tab bar, touch-friendly, dark/light theme switch).
> 2. Penambahan 10 skenario tes langsung (Example Tests) di Studio yang dapat dijalankan atau dimuat ke form hanya dengan satu klik (Basic Chat, Math Reasoning DeepThink, Web Search, Code Generation, Tool Calling `get_weather`, Multi-step auto mock, Qwen image task, System prompt persona, Grok chat, dan DeepSeek streaming).
> 3. Pelacakan IP address yang mengakses API (`admin_store.IPTracker`), lookup informasi GeoIP rinci (negara + bendera emoji, kota, wilayah, ISP, organisasi, AS number, status private/loopback) via `ip_lookup.py` dengan LRU cache memori dan disk, serta kemampuan block dan unblock IP secara langsung dari panel dengan proteksi 403 Forbidden di level middleware gateway.

### 1. Perubahan
- **UI/UX Modern & Responsif (`fixie.html`)**:
  - Tampilan studio panel modern dengan hierarki visual terstruktur, kartu-kartu metrik bersih, dan bubble percakapan chat role-colored.
  - Dukungan responsif penuh: di desktop (>900px) menggunakan 2-kolom side-by-side, di mobile (<900px) daftar sesi dan composer bertransisi dengan tombol "← Back to List", layout touch-friendly, dan input form yang otomatis menyesuaikan lebar layar.
  - Tombol manual toggle Dark/Light mode (☾ / ☀) di header bar dengan penyimpanan status persisten di `localStorage`.
- **10 Example Tests di Studio (`/fixie/api/studio/examples`)**:
  - Baris kartu interaktif contoh tes langsung di atas composer Studio.
  - Memuat otomatis konfigurasi backend/model, pesan user, system prompt, skema tools JSON, think mode, task type, streaming, dan auto-tools mock ke form input.
- **Pelacakan & Lookup IP (`ip_lookup.py`, `admin_store.IPTracker`)**:
  - `ip_lookup.py`: GeoIP helper berbasis API `ip-api.com` (tanpa API key) dengan in-memory LRU cache (TTL 1 jam, maks 1000 entri) dan disk cache `.admin_ip_cache.json`. Deteksi otomatis IP private/loopback/link-local tanpa memanggil jaringan.
  - `admin_store.IPTracker`: Mencatat statistik per IP (jumlah request, error count, first seen, last seen, endpoint paths yang dikunjungi, status block) dan disimpan ke `.admin_ips.json` (`PAF_ADMIN_IPS`).
  - Tab baru **"IPs"** di panel admin: ringkasan statistik (Total Tracked, Blocked, Active 1h, Private), filter pencarian IP/negara, tabel IP lengkap dengan bendera negara, detail GeoIP, dan tombol aksi Block/Unblock.
- **Enforcement Block IP (`vps_server.py`)**:
  - `ApiTokenMiddleware` memeriksa `_ip_tracker.is_blocked(client_ip)` sebelum verifikasi autentikasi token. IP yang diblokir langsung ditolak dengan `403 {"detail": "Your IP has been blocked."}`.
  - Permintaan yang diblokir tercatat di log audit (`admin_audit`).

### 2. Catatan Keamanan
- Blokir IP dieksekusi secara instan di layer terluar gateway (`ApiTokenMiddleware`) sehingga IP yang diblokir tidak dapat membebani worker atau membocorkan informasi status token.
- Aksi `ip.block` dan `ip.unblock` diaudit ke `.admin_audit.jsonl`.
- Private IP (127.0.0.1, 10.x, 192.168.x, 172.16-31.x, ::1) ditandai dengan ikon gembok khusus dan tidak pernah dibocorkan ke server GeoIP eksternal.

### 3. Verifikasi
- Pengujian otomatis pada `tests/test_ip_manager.py`: private IP detection, GeoIP resolution, cache LRU, IPTracker persistence, endpoint `/fixie/api/ips`, `/fixie/api/ips/{ip}/block`, `/fixie/api/ips/{ip}/unblock`, `/fixie/api/studio/examples`, dan enforcement 403 Forbidden pada `ApiTokenMiddleware`.

---

## [Unreleased] — Admin Panel `/fixie`: Studio (inspeksi request, sesi baru, tool calling, streaming, file)

> Tab Sessions kini berfungsi sebagai studio uji. Sebelumnya panel hanya mencatat teks user terakhir dan hanya bisa mengirim teks ke sesi yang sudah ada; system prompt, `tools`, dan parameter lain tidak terlihat, sesi baru tidak bisa dibuat, dan hasil tool tidak bisa dikirim.

### 1. Perubahan
- **Inspeksi lengkap per giliran** (`admin_store.py`, `vps_server.py`): setiap request dicatat dengan *snapshot* `system_prompt`, `tools`, `tool_choice`, `think_mode`, `deep_think`, `web_search`, `task_type`, `max_tokens`, `temperature`, `stream`, jumlah pesan, dan metadata file (nama/tipe/ukuran; **base64 tidak pernah disimpan**), plus hasil tool yang dikirim (`tool_results`) dan asal giliran (`origin`: `api` atau `studio`). Bagian *Request details* di UI bisa dibuka per giliran. Field besar dipotong (200k karakter). Sesi mengingat konfigurasi terakhir (`config`) untuk mengisi form otomatis.
- **Sesi baru dari panel**: `POST /fixie/api/sessions` (pilih backend atau `backend(akun)`, system prompt, tools, parameter, file, stream, pesan pertama). Validasi dilakukan sebelum sesi dibuat (model salah, akun tidak terhubung, tidak ada worker, stream tidak didukung, tools tidak valid → 4xx langsung, tidak ada sesi yatim).
- **Kirim giliran berikutnya** (`POST /fixie/api/sessions/{id}/send`) menerima `system_prompt`, `tools`, parameter, file, `stream`, dan `tool_results`. Field yang tidak dikirim memakai konfigurasi tersimpan sesi; field yang dikirim (juga kosong) menggantinya hanya untuk giliran itu dan menjadi nilai tersimpan berikutnya.
- **Tool calling**: `tool_calls` dari model ditampilkan per panggilan dan muncul kotak hasil tool manual. Giliran berikutnya mengirim `tools` ulang (aturan protokol) plus `tool_messages`; id panggilan divalidasi. **Auto-run dengan mock** (opsional): per fungsi `fixed` atau `template` (`{{arg}}`, `{{args}}`), fallback `*`, maksimal 10 ronde; berhenti dan menunggu hasil manual jika ada fungsi tanpa mock.
- **Streaming** (DeepSeek, butuh worker `--enable-stream`, tidak bersama `tools`, sama seperti API publik): teks parsial tampil langsung selama giliran berjalan (`AdminStore.progress`).
- **Upload file**: maksimal 10 file dan 20 MB total, base64 divalidasi, nama file dibersihkan dari path.
- **Redo**: *Resend here* (isi form dari giliran lama) dan *Redo in new session* (sesi baru dengan pesan dan opsi yang sama; file harus dilampirkan ulang).
- **Refactor**: isi `chat_completions` dipindah ke `_chat_impl` (perilaku endpoint publik tidak berubah) agar Studio bisa memulai sesi dengan id yang dipilih di muka; `StudioBridge` menggantikan `_admin_run_chat`. UI hanya membangun ulang giliran yang berubah, sehingga bagian yang sedang dibuka tidak menutup sendiri saat polling.

### 2. Catatan keamanan
- Tetap di balik password admin; audit log mencatat `session.create`/`session.send` hanya dengan ringkasan (id, model, jumlah karakter/tools/file), tanpa isi system prompt, pesan, atau hasil tool.
- Log interaksi (`.admin_log.jsonl`) kini memuat system prompt dan definisi tools, yang bisa sensitif. File sudah ada di `.gitignore`; `PAF_ADMIN_LOG=off` mematikan penyimpanan.

### 3. Verifikasi
- Baru: `tests/test_admin_studio.py` (snapshot request, pewarisan/override konfigurasi, sesi baru + akun, tool manual, auto-run mock, streaming parsial, file, validasi, audit, persistensi) dan `tests/test_admin_studio_ui.py` (Chromium: buat sesi, tool call → kotak hasil, request details, Redo, validasi JSON, tanpa error JS; di-skip bila Playwright tidak ada). `test_admin_panel.py`, `test_stream_e2e.py`, `test_grok_tools_e2e.py`, `test_vps_smoke.py`, `test_tool_protocol.py` tetap lolos.
- Tidak terkait perubahan ini: `test_http_e2e.py` dan `test_delete_session_e2e.py` gagal juga di `HEAD` karena tidak mengirim API token (gateway kini mewajibkannya).
- Belum diuji terhadap worker dan akun sungguhan (hanya worker WebSocket tiruan).

---

## [Unreleased] — Admin Panel `/fixie`: tab API, Workers (read-only), Audit

> Panel admin diperluas: manajemen API token + statistik pemakaian, status/kesehatan worker (hanya baca, termasuk deteksi masalah), dan audit log aksi admin.

### 1. Perubahan
- **Tab API**: kartu ringkasan (request/sukses/error/latensi 24 jam), grafik per jam, tabel per backend, **error digest** (dikelompokkan, bisa dibuka ke sesinya), daftar **masalah** yang terdeteksi otomatis, request API yang **ditolak** (token salah/kosong/kedaluwarsa), dan contoh curl.
- **Manajemen token** (`GatewayAdmin` di `vps_server.py`, memakai `paf_auth` seperti perintah konsol): buat (dengan expiry), rotate, ubah expiry, revoke; efek langsung. Token baru ditampilkan sekali; **reveal** memerlukan password admin lagi (dibatasi lockout yang sama dengan login). Token env/CLI hanya-baca. Rotate dengan expiry salah tidak menghapus token lama. Pemakaian per token (request, error, token terpakai, terakhir dipakai) dihitung dari log interaksi.
- **Pengaturan runtime**: `request_timeout` (30–3600 dtk) dan `worker_wait_timeout` (1–600 dtk), berlaku langsung, kembali ke nilai awal saat restart.
- **Tab Workers (hanya baca)**: status per worker (uptime, ping terakhir, beban, tugas ok/gagal, latensi rata-rata, akun, error terakhir) dan feed event (connect, disconnect, tugas gagal, timeout, koneksi ditolak karena `PAF_TOKEN` salah). `WorkerEntry`/`WorkerManager` kini mencatat hostname, hasil tiap tugas, dan ring buffer event; tidak mengubah routing.
- **Deteksi masalah**: tidak ada ping >90 dtk, tugas macet melebihi timeout, ≥30% tugas terakhir gagal, worker terputus saat ada tugas berjalan, reconnect berulang, tidak ada akun, `in_flight` tidak wajar, backend gagal tanpa worker, tidak ada worker sama sekali, tidak ada token API yang valid / token hampir kedaluwarsa, request yang tidak pernah selesai, lonjakan request ditolak. Hasilnya muncul sebagai pil di header panel.
- **Tab Audit**: login (termasuk gagal), create/rotate/expiry/revoke/reveal token, perubahan setelan, pesan terkirim (hanya panjangnya). Tanpa token atau isi pesan. File `.admin_audit.jsonl` (`PAF_ADMIN_AUDIT=off` untuk mematikan).
- UI `fixie.html` diganti dengan versi bertab; middleware mencatat request yang ditolak (`AUTH_REJECTS`).

### 2. Temuan (tidak diubah)
- Jika worker terputus saat ada tugas berjalan, request klien tetap menunggu sampai `PAF_REQUEST_TIMEOUT` (future tidak langsung digagalkan). Kini terlihat sebagai event `disconnected_busy` + `task_timeout`.

### 3. Verifikasi
- `tests/test_admin_panel.py` diperluas: token (buat/duplikat/nama salah/expiry salah/reveal/rotate/revoke), pengaturan, overview, worker + event, worker mati saat tugas berjalan + timeout, audit tanpa rahasia. Uji UI headless (Chromium): semua tab tampil, alur reveal lewat modal berfungsi, tanpa error JavaScript.

---

## [Unreleased] — Admin Panel `/fixie` (sesi aktif, riwayat input/output/error, kirim pesan langsung)

> **Panel admin di `http://<ip>:9000/fixie`** untuk memantau semua sesi yang lewat gateway VPS dan mengirim pesan langsung ke sesi terpilih. Sebelumnya gateway tidak menyimpan riwayat apa pun (hanya peta afinitas `session_id → worker_id` di memori), sehingga input, output, dan error per sesi tidak bisa dilihat.

### 1. Perubahan
- **`PublicForward/ForVPS/admin_store.py` (baru)**: log interaksi per sesi (input, output, `tool_calls`, error + status HTTP, latensi, akun, mode). Di memori dengan batas (500 sesi × 300 giliran, 200k karakter/field) dan ditambahkan ke `.admin_log.jsonl` agar bertahan setelah restart (`PAF_ADMIN_LOG`, `off` untuk mematikan). Hanya trafik yang lewat gateway sejak fitur ini aktif; `dataSession/` worker tidak diimpor.
- **`PublicForward/ForVPS/admin_panel.py` (baru)**: router `/fixie` + API JSON. Login password (`PAF_ADMIN_PASSWORD`) → cookie httpOnly `SameSite=Strict` (12 jam), lockout 60 dtk setelah 5 kegagalan per IP, header `X-Fixie: 1` untuk aksi mengubah state, pengecekan `Origin` = `Host`. Tanpa password → 503 (fail closed).
- **`PublicForward/ForVPS/fixie.html` (baru)**: UI satu halaman (daftar sesi, transkrip, error ditandai, kotak input, polling).
- **`vps_server.py`**: `chat_completions` mencatat tiap giliran (pending sebelum dispatch, lalu `finish`/`fail`; jalur stream dibungkus `_logged_stream`); `ApiTokenMiddleware` melewatkan `/fixie*` (diautentikasi oleh panel); `WorkerManager.active_sessions()`; `DELETE /v1/sessions/{id}` menandai sesi terhapus di log.
- **Kirim dari panel**: memakai jalur yang sama dengan `/v1/chat/completions` (`mode=continue`, afinitas worker, tercatat otomatis), satu giliran per sesi; sesi terhapus → 409.

### 2. Verifikasi
- `tests/test_admin_panel.py` (baru, offline): auth, pending→ok, error 429, filter aktif, polling inkremental, kirim + penolakan ganda, sesi terhapus, logout, replay JSONL.
- Tes yang sudah ada kini mengatur `PAF_ADMIN_LOG=off` agar tidak menulis log. `test_http_e2e.py` dan `test_delete_session_e2e.py` sudah gagal sebelum perubahan ini (tidak ada API token di server uji: 503/timeout), tidak terkait fitur ini.

---

## [Unreleased] — Qwen Think Mode Enforcement, Multi-turn / Continue Support & Selector Fix

> **Perbaikan penerapan mode berpikir (think mode: `fast`, `auto`, `thinking`) pada Qwen agar request selalu diterapkan secara akurat dan tidak terjebak pada mode default atau mode request sebelumnya.** Ditemukan bug di mana permintaan mode `fast` tetap berada di mode `auto` atau sebaliknya. Masalah disebabkan oleh: (1) bypass `mode == "continue"` yang mematikan pergantian think mode pada percakapan lanjutan / turn 2+, (2) state leakage pada worker pool di mana `_think_mode` tidak di-reset ketika request berikutnya tidak mengirimkan `think_mode`, dan (3) selector trigger & dropdown option yang tidak presisi dengan DOM Qwen v2 (`div.qwen-chat-v2-dropdown-menu-item`).

### 1. Perbaikan Selector & Interaksi Dropdown (`scrapers/qwen_scraper.py`, `config/qwen.py`)
- **`_get_current_think_mode()`**:
  - Memprioritaskan selector spesifik `.qwen-thinking-selector .qwen-chat-v2-dropdown-menu-select-label` dan `.qwen-chat-v2-dropdown-menu-select-label`.
  - Melakukan pencocokan string persis (`text in ("auto", "thinking", "fast")`) dan word match terlebih dahulu untuk menghindari false positive pada substring "thinking".
  - Menghapus debug `print` tersisa.
- **`_set_think_mode(mode)`**:
  - Mengecek mode aktif saat ini terlebih dahulu; jika sudah cocok (misal requested `fast` dan UI sudah `Fast`), langsung skip (fast-path ~2ms).
  - Mengecek apakah popup dropdown `.qwen-chat-v2-dropdown-menu-popup` sudah terbuka sebelum mengklik trigger agar tidak menutup dropdown yang sudah terbuka secara tidak sengaja.
  - Memfokuskan trigger click ke `.qwen-thinking-selector .qwen-chat-v2-dropdown-menu-select` dan `.qwen-thinking-selector` (menghindari global `.qwen-chat-v2-dropdown-menu-trigger` yang mencakup 48 elemen unrelated).
  - Menyesuaikan selector option untuk menargetkan `div.qwen-chat-v2-dropdown-menu-item` dan turunannya.
  - Memverifikasi label UI baru setelah klik; hanya menandai `_think_mode_applied = True` jika perubahan berhasil terkonfirmasi di UI.
- **`config/qwen.py`**:
  - Memperbarui `think_mode_trigger`, `think_mode_selected`, dan `think_mode_options` agar selaras dengan DOM Qwen v2.

### 2. Dukungan Penuh Think Mode pada Mode CONTINUE (`scrapers/qwen_scraper.py`)
- **`_ensure_page_ready()`**:
  - Menghapus baris `self._think_mode_applied = True` yang secara prematur menandai mode sudah diaplikasikan pada mode continue.
- **`send_prompt()`**:
  - Menghapus kondisi `if mode != "continue"` yang sebelumnya memblokir eksekusi `_set_think_mode()` pada turn 2+ / percakapan lanjutan.
  - Memanggil `_set_think_mode()` baik pada mode `new` maupun `continue` jika mode belum diaplikasikan atau jika `effective_think` berbeda dari mode aktif scraper.

### 3. Pencegahan State Leakage Antar-Request (`public_qwen.py`, `browser_pool_qwen.py`)
- **`public_qwen.py`**:
  - Mereset `_think_mode` ke default config (`fast`) jika client tidak mengirimkan `think_mode` dalam request baru, mencegah bocornya mode dari request lama pada worker yang sama di pool.
  - Menandai `_think_mode_applied = False` saat request continue melakukan navigasi `goto(conv_url)` ke percakapan baru.
- **`browser_pool_qwen.py`**:
  - Mengimpor `QWEN_CONFIG`.
  - Pada `_reset_slot_page()`, mereset `slot.scraper._think_mode` kembali ke default pool/config (`fast`) dan mereset `_think_mode_applied = False`.

### 4. Pengujian Otomatis (`tests/test_qwen_think_mode.py`)
- Menambahkan 7 unit test komprehensif: deteksi akurasi mode aktif, fast-path skip jika mode sudah cocok, transisi dari `auto` ke `fast`, penerapan think mode pada mode `continue`, pergantian mode saat requested mode berbeda, pencegahan state leakage di `public_qwen.py`, dan reset state di `browser_pool_qwen.py`.

---

## [Unreleased] — Qwen URL-Only Authentication Detection & Elimination of DOM False Positives

> **Deteksi status autentikasi Qwen murni berbasis URL, menghapus ketergantungan deteksi DOM / elemen Guest yang memicu false positive.** Sebelumnya, _is_unauthenticated() mengevaluasi elemen DOM (avatar, modal usia, tombol login di header) yang sering memicu false positive pada sesi percakapan aktif (https://chat.qwen.ai/c/<uuid>). Akibatnya, scraper mengira sesi belum login sebelum mengirim prompt, lalu mencoba memanggil ensure_authenticated() dan membuka https://chat.qwen.ai/auth yang membuang waktu tunggu hingga ~45 detik. Kini deteksi status autentikasi disederhanakan: cukup memeriksa apakah URL adalah https://chat.qwen.ai/ atau percakapan https://chat.qwen.ai/c/<conversation_id> (misal https://chat.qwen.ai/c/60f74e61-7c18-450e-8024-77ade72e41ce). Jika URL bukan salah satu dari keduanya, maka otomatis menjalankan ensure_authenticated().

### 1. Deteksi Autentikasi Berbasis URL (scrapers/qwen_scraper.py)
- **is_authenticated_url(url)**: metode statis baru untuk memverifikasi apakah URL adalah halaman chat valid (https://chat.qwen.ai/ atau https://chat.qwen.ai/c/<id>, di mana <id> bukan guest).
- **_is_unauthenticated()**: disederhanakan murni menjadi pengecekan 
ot is_authenticated_url(url). Seluruh evaluasi JavaScript DOM selector (avatar, history, modal verifikasi usia, header login buttons) dihapus sehingga bebas dari false positive.
- **is_session_expired()**: memeriksa 
ot self.is_authenticated_url(url) secara langsung tanpa traversing pola URL manual.
- **ensure_authenticated()**: jika URL saat ini sudah valid (is_authenticated_url), langsung return True tanpa memicu navigasi atau memanggil login(). Jika belum di URL valid (misal bout:blank), navigasi ke https://chat.qwen.ai; jika ter-redirect ke luar URL valid (/auth, /login), jalankan auto-login self.login().
- **_wait_for_login_result()**: menunggu hingga URL halaman berubah menjadi is_authenticated_url dan textarea siap sebelum menyatakan login sukses.

### 2. Pengujian (	ests/test_qwen_guest_protector.py)
- Menambahkan validasi URL percakapan UUID seperti https://chat.qwen.ai/c/60f74e61-7c18-450e-8024-77ade72e41ce pada sampel URL terautentikasi.
- Menambahkan pengujian khusus 	est_ensure_authenticated_url_based() yang memverifikasi bahwa URL valid tidak memicu navigasi ulang atau form login, sementara URL tidak valid (/auth) memicu navigasi dan form login.

---

## [Unreleased] — Qwen Guest URL Protector, False Login Fix & DOM Selectors Update

> **Proteksi status autentikasi Qwen berbasis URL conversation (`/c/guest` vs `/c/<uuid>`) dan pembaruan selector DOM dari diagnostik terbaru.** Terdeteksi kondisi false login pada akun Qwen di mana landing page mengasumsikan sesi telah terautentikasi (karena keberadaan input chat dan elemen layout sidebar). Ketika prompt dikirimkan pada sesi belum login/guest, Qwen mengalihkan URL ke `https://chat.qwen.ai/c/guest` (berbeda dengan akun login yang berpindah ke `https://chat.qwen.ai/c/<uuid>`). URL `/c/guest` menyebabkan tombol auth muncul kembali pada request berikutnya, memicu fungsi login berulang kali di setiap request, serta merusak multi-turn session jika `/c/guest` tersimpan sebagai `conversation_url`. Selain itu, request pertama mode `new` kini tidak lagi memanggil `ensure_authenticated()` di awal, melainkan mengandalkan URL protector saat pengiriman prompt. Selector DOM diselaraskan dengan hasil recon terkini (`debug/summary_prompt/summary.md`).

### 1. Skip ensure_authenticated pada Request Pertama Mode NEW (`scrapers/qwen_scraper.py`, `scrapers/base_qwen.py`)
- **`_ensure_page_ready`**: hapus pemeriksaan `ensure_authenticated()` saat `mode == "new"`. Scraper langsung memuat chat baru dan mengetik prompt tanpa memicu verifikasi/login premature di landing page.
- **`BaseAIChatScraper.scrape`**: lewati `is_session_expired()` pada attempt 1 saat `mode == "new"`. Jika akun ternyata belum login, protector `/c/guest` akan langsung menangkapnya saat prompt dikirim.

### 2. Pembaruan DOM & UI Selectors (`config/qwen.py`, `scrapers/qwen_scraper.py`)
- **Stop Button**: tambahkan `button.stop-button`, `button[aria-label="Stop"]`, `[class*="stop-button"]` (terverifikasi di DOM live saat AI generating).
- **Send Button**: tambahkan selector kontainer `.chat-prompt-send-button button:not(.disabled)`, `.message-input-right-button-send button:not(.disabled)`, serta deteksi class `disabled` pada button untuk mencegah submit saat tombol belum siap.
- **Loading / Streaming Indicators**: tambahkan `.response-loading`, `[class*="response-loading"]`, `.scroll-down-button-loading` ke `_SEL_THINKING` dan `_is_generating()`.
- **Response Container & Count**: tambahkan `.custom-qwen-markdown`; perbarui `_count_response_elements()` dan `_extract_last_response()` untuk menghapus dependensi `.chat-message-container` yang sudah usang di DOM Qwen terbaru.
- **Toolbar Menu**: tambahkan `.mode-select-open, div.mode-select-open, [class*="mode-select-open"]` ke config.

### 3. Protector URL & Abort (`scrapers/qwen_scraper.py`, `scrapers/base_qwen.py`)
- **`GuestSessionError`**: exception baru yang dinaikkan saat scraper mendeteksi URL beralih ke mode Guest (`/c/guest` atau `/guest`) setelah prompt dikirim atau saat generasi berlangsung.
- **`_is_guest_url` & `is_guest_session`**: helper untuk mendeteksi apakah halaman berada di path guest URL secara aman (`getattr(self, "_page", None)`).
- **`_abort_generation`**: otomatis mengeksekusi klik tombol stop/abort di DOM ketika guest URL terdeteksi saat generasi dimulai atau saat polling kestabilan respon.
- **Protector di `_wait_for_generation` & `_wait_for_generation_media`**: mendeteksi `/c/guest` pada Fase 1 (sinyal awal) dan Fase 2 (stabilisasi). Jika terdeteksi, generasi langsung dibatalkan, `_authenticated` diset `False`, dan `GuestSessionError` dinaikkan.
- **Recovery Opsi 1 di `BaseAIChatScraper.scrape`**: jika `GuestSessionError` tertangkap, scraper menandai sesi expired, mengambil screenshot debug, menjalankan `ensure_authenticated()`, dan mengulang (`attempt -= 1; continue`) prompt pada akun yang sama jika re-autentikasi berhasil (rotasi hanya terjadi jika re-autentikasi gagal).
- **DOM Guard di `_is_unauthenticated` & `_wait_for_login_result`**:
  - Hapus `.sidebar-wrapper` dan `.sidebar-entry-fixed-list-content` dari sinyal positif (keduanya ada di mode guest).
  - Tambahkan sinyal positif spesifik akun terautentikasi (avatar user, user menu, item riwayat chat).
  - `_wait_for_login_result` menolak status sukses jika mendarat di `/c/guest`.

### 4. Config & Session Affinity Guard (`config/qwen.py`, `public_qwen.py`)
- Tambahkan `"/c/guest"` dan `"/guest"` ke `login_url_patterns` dan `guest_url_patterns`.
- Perbarui `authenticated_selectors` dengan selector avatar/profil pengguna.
- Mencegah URL `/c/guest` tersimpan ke `session.conversation_url` dan mengabaikan guest URL di session continue.

### 5. Diagnostik & Tes (`debug_login_qwen.py`, `tests/test_qwen_guest_protector.py`)
- `debug_login_qwen.py`: menambahkan deteksi URL `/c/guest` pada inspeksi landing page.
- `tests/test_qwen_guest_protector.py`: unit test komprehensif menguji pola URL guest, abort generasi, pengangkatan `GuestSessionError`, alur recovery Opsi 1 pada `scrape()`, proteksi `public_qwen`, serta verifikasi skip `ensure_authenticated()` pada mode NEW attempt 1.

---

## [Unreleased] — DeepSeek UI Baru: Toggle Bidirectional, Vision Dihapus, Default ON

> **Adaptasi terhadap perubahan UI chat.deepseek.com (verifikasi recon `debug/deepseek_dom/20261025_*`).** DeepSeek menghapus mode pills Instant/Expert/Vision (0 kemunculan label di semua snapshot DOM). Yang tersisa hanya dua toggle — **DeepThink** dan **Search** — keduanya **ON secara default**. Konsekuensi besar: `_set_toggle` lama tidak pernah mematikan toggle (asumsi default OFF), sehingga request `deep_think=false`/`web_search=false` akan tetap terkirim dengan tool menyala. Sekarang toggle bersifat **bidirectional**: state dibaca dari DOM (`aria-pressed` / class `ds-toggle-button--selected`) dan pill diklik hanya jika berbeda dengan yang diminta API. Input file/gambar dikonfirmasi bekerja seperti Qwen (clipboard paste) tanpa mode khusus.

### 1. Scraper (`scrapers/deepseek_scraper.py`, `scrapers/base_deepseek.py`)
- **`_set_toggle` bidirectional**: hapus early-return `if not desired` (asumsi lama "default state is OFF"); baca state via `_is_active()` lalu klik hanya saat beda. Ground truth state ON: `aria-pressed="true"` + class `ds-toggle-button--selected` (recon `20261025_015631`).
- **`_is_active`** disederhanakan: cek atribut ARIA (`aria-checked`/`aria-pressed`/`aria-selected`) + class `ds-toggle-button--selected`; heuristik class-count dan `active_marker_class_hint` dihapus.
- **Hapus Layer 1**: `_select_model_tab()`, `_is_active_by_class_count()`, `_tool_allowed_for_mode()`, `_TOOL_MATRIX_KEY`, dan atribut `_active_model_tab` dihapus (mode pills tidak ada lagi di DOM).
- **`send_prompt`**: param `model_tab` dideprecate (masih diterima, diabaikan + debug log); `deep_think`/`web_search` kini `Optional[bool]` — `None` = pakai default config (ON).
- **x_metadata**: `model_tab` dihapus dari metadata; `deep_think`/`web_search` dilaporkan setelah resolusi None → default config.

### 2. Config (`config/deepseek.py`)
- `deep_think_default`/`web_search_default` → `True` (mengikuti default situs).
- Hapus `model_tabs`, `default_model_tab`, `tab_toggle_matrix`, selector `model_tab` (instant/expert/vision), `active_marker_class_hint`, `active_aria_selected`.
- Komentar blok attachments diperbarui: input file tidak lagi terikat Vision tab (clipboard paste seperti Qwen); dokumentasi struktur DOM toggle baru ditambahkan.

### 3. API surface (`public_deepseek.py`, `PublicForward/ForVPS/vps_server.py`)
- `deep_think`/`web_search` tidak dikirim → `None` → worker memakai default ON (bukan `False` hardcode). `model_tab` diterima tapi tidak diteruskan; `x_meta.model_tab` dihapus.
- `THINK_MODE_ALIASES` baru: `auto` (default situs, ON+ON), `instant`/`fast` (OFF+OFF), `thinking`/`expert`/`reasoning` (ON+OFF), `search`/`web` (OFF+ON), `research` (ON+ON). Alias `vision` dihapus, alias `search`/`web`/`research` baru.
- `x_meta.deep_think`/`web_search` kini mencerminkan nilai efektif (bukan `False` default).

### 4. CLI (`main.py`, `example/chat_deepseek.py`)
- `main.py`: flag `--model-tab` dihapus; `--deep-think`/`--web-search` jadi `BooleanOptionalAction` default `None` (= ON; matikan dengan `--no-deep-think`/`--no-web-search`).
- `chat_deepseek.py`: daftar `/think` diperbarui (tanpa `vision`/`deep`; + `web`/`research`), default `--think-mode` → `auto`.

### 5. Dokumentasi
- `API_USAGE.md`: tabel `think_mode` baru, default ON dijelaskan, bagian "Gambar / file (vision)" → "Gambar / file" (tanpa `think_mode` wajib), `model_tab` ditandai usang, contoh `x_meta` diperbarui.

### 6. Bugfix — attachment API crash (`not 'dict'` TypeError) + paste pipeline
- **Gejala 1**: request dengan `attachments` gagal di `scrape()` dengan `argument should be a str or an os.PathLike object where __fspath__ returns a str, not 'dict'` (log: error persis setelah `Toggled 'DeepThink' OFF`).
- **Akar masalah 1**: `public_deepseek.py`/`vps_server.py` meneruskan attachment sebagai dict base64 `{"filename","data","mime_type"}` (wire format API), tapi `_attach_via_clipboard(file_path: str|Path)` memanggil `Path(dict)` → TypeError. Qwen sudah benar karena `public_qwen.py` mengonversi dict → objek `Attachment` lebih dulu.
- **Gejala 2** (setelah fix 1): tidak ada error, tapi gambar **tidak ter-paste** — handler DeepSeek mengabaikan ClipboardEvent sintetis tunggal yang dikirim ke textarea.
- **Perbaikan** (`scrapers/deepseek_scraper.py`): attachment kini melewati **pipeline eskalasi dengan verifikasi preview** (persis resep Qwen + 1 lapis tambahan), berhenti begitu preview terdeteksi:
  1. fokus input → synthetic `ClipboardEvent('paste', clipboardData)` (metode lama),
  2. synthetic `DragEvent('drop', dataTransfer)` — fallback terbukti di Qwen,
  3. **clipboard asli**: `navigator.clipboard.write(ClipboardItem)` (permission di-grant via Playwright context) + keypress **Ctrl+V sungguhan** → paste event **trusted** (`isTrusted=true`), tak bisa dibedakan dari paste manusia.
  Setiap attempt diverifikasi via `_wait_attachment_preview()` (poll `selectors.attachment_preview`, baru di config — TODO-verify live). Gagal semua → warning jelas ("prompt will be sent WITHOUT it"), request tetap lanjut. Antar-file multi-attachment diberi jeda 1.2s (paritas Qwen). Dispatch paste+drop sekaligus sengaja dihindari (file terdaftar 2x, pelajaran dari Qwen).
- **Bugfix lanjutan (live 2026-10-26): gambar ter-paste 2x.** Penyebab: paste event pertama sebenarnya DITERIMA, tapi chip upload muncul **setelah** jendela cek 5 detik → pipeline menganggap gagal → drop event juga diterima → dobel. Perbaikan: **baseline sinyal DOM** (`_attachment_signal()` — hitaran luas chip/preview/upload/img level halaman; hanya DELTA yang dipakai, aman di mode CONTINUE) di-snapshot sebelum dispatch; eskalasi ke attempt berikutnya **hanya jika sinyal tidak berubah sama sekali** setelah tunggu 10 detik (`_wait_attachment_accepted`); `_preview_visible_once()` dipisah dari loop polling agar tidak saling memakan budget; setelah sukses `_hint_duplicate_attachment()` memperingatkan bila delta > 1 (deteksi handler ganda dalam satu dispatch — advisory; jika muncul, kirim DOM chip untuk kalibrasi selector hapus).
- **Normalisasi** dipisah ke `_normalize_attachment()`: str/Path (CLI), dict base64 mentah, data-URI `data:<mime>;base64,...` (mime dari header), dict `path` lokal; entri tak valid di-skip dengan warning.
- **Verifikasi**: unit test fake-page — 6 kasus pipeline (paste langsung sukses / fallback drop / Ctrl+V / semua gagal / clipboard API ditolak / data-URI) + 8 kasus normalisasi — semua lulus. Selector `attachment_preview` belum terverifikasi live; log baris "Pasted attachment via …" akan menunjukkan metode mana yang diterima DeepSeek.

### Verifikasi
- `py_compile` lulus untuk semua file yang diubah; import `config` + `scrapers.deepseek_scraper` + `vps_server` OK.
- Unit test fake-locator 7 kasus `_set_toggle` (ON→OFF, OFF→ON, sudah-cocok ×2, pill hilang, disabled, deteksi class-only) — semua lulus.
- **Belum diverifikasi live**: e2e dengan browser nyata (perlu sesi login) — jalankan `python main.py --prompt "tes"` setelah deploy untuk memastikan klik pill OFF bekerja di UI baru.

---

## [Unreleased] — Grok v1.1: Diagnostik DOM Live & Optimasi Selector Cepat-Akurat

> **Pembaruan & Optimasi Selektor Grok.** Hasil investigasi DOM live dari tool diagnostik baru `debug_dom_grok.py` mengonfirmasi struktur internal `grok.com`: input prompt menggunakan TipTap/ProseMirror (`[data-testid="chat-input"] [contenteditable="true"]`), tombol submit dinamis berdasarkan `aria-label="Submit"` / `"Query"`, dan respon assistant dirender di dalam container `.response-content-markdown` di bawah `[data-testid="assistant-message"]`. Dengan menargetkan elemen ini secara presisi dan menambahkan *positive completion detection* (deteksi tombol Copy / Regenerate), proses scraping Grok menjadi **5–9 detik lebih cepat** per permintaan dan **100% bebas dari noise UI** (seperti header `<h2 class="sr-only">Grok</h2>` atau status thinking `Worked for 3s`).

### 1. Tool Diagnostik DOM (`debug_dom_grok.py` & `tests/test_debug_dom_grok.py`)
- **Diagnostic Engine Mandiri (`debug_dom_grok.py`)**:
  - Mendiagnosis seluruh lifecycle interaksi `grok.com`: Pre-send, Phase 1 (Send Prompt), Phase 2 (Live Polling Timeline selama generasi), dan Phase 3 (Post-Generation Evaluation).
  - Dilengkapi detektor otomatis **Reader Buta (Blind Reader)**: membandingkan kemunculan teks jawaban di `document.body.innerText` vs pembacaan selector produksi.
  - Cek pre-flight konektivitas CDP (`check_cdp_reachable`) dengan opsi `--no-cdp` dan `--cdp` agar aman dari kegagalan attach port 9222 ketika Chrome background tidak berjalan.
  - Dukungan selector standar DOM pada `sign_in_probe` (menghindari error `SyntaxError` dari pseudo-class Playwright `:has-text()` di dalam `document.querySelectorAll`).
  - Output diagnostik terstruktur rapi di `debug/summary_grok/summary.md` dan `debug/summary_grok/summary.json`.
- **Unit Test Komprehensif (`tests/test_debug_dom_grok.py`)**:
  - 35 pemeriksaan offline: validasi parser argumen CLI, fallback CDP, filter class CSS stabil vs hashed, registrasi selector, struktur JSON timeline, dan formatting laporan Markdown.

### 2. Optimasi Kecepatan Input & Pengiriman Prompt (`config/grok.py`, `scrapers/grok_scraper.py`)
- **Prioritisasi Selektor TipTap / ProseMirror**:
  - Menargetkan `[data-testid="chat-input"] [contenteditable="true"]`, `div.tiptap[contenteditable="true"]`, dan `[role="combobox"]` di posisi teratas `prompt_textarea`, memangkas waktu traversal fallback generic `<textarea>`.
- **Deteksi Tombol Submit & Query ARIA**:
  - Menambahkan selector langsung `[data-testid="chat-input"] ~ div button[aria-label*="Submit" i]`, `button[aria-label*="Submit" i]`, dan `button[aria-label*="Query" i]`.
  - Pada `_click_send_button`, timeout selektor dipercepat dari `3000ms` ke `800ms`, dan scanning fallback JS diperluas mencakup `submit`, `query`, serta `send`.
- **Pangkas Dead-Wait & Jeda Aksi**:
  - Initial post-send settle wait di `scrapers/grok_scraper.py` dipangkas dari `2.0s` (atau `6.0s` continue) menjadi `0.5s` (atau `1.5s` continue), menghemat 1.5–4.5 detik waktu tunggu idle per giliran.
  - `timeouts.between_actions` diturunkan dari `800ms` ke `300ms`.

### 3. Deteksi Selesai Instan / Positive Completion Check (`scrapers/base_grok.py`)
- **Positive Completion Check**:
  - Ditambahkan evaluasi DOM cepat di `BaseAIChatScraper._is_generating()`: jika tombol aksi pasca-generasi (`button[aria-label*="Copy" i]`, `button[aria-label*="Regenerate" i]`, `button[aria-label*="Share" i]`) sudah muncul pada bubble assistant terakhir, scraper langsung mengembalikan `False` (generasi selesai).
  - Menghilangkan delay 5 detik dari stall grace period ketika indikator loading/stop hilang namun teks sudah selesai dirender.
- **Pangkas Waktu Uji Stabilitas**:
  - `timeouts.stability_check` dipersingkat dari `800ms` ke `400ms` (penghematan 50% pada verifikasi akhir respon).

### 4. Ekstraksi Markdown Murni & Anti-Noise (`config/grok.py`, `scrapers/grok_scraper.py`)
- **Targeting Inner Markdown Container**:
  - Selektor `assistant_response` diperbarui untuk menargetkan kontainer markdown murni di dalam bubble:
    `[data-testid="assistant-message"] .response-content-markdown`, `[data-testid="assistant-message"] [class*="response-content-markdown"]`, dan `.streamdown-chat-md`.
  - Mencegah pembacaan elemen non-jawaban seperti `<h2 class="sr-only">Grok</h2>` dan container progress `Worked for Xs` langsung di level DOM.
- **Pembersihan Regex Cadangan**:
  - Menambahkan token `grok` ke dalam pola regex `_UI_LINE_PATTERNS` di `scrapers/grok_scraper.py` sebagai jaring pengaman bila ekstraksi fallback ke outer bubble.

### 5. Dokumentasi & Status Verifikasi
- Terintegrasi dalam `README.md` dan `GROK_BACKEND.md`.
- Semua test suite passed:
  - `tests/test_debug_dom_grok.py`: 35/35 checks passed
  - `tests/test_vps_smoke.py`: PASSED
  - `tests/test_grok_tools_e2e.py`: PASSED
  - `tests/test_tool_protocol.py`: 57/57 checks passed
  - `tests/test_protocol_scrapers.py`: 51/51 checks passed

---

## [Unreleased] — DeepSeek v3.11: Filter Chrome Code-Block (md-code-block)

> **Perbaikan (branch `DeepSeek_filtering_results`).** Noise keluarga kedua (setelah v3.10): setiap code block yang dirender bocorkan bar header-nya ke hasil sebagai `python\nCopy\nDownload` / `html\nCopy\nDownload` / `cpp\nCopy\nDownload` — label bahasa highlighter + label tombol Copy/Download ikut terbaca oleh `inner_text()` di `_get_last_response_text()`. **GROUND TRUTH TERVERIFIKASI** (recon user `debug/deepseek_dom/20261025_034718`, jawaban ber-4 code block): `div.md-code-block.md-code-block-light > div.md-code-block-banner-wrap > div.md-code-block-banner.md-code-block-banner-lite > [span.d813de27 "html" (label bahasa) + div[role=button].ds-button dengan teks di span.code-info-button-text]`. Catatan penting: recon itu dijalankan DENGAN CSS supresi aktif (tag `paf-hide-noise-style` ada di dump) dan reader tetap bersih sepanjang generasi (timeline 7 poll, 1656 char ber-frame CHATCODE, nol chrome di body.innerText) — **bukti live efektif**; class tetap terbaca dari HTML karena `display:none` tidak mengubah atribut.

### Perbaikan (`scrapers/base_deepseek.py`)
- **Layer 1 (primer, CSS)** — `_CITE_SUPPRESS_JS` di-rename `_NOISE_SUPPRESS_JS` (style id `paf-hide-noise-style`), kini DUA aturan: sitasi (v3.10) + `[class*="md-code-block-banner"], span.code-info-button-text { display:none !important }`. Fragmen `md-code-block-banner` terverifikasi mencakup ketiga class header asli (`banner-wrap`/`banner`/`banner-lite` — label bahasa hashed `d813de27` ikut tersembunyi bersama banner). **Tebakan awal `md-code-block-action` DIBUANG** — terbukti tidak ada di DOM build ini (satu-satunya kemunculannya di dump adalah rule CSS injeksi kita sendiri). `span.code-info-button-text` (span teks Copy/Download, inline `display:none` di dump tapi TERLIHAT pada live run pre-CSS user) disupresi eksplisit sebagai belt-and-braces.
- **Layer 2 (fallback, regex)** — `strip_code_chrome_artifacts()` + `_CODE_CHROME_RE`: menghapus triplet persis `label-bahasa\nCopy\nDownload` (varian UI Indonesia `Salin\nUnduh` ditoleransi) dan varian tombol-saja (kalau banner tersembunyi CSS tapi teks tombol bocor). **Label bahasa memakai whitelist** (`_CODE_LANGS`, label lowercase highlighter: python, cpp, c++, c#, objective-c, html, json, …) — BUKAN token bebas, karena pola token-bebas terbukti menelan baris satu-kata legit yang kebetulan mendahului tombol bocor (tertangkap test). Chrome di awal teks: newline residu ikut dibersihkan. Preseden pola text-level: `grok_scraper.py` ("Copy / Share this response / Send feedback").
- **Gabungan** — `strip_extraction_noise()` menjalankan kedua filter sitasi + chrome; titik baca tunggal kini mengembalikan teks bebas KEDUA keluarga noise (final, pre-send, stabilitas, delta stream).
- **Rekon kalibrasi** — `debug_dom_deepseek.py` + `CODE_BLOCK_CENSUS_JS` (read-only, dipanggil dari `dump_phase()`): setiap fase yang memuat `[class*="md-code-block"]` terdump ke `codeblocks_<fase>.json` (struktur children + kandidat chrome banner/header/code-info-button-text + status style supresi `suppressed`). Versi awal probe salah tempat (di loop poll, mereferensi `prefix`/`name` milik `dump_phase` → NameError senyap → tidak pernah menghasilkan file) — diperbaiki penempatannya.

### Test & verifikasi
- `tests/test_citation_filter.py` di-rename `tests/test_extraction_noise.py` (v3.10 masih uncommitted) dan diperluas: **34 cek** — sitasi (12), chrome (14), gabungan (2), guard ground-truth CSS (3: banner family ada, code-info-button-text ada, action guess TIDAK ada), wiring reader (3).
- Verifikasi end-to-end sampel gabungan (IHSG user + 3 code block python/html/cpp): semua chrome & sitasi hilang, seluruh isi kode (`inflasi = 0.031`, `<table>…`, `int main() { return 0; }`) dan struktur paragraf utuh.
- **Live proof dari recon user**: jawaban 4 code block dirender dengan CSS aktif — `body.innerText` & output reader nol chrome, deteksi CHATCODE frame normal.
- Suite offline lengkap PASS: test_stream_scrapers (44), test_protocol_scrapers (51), test_tool_protocol (57), test_stuck_signal_regression, test_extraction_noise (34).

---


## [Unreleased] — DeepSeek v3.10: Filter Noise Sitasi Web (ds-markdown-cite)

> **Perbaikan (branch `DeepSeek_filtering_results`).** Output jawaban ber-web-search tercemar noise baris seperti `-18`, `-10`, `-3` (contoh nyata: `kerentanan struktural:-\n3`, `transparansi pasar:-\n10\n-\n11`, `diterima.-\n18`). Ground truth dari dump DOM (`debug/deepseek_dom/20261025_015631`): DeepSeek merender setiap sitasi inline sebagai `<a aria-label="N" rel="noreferrer"><span class="ds-markdown-cite"><span style="opacity:0">-</span><span style="position:absolute">N</span></span></a>` — tanda `-` tak-tampak menempel ke kata terakhir dan angka yang diposisikan absolut jatuh di baris sendiri, sehingga `inner_text()` pada `_get_last_response_text()` ikut menangkapnya. Noise ini mengalir ke SEMUA jalur: snapshot pre-send, poll stabilitas, delta stream, dan teks final.

### Perbaikan (`scrapers/base_deepseek.py`) — dua lapis
- **Layer 1 (primer, DOM-level)** — `_CITE_SUPPRESS_JS` + injeksi CSS idempoten di `_get_last_response_text()`: satu `<style>` (`ds-markdown-cite, span.ds-markdown-cite { display:none !important }`, id `paf-hide-cite-style`) menyembunyikan seluruh badge sitasi sehingga `inner_text()` tak pernah melihatnya — berlaku juga untuk badge yang dirender BELAKANGAN selama streaming (aturan stylesheet, bukan mutasi per-elemen). Diinjeksikan DI TITIK BACA TUNGGAL sebelum read apa pun: baca pertama setiap alur (scrape / corrective retry / scrape_with_tool_result) adalah capture pre-send, sehingga snapshot pre-send dan semua poll konsisten bebas badge — penghapusan badge mustahil salah terdeteksi sebagai "response baru" oleh deteksi perubahan teks di mode CONTINUE. Best-effort (try/except).
- **Layer 2 (fallback, regex konservatif)** — `strip_citation_artifacts()` + `_CITE_NOISE_RE`: menghapus signature artefak PERSIS dari teks yang sudah terekstrak — bentuk glued `word-\nN` (hyphen menempel kata) dan bentuk bare `\n-\nN` (hyphen sendirian di baris), masing-masing langsung diikuti baris angka 1–3 digit polos; run berurutan (`-\n10\n-\n11\n-\n27`) dihapus utuh termasuk pemisah `\n` internalnya, newline paragraf di sekitarnya dipertahankan (lookahead `(?=\n|$)` tidak pernah mengonsumsi). Aman untuk konten finansial: angka negatif di prosa (`dari -\n18`) punya SPASI sebelum hyphen → tidak pernah match; en-dash `–` / em-dash `—` karakter berbeda → tidak pernah match; penomoran list & garis `-` tanpa angka tidak tersentuh. Mencakup jendela saat Layer 1 belum aktif (halaman baru / navigasi `_goto_new_chat()` hard-goto menghapus style tag) atau rename class di masa depan.
- Cakupan otomatis: teks final, snapshot pre-send, perbandingan stabilitas, dan SEMUA delta stream (`on_text` → `_stream_forward`) — semuanya lewat satu titik baca yang sama, tanpa perubahan di `deepseek_scraper.py` / `public_deepseek.py` / VPS.

### Test & verifikasi
- Test baru `tests/test_citation_filter.py` (16 cek): Layer 2 terhadap fragmen nyata hasil user (glued / bare / run 2–3 sitasi / akhir-teks), kasus aman (angka negatif, en-dash, penomoran list, teks bersih byte-identical), plus wiring reader nyata — `_get_last_response_text()` memanggil injeksi CSS sebelum baca, menerapkan filter pada hasil `inner_text()`, dan tetap bersih (degradasi ke Layer 2) saat injeksi gagal.
- Verifikasi end-to-end pada sampel jawaban IHSG lengkap milik user: 14 blok noise terhapus, 0 artefak tersisa, konten legit (`37–43%`, `Rp100 triliun`, `1.033.182 orang`, `10,75%`) utuh.
- Suite offline lengkap PASS: test_stream_scrapers (44), test_protocol_scrapers (51), test_tool_protocol (57), test_stuck_signal_regression, test_citation_filter (16).

---

## [Unreleased] — Streaming DeepSeek v3.9: Deteksi Balasan Lama (BEGIN Kode Asing)

> **Perbaikan (branch `stream-experimental`).** Live: `CHATCODE b53b99f9: BEGIN marker not found (len=406); head='@@PAF-BEGIN:f4c02495@@\nVideo dengan URL …'` — reply yang terbaca MEMUAT BEGIN, tapi dengan kode giliran LAMA (`f4c02495`). Diagnosis dari preview: yang diterima sebagai "response baru" adalah **balasan ber-frame giliran sebelumnya** — di mode CONTINUE, virtual list me-render ulang pesan lama sehingga innerText-nya berbeda tipis dari snapshot `pre_send_text`, lolos deteksi perubahan, lalu stabil dan diterima. Kode CHATCODE unik per request menjadikan kasus ini terdeteksi secara deterministik: teks ber-BEGIN **kode asing** mustahil response giliran ini.

### Perbaikan
- `tp.looks_like_stale_reply(text, chatcode)` baru (`tool_protocol.py`): true bila teks memuat BEGIN dengan kode ≠ kode live (atau kode live tidak ada / protokol mati). Reply giliran ini ber-BEGIN kode live (patuh) atau tanpa BEGIN sama sekali (tidak patuh) — dua-duanya bukan stale.
- `wait_for_response()` (`base_deepseek.py`): Fase-1 tidak menganggap balasan-stale sebagai "response baru" (diperlakukan seperti pre-send; ketika elemen pesan baru dirender, teks berpindah ke konten giliran ini — termasuk reply tak ber-frame yang sebelumnya berisiko timeout); sabuk pengaman yang sama di gerbang penerimaan stabilitas (bersama thought-live & echo-prompt).
- `_stream_forward()`: snapshot stale di-skip sebelum apapun — sekaligus mencegah **fallback raw salah latch ke balasan lama** di mode CONTINUE (balasan lama panjang & tanpa frame-live bisa memicu latch padahal bukan jawaban giliran ini).
- Test: +5 (unit detector; wait-loop: stale 3× poll tak pernah diterima, reply live yang dikembalikan; stream B9: stale tak diteruskan & tak latch raw, body live ter-stream). Total 44 cek; suite offline lengkap PASS.

---


## [Unreleased] — Streaming DeepSeek v3.8: Kalibrasi Selector dari Ground-Truth DOM Live (recon 20261025_015631)

> **Perbaikan berbasis bukti (branch `stream-experimental`).** Hasil `debug_dom_deepseek.py` mengubah pemahaman kita tentang DOM live:
> 1. **`ds-think-content`** (class stabil prefix `ds-`) membungkus SELURUH reasoning: `ds-message > div(_74c0879) > div.ds-think-content > ds-markdown > p…`, sedangkan **jawaban** dirender di sibling: `ds-message > div.ds-markdown.ds-assistant-message-main-content > p…` — tidak pernah di dalam `ds-think-content`. Inilah diskriminator reasoning-vs-jawaban yang sesungguhnya, bukan heuristik teks.
> 2. **Header live ber-teks DOBEL `'ThinkingThinking'`** (label + echo) — regex `^Thinking\b` tidak pernah match (tidak ada word-boundary); ikon toggle ada di baris header (`_245c867`, hashed), bukan di parent span teks. Karena itu `thought_live` selalu False dan panel tak pernah tertangani.
> 3. **Model TERNYATA PATUH CHATCODE framing** (jawaban 2083 char diawali `@@PAF-BEGIN:`) — laporan sebelumnya "tidak menyesuaikan framing" sebenarnya adalah reader membaca reasoning di tengah thinking. Fallback raw tetap berguna sebagai jaring pengaman.
> 4. Tidak ada elemen stop/loading yang tertangkap selama generasi (selector stop-button memang mati) — pertahanan efektif: header thinking + `ds-think-content`.
> Timeline juga menunjukkan reader membaca reasoning di poll 2–4 ('User wants…', 'Search…') lalu berpindah ke jawaban ber-frame di poll 5+.

### Pembaruan (`scrapers/base_deepseek.py`)
- `_IS_INSIDE_THOUGHT_JS`: **primary** `closest('.ds-think-content')` — reader otomatis melewati semua markdown reasoning selama thinking; fallback tag `data-paf-thought` dan heuristik teks lama tetap (dengan `^Thinking` tanpa `\b`).
- `_COLLAPSE_THOUGHT_JS`: **jangkar struktural** — setiap `.ds-think-content`: tag panel orangtuanya (`data-paf-thought`) + klik ikon `ds-icon` pertama di panel maksimal sekali hanya saat konten masih terlihat (`offsetHeight > 8`). Scan teks lama jadi fallback dengan prefix toleran (`^thinking` tanpa boundary).
- `_THOUGHT_LIVE_JS`: sinyal live = elemen ber-teks pendek diawali `thinking` (case-insensitive) yang **memuat ds-icon di dalamnya sendiri** (baris header `_245c867`) — paragraf jawaban tidak pernah memuat ikon sehingga bebas false-positive; state selesai (`Thought for N seconds`) tidak match.
- `_is_generating()` cek #3: `^Thinking` tanpa `\b` (teks dobel).

### Status
- Suite offline lengkap PASS. **Perlu live test ulang**: dengan diskriminator struktural, reader harus diam selama thinking (tidak lagi membaca reasoning), lalu meng-stream jawaban ber-frame begitu `ds-assistant-message-main-content` mulai dirender.

---


## [Unreleased] — Streaming DeepSeek v3.7: Recon DOM Diperluas ke SEMUA DOM

> **Tooling (branch `stream-experimental`).** Laporan live: jawaban SUDAH tampil di layar tapi reader tidak membacanya — konsisten dengan hipotesis selector reader (`virtual_list`/`ds-markdown`) yang usang. `debug_dom_deepseek.py` diperluas dari "census elemen markdown" menjadi **pelacakan seluruh DOM**.

### Perubahan script
- **Census PENUH semua elemen ber-teks-langsung** (semua tag, bukan hanya `[class*="markdown"]`): tag, class (hashed ditandai), path 8 level, teks langsung vs total, visibilitas — disimpan per fase (`census_*.json`).
- **`document.body.innerText` lengkap per fase** (`body_*.txt`) + jejak `body_len` vs `reader_len` per poll di timeline — pembaca DOM-agnostic sebagai pembanding.
- **Verdict otomatis "READER BUTA"**: jawaban ditemukan di body.innerText tapi reader produksi menangkap <40 karakter → bukti selector usang.
- **Lokalisasi container**: elemen census yang memuat teks jawaban (class/path-nya) + daftar kandidat wadah reasoning + tabel frekuensi class stabil.
- Header probe kini menandai `[LIVE]` vs `[DONE]`.
- **Bugfix kondisi-akhir**: header "Thought for N seconds" yang tertinggal (non-live) tadinya membuat loop tidak pernah berhenti normal (selalu `end_timeout`); kini hanya header LIVE yang menahan.

---


## [Unreleased] — Streaming DeepSeek v3.6: Script Rekayasa DOM Live (`debug_dom_deepseek.py`)

> **Tooling (branch `stream-experimental`).** Bukti dari preview `head=` pada warning FRAME_MISSING: teks yang diterima sebagai jawaban adalah REASONING (`'User ingin analisis mendalam…'`) saat model masih di Thinking panel. Artinya semua guard berbasis teks/header (jangkar ikon, pola header, tag panel) meleset terhadap DOM live — sudah tiga iterasi tebakan buta. Keputusan: berhenti menebak; rekam ground truth.

### Script baru
- `debug_dom_deepseek.py` (pola `debug_prompt_qwen.py`): kirim satu prompt lewat jalur produksi (CHATCODE aktif), lalu **census DOM baca-saja** selama generasi — tanpa klik/mutasi (kecuali `--allow-collapse` untuk menguji one-shot collapse).
  - Probe header: semua elemen ber-teks `/thinking|thought for/i` (≤60 char) lengkap dengan tag, class (hashed ditandai), path 7 level, class parent/grandparent, daftar ikon & tombol di dalamnya → bahan kalibrasi `_THOUGHT_LIVE_JS`/`_COLLAPSE_THOUGHT_JS`.
  - Census `[class*="markdown"]`: panjang/head teks, visibilitas, verdict inside-thought **memakai JS produksi yang sama**, status tag `data-paf-thought` → menunjukkan elemen mana reasoning vs jawaban vs echo prompt.
  - Probe stop/loading indicator + state detektor produksi per poll (`_get_last_response_text`/`_thought_in_progress`/`_is_generating`) → post-mortem guard mana yang gagal.
  - Artefak per run ke `debug/deepseek_dom/<ts>/`: `timeline.jsonl`, `phase_*.html`+`.png` di tiap transisi fase (pre-send/thinking/answer_chars/end), `summary.md` + `summary.json` berisi temuan teragregasi + kandidat selector stabil (class hashed otomatis dibuang).
- CLI: `--account --prompt --headless --max-wait --poll-interval --allow-collapse --keep-open --out`.

---


## [Unreleased] — Streaming DeepSeek v3.5: Panel Thinking Ditangani SEKALI Lalu Diabaikan

> **Perbaikan eksperimental (branch `stream-experimental`).** Directive dari live test: panel Thinking sangat mengganggu — abaikan setelah ditangani 1×. Sebelumnya pass collapse/tagging tetap menjalankan JS (`querySelectorAll` semua div + kueri ikon + `setAttribute`) di setiap poll sepanjang generasi meski kliknya sudah dibatasi sekali per panel.

### Perilaku baru
- `_collapse_thinking_panels()` kini **one-shot per generasi**: pass terus berjalan hanya sampai pertama kali menemukan header thought — satu pass itu men-tag panel (`data-paf-thought`) dan mengklik toggle maksimal sekali. Setelah itu method short-circuit **tanpa menyentuh DOM sama sekali** (`{"found": 0, "clicked": 0}`) sampai generasi berikutnya; flag `_thought_panel_handled` di-reset di setiap `scrape()`.
- Pemeriksaan baca-saja (`_thought_in_progress`) tetap berjalan — tidak pernah memutasi DOM dan adalah penahan penerimaan prematur mid-think.
- Trade-off yang disengaja: jika muncul panel thinking KEDUA (multi-round) dalam satu respons, panel itu tidak lagi ditangani — gerbang CHATCODE + fallback raw + cek header live tetap melindungi stream.

### Test & Dokumentasi
- `tests/test_stream_scrapers.py`: +3 cek dengan method asli + stub page penghitung `evaluate` — pass pertama menjalankan JS & menangani panel; setelah itu tidak ada sentuhan DOM; tetap mem-poll sampai panel pertama ditemukan lalu berhenti. Total 39 cek, suite offline lengkap PASS.

---


## [Unreleased] — Streaming DeepSeek v3.4: Guard Anti-Echo Prompt + Deteksi Header Thinking Toleran

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test v3.3 masih memunculkan `CHATCODE …: BEGIN marker not found in reply (len=304)` — sistem membaca teks yang bukan jawaban. Analisa menemukan dua lubang baca yang sama-sama menghasilkan gejala persis ini:
> 1. **Echo prompt sendiri.** Bubble user berisi prompt terbungkus (`[SYSTEM CONTEXT]…Your CHATCODE for this request is: <kode>…`) — ±300 karakter, stabil sempurna, dan **tidak pernah** memuat BEGIN (by design). Begitu prompt terkirim, teks itu "berubah dari pre_send" → dianggap response baru → diterima saat model masih berpikir → parse gagal. `len=304` cocok dengan panjang wrapper.
> 2. **Regex header terlalu kaku.** `_THOUGHT_LIVE_JS`/`HEADER_RE` menuntut teks persis `Thinking` (hanya suffix titik). Header live seperti `Thinking…` (elipsis), ada timer, atau kata tambahan tidak match → sinyal "masih thinking" tak pernah menyala dan panel tidak di-tag → reasoning yang berhenti berubah saat jeda pikir bisa diterima.

### 1. Guard anti-echo prompt (`scrapers/tool_protocol.py` + `base_deepseek.py`)
- `tp.looks_like_prompt_echo(text, chatcode)` baru: teks memuat frasa `CHATCODE for this request is: <kode>` TANPA BEGIN dengan kode itu → pasti echo prompt / reasoning yang mengutipnya, bukan jawaban.
- `wait_for_response()`: Fase-1 tidak menganggap echo sebagai "response baru" (diperlakukan seperti pre-send), dan gerbang penerimaan stabilitas juga menolaknya (sabuk pengaman).

### 2. Header toleran + jangkar struktural (`base_deepseek.py`)
- `_THOUGHT_LIVE_JS` & `_COLLAPSE_THOUGHT_JS`: pola teks diganti prefix-match (`^Thinking\b` / `^Thought for \d+`, ≤ 40 char — `Thinking`, `Thinking...`, `Thinking…` semua cocok) dengan **jangkar ikon**: div/barisnya harus memuat `[class*="ds-icon"]`, sehingga paragraf jawaban yang kebetulan diawali kata "Thinking" tidak false-positive (yang akan memblokir penerimaan selamanya). Tagging panel kini mensyaratkan ikon (perlindungan over-tag saat matching diperluas); klik tetap maksimal sekali per panel.

### 3. Diagnosis lebih mudah
- Warning `FRAME_MISSING` di `parse_model_output` kini menyertakan preview 120 karakter pertama balasan (`head=…`) — live test berikutnya langsung terlihat apakah yang terbaca itu reasoning, echo prompt, atau jawaban tanpa frame.

### 4. Test & Dokumentasi
- `tests/test_stream_scrapers.py`: +4 cek (unit detector echo: frasa+kode tanpa BEGIN, reply ber-frame bukan echo, teks biasa/kode None bukan echo; loop wait: echo 3× poll tidak pernah diterima/ter-emisi, jawaban asli yang dikembalikan). Total 36 cek; suite offline lengkap PASS.

---


## [Unreleased] — Streaming DeepSeek v3.3: Fallback Raw saat Model Mengabaikan CHATCODE Framing

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test v3.2: hasil yang dihasilkan model **tidak menyesuaikan CHATCODE framing** — balasan yang sehat ternyata tidak membawa penanda `@@PAF-BEGIN/DONE@@` (kepatuhan framing memang belum pernah terverifikasi di situs live; catatan itu sudah ada di commit CHATCODE). Konsekuensinya di stream: gate menahan semuanya → tidak ada delta sama sekali. Solusi: jangan pertaruhkan fitur stream pada kepatuhan prompt — frame tetap gerbang utama, tetapi ada **fallback raw** yang aman.

### 1. State machine emisi (`scrapers/base_deepseek.py`, `_stream_forward`)
- Mode `"frame"` → `"raw"`, satu arah per generasi. Frame terbuka → body frame yang diteruskan (seperti sebelumnya). Frame-less berturut-turut → latch ke raw hanya bila SEMUA penjaga terpenuhi: header "Thinking" live SUDAH turun (teks yang terbaca adalah jawaban, bukan reasoning), teks > 40 karakter (bukan blip noise), teks ≠ snapshot pre-send (bukan re-read jawaban giliran lama), dan kondisi itu bertahan 2 poll berturut-turut (±1 detik).
- Mode raw meneruskan seluruh snapshot dengan **`strip_frame_markers()`** (penanda `@@PAF-*@@` kode apa pun tidak pernah bocor ke klien) dan tetap menolak meneruskan selama header "Thinking" live (melindungi dari thinking yang menyusul).
- Hasil scrape kini memuat `stream_unframed: true` bila fallback dipakai; log warning "reply is not CHATCODE-framed … falling back to raw answer streaming" di worker = sinyal kepatuhan framing yang bisa diukur.
- Berlaku juga saat protokol mati (`chatcode` None) — dulu diam total, kini tetap men-stream jawaban raw.

### 2. Observabilitas (gateway)
- `x_meta.stream_unframed` di chunk akhir SSE menandai request yang fallback (kepatuhan framing per-request terlihat dari sisi klien).

### 3. Test & Dokumentasi
- `tests/test_stream_scrapers.py`: B7 dipecah — blip pendek tetap tidak latch (guard noise); **B7b** baru: jawaban unframed panjang → raw fallback meng-stream-nya (penanda ter-strip, `stream_unframed=True`); **B7c** baru: teks frame-less saat Thinking live tidak boleh latch, jawaban baru di-stream setelah thinking selesai; B8 diperbarui (chatcode None → fallback raw, bukan diam). B2b memakai sinyal thought_live agar thinking-nya tidak latch. Total 32 cek, suite offline lengkap PASS.
- `API_USAGE.md` §11.1: bullet OUTPUT-ONLY ditulis ulang (gerbang + fallback + `stream_unframed`). Perlu live test ulang untuk mengukur berapa sering fallback menyala.

---


## [Unreleased] — Streaming DeepSeek v3.2: Klik Toggle Thinking Maksimal Sekali per Panel

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test v3.1: scraper **mengklik tombol Think terus-menerus** — toggle adalah saklar, dan heuristik "panel terbuka" (`panel.children` selain baris header punya tinggi) salah baca container pada DOM nyata (panel yang ditebak ternyata memuat elemen lain yang selalu terlihat), sehingga dianggap selalu terbuka dan diklik lagi tiap 0.5 detik → panel berkedip buka-tutup tanpa henti.

### Perbaikan
- `_COLLAPSE_THOUGHT_JS`: klik toggle **maksimal sekali per panel**, ditandai `data-paf-thought-clicked` di DOM (ditulis SEBELUM klik agar tidak pernah dobel dari race). Panel thinking baru di giliran berikutnya adalah elemen baru → dapat satu klik sendiri. Klik yang meleset hanya menyisakan panel terbuka — tidak berbahaya, karena gerbang CHATCODE + cek header "Thinking" live sudah menjaga reasoning keluar dari stream dan penerimaan prematur.
- Tagging `data-paf-thought` (untuk deteksi inside-thought) TETAP dijalankan tiap poll — idempotent dan selalu aman.
- Log info saat klik berhasil (`collapsed N thinking panel(s)`) untuk memudahkan verifikasi live.
- `API_USAGE.md` §11.1 diperbarui. Suite offline tetap PASS; perlu live test ulang.

---


## [Unreleased] — Streaming DeepSeek v3.1: Jangan Terima "Stabilitas" Saat Masih Thinking (+ fix klausa tag)

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test v3 memunculkan log `CHATCODE <kode>: BEGIN marker not found in reply (len=466) — falling back to unframed parsing` **padahal respons masih dalam Think**. Dua akar masalah: (1) gerbang stabilitas `wait_for_response` menerima teks reasoning sebagai jawaban final — teks reasoning "stabil" sesaat saat jeda pikir, dan selector stop-button (sudah lama bertanda UNVERIFIED di config) tidak menahan, sehingga parse berjalan di tengah thinking; (2) bug klausa tag v3 pada `_IS_INSIDE_THOUGHT_JS`: untuk elemen reasoning, first-child yang cocok adalah baris header yang berada *di dalam* panel bertag — shortcut "first bertag → sibling" ikut menandai reasoning sebagai bukan-thought sehingga terbaca sebagai respons.

### 1. Header "Thinking" live = sinyal keras (`scrapers/base_deepseek.py`)
- `_thought_in_progress()` baru (JS `_THOUGHT_LIVE_JS`): true selama masih ada header div ber-teks `Thinking` (± elipsis) — header itu baru berubah jadi `Thought for {n} seconds` saat thinking selesai, jadi ini bukti self-contained bahwa elemen jawaban **belum mulai** dirender.
- Gerbang stabilitas `wait_for_response`: saat teks "stabil", bila `thought_live` maka **tidak menerima** — teks yang stabil adalah reasoning, bukan jawaban. Berlaku juga terhadap escape `stall_grace` (grace hanya untuk sinyal stop-button yang tak andal; sinyal header ini andal).
- Cabang deadline: `thought_live` juga dihitung sebagai "masih generating" sehingga thinking panjang tetap mendapat perpanjangan deadline. Berlaku untuk mode stream **dan** non-stream (bug laten yang sama).

### 2. Fix klausa tag → containment-based
- `_IS_INSIDE_THOUGHT_JS`: bila first-child yang cocok pola header berada dalam `[data-paf-thought]`, keputusan kini via **containment** pada panel bertag: `tagged.contains(el)` → true (isi panel = reasoning) / false (sibling = jawaban). Shortcut lama ("first bertag → pasti sibling") salah untuk reasoning karena baris header-nya juga di dalam panel.

### 3. Tagging panel dipisah dari ikon
- `_COLLAPSE_THOUGHT_JS`: panel tetap ditandai `data-paf-thought` meski tombol toggle tidak ketemu (tagging penting untuk deteksi inside-thought; klik hanya opsional).

### 4. Test & Dokumentasi
- `tests/test_stream_scrapers.py`: cek baru "mid-think 'stable' reasoning NOT accepted as the answer" (stabilitas saat `thought_live` ditolak, diterima setelah header flip dan jawaban stabil); total 29 cek. Suite offline lengkap PASS. Tetap perlu live test ulang.

---


## [Unreleased] — Streaming DeepSeek v3: Tutup Panel "Thinking" (klik toggle) + Pembacaan Realtime yang Benar

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test v2: stream berhenti total — `@@PAF-BEGIN@@` tidak pernah tertangkap. Ground truth DOM dari live test: DeepSeek merender reasoning dalam panel collapsible yang **terbuka secara default** (header `Thinking` saat aktif → `Thought for {n} seconds` saat selesai, dengan tombol toggle `ds-icon` di baris header). Dua akibat: (1) selama panel terbuka, teks reasoning mendominasi innerText; (2) jebakan struktural pada `_IS_INSIDE_THOUGHT_JS` — heuristik "ancestor punya first-child ber-teks header" aman saat panel terbuka (textContent panel panjang > 60 char), tetapi saat panel **tertutup** textContent-nya menyusut jadi persis teks header (≤ 60 char) sehingga **jawaban (sibling panel) ikut dianggap inside-thought dan ter-skip selamanya** → tidak ada yang terbaca → response "berhenti".

### 1. Tutup panel Thinking otomatis (`scrapers/base_deepseek.py`)
- `_collapse_thinking_panels()` baru (JS `_COLLAPSE_THOUGHT_JS`): cari header via **teks** (`Thinking` / `Thought for {n} seconds` — nama class hashed seperti `_245c867`/`_3d79d66` berotasi antar deploy, jadi tidak dipakai), temukan toggle `[class*="ds-icon"]`, **klik hanya saat body panel benar-benar terbuka** (sekali per toggle, dedupe via Map), dan tandai container panel dengan `data-paf-thought`.
- Dipanggil di `wait_for_response()` **setiap poll, hanya saat mode stream** (`on_text` aktif) — jalur non-stream tidak tersentuh. Efek: teks reasoning hilang dari innerText, sehingga pembacaan "hal terbaru pada response" selalu menunjuk ke jawaban yang sedang dirender secara realtime.

### 2. Deteksi inside-thought jadi tag-aware
- `_IS_INSIDE_THOUGHT_JS`: (1) elemen di dalam `[data-paf-thought]` → pasti thought; (2) jika first-child yang cocok dengan pola header ternyata panel bertag → elemen yang diuji adalah **sibling** (jawaban) → tidak dianggap thought. Ini menutup jebakan panel-tertutup di atas tanpa mengubah perilaku untuk panel terbuka yang belum bertag (fallback tekstual lama tetap jalan).
- `_is_generating()` cek #3 kini juga mengenali header `Thinking` (bukan hanya `Thought for \d+`), sehingga perpanjangan deadline saat thinking panjang tetap bekerja bahkan jika selector stop-button usang.

### 3. Test & Dokumentasi
- `tests/test_stream_scrapers.py`: asersi baru — collapse dipanggil tiap poll saat streaming dan **tidak pernah** dipanggil tanpa `on_text`; total 28 cek.
- `API_USAGE.md` §11.1 diperbarui (panel Thinking ditutup otomatis di mode stream).
- Suite offline lengkap PASS. **Perlu live test ulang** dengan akun nyata (mekanisme klik + struktur DOM divatas dari laporan live test, belum bisa diverifikasi offline).

---


## [Unreleased] — Streaming DeepSeek v2: Hanya OUTPUT via Gerbang Frame CHATCODE

> **Perbaikan eksperimental (branch `stream-experimental`).** Live test stream v1 berjalan mulus, tetapi yang terkirim adalah **proses noise** — teks thinking/reasoning dan label UI yang dirender DeepSeek sebelum elemen jawaban ada — bukan jawabannya. Akar masalah: `wait_for_response()` mem-forward snapshot DOM mentah, dan deteksi blok "Thought for N seconds" baru bekerja SETELAH header itu dirender (header justru muncul saat thinking selesai), jadi selama thinking aktif teks reasoning lolos sebagai "jawaban terakhir". Fix: emisi stream digerbangi pada **frame CHATCODE** (fitur output-framing per-request dari commit `CHATCODE framing`) — delta hanya berisi teks setelah `@@PAF-BEGIN:<kode>@@` dengan kode yang sedang aktif.

### 1. Gerbang output-only (`scrapers/tool_protocol.py`)
- `partial_framed_body(raw, chatcode)` baru — varian streaming `extract_framed()`: mengembalikan body parsial setelah BEGIN dengan kode aktif (dipotong di DONE bila sudah ada), atau **None** bila frame belum dibuka. **Tidak pernah fallback ke teks mentah** (snapshot tanpa BEGIN = thinking/noise, bukan output). Strip-nya identik dengan `extract_framed`, sehingga body terakhir yang ter-stream byte-identik dengan jawaban final ter-parse.

### 2. Scraper (`scrapers/base_deepseek.py`)
- `_stream_forward` (callback `on_text` di `wait_for_response`) kini menjalankan snapshot melalui `partial_framed_body` dengan `self._chatcode` aktif: teks sebelum BEGIN tidak pernah diteruskan; body yang tidak berubah (churn whitespace / body identik) di-dedupe sebelum dikirim ke worker; `stream_emitted` hanya True bila benar-benar ada body yang diteruskan.
- Konsekuensi yang disengaja: bila protokol mati (`_chatcode` None) atau model mengabaikan framing (tidak ada BEGIN), **tidak ada delta yang dikirim** — lebih diam daripada salah kirim noise; chunk akhir `x_meta.full_text` tetap membawa jawaban utuh (fallback parse tetap jalan).

### 3. Test & Dokumentasi
- `tests/test_stream_scrapers.py` ditulis ulang: +8 cek unit `partial_framed_body` (noise/kode asing/tanpa kode/frame terbuka & tertutup/strip identik), kasus baru B2b (snapshot thinking tidak pernah diteruskan, hanya body frame), B2c (dedupe churn), B7 (reply tanpa frame → tanpa delta, final tetap ok), B8 (chatcode None → tanpa delta). Total 26 cek.
- `API_USAGE.md` §11.1 dan `README.md` diperbarui (kebijakan output-only).
- Seluruh suite offline PASS (`test_stream_e2e`, `test_stream_scrapers`, `test_tool_protocol`, `test_protocol_scrapers`, `test_vps_smoke`, `test_grok_tools_e2e`, `test_stuck_signal_regression`).

---

## [Unreleased] — EXPERIMENTAL: Output Streaming untuk Backend DeepSeek (`stream: true`, SSE)

> **Fitur eksperimental di branch `stream-experimental`.** Sebelumnya `stream: true` ditolak mentah-mentah oleh worker ("Streaming is not supported"). Kenyataannya, UI DeepSeek me-render jawaban token-per-token di DOM dan loop polling `wait_for_response()` **sudah** membaca snapshot parsial itu setiap 0.5 detik — hanya lalu dibuang karena yang dipakai teks final yang stabil. Update ini memberi jalur keluar pada snapshot tersebut: worker → VPS → klien sebagai SSE `chat.completion.chunk` standar OpenAI. Opt-in ganda: `--enable-stream` di worker + `stream: true` per request.

### 1. Scraper (`scrapers/base_deepseek.py`)
- `wait_for_response(..., on_text=cb)` — callback async opsional yang menerima snapshot **teks penuh** saat pertama kali response terdeteksi dan pada setiap perubahan (perulangan teks identik tidak dikirim ulang). Loop deteksi stabilitas/stall/deadline-extension **tidak diubah sama sekali**; kegagalan callback ditelan agar observasi tidak pernah merusak deteksi jawaban final.
- `scrape(..., stream_on_text=cb)` — snapshot hanya diteruskan untuk **generasi pertama attempt pertama**; wait corrective-retry sengaja tidak diberi callback.
- **Taint semantics**: `_taint_stream(reason)` dipanggil di semua titik retry (rate limit, corrective retry, corrective gagal, exception handler). Jika retry terjadi **setelah** delta sempat terkirim, hasil membawa `stream_tainted: true`; jika belum ada delta terkirim, stream cukup dimatikan diam-diam (retry berjalan normal non-stream). State di-reset di setiap panggilan `scrape()` (scraper dipakai ulang pool).
- Hasil sukses kini memuat `stream_emitted` / `stream_tainted` (hanya bila `stream_on_text` diberikan).

### 2. Worker (`public_deepseek.py`)
- Flag `--enable-stream` (default mati). Saat aktif, worker mendaftar dengan `"features": ["stream"]`.
- `stream:true` tanpa flag → 400 "not enabled"; `stream:true` + `tools` → 400 (keputusan desain: blok `@@PAF-CALL` baru berguna setelah di-parse, mentahnya tidak ada gunanya di-stream dan `content` harus `null` untuk `tool_calls`).
- Saat streaming, partial snapshot dikirim sebagai pesan WS `{"type":"stream_delta","task_id","seq","text":<penuh>}` di koneksi yang sama dengan hasil final (ordering terjaga). **Teks penuh + seq**, bukan delta — VPS yang menghitung selisihnya (mudah di-debug, tahan duplikasi).

### 3. Gateway (`PublicForward/ForVPS/vps_server.py`)
- Pre-check sebelum dispatch (semuanya 400 bersih, tidak ada task terkirim): `stream` + backend non-deepseek, `stream` + `tools`, dan "tidak ada worker deepseek dengan fitur stream".
- `WorkerManager`: registry `_stream_queues` per task; `dispatch(..., stream_queue=..., require_feature="stream")` — mode stream mengembalikan **future** tanpa menunggu hasil (cleanup via `add_done_callback`, bukan `finally`, agar queue tidak ter-unregister sebelum delta masuk); `_pick_worker` memfilter `features`; tipe pesan baru `stream_delta` ditangani di loop `/ws/worker`.
- Cabang SSE di `chat_completions` → `StreamingResponse` (`text/event-stream`, header `X-Session-ID` + `X-Backend`; `X-Accel-Buffering: no`). Generator `_deepseek_stream_sse`:
  - Chunk role dulu, lalu `delta.content` per snapshot, chunk akhir `finish_reason:"stop"` + `usage` + `x_meta` (termasuk `full_text`), lalu `data: [DONE]`.
  - **Kebijakan non-append (markdown re-render)**: snapshot yang tidak memperpanjang teks yang sudah terkirim di-suppress; chunk akhir membawa `x_meta.full_text` otoritatif.
  - **Kebijakan kegagalan mid-stream**: error worker, timeout, atau `stream_tainted` (retry/rotasi setelah delta terkirim) → stream diakhiri dengan event `data: {"error":...}` dan **tanpa** `[DONE]`.
  - Timeout keseluruhan tetap `REQUEST_TIMEOUT`.

### 4. Kompatibilitas
- Semua perubahan aditif: VPS lama mengabaikan `features` dan `stream_delta`; worker baru + VPS lama tetap non-stream; jalur non-stream tidak berubah (tetap satu JSON utuh).
- Perilaku klien qwen berubah sedikit: `stream:true` untuk model qwen kini ditolak 400 di gateway dengan pesan jelas (sebelumnya diteruskan ke worker lalu gagal 502 `unsupported_feature`).

### 5. Test & Dokumentasi
- `tests/test_stream_e2e.py` (gateway + fake worker): urutan chunk happy path, suppress non-append, 400 untuk tools+stream dan qwen+stream, error event tanpa `[DONE]` (worker error setelah delta & stream_tainted), regresi non-stream.
- `tests/test_stream_scrapers.py` (stub browser): emisi `on_text` di loop `wait_for_response` asli, plumbing `scrape()`, taint pada corrective/rate-limit, reset antar-panggilan, diam saat retry sebelum emisi.
- `API_USAGE.md` §1/§5.1/§11.1 dan `README.md` diperbarui.
- **Catatan**: test membuktikan plumbing end-to-end, bukan bagaimana situs live me-render markdown parsial pada `innerText` — frekuensi kejadian non-append perlu diukur manual dengan akun nyata (itu alasan utama status eksperimental).

---

## [Unreleased] — Semua Backend: Output Framing per-Request (CHATCODE) untuk Mengurangi Noise Scraping

> **Perubahan lintas backend (DeepSeek, Qwen, Grok).** Teks yang di-scrape dari halaman berisi noise UI (label model, "Copy", "Thinking...", "Worked for 5s", footer sumber, giliran sebelumnya). Kini model diwajibkan membungkus **seluruh** balasannya dengan penanda berkode unik per request, dan scraper hanya mengambil teks di antara penanda itu.

### 1. Format
```
@@PAF-BEGIN:<kode>@@
...jawaban biasa atau blok @@PAF-CALL ... @@PAF-END@@...
@@PAF-DONE:<kode>@@
```
- `<kode>` = 8 hex acak (`tool_protocol.new_chatcode()`), dibuat **baru di setiap pengiriman** (prompt baru, hasil-tool, dan prompt korektif).
- Memakai `@@…@@` (bukan `###`): UI ketiga situs merender markdown, sehingga `###` di awal baris menjadi heading dan teksnya hilang dari `innerText`. Nama `BEGIN`/`DONE` sengaja berbeda dari `@@PAF-END@@` milik blok pemanggilan fungsi.
- Aturan framing ditanam default di `[SYSTEM CONTEXT]` oleh `build_system_context()`, satu tempat untuk semua backend. Prompt hanya memuat placeholder `<CHATCODE>` dan kodenya, **tidak pernah** penanda live yang utuh, sehingga echo bubble user di DOM tidak bisa tertangkap sebagai balasan model.

### 2. Ekstraksi (`scrapers/tool_protocol.py`)
- `extract_framed()` mengambil `BEGIN` **terakhir** dengan kode yang cocok sampai `DONE` berikutnya; kode dari giliran lama diabaikan.
- `parse_model_output(..., chatcode=)` mem-parse hanya isi frame; hasilnya diberi `frame` = `ok` / `unterminated` / `missing`.
- Fallback aman: tanpa `BEGIN` → jalur lama + warning log; `BEGIN` tanpa `DONE` (terpotong) → teks setelah `BEGIN` + warning. Tidak pernah menjadi error.
- Penanda **tidak pernah** sampai ke klien (`strip_frame_markers()` membuang semua penanda, apa pun kodenya). Streaming memang tidak didukung semua backend (`stream: true` ditolak), sehingga cukup satu gerbang ini.

### 3. Scraper
- `rotate_chatcode(self)` dipanggil sebelum setiap pengiriman; parser membaca `self._chatcode`, jadi retry/korektif tidak pernah dicocokkan dengan kode basi.
- **Grok:** bila balasan ter-frame, teks akhir diambil dari isi frame. Pembersih DOM (`_extract_response`) hanya dipakai sebagai fallback — sebelumnya ia menambah noise sekaligus merusak baris kosong dan indentasi.
- **DeepSeek:** bila `JSON_API_CONFIG["enabled"]` mati, tidak ada framing (jalur plain-text lama tidak berubah).

### 4. Tes
- `tests/test_tool_protocol.py`: +22 cek (noise, kode lama, BEGIN terakhir, terpotong, tanpa penanda, kode salah, frame kosong, tool call di dalam frame, envelope legacy).
- `tests/test_protocol_scrapers.py`: stub `QwenScraper` yang usang diperbaiki (`_system_prompt`), stub `send_prompt` kini meniru pembungkusan asli, dan ditambah 17 cek end-to-end loop `scrape()` asli untuk ketiga backend (balasan ter-frame, tool call, korektif dengan kode baru, tool-result, fallback).
- **Belum diverifikasi di situs live** — apakah tiap model patuh pada framing perlu dicek manual (lihat `tests/_manual_*`).

---

## [Unreleased] — Semua Backend: System Prompt Terpadu (DeepSeek, Qwen, Grok)

> **Perubahan lintas backend.** Sebelumnya pesan `system` dari klien hanya bekerja di **DeepSeek**. Di **Grok** pesan itu dibuang oleh gateway (tidak pernah dikirim ke worker), dan di **Qwen** worker mengisi `payload["system_prompt"]` tetapi tidak ada kode yang membacanya, sehingga hilang sebelum sampai ke prompt. Kini ketiga backend memperlakukan system prompt dengan cara yang sama.

### 1. Gateway (`PublicForward/ForVPS/vps_server.py`)
- **Fungsi baru `_extract_system_prompt()`** — satu sumber kebenaran untuk semua backend. Mengumpulkan semua pesan `system` **dan `developer`** (nama role baru di OpenAI) menjadi satu string (digabung `\n\n`), mendukung `content` berupa string maupun list bagian `{type:"text"}`, dan mengabaikan pesan kosong. Hasilnya `None` bila klien tidak mengirim system message.
- `system_prompt` kini ikut di `task_fields` untuk **deepseek, grok, dan qwen** (sebelumnya hanya deepseek, dan hanya untuk `content` bertipe string).

### 2. Grok
- `public_grok.py` → `browser_pool_grok.run_task(system_prompt=…)` → `GrokScraper.scrape(system_prompt=…)` → `tool_protocol` (`client_system`). Berlaku di turn baru, continue, dan turn hasil-tool (Turn 2), termasuk saat rotasi akun + retry.

### 3. Qwen
- `QwenScraper._system_prompt` baru; `_build_wrapped_prompt()` dan `_build_tool_result_prompt()` meneruskannya sebagai `client_system`.
- `public_qwen.py`: `process()` membaca `payload["system_prompt"]` dan menyetel `scraper._system_prompt` **di setiap request, termasuk `None`** — scraper dipakai ulang oleh pool, jadi tanpa reset system prompt request lama bisa bocor ke request berikutnya.
- Ekstraksi di worker kini hanya fallback bila gateway lama belum mengirim `system_prompt`; role `developer` dan content list ikut ditangani.

### 4. DeepSeek
- Perilaku tidak berubah, hanya kini memakai fungsi ekstraksi bersama (jadi `developer` role dan content list juga didukung).

### 5. Catatan perilaku
- System prompt dikirim di blok `[SYSTEM CONTEXT]` pada **setiap turn** (UI chat tidak punya role system sungguhan) dan **tidak disimpan di session** — klien perlu mengirimnya ulang tiap request, seperti klien OpenAI pada umumnya.
- Tugas media Qwen (`create_image`, `create_video`, `web_search`) tidak dibungkus `[SYSTEM CONTEXT]`, sehingga tidak terpengaruh.

### 6. Dokumentasi
- `API_USAGE.md` §5.1, §5.2, dan §9 diperbarui (sebelumnya menyatakan system message "DeepSeek only").

---

## [Unreleased] — Semua Backend: Protokol API Mode Bersama (Teks Biasa + Tool Calling Berbasis Penanda) dan Tool Calling untuk Grok

> **Perubahan lintas backend (DeepSeek, Qwen, Grok).** Sebelumnya setiap balasan dipaksa berbentuk envelope JSON sehingga model harus meng-escape sendiri tanda kutip, backslash, newline, dan kode di dalam string JSON — sumber utama error "invalid JSON", retry, dan rotasi akun. Kini jawaban biasa berupa **teks polos**, dan hanya pemanggilan fungsi yang memakai blok bertanda berisi nilai argumen **mentah**; JSON `tool_calls` disusun oleh kode (`json.dumps`), bukan oleh model. System prompt `[SYSTEM CONTEXT]` / `[USER REQUEST]` tetap dipertahankan.

### 1. Modul Protokol Bersama (`scrapers/tool_protocol.py`)
- **File baru** tanpa dependensi browser/jaringan, dipakai ketiga backend: pembangun prompt (`build_wrapped_prompt`, `build_tool_result_prompt`, `build_corrective_prompt`) dan parser balasan (`parse_model_output`).
- **Chat biasa (tanpa `tools`):** jawaban = teks polos, tidak ada yang divalidasi.
- **Dengan `tools`:** jawaban teks polos, kecuali model perlu memanggil fungsi → blok:
  `@@PAF-CALL:<fungsi>@@` / `@@PAF-ARG:<argumen>@@ <nilai mentah>` / `@@PAF-END@@`. Penanda sengaja tanpa `<`/`>` dan tanpa karakter khusus markdown agar selamat dari renderer; model diminta membungkus blok dalam fenced code block 4-backtick agar baris baru dan indentasi tetap utuh pada `innerText`. Parser tetap bekerja dengan/tanpa fence dan mengabaikan teks UI sebelum blok.
- **Konversi tipe** nilai argumen mengikuti skema `parameters` (`integer`, `number`, `boolean`, `object`, `array`). `function.arguments` kini **selalu string JSON** (sesuai spesifikasi OpenAI dan `API_USAGE.md`); sebelumnya Qwen mengembalikan objek.
- **Self-healing:** blok pemanggilan yang rusak (tidak ditutup, nama fungsi tidak dikenal, dst.) atau balasan kosong memicu satu pesan koreksi singkat di session yang sama (maks. 2×). Jawaban teks biasa tidak pernah di-retry karena format.
- **Kompatibel mundur:** envelope JSON lama (`{"status":"success"|"tool_calls",...}`) tetap dipahami, sehingga session yang dimulai sebelum update ini tetap berjalan. Envelope sukses yang rusak tidak pernah menggagalkan chat biasa; hanya `tool_calls` lama yang rusak yang di-retry.
- `[SYSTEM CONTEXT]` dikirim pada **setiap** turn (singkat untuk chat biasa) karena klien boleh mengganti `tools` antar request dan session lama masih berisi instruksi JSON.

### 2. Qwen
- `_build_wrapped_prompt()` / `_build_tool_result_prompt()` memakai modul bersama (kata "tool" tetap dihindari dalam instruksi; dipakai "function").
- `base_qwen.scrape()`: validasi JSON diganti `parse_model_output()`; logika retry/rotasi akun/hard-cap tetap, namun pemicunya kini hanya blok pemanggilan rusak atau balasan kosong.
- `scrape_with_tool_result()` kini punya putaran koreksi (sebelumnya langsung gagal).

### 3. DeepSeek
- Wrapper dan hasil-tool memakai modul bersama; client `system` message tetap ditambahkan ke `[SYSTEM CONTEXT]`.
- **Perbaikan state:** `send_prompt()` tidak lagi menimpa `_tools`/`_max_tokens`/`_system_prompt` pada pengiriman verbatim (koreksi / hasil tool), sehingga validasi nama fungsi dan konversi tipe tetap berlaku.
- `tools`/`max_tokens`/`system_prompt` kini diteruskan sampai Turn 2 (worker → pool → `scrape_with_tool_result`).
- `JSON_API_CONFIG`: kunci `chat_system_instruction` dihapus (sumber instruksi tunggal kini `tool_protocol.py`); `enabled` dan `max_corrective_retries` dipertahankan.

### 4. Grok — Tool Calling Kini Didukung
- `GrokScraper.scrape()` menerima `tools`, `max_tokens`, `tool_messages`, `next_user_msg`; prompt dibungkus dan balasan di-parse dengan modul bersama.
- Pemanggilan fungsi di-parse dari **teks mentah**; pembersih UI (`_clean_response_text`) sengaja tidak dijalankan pada tool call karena regex-nya membuang baris kosong dan memangkas indentasi sehingga merusak nilai argumen. Jawaban biasa tetap melalui pembersih seperti sebelumnya.
- Gateway (`vps_server.py`) kini meneruskan `tools` dan `tool_messages` ke worker Grok; `browser_pool_grok.run_task()` dan `public_grok.py` meneruskannya ke scraper.

### 5. Dokumentasi & Test
- `API_USAGE.md` §9 ditulis ulang (protokol baru, Grok didukung), plus perbaikan §13.5, §14, §15; `README.md` dan `GROK_BACKEND.md` diperbarui.
- Test offline baru: `tests/test_tool_protocol.py` (parser/builder), `tests/test_protocol_scrapers.py` (loop `scrape()` asli ketiga backend dengan browser stub), `tests/test_grok_tools_e2e.py` (gateway + worker palsu, dua giliran).
- **Catatan:** test ini membuktikan plumbing di sekitar balasan model, bukan bagaimana situs live (chat.qwen.ai, chat.deepseek.com, grok.com) merender blok bertanda pada `innerText`. Perlu verifikasi manual dengan akun nyata. `tests/test_http_e2e.py` bawaan sudah usang terhadap autentikasi API token (gagal juga pada kode sebelum perubahan ini) dan tidak diubah.

---

## [Unreleased] — Qwen Backend: Diagnostik Prompt Page (I/O), Pembaruan Selector UI qwen-chat-v2, dan Optimasi Latency CONTINUE

> **Pembaruan Backend Qwen.** NEW! Penambahan tool diagnostik mandiri untuk halaman percakapan prompt (`debug_prompt_qwen.py`) yang menguji alur I/O secara end-to-end pada **NEW mode** dan **CONTINUE mode**, identifikasi migrasi antarmuka Qwen Web ke sistem komponen `qwen-chat-v2`, pembaruan selector I/O, serta optimasi latensi respon mode CONTINUE yang memulihkan kecepatan respon dari ~8 detik kembali ke ~5 detik.

### 1. Tool Diagnostik Mandiri Prompt Page (`debug_prompt_qwen.py`)
- **Script Diagnostik Menyeluruh:** File baru [`debug_prompt_qwen.py`](./debug_prompt_qwen.py) untuk menguji, membedah, dan memvalidasi seluruh elemen DOM dan selector I/O pada halaman percakapan Qwen (`chat.qwen.ai`).
  - Mendukung pengujian **NEW mode** (buka chat baru, fill prompt, send, tangkap turn 1) dan **CONTINUE mode** (kirim prompt ke-2 di thread yang sama, verifikasi stabilitas respon turn 2).
  - Mode **No-Headless** (default) dan **Headless** (`--headless`).
  - Opsi `--auto-login`: otomatis login jika sesi akun belum aktif sebelum memulai pengetesan prompt.
  - Mode interaktif (`--interactive`) untuk inspeksi manual via DevTools (F12).
  - Perekaman artefak: screenshot `.png` dan HTML dump `.html` di setiap tahap ke `debug/`.
  - Generator summary otomatis ke `debug/summary_prompt/` ([`summary.md`](./debug/summary_prompt/summary.md) & [`summary.json`](./debug/summary_prompt/summary.json)).

### 2. Pembaruan Selector DOM UI Qwen Web (`qwen-chat-v2`)
- **Think Mode Dropdown (`qwen-chat-v2`):**
  - Menggantikan selector usang `.qwen-select-thinking-label` dengan komponen generasi baru Qwen:
    - Container/Trigger: `.qwen-thinking-selector`, `.qwen-chat-v2-dropdown-menu-trigger`
    - Selected Label: `.qwen-chat-v2-dropdown-menu-select-label`
    - Options: `.qwen-chat-v2-dropdown-menu li`, `.qwen-chat-v2-dropdown-menu-item`, `[role="option"]`
  - Diperbarui pada [`config/qwen.py`](./config/qwen.py) dan [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py).
- **Send Button & Status Disabled:**
  - Menambahkan selector spesifik tombol kirim Qwen: `button.send-button:not(.disabled)` dan `button[aria-label="Send"]:not([disabled])`.
- **Input Textarea:**
  - Menambahkan class spesifik `textarea.message-input-textarea` sebagai prioritas pertama sebelum fallback `textarea[placeholder]`.
- **Response Container & Markdown:**
  - Memprioritaskan `.qwen-markdown` dan `.chat-response-message` pada strategi ekstraksi teks respon.
- **Tombol New Chat:**
  - Menyesuaikan selector tombol chat baru dengan elemen DOM terkini: `[aria-label="New Chat"]`, `div.sidebar-entry-fixed-list-content`.

### 3. Optimasi Latency Respon Mode CONTINUE (Pemulihan dari ~8s ke ~5s)
- **Eliminasi Pencarian Think-Mode di Mode CONTINUE:**
  - UI Qwen Web menyembunyikan trigger think-mode pada halaman percakapan yang sedang berjalan (`/c/<id>`).
  - Memperbaiki kondisi guard di `send_prompt()` ([`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py)) agar hanya mengeksekusi `_set_think_mode()` pada mode `new` (`mode != "continue"` dan `not self._think_mode_applied`).
- **Penghapusan Pemanggilan Diagnostik Otomatis di Jalur Produksi:**
  - Menghapus pemanggilan otomatis `self.debug_think_mode_selectors()` saat trigger think-mode tidak ditemukan di `send_prompt()`. Ini mencegah eksekusi 2x full document `createTreeWalker` via Playwright CDP yang sebelumnya membuang 2.5–3.5 detik per pesan.
  - Method `debug_think_mode_selectors()` tetap dipertahankan di class scraper dan dapat dipanggil secara manual saat dibutuhkan.
- **Pencegahan Reset Flag `_think_mode_applied` pada Mode CONTINUE di Worker:**
  - Pada [`public_qwen.py`](./public_qwen.py), flag `_think_mode_applied` kini hanya di-reset ke `False` jika `mode != "continue"`.
- **Prioritaskan Selector Input Cepat di Worker Readiness Check:**
  - Menambahkan `textarea.message-input-textarea` pada posisi teratas `_INPUT_SELECTORS` di [`public_qwen.py`](./public_qwen.py).

### 4. Deteksi Login Otomatis, Pre-Flight Auth Guard & Penanganan Modal Umur
- **Pre-Flight Authentication Check Sebelum Pengiriman Prompt:**
  - Menambahkan pengecekan `if await self.is_session_expired():` pada `scrape()` di [`scrapers/base_qwen.py`](./scrapers/base_qwen.py) sebelum prompt dikirim. Jika akun belum login / sesi habis, scraper otomatis menjalankan `ensure_authenticated()` atau merotasi ke akun lain.
- **Deteksi Unauthenticated Komprehensif (< 10ms):**
  - Memperbarui `_is_unauthenticated()` pada [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py) dengan evaluasi JS cepat memeriksa container auth header (`.auth-buttons`, `.header-right-auth-button`), keberadaan tombol "Log in" / "Sign up", dan URL `/auth`.
- **Dukungan Form Login 2-Tahap (Password Switch):**
  - Pada `login()` di [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py), ditambahkan klik otomatis pada tombol switch `button:has-text("Log in with a password")` agar field password dimunculkan sebelum pengisian form.
- **Auto-Dismiss Modal Verifikasi Umur ("Confirm your age to continue"):**
  - Menambahkan helper `_dismiss_age_confirmation_modal()` di [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py) yang otomatis mengklik `Continue` jika pop-up verifikasi usia muncul, mencegah browser membeku / macet saat sesi guest aktif.
- **Recovery Cerdas pada `TimeoutError`:**
  - Memperbarui blok `except TimeoutError` di [`scrapers/base_qwen.py`](./scrapers/base_qwen.py) untuk mengecek apakah timeout disebabkan oleh sesi yang logout/expired. Jika ya, scraper segera me-reautentikasi atau merotasi akun tanpa membuang waktu mengulang percobaan pada sesi yang rusak.

### 5. Eliminasi False (Guest): Evaluasi Ganda Positif-Negatif & Penghapusan Pemindaian Frasa Body
- **Penghapusan Pemindaian Teks Body `session_expired_phrases`:**
  - Menghapus pemindaian string bebas `contains_any(body, ...)` pada `is_session_expired()` di [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py). Sebelumnya, kata "log in", "sign in", atau "unauthorized" di dalam pesan chat atau contoh kode memicu deteksi sesi expired secara keliru.
- **Logika Evaluasi Ganda (Positive & Negative Guard):**
  - Pada `_is_unauthenticated()` di [`scrapers/qwen_scraper.py`](./scrapers/qwen_scraper.py), ditambahkan deteksi sinyal positif akun login (`.temporary-chat-entry`, `.sidebar-wrapper`, `.sidebar-entry-fixed-list-content`). Jika sinyal positif ada dan header auth tidak ada, halaman dipastikan berstatus LOGIN (`False`).
- **Pengecekan Header Terisolasi (#qwen-chat-header-right):**
  - Selector tombol login pada [`config/qwen.py`](./config/qwen.py) dikunci hanya pada header kanan (`#qwen-chat-header-right .auth-buttons`), mencegah false positive dari tombol demo atau teks di area konten utama.
- **Pengecekan Modal Usia Khusus Kontainer Dialog:**
  - Evaluasi teks verifikasi umur kini dibatasi hanya pada elemen `[role="dialog"]` / `.ant-modal`, bukan seluruh teks dokumen.
- **Jeda Hidrasi Anti-Race-Condition:**
  - Menambahkan verifikasi ulang singkat (400ms) pada `_ensure_page_ready()` jika status unauthenticated dicurigai saat cold-load, memberi waktu React SPA memvalidasi sesi akun sebelum memicu login otomatis.

---

## [Unreleased] — Qwen Backend: Diagnostik Login Otomatis, Pemetaan Selector Baru, dan Isolasi Profil Akun

> **Pembaruan Backend Qwen.** Penambahan tool diagnostik auth mandiri (`debug_login_qwen.py`) dengan auto-summary generator, identifikasi perubahan alur login Qwen Web (v0.3.20), pemetaan selector baru, serta pengetatan isolasi persistent browser profile akun ke `profiles/qwen/<account>/`.

### 1. Tool Diagnostik Mandiri & Auto-Summary (`debug_login_qwen.py`)
- **Script Diagnostik Komprehensif:** File baru [`debug_login_qwen.py`](./debug_login_qwen.py) untuk menguji, membedah, dan mendiagnosis seluruh tahapan login Qwen (`chat.qwen.ai`) secara live.
  - Mendukung mode **No-Headless** (default, browser GUI tampil) dan mode **Headless** (`--headless`).
  - Mode interaktif (`--interactive`): menahan jendela browser terbuka untuk inspeksi elemen langsung via Chrome DevTools (F12).
  - Mode profil bersih (`--clean-profile`): pengujian first-time login cold-start tanpa terpengaruh cache/sesi lama.
  - Opsi `--skip-fill` dan `--skip-submit` untuk inspeksi selektif tanpa mengubah status form.
- **Generator Summary Otomatis:** Script secara otomatis menganalisis hasil pengujian dan menyimpannya ke direktori `debug/summary/`:
  - [`debug/summary/summary.md`](./debug/summary/summary.md): Ringkasan lengkap format Markdown (tabel evaluasi selector, temuan alur baru, dan rekomendasi kode).
  - [`debug/summary/summary.json`](./debug/summary/summary.json): Data ringkasan terstruktur JSON untuk kemudahan parsing terotomasi.
  - Arsip riwayat pengujian ber-timestamp (`summary_YYYYMMDD_HHMMSS.md` & `.json`).
- **Perekaman Artefak Lengkap:** Tangkapan layar otomatis (`.png`) dan dump DOM HTML penuh (`.html`) tersimpan pada folder `debug/` di setiap tahap (landing page, auth page, form terisi, dan respon pasca-submit).

### 2. Temuan Alur UI Baru Qwen Web (`qwen-chat-fe/0.3.20`)
- **Alur Login Dua Tahap (Two-Step Flow):**
  - Halaman `/auth` kini secara default menampilkan alur kode verifikasi / SSO. Field password **disembunyikan** hingga tombol `Log in with a password` diklik.
  - Ditambahkan dukungan deteksi dan interaksi tombol switch: `button:has-text("Log in with a password")`.
- **Perubahan Tipe Input Email:**
  - Input email diubah oleh Qwen menjadi `type="text"` dengan `name="email"` (sebelumnya `type="email"`).
  - Pembaruan selector email rekomendasi: `input[name="email"]` dan `input[placeholder*="Email" i]`.
- **Input Password & Submit Button:**
  - Input password menggunakan `name="password"` dan `type="password"`.
  - Tombol submit formulir login menggunakan class khusus `.qwenchat-auth-pc-submit-button` dengan teks "Log in".
- **Koreksi Deteksi Sesi Guest:**
  - Halaman landing `chat.qwen.ai` merender textarea input chat untuk pengguna tamu (guest), sehingga keberadaan `#chat-input` tidak lagi dijadikan acuan tunggal status login. Scraper memverifikasi ketiadaan tombol "Log in" / "Sign up" untuk memastikan sesi terautentikasi.

### 3. Pengetatan Isolasi Persistent Profile (`profiles/qwen/<account>/`)
- **Isolasi Profil Konsisten:**
  - Scraper Qwen kini secara ketat memetakan seluruh sesi akun ke subfolder namespace khusus: `profiles/qwen/<account>/` (misal `profiles/qwen/account1/`, `profiles/qwen/account2/`), mencegah konflik SingletonLock dengan backend DeepSeek (`profiles/deepseek/`) dan Grok (`profiles/grok/`).
- **Perbaikan Browser Restart:**
  - Memperbaiki method `restart_browser()` pada `scrapers/base_qwen.py`: sebelumnya restart browser tanpa argumen menyebabkan profil terlempar ke `profiles/qwen/default`. Sekarang `restart_browser()` mempertahankan `self.account` dan membuka kembali direktori profil akun yang sama.
- **Dukungan Rotasi Multi-Akun Email+Password:**
  - Memperbarui `_rotate_account()` pada `scrapers/base_qwen.py` agar mendukung rotasi akun dari `cookies/authqwen.json` (`account1` → `account2` → `account3` → `account4`).
  - Setiap rotasi menutup browser context aktif dan meluncurkan persistent context baru ke profil akun berikutnya.
- **Koreksi Identitas Akun pada Prompt Wrapper:**
  - Memperbaiki `_build_wrapped_prompt` dan `_build_tool_result_prompt` pada `scrapers/qwen_scraper.py` agar field `"model"` menggunakan `self.account` (misal `"model": "account1"`), bukan fallback statis `"qwen"`.
- **Pembersihan Dokumentasi Browser Pool:**
  - Menyelaraskan seluruh docstring dan komentar di `browser_pool_qwen.py` agar secara eksplisit merujuk ke `profiles/qwen/<account>/`.

---

## [Unreleased] — MAJOR: client API token (auth) for the VPS gateway

> **Breaking change.** Every HTTP endpoint of `vps_server.py` now requires
> `Authorization: Bearer <API_TOKEN>`. Existing clients without the token get
> `401`. There is intentionally **no** "auth off" / transition mode.

**Why:** until now the public REST API had no client authentication at all —
anyone who could reach the VPS port could use it. `PAF_TOKEN` only protected
the worker WebSocket (`/ws/worker`), not callers.

**Design (single shared token, CLI-managed):**
- **One token for all users**, sent as `Authorization: Bearer <token>`.
  Separate from `PAF_TOKEN` (worker auth), which is unchanged.
- Enforced by a pure-ASGI `ApiTokenMiddleware` on **all** HTTP routes
  (`/`, `/health`, `/v1/models`, `/v1/chat/completions`,
  `DELETE /v1/sessions/{id}`, unknown paths, `/docs`, `/openapi.json`), before
  routing/body parsing. WebSocket scopes pass through (worker auth unchanged).
- Responses: `401` + `WWW-Authenticate: Bearer` for missing/invalid token;
  `503` if the server has no token configured (**fail closed**).
- Constant-time comparison (`hmac.compare_digest`); non-ASCII credentials are
  rejected cleanly. Rejections are logged (method, path, client IP — never the
  token).
- Middleware order keeps **CORS outermost**: browser preflight `OPTIONS` works
  without credentials and `401` responses carry CORS headers.
- No token configured → every request is `503`. Without an interactive
  terminal `python vps_server.py` **refuses to start** (exit code 2) and
  `start.sh` stops instead of looping on that config error.

**Optional token expiry:** `token generate 7d`, `token rotate 12h`,
`token set <value> 2w`, `token expire <expiry|never>` (units `s/m/h/d/w`, max
10 years; default = never expires). An expired token is rejected automatically
with `401` ("API token has expired...") — no restart, enforced on every request
and again after a restart. Stored as an optional `expires_at=<UTC ISO>` second
line of the token file (files without it keep working and never expire; an
unparsable expiry line fails closed = expired). Tokens from `--api-token` /
`PAF_API_TOKEN` never expire. Offline: `--generate-token --expires 7d`,
`manage_token.py generate|set --expires ...`, `manage_token.py expire <expiry|never>`.

**Managing the token — live console:** while `vps_server.py` runs in a terminal,
type `token generate | rotate | set <value> | expire | show | reveal | revoke | help`
right in that console. Changes apply to the running server **immediately (no
restart)** and are saved to the token file. Enabled automatically when stdin is
a TTY (disable with `--no-console`); not available under nohup/systemd. In an
interactive terminal the server may start with no token (every request → 503)
so you can create it from the console; without a terminal it refuses to start.
Offline alternatives: `python vps_server.py --generate-token [--force]` and the
new `PublicForward/ForVPS/manage_token.py`
(`generate [--force]`, `set`, `show [--reveal]`, `revoke`). Stored in
`PublicForward/ForVPS/.api_token` (chmod 600, git-ignored). Resolution order:
`--api-token` flag > env `PAF_API_TOKEN` > token file. Console changes are
live; the offline CLI/flag only take effect on a running server after a restart.

**New files:** `PublicForward/ForVPS/paf_auth.py`,
`PublicForward/ForVPS/manage_token.py`, `tests/test_api_auth.py`.

**Changed files:** `PublicForward/ForVPS/vps_server.py`,
`PublicForward/ForVPS/start.sh`, `PublicForward/start.txt`, `.env.example`,
`.gitignore`, `API_USAGE.md` (§3 rewritten, error table, all examples),
`README.md`, `tests/test_http_e2e.py`, `tests/test_delete_session_e2e.py`
(now send the Bearer token), and the example clients in `example/`
(`--api-token` / env `PAF_API_TOKEN`).

**Upgrade steps:** start the gateway in a terminal → type `token generate` in
its console (no restart needed) → give the token to your users.

---

## [Unreleased] — Grok backend replaces ChatGPT backend entirely (migration)

> **Full architecture + operational deep-dive:** see
> **[`GROK_BACKEND.md`](./GROK_BACKEND.md)**. `CHATGPT_BACKEND.md` has been
> removed — its content is superseded by `GROK_BACKEND.md`.

**Summary:** the ChatGPT backend (third backend slot, chatgpt.com) has been
**fully replaced** by a Grok backend (grok.com), built from an
owner-supplied reference scraper (`grok.js` / `grokdebug.js` /
`login-capture-grok.js`, Puppeteer-based). The proven Cloudflare/anti-bot
CDP mitigation ladder built for ChatGPT (see the retired entries below)
is **reused verbatim** — only naming changed (`CHATGPT_*` → `GROK_*` env
vars, `chatgpt.com` → `grok.com`, `profiles/chatgpt` → `profiles/grok`).

**Removed files:** `config/chatgpt.py`, `scrapers/base_chatgpt.py`,
`scrapers/chatgpt_scraper.py`, `browser_pool_chatgpt.py`,
`public_chatgpt.py`, `login_chatgpt.py`, `import_chatgpt_cookies.py`,
`start_chatgpt_chrome.py`, `CHATGPT_BACKEND.md`,
`tests/_manual_continue_button_check.py` (tested a ChatGPT-only login-form
bug that has no Grok equivalent — see below).

**New files:** `config/grok.py`, `scrapers/base_grok.py`,
`scrapers/grok_scraper.py`, `browser_pool_grok.py`, `public_grok.py`,
`login_grok.py`, `import_grok_cookies.py`, `start_grok_chrome.py`,
`GROK_BACKEND.md`.

**Load-bearing deviation from ChatGPT — auth model:** grok.com
authenticates via SSO (Google / X / Apple / email-link), not
email+password. The owner-supplied reference scraper never automates a
login either — it only ever loads cookies captured from a fully manual
login. `GrokScraper` therefore has **no automated `login()` method at
all**: `ensure_authenticated()` only checks whether the persisted profile
already holds a valid session, and fails loud (with instructions to run
`login_grok.py` or `import_grok_cookies.py`) otherwise. `cookies/
authgrok.json`'s `email`/`password` fields are optional/reserved, not
required.

**Chat-flow logic ported 1:1 from `grok.js`:**
- Composer/send-button selector cascades (grok.com has no stable
  `data-testid`, unlike ChatGPT's `#prompt-textarea` / `[data-testid=
  "send-button"]`) — falls back through generic element types and a
  text/aria-label scan.
- Response-choice A/B dialog handling ("Which response do you prefer?") —
  a Grok-specific UI quirk with no ChatGPT equivalent.
- Richer "still generating" detection (stop button + web-search progress
  text like "Membaca"/"Menelusuri"/"Thinking…", not just a stop button).
- Response-text cleaning regex cascade (strips image credits, search
  status text, timestamps, speed labels, copy/share button text).
- Canvas/code-block extraction (`pre, code, [class*="code"],
  [class*="canvas"]` scan with SHA-256 dedup), in addition to fenced
  ``` code blocks in the plain-text response.

**Gateway (`vps_server.py`) changes:** `MODEL_ID_RE` now accepts
`grok`/`grok(account1)` instead of `chatgpt`/`chatgpt(account1)`; the
`backend == "chatgpt"` dispatch branch renamed to `backend == "grok"`
(same deepseek-style envelope/result shape, unchanged). `public.py
--backend` choices updated to `deepseek`/`qwen`/`grok`.

**Tests updated (all passing after migration):**
- `tests/test_vps_smoke.py`, `tests/test_http_e2e.py` — every
  `chatgpt`/`chatgpt(account1)` case replaced with the `grok` equivalent;
  `test_delete_session_e2e.py` required no changes (backend-agnostic).
- `tests/_manual_login_detection_check.py`,
  `tests/_manual_login_wait_check.py`, `tests/_manual_driver_check.py`,
  `tests/_manual_stealth_check.py`, `tests/_manual_cookie_import_check.py`,
  `tests/_manual_confirm_close_check.py` — all re-pointed at
  `GrokScraper`/`login_grok`/`import_grok_cookies`, HTML stub domains
  changed to `grok.com`, cookie-diagnostic essential-cookie check changed
  from ChatGPT's `__Secure-next-auth.session-token` to Grok's `sso` cookie
  (confirmed from a real grok.com Cookie-Editor export). All ran clean.
- `tests/_manual_continue_button_check.py` **removed** — it tested a
  ChatGPT-only bug (`button:has-text("Continue")` substring-matching
  "Continue with phone number"), which cannot occur in Grok's SSO-only,
  no-login-form model.

**Docs updated:** `README.md`, `API_USAGE.md` — every ChatGPT reference
replaced with the Grok equivalent (routing tables, curl examples, auth
section, error-code table, cross-references to `GROK_BACKEND.md`).
`requirements.txt` comments (`playwright-stealth`/`patchright` — "ChatGPT
backend only" → "Grok backend only").

**Known v1 limitations (see `GROK_BACKEND.md` §8):** no `think_mode`;
attachments support is generic/best-effort (the reference scraper doesn't
cover attachments); `rate_limited` text patterns are best-effort
placeholders pending confirmation against a live grok.com account.

---

## [Retired] — ChatGPT backend (major update, SUPERSEDED BY GROK ABOVE)

> **This backend no longer exists in the codebase.** The entries below are
> kept as the historical engineering record explaining *why* the
> Cloudflare/CDP mitigation ladder — now reused by the Grok backend — was
> built the way it was. For current behavior, see the migration entry
> above and [`GROK_BACKEND.md`](./GROK_BACKEND.md).

**Index of entries below (newest first):**
1. Feature — CDP attach ke Chrome asli yang sudah berjalan (workaround Turnstile terkuat)
2. Feature — Dua jalur baru mengatasi Cloudflare Turnstile: driver Patchright + import cookies manual
3. Fix — `_is_logged_in()` false positive saat login manual belum selesai (popup handling)
4. Feature — `login_chatgpt.py`: helper login manual satu-kali
5. Feature — `playwright-stealth` untuk mask fingerprint CDP controller
6. Feature — Kontingensi Cloudflare Turnstile: opsi `channel="chrome"`
7. Fix — Login ChatGPT salah klik "Continue with phone number" alih-alih "Continue"
8. Fix — Tes gateway yang sudah usang disinkronkan ke API saat ini
9. Feature — Backend ChatGPT ketiga (chat-only + code blocks + attachments) — initial implementation

### Feature — CDP attach ke Chrome asli yang sudah berjalan (workaround Turnstile terkuat)

**File baru:** `start_chatgpt_chrome.py`
**File diubah:** `scrapers/base_chatgpt.py`, `config/chatgpt.py`, `.env.example`
**Latar belakang:** Setelah seluruh jalur sebelumnya (stealth JS →
`channel="chrome"` → patchright → login manual visible → import cookies),
owner melaporkan Turnstile MUNCUL BAHKAN saat mengakses `chatgpt.com`
biasa. Yang tersisa untuk dideteksi oleh Cloudflare adalah jejak
otomasi level-proses yang ditanamkan saat browser DILUNCURKAN oleh
Playwright/patchright (flag `--enable-automation` internal, argumen
`--remote-debugging-pipe`, environment variable, dsb.) — hal yang tidak
bisa dihilangkan dari sisi aplikasi.
**Fix — CDP attach (mode `CHATGPT_CDP_ATTACH=1`):** alih-alih meluncurkan
browser, worker/login helper sekarang bisa ATTACH ke Chrome asli yang
SUDAH BERJALAN lewat `connect_over_cdp()`. Browser-nya adalah Chrome
sungguhan yang memulai dirinya sendiri (di-start via
`start_chatgpt_chrome.py --account account1`, yang meluncurkannya dengan
persistent profile `profiles/chatgpt/<account>/` yang SAMA dengan yang
dipakai worker + `--remote-debugging-port`) — jadi tidak ada fingerprint
peluncuran otomasi yang pernah ada sejak awal. Playwright hanya membaca
DOM / klik lewat koneksi CDP. Mode ini juga otomatis melewati injeksi
stealth JS (browser sudah bersih; patch JS justru menambah artefak).
`close_browser()` dalam mode ini hanya DISCONNECT — Chrome asli tetap
berjalan (lifecycle-nya milik user, dihentikan via
`start_chatgpt_chrome.py --account account1 --stop`).
**Cara pakai:**
```
python start_chatgpt_chrome.py --account account1      # terminal 1 (login manual sekali)
set CHATGPT_CDP_ATTACH=1                               # terminal 2 (Windows)
python public.py --backend chatgpt --vps ws://... --token ...
```
**Verifikasi:** live test di sandbox — chromium asli di-start manual dengan
`--remote-debugging-port`, lalu `ChatGPTScraper` dengan
`CHATGPT_CDP_ATTACH=1` berhasil attach (`connect_over_cdp`), membaca
halaman, dan disconnect bersih tanpa mematikan browser-nya. Semua test
lain (driver, cookie-import, login-detection, popup-wait, continue-button,
confirm-close, smoke, e2e, delete-session) tetap PASS.

### Feature — Dua jalur baru mengatasi Cloudflare Turnstile: driver Patchright + import cookies manual

**File baru:** `import_chatgpt_cookies.py`, `tests/_manual_driver_check.py`,
`tests/_manual_cookie_import_check.py`
**File diubah:** `scrapers/base_chatgpt.py`, `login_chatgpt.py`,
`requirements.txt`, `.env.example`
**Latar belakang:** Turnstile pada `auth.openai.com` muncul TERUS-menerus —
bahkan di browser VISIBLE saat login manual. Ini berarti yang terdeteksi
bukan stealth JS (yang sudah dipakai sejak versi sebelumnya), melainkan
**controller CDP-nya sendiri**: vanilla Playwright meninggalkan jejak
otomasi level-driver (`Runtime.enable` side effects, binding
`getPlaywright`, dsb.) yang TIDAK bisa dihilangkan oleh patch JavaScript
apapun — patch JS justru menambah artefak baru (getter non-native).
**Fix 1 — Patchright (jalur utama):** `base_chatgpt.py` sekarang memilih
driver Playwright-compatible via `_load_async_api()` + env
`CHATGPT_BROWSER_DRIVER` (`auto` default = patchright jika terinstall,
`playwright` untuk memaksa yang lama). [Patchright](https://github.com/Kaliiiiiiiiii-Virtual-Company/patchright)
adalah fork Playwright yang di-patch DI LEVEL DRIVER untuk menghapus
kebocoran CDP tadi — API-nya identik, jadi seluruh backend (scraper, pool,
worker, login helper) memakainya tanpa perubahan kode. Saat driver
patchright aktif, injeksi stealth JS otomatis di-skip (patch driver-level
bisa rusak kalau ditumpuk patch JS). Bisa dikombinasikan dengan
`CHATGPT_BROWSER_CHANNEL=chrome` untuk konfigurasi paling stealth.
Cara pakai: `pip install patchright` + `python -m patchright install chromium`,
lalu jalankan worker/login helper seperti biasa.
**Fix 2 — Import cookies manual (jalur zero-automation):**
`import_chatgpt_cookies.py` men-seed persistent profile dari cookies yang
di-export MANUAL dari browser sehari-hari (ekstensi Cookie-Editor → Export
JSON). Proses login sama sekali tidak menyentuh Playwright/CDP sehingga
tidak ada yang bisa dideteksi Cloudflare. Script meng-inject cookies ke
`profiles/chatgpt/<account>/` (pola yang sama dengan seeding cookie legacy
Qwen, via `cookie_editor_json_to_playwright()`), verifikasi session benar
valid (`_page_is_logged_in()`), menulis sentinel, dan selalu bertanya
sebelum menutup browser. Pesan error actionable untuk semua bentuk export
yang salah (header string, export saat belum login, file hilang).
**Verifikasi:** test driver memastikan patchright ter-resolve dan seluruh
alur stub (login-state check + persistent context) jalan di bawahnya; test
cookie-import mencakup konversi Cookie-Editor (termasuk varian wrapper
`{"cookies": [...]}`) dan pesan error yang jelas untuk export tidak valid.
Semua test lain tetap PASS.

### Fix — `_is_logged_in()` false positive saat login manual belum selesai

**File:** `scrapers/base_chatgpt.py`, `login_chatgpt.py`,
`tests/_manual_login_detection_check.py`, `tests/_manual_login_wait_check.py`
**Bug (dilaporkan langsung dari `login_chatgpt.py`):** setelah menjalankan
`login_chatgpt.py`, script langsung menandai "✅ Login detected" hanya ~9
detik setelah browser terbuka — padahal user belum sempat menyelesaikan
login sama sekali.
**Root cause:** `_is_logged_in()` HANYA mengecek absennya tombol "Log in"
di DOM. Itu benar untuk homepage ChatGPT yang sudah ter-render sepenuhnya,
tapi jadi *false positive* pada halaman APAPUN yang belum/bukan app
ChatGPT — halaman kosong/masih loading tepat setelah `page.goto()`, tab
yang masih di tengah redirect, atau halaman interstitial Cloudflare di
domain lain — karena semua itu juga "tidak punya tombol Log in" (bukan
karena sudah login, tapi karena bukan halaman ChatGPT sama sekali / belum
selesai render).
**Fix (dua lapis):**
1. `_is_logged_in()` sekarang mensyaratkan TIGA hal: (a) URL memuat
   `chatgpt.com`, (b) tombol "Log in" tidak terlihat, DAN (c) konfirmasi
   positif bahwa app shell benar-benar sudah render (`prompt_textarea` atau
   `main_area` ada di DOM) — bukan sekadar absennya tombol Log in. Poin (c)
   dipakai HANYA sebagai konfirmasi sekunder setelah poin (b) lolos, BUKAN
   sebagai sinyal utama menggantikan absennya tombol Log in (tetap
   konsisten dengan catatan desain: homepage logged-out juga menampilkan
   input chat, jadi keberadaan input TIDAK BOLEH jadi satu-satunya sinyal).
2. `login_chatgpt.wait_for_manual_login()` menambah debounce: butuh 2 poll
   berturut-turut ber-hasil True sebelum dianggap sukses (pola "stability
   check" yang sama dipakai `wait_for_response()` di tempat lain pada
   codebase ini), sebagai lapisan pertahanan tambahan terhadap race
   sesaat.
**Verifikasi:** test HTML stub diperluas untuk menyajikan halaman via
`page.route()` pada URL nyata `https://chatgpt.com/` (karena cek domain
baru butuh URL asli, bukan `about:blank` dari `page.set_content()`), plus
2 kasus regresi baru: halaman kosong/loading pada domain chatgpt.com HARUS
tetap dianggap belum-login, dan halaman di luar domain chatgpt.com (mis.
`about:blank`, mid-redirect) juga HARUS tetap dianggap belum-login.

### Feature — `login_chatgpt.py`: helper login manual satu-kali (rekomendasi utama untuk Turnstile)

**File baru:** `login_chatgpt.py`, `tests/_manual_login_wait_check.py`
**Latar belakang:** Setelah `channel="chrome"` dan `playwright-stealth`
tetap belum cukup mengatasi Cloudflare Turnstile untuk sebagian
lingkungan/akun, jalan yang paling andal adalah menghindari flow login
otomatis sama sekali untuk kasus yang terblokir: login **manual satu kali**
di browser visible yang terikat ke persistent profile yang SAMA dengan
yang dipakai worker/pool produksi.
**Cara kerja:** `python login_chatgpt.py --account account1` membuka
browser visible (headless=False) di `profiles/chatgpt/account1/`, lalu
polling `_is_logged_in()` (fungsi yang sama dipakai di semua tempat lain di
backend ini) sampai user selesai login secara manual (termasuk
menyelesaikan checkbox Turnstile sendiri, mengisi email/password, klik
"Continue with password"). Setelah terdeteksi login, sentinel
`cookies_seeded` ditulis dan cookies di-backup (best-effort).
**Mengapa ini menghilangkan masalah Turnstile untuk run berikutnya:**
`ChatGPTScraper.ensure_authenticated()` SELALU mengecek `_is_logged_in()`
LEBIH DULU sebelum pernah memanggil `login()` — jika profile sudah berisi
session valid (dari login manual ini), worker headless berikutnya tidak
pernah menyentuh flow login otomatis sama sekali, sehingga tidak pernah
lagi mengunjungi halaman yang di-challenge Cloudflare.
**Catatan:** akun tetap harus terdaftar namanya di
`cookies/authchatgpt.json` (email/password boleh dikosongkan) agar
`BrowserPool` tahu harus membuat slot untuk akun tersebut — kredensial di
file itu hanya jadi fallback bila session manual ini nanti expired.

### Feature — `playwright-stealth` untuk mask fingerprint CDP controller (bukan cuma UA/headless)

**File:** `scrapers/base_chatgpt.py`, `requirements.txt`
**Latar belakang:** Setelah kontingensi `channel="chrome"` diaktifkan, owner
melaporkan Cloudflare Turnstile **masih** muncul di `auth.openai.com`
meski IP reputasinya bersih dan browser sudah Chrome asli. Root cause:
Cloudflare tidak hanya mengecek User-Agent/headless — ia mendeteksi
**Playwright/CDP sebagai automation controller** lewat sinyal-sinyal lain
(leak `Runtime.enable`, getter properti hasil override yang bukan native,
bentuk `PluginArray` yang salah, mismatch prototype `iframe.contentWindow`,
vendor WebGL, dsb.) yang TIDAK hilang hanya dengan berganti ke Chrome asli
atau patch JS sederhana seperti `_apply_stealth` versi awal.
**Fix:** `_apply_stealth()` sekarang memakai paket
[`playwright-stealth`](https://pypi.org/project/playwright-stealth/)
(port Python dari `puppeteer-extra-plugin-stealth`, ~15 evasion terarah:
`navigator.webdriver`, `navigator.plugins`, `navigator.permissions`,
`navigator.languages`, `iframe.contentWindow`, `chrome.csi`/`chrome.app`/
`chrome.loadTimes`, `webgl_vendor`, `error_prototype`, `sec_ch_ua`, dll.)
sebagai jalur utama — diterapkan di level `BrowserContext` sehingga berlaku
untuk semua page yang dibuat dari context tersebut. Jika paket belum
terinstall (dependency opsional), otomatis fallback ke script kustom
sebelumnya (masih ada, tidak dihapus) agar backend tetap berfungsi.
**Cara pakai:** `pip install -r requirements.txt` sudah mencakup
`playwright-stealth>=2.0.0` — tidak perlu langkah tambahan.
**Catatan realistis:** tidak ada kombinasi stealth-script yang dapat
menjamin 100% lolos dari Cloudflare Turnstile (ini "managed challenge"
yang terus diperbarui providernya) — kombinasi `channel="chrome"` +
`playwright-stealth` + profile persisten + IP bersih adalah best-effort
terbaik yang tersedia untuk automation berbasis CDP. Jika Turnstile tetap
muncul setelah semua ini, satu-satunya jalan pasti adalah menyelesaikan
challenge sekali secara manual dengan `--no-headless` — profile akan
mengingat session tersebut untuk run headless berikutnya.

### Feature — Kontingensi Cloudflare Turnstile: opsi `channel="chrome"` (v1.1, diaktifkan lebih awal)

**File:** `config/chatgpt.py`, `scrapers/base_chatgpt.py`, `.env.example`
**Latar belakang:** Risiko "Cloudflare mendeteksi Chromium headless" yang
sudah didokumentasikan di `design_chatgpt_backend.md` §11 / `implementation.md`
§3 terjadi di deployment nyata — login stuck di halaman
`auth.openai.com` "Performing security verification" (Cloudflare Turnstile
checkbox), bukan di happy-path "Continue with password".
**Fix:** Kontingensi v1.1 yang sudah direncanakan diaktifkan lebih awal:
`launch_browser()` sekarang membaca `CHATGPT_BROWSER_CHANNEL` (env var) atau
`CHATGPT_CONFIG["browser_channel"]` (default `None` = bundled Chromium,
perilaku tidak berubah). Jika di-set ke `"chrome"`, Playwright meluncurkan
**Google Chrome asli** yang terinstall di mesin (`channel="chrome"`) — satu
baris config, tanpa perlu ubah kode lain — karena Chrome asli umumnya lebih
dipercaya Cloudflare Turnstile dibanding binary Chromium headless bawaan.
Stealth script (`_apply_stealth`) juga diperluas: tambah patch
`navigator.permissions.query` untuk notifications (pola stealth umum),
selain patch `webdriver`/`languages`/`plugins` yang sudah ada.
**Cara pakai:** `export CHATGPT_BROWSER_CHANNEL=chrome` di worker host (perlu
`playwright install chrome` atau Chrome sistem sudah terinstall), lalu
jalankan ulang `python public.py --backend chatgpt ...`.
**Catatan tambahan jika Turnstile masih muncul:** Cloudflare juga menilai
reputasi IP (datacenter/VPS IP sering memicu challenge terlepas dari
headless atau tidak) — jika `channel="chrome"` belum cukup, coba jalankan
worker sekali dengan `--no-headless` untuk menyelesaikan checkbox secara
manual (profile akan mengingat session untuk run berikutnya), atau
pertimbangkan menjalankan worker dari IP residensial/non-datacenter.

### Fix — Login ChatGPT salah klik "Continue with phone number" alih-alih "Continue"

**File:** `config/chatgpt.py`, `scrapers/chatgpt_scraper.py`,
`tests/_manual_continue_button_check.py` (baru)
**Root cause:** selector `continue_button` sebelumnya
`button:has-text("Continue")` — di Playwright, `:has-text()` melakukan
**substring match**, jadi ikut match tombol sekunder seperti "Continue with
phone number" / "Continue with Google" / "Continue with Apple". Ditemukan
langsung dari laporan pengguna: email berhasil terisi, tapi yang diklik
malah "Continue with phone number".
**Fix (dua lapis):**
1. Selector diganti ke `button:text-is("Continue")` (exact match,
   whitespace-normalized) sebagai kandidat utama, dengan fallback yang
   secara eksplisit mengecualikan varian "... with ...":
   `button:has-text("Continue"):not(:has-text("with"))`.
2. `_click_continue_button()` (baru, menggantikan `_click_first()` generik
   untuk tombol ini) menambahkan verifikasi runtime: teks elemen yang
   ter-resolve harus PERSIS `"continue"` (case-insensitive, trimmed)
   sebelum diklik — kandidat yang gagal verifikasi dilewati, bukan diklik
   membabi-buta.
**Verifikasi:** `tests/_manual_continue_button_check.py` mereproduksi
skenario persis (tombol "Continue with phone number" diletakkan SEBELUM
tombol "Continue" yang benar di DOM) dan memastikan tombol yang benar yang
diklik.

### Fix — Tes gateway yang sudah usang disinkronkan ke API saat ini

`tests/test_vps_smoke.py` sebelumnya memanggil `V.resolve_backend(...)`, yang
sudah tidak ada di `vps_server.py` (API saat ini hanya punya
`resolve_backend_and_account(model) -> (backend, account_id)`). Diganti
dengan `test_resolve_backend_and_account()` yang sesuai API saat ini +
kasus `chatgpt`/`chatgpt(account1)`.

`tests/test_http_e2e.py` sebelumnya mengirim `model: "deepseek-chat"` untuk
kasus DeepSeek — string ini **tidak match** `MODEL_ID_RE` saat ini
(`^(deepseek|qwen|chatgpt)(?:\(([^)]+)\))?$`), sehingga `chat_completions()`
langsung melempar 400 SEBELUM pernah memanggil `dispatch()`, sementara test
tetap menunggu `ws.recv()` untuk sebuah task envelope yang tidak akan pernah
dikirim — membuat test **hang tanpa batas waktu**. Diperbaiki: model diganti
ke `"deepseek"`, `ws.recv()` diberi timeout eksplisit, dan ditambahkan dua
kasus baru untuk backend `chatgpt` (`"chatgpt"` dan `"chatgpt(account1)"`).

---

### Feature — Backend ChatGPT ketiga (chat-only + code blocks + attachments)

**File baru:** `config/chatgpt.py`, `scrapers/base_chatgpt.py`,
`scrapers/chatgpt_scraper.py`, `browser_pool_chatgpt.py`, `public_chatgpt.py`,
`tests/_manual_login_detection_check.py`
**File diubah (minimal touch):** `config/__init__.py` (re-export),
`public.py` (`--backend` += `chatgpt`), `.env.example` (blok
`CHATGPT_EMAIL`/`CHATGPT_PASSWORD`), `PublicForward/ForVPS/vps_server.py`
(`MODEL_ID_RE` += `chatgpt`, branch `task_fields` untuk `backend=="chatgpt"`,
komentar normalisasi hasil `deepseek | chatgpt`), `tests/test_vps_smoke.py`,
`tests/test_http_e2e.py`, `README.md`, `API_USAGE.md`.

Mengikuti keputusan FINAL di `design_chatgpt_backend.md` /
`implementation.md`:

- **Port penuh ke Python + Playwright**, satu stack dengan deepseek/qwen.
  ChatGPT mengikuti pola persistent-profile email+password milik Qwen
  (`base_qwen.py`), bukan pola cookie-file legacy.
- **Login otomatis email+password** via `cookies/authchatgpt.json` (format
  identik `auth.json`/`authqwen.json`, di-reuse langsung oleh `AuthStore`).
  Tanpa SSO. Flow sesuai screenshot owner: klik "Log in" (POPUP *atau*
  redirect same-tab — keduanya ditangani via listener `context.on("page")`)
  → isi email → klik "Continue" → halaman "Check your inbox" → **klik
  "Continue with password"** (jalur utama, BUKAN mengisi kode verifikasi
  email) → isi password → klik "Continue" → tunggu tombol "Log in" hilang.
- **Deteksi login HANYA via absennya tombol "Log in"** di DOM — BUKAN
  keberadaan input chat, karena homepage logged-out ChatGPT tetap
  menampilkan input "Ask ChatGPT" (poin kritis dari screenshot owner, cermin
  `detectSignOut` di referensi openai.js).
- **Login WAJIB headless=true** (constraint owner, diverifikasi manual
  terhadap flow "Continue with password" yang live).
- **Ekstraksi response**: DOM selector utama
  `[data-message-author-role="assistant"]` (elemen terakhir) → fallback
  innerText `<main>` yang di-anchor pada occurrence TERAKHIR dari prompt,
  dibersihkan (buang label "You said:"/"ChatGPT said:", baris UI seperti
  Copy/Share/Regenerate, dedupe baris berturutan) — port 1:1 strategi
  referensi openai.js.
- **Profile terisolasi**: `profiles/chatgpt/<account>/`, terpisah dari
  `profiles/deepseek/<account>/` dan `profiles/qwen/<account>/` — mencegah
  Chrome `SingletonLock` collision yang sudah pernah diperbaiki untuk
  deepseek/qwen di entri CHANGELOG sebelumnya.
- **Attachments**: `set_input_files` pada `input[type=file]` tersembunyi,
  tunggu preview chip muncul (timeout 15s) sebelum mengirim prompt.
- **Rate limit & rotasi**: deteksi frasa "you've reached"/"usage cap"/"limit
  reached"; mode `new` → rotasi akun via `authchatgpt.json` lalu retry 1x;
  mode `continue` → fail jelas (session terikat akun, rotasi akan
  menghilangkan konteks percakapan — konsisten dengan deepseek/qwen).
- **Gateway**: `model` valid `chatgpt` \| `chatgpt(account1)`. Worker
  register dengan `"backend": "chatgpt"` — routing least-loaded, session
  affinity, `/v1/models`, `x_meta`, dan `DELETE /v1/sessions/{id}` semua
  bekerja otomatis tanpa perubahan tambahan (generik lewat field `backend`).
  Task envelope memakai format deepseek (`{"type":"task","task_id","request"}`)
  karena ini worker baru tanpa protokol lama yang harus dijaga kompatibel.
- **v1 scope**: chat + code blocks + attachments saja. TIDAK ada
  think_mode/model picker (default model UI). Tool calling **diterima**
  di request body tapi **belum dieksekusi** ke UI ChatGPT (ditandai untuk
  v1.1). `stream: true` diabaikan (non-streaming, konsisten dengan deepseek).
- **Regresi**: perilaku backend deepseek & qwen TIDAK berubah. Semua
  perubahan pada file existing bersifat minimal-touch (§F implementation.md).

---

## [Unreleased] — 2026-09-03 (sesi 5)

### Change — Session tidak lagi punya TTL otomatis; dihapus lewat API/console command secara eksplisit

**File:** `public_deepseek.py`, `public_qwen.py`, `PublicForward/ForVPS/vps_server.py`,
`API_USAGE.md`
**Latar belakang:** Sebelumnya session (`X-Session-ID` → conversation_url +
account pin) otomatis dihapus dari memory & disk setelah tidak dipakai
selama `ttl` detik (default 3600s), lewat cek di `SessionStore.get()` +
background loop tiap 60 detik. Tidak ada cara untuk menghapus session
secara eksplisit lewat API — satu-satunya jalan adalah menunggu TTL habis.
Perubahan ini mengganti model tersebut menjadi: **session hidup selamanya
sampai dihapus secara eksplisit**, baik lewat API maupun command manual.

#### 1. TTL otomatis dihapus total dari kedua backend

`SessionStore.get()` (DeepSeek & Qwen) tidak lagi mengecek `is_expired()`
dan menghapus session diam-diam saat diakses. `load_from_disk()` me-restore
SEMUA file session di `dataSession/` tanpa syarat, tidak ada lagi yang
di-skip sebagai "expired". Background loop (`_cleanup_loop` di DeepSeek,
`_status_reporter` di Qwen) tidak lagi memanggil pembersihan session sama
sekali — hanya membersihkan lock idle (housekeeping memory, tidak
menyentuh data session).

```
Sebelum: get(sid) → cek is_expired(ttl) → auto-hapus jika lewat TTL   ❌
         (juga terjadi otomatis tiap 60s lewat background loop)
Sesudah: get(sid) → langsung return dari dict, TIDAK ADA pengecekan
         umur sama sekali. Session hanya hilang lewat aksi eksplisit.  ✅
```

`cleanup_expired()` di kedua `SessionStore` diganti menjadi
`cleanup_older_than(max_age=None)` — method yang sama, tapi sekarang
HARUS dipanggil manual (tidak ada lagi yang memanggilnya otomatis di
manapun). `cleanup_expired()` dipertahankan sebagai alias deprecated
(memanggil `cleanup_older_than()` tanpa argumen) untuk backward-compat.

#### 2. Command console manual "cleanup sessions" / "cleanupsessions"

Karena TTL otomatis dihapus, operator butuh cara manual untuk membersihkan
session yang sudah lama tidak dipakai (mencegah `dataSession/` tumbuh tanpa
batas jika client tidak pernah memanggil delete). Ditambahkan:

- **DeepSeek** (`public_deepseek.py`, console REPL lokal): perintah
  `cleanup sessions [max_age_s]`. Tanpa argumen, pakai nilai `--session-ttl`
  saat start worker sebagai default (nilai itu SEKARANG hanya default untuk
  command manual ini, bukan lagi TTL otomatis).
- **Qwen** (`public_qwen.py`, console REPL lokal): perintah
  `cleanupsessions [max_age_s]` dengan semantik yang sama. Diperlukan
  perubahan signature `_run_console_command(pool, line)` →
  `_run_console_command(pool, worker, line)` agar command ini bisa
  mengakses `worker.processor.sessions`.

#### 3. Endpoint baru: `DELETE /v1/sessions/{session_id}`

**File:** `PublicForward/ForVPS/vps_server.py`

Session sesungguhnya hidup di WORKER (SessionStore per-worker), bukan di
VPS — VPS hanya menyimpan hint routing (`_session_worker`) yang bisa basi
(misal setelah worker restart). Karena itu, `WorkerManager.delete_session()`
**broadcast** pesan `{"type":"delete_session","request_id","session_id"}`
ke SEMUA worker yang terhubung (kedua backend), menunggu balasan
`{"type":"session_deleted","request_id","found"}` dari masing-masing
(future per-request + timeout 8s), lalu agregasi: `deleted = any(found)`.
Hint `_session_worker[session_id]` juga langsung dihapus di VPS, apa pun
hasilnya, supaya request berikutnya untuk `session_id` itu pasti dianggap
baru (tidak coba pakai worker affinity yang basi).

```bash
curl -X DELETE http://VPS_HOST:PORT/v1/sessions/sess-421a9c7e1b2c3d4f
# -> {"session_id": "sess-421a9c7e1b2c3d4f", "deleted": true, "workers_checked": 1}
```

`deleted: false` BUKAN error (idempotent) — cuma berarti session tidak
ditemukan di worker mana pun (sudah terhapus / tidak pernah ada / worker
pemiliknya sedang offline). Tidak ada auth tambahan di endpoint ini,
konsisten dengan endpoint REST lain di gateway ini (lihat `API_USAGE.md`
§3) — belum ada pengecekan token client-facing di gateway ini sama sekali.

Worker menerima pesan `delete_session` lewat message-loop WS yang sudah
ada (tipe pesan baru, paralel dengan `"task"`/`"ping"`), dan membalas
`session_deleted` setelah menghapus dari `SessionStore` (memory + disk).

#### 4. Race condition saat DELETE bersamaan dengan task CONTINUE yang sedang berjalan

**Masalah:** task `mode="continue"` yang sedang berjalan untuk session X,
di akhir eksekusinya akan memanggil `session_store.update()` /
`get_or_create()` untuk menyimpan `conversation_url` terbaru. Jika request
`DELETE` untuk session X datang DI TENGAH task itu berjalan, delete bisa
selesai lebih dulu, lalu task yang masih berjalan "menghidupkan kembali"
session yang baru saja dihapus saat dia selesai dan menulis ulang.

**Fix:** `_handle_delete_session()` (di kedua worker) mengambil **lock
per-session yang sama** yang sudah dipakai untuk serialisasi task
CONTINUE (`_get_session_lock(session_id)`) SEBELUM memanggil
`session_store.delete()`. Ini memaksa delete menunggu task yang sedang
berjalan untuk session tersebut selesai dulu (task itu akan menulis ulang
session seperti biasa), baru kemudian delete benar-benar dieksekusi —
sehingga hasil akhirnya selalu terhapus, tidak pernah "dihidupkan kembali"
oleh task yang tumpang tindih.

```
Sebelum: DELETE bisa balapan dengan task CONTINUE yang masih menulis ulang
         session → session bisa "hidup lagi" setelah dihapus            ❌
Sesudah: DELETE menunggu lock per-session yang sama dipakai task
         CONTINUE → dijamin urut, tidak ada resurrection               ✅
```

#### 5. Dokumentasi: `API_USAGE.md`

Bagian §6.2 (session continuity) mendapat sub-bagian baru **§6.2.1 "Sessions
have NO automatic TTL — you manage their lifetime"** yang menjelaskan:
- Session hidup selamanya sampai dihapus eksplisit.
- Cara implementasi TTL versi client sendiri: simpan timestamp `last_used`
  per `session_id` di sisi klien, panggil `DELETE /v1/sessions/{id}` sendiri
  begitu dianggap basi (atau cukup berhenti memakai ulang `X-Session-ID`
  itu — turn berikutnya otomatis jadi percakapan baru).
- Endpoint `DELETE /v1/sessions/{session_id}` didaftarkan di §4.5 (daftar
  endpoint) dan tabel otentikasi di §3 diperbarui untuk menyertakannya.

#### Test

Ditambahkan `tests/test_delete_session_e2e.py` — uji e2e nyata (uvicorn +
websockets worker asli, pola sama dengan `tests/test_http_e2e.py`):
tidak ada worker terhubung, worker terhubung tapi session tidak dikenal,
worker menemukan & menghapus session (dan memverifikasi hint
`_session_worker` ikut terhapus), serta delete berulang (idempoten). Semua
skenario lolos.

**Catatan:** `tests/test_http_e2e.py` ditemukan hang di sandbox ini —
dikonfirmasi lewat `git stash` bahwa ini adalah masalah environment yang
SUDAH ADA SEBELUM sesi ini (terjadi juga pada `vps_server.py` versi asli,
tidak disebabkan oleh perubahan sesi ini).

---

## [Unreleased] — 2026-09-03 (sesi 4)

### Fix — DeepSeek scraper menangkap output "Thought for N seconds" / partial-stream sebagai jawaban final (5 lapis bug berantai)

**File:** `scrapers/base_deepseek.py`
**Dipicu oleh:** Screenshot + log worker menunjukkan scraper berulang kali gagal
validasi JSON (`JSON parse error: Expecting value: line 1 column 1 (char 0)`) dan
melakukan corrective-retry berulang, kadang berujung proses "stuck" tanpa respons
sama sekali. Investigasi dilakukan bertahap — setiap fix menutup satu jalur
kegagalan sekaligus membuka gejala baru, sampai akhirnya seluruh rantai tertutup.

Semua fix di bawah ini berada di `BaseAIChatScraper._get_last_response_text()`
dan `BaseAIChatScraper.wait_for_response()`.

#### Root Cause (lapis 1) — thought-block ikut terbaca sebagai respons

DeepSeek merender bullet chain-of-thought pada panel **"Thought for N seconds"**
(mode DeepThink/Expert) dengan class DOM (`div.ds-markdown`) yang **sama** dengan
elemen jawaban final. Selama model masih "thinking", elemen jawaban final belum
ada di DOM — `_get_last_response_text()` yang naif mengambil elemen `div.ds-markdown`
**terakhir** di DOM sehingga menangkap baris reasoning, bukan jawaban sesungguhnya.
Teks reasoning ini bukan JSON valid → corrective-retry loop.

```
Sebelum: ambil div.ds-markdown TERAKHIR di DOM, apa pun isinya         ❌
Sesudah: skip elemen yang berada di dalam blok "Thought for N seconds",
         kembalikan "" jika SEMUA kandidat masih di dalam blok thought  ✅
```

Deteksi blok thought dipakai lewat heuristik teks header produk yang selalu
Inggris ("Thought for N seconds…") — bukan class minified yang memang sudah
ditandai "WILL change between builds" di `config/deepseek.py` — dicek pada
`firstElementChild` tiap ancestor (dibatasi panjang teks, bukan `textContent`
penuh) supaya tidak salah tangkap container gabungan thought+jawaban-final,
dengan batas kedalaman ancestor 25 level sebagai margin aman untuk DOM nyata.

#### Root Cause (lapis 2) — timeout tetap trigger retry walau masih "Thinking"

Setelah lapis 1 diperbaiki, `wait_for_response()` benar mengembalikan `""` selama
masih thinking — tapi fungsi ini punya **hard timeout 60 detik** (`response_wait`)
tanpa mengecek apakah model masih aktif memproses. DeepThink + web-search dengan
banyak ronde pencarian bisa berjalan >60 detik secara legitimate. Saat deadline
tercapai padahal model masih "Thinking", kode langsung menganggap gagal dan
mengirim **corrective prompt** — yang justru **memutus/menginterupsi** proses
"Thought for N seconds" yang sedang berjalan di browser, memicu retry-loop.

```
Sebelum: deadline 60s tercapai → langsung timeout → kirim corrective prompt
         (memutus generation yang masih berjalan)                      ❌
Sesudah: deadline tercapai → cek _is_generating() (stop-button /
         loading-indicator / thought-panel tanpa jawaban) → jika masih
         aktif, perpanjang deadline alih-alih menyerah                 ✅
```

#### Root Cause (lapis 3) — deadline diperpanjang tanpa batas saat benar-benar macet

Fix lapis 2 menimbulkan gejala baru: log menunjukkan teks reasoning beku
**persis sama** selama 4+ menit sementara `_is_generating()` terus melaporkan
"masih generating", sehingga deadline diperpanjang berkali-kali menuju
`hard_ceiling` (6x timeout) — dari sisi pengguna terlihat "stuck, tidak ada
respons". Sinyal "masih generating" hanya membuktikan indikator visible di
DOM, bukan bukti ada progres nyata.

```
Sebelum: masih "generating" → perpanjang terus sampai hard_ceiling (~6 menit) ❌
Sesudah: tambahkan stall watchdog — jika teks BENAR-BENAR tidak berubah
         > max(timeout*1.5, 90s), anggap macet (frozen page / backend hang)
         dan berhenti menunggu lebih cepat, sekaligus trigger dump
         diagnostik + screenshot untuk debugging                         ✅
```

#### Root Cause (lapis 4) — jawaban final yang masih di-*stream* tertangkap belum lengkap

Setelah "Thought for N seconds" selesai, DeepSeek men-*stream* jawaban
kata-per-kata/chunk-per-chunk. Mekanisme stability check (`stability_polls=2`,
`poll_interval=0.5s` → hanya butuh teks sama 1 detik) terlalu longgar: jeda
sesaat antar-chunk streaming (mis. baru ketik `"The"` lalu pause) bisa dianggap
"stabil" secara prematur, sehingga teks setengah-jadi lolos dan gagal validasi
JSON → corrective retry dikirim **selagi jawaban asli masih di-stream**.

```
Sebelum: teks sama 1 detik (2 poll) → langsung diterima sebagai final    ❌
         → menangkap "The" (3 karakter) sebagai jawaban lengkap
Sesudah: sebelum menerima "STABLE", cek _is_generating() — jika masih
         streaming, JANGAN terima, terus tunggu                          ✅
```

#### Root Cause (lapis 5) — sinyal `_is_generating()` false-positive permanen memblokir jawaban yang SUDAH selesai

Fix lapis 4 mengekspos bahwa selector `stop_button` / `loading_indicator` di
`config/deepseek.py` (yang memang belum pernah diverifikasi ke DOM asli, masih
bertanda `# TODO: verify`) bisa melaporkan "masih generating" **selamanya**,
bahkan untuk teks yang sudah 100% lengkap dan tidak berubah selama 18+ poll
(~9 detik). Gate lapis 4 yang bersifat hard-block membuat respons yang sudah
tuntas tertahan tanpa akhir.

```
Sebelum: _is_generating()==True → tunggu terus tanpa batas waktu          ❌
Sesudah: _is_generating() jadi sinyal ADVISORY dengan grace period
         terbatas (~5 detik) — jika teks diam > grace period, terima
         apa pun kata sinyal tersebut (anggap basi/tidak reliabel)        ✅
```

#### Test

Ditambahkan 5 skrip verifikasi standalone (semua lolos, tidak saling konflik):
`test_thought_fix.py`, `test_deadline_extension.py`, `test_stall_watchdog.py`,
`test_streaming_gate.py`, `test_stuck_signal_regression.py`.

**Catatan lanjutan:** Selector `stop_button` / `loading_indicator` di
`config/deepseek.py` masih belum terverifikasi terhadap DOM live DeepSeek
(diberi `# TODO: verify` sejak awal). Fix lapis 5 membuat sistem tahan
terhadap kesalahan selector tersebut lewat grace period, tapi bila selector
yang benar berhasil diverifikasi manual (mis. lewat DevTools saat model
sedang "Thinking"), deteksi `_is_generating()` bisa dibuat presisi tanpa
bergantung pada grace period sebagai pengaman.

---

## [Unreleased] — 2026-07-26 (sesi 3)

### Fix — DeepSeek warmup masih diam di `/sign_in` (fix sesi 2 belum menutup celah)

**File:** `scrapers/deepseek_scraper.py`
**Dipicu oleh:** Setelah fix sesi 2 (Fix 1) diterapkan, bug yang sama masih muncul:
browser warmup berhenti di `https://chat.deepseek.com/sign_in` tanpa login terpicu.

#### Root Cause

Fix sesi 2 menambahkan "URL-stabilisation loop" yang menganggap SPA sudah selesai
routing begitu satu sample URL (tiap 0.3s) sama dengan sample sebelumnya. Ini
adalah asumsi yang salah:

```
t=0.0s : goto() selesai (domcontentloaded) → _prev_url = "https://chat.deepseek.com"
t=0.3s : SPA belum sempat redirect ke /sign_in (masih proses cek auth via API)
         → _curr_url masih sama dengan _prev_url → loop mengira "stabil" → break ❌
         (padahal redirect sebenarnya baru terjadi di t=0.5s, SETELAH loop keluar)
```

Karena loop keluar terlalu dini, `ensure_authenticated()` → `is_session_expired()`
dipanggil saat URL **masih** base_url (bukan `/sign_in` yang sebenarnya akan
dituju). Pada momen itu:
- Check 1 (URL == sign_in) → belum match, URL masih base_url
- Check 2 (password field visible) → belum ada, halaman belum selesai render
- Check 3 (chat_input present) → belum ada juga
- Check 4 (phrase match di body) → body masih kosong/loading, tidak match

Hasilnya `is_session_expired()` return `False` ("dikira sudah login") → login
di-skip → slot ditandai READY padahal browser baru mendarat di `/sign_in`
beberapa ratus ms kemudian.

#### Fix di `scrapers/deepseek_scraper.py` (`_ensure_loaded()`)

Ganti pendekatan "tebak dari stabilitas URL" (heuristik, rawan race condition)
dengan **polling langsung ke state akhir yang definitif** — menunggu salah satu
dari tiga kondisi berikut muncul (bounded, maks 10 detik, cek tiap 0.25s):

1. URL sudah mengandung `/sign_in` → session expired
2. Password field terlihat (`input[type="password"]` visible) → login DOM tampil
3. Salah satu selector `chat_input` (dari config) ditemukan → sudah terautentikasi

```
Sebelum: goto() → tunggu 1 sample URL sama dgn sebelumnya → is_session_expired() ← masih bisa fooled ❌
Sesudah: goto() → poll sampai salah satu dari 3 state definitif muncul (maks 10s) → is_session_expired() ✅
```

Deadline di-cap fixed 10 detik (independen dari timeout `page_load` 60 detik)
supaya kasus halaman benar-benar stuck tidak membuat warmup menunggu semenit
penuh per slot.

---

## [Unreleased] — 2026-07-26 (sesi 2)

### Fix 1 — DeepSeek warmup diam di `/sign_in` (false-valid session)

**File:** `scrapers/deepseek_scraper.py`
**Dipicu oleh:** Browser tampil di `https://chat.deepseek.com/sign_in` setelah warmup,
padahal log menunjukkan "Slot ready".

#### Root Cause
`_ensure_loaded()` memanggil `goto(base_url, wait_until="domcontentloaded")` lalu
langsung memanggil `ensure_authenticated()` dengan jeda hanya 0.1s. DeepSeek adalah
React SPA — event `domcontentloaded` fire **sebelum** JS routing selesai. Saat
`is_session_expired()` dipanggil, URL masih `https://chat.deepseek.com` (bukan `/sign_in`),
sehingga semua check lolos → fungsi return `False` (dikira valid). Slot ditandai READY,
padahal browser baru kemudian menyelesaikan redirect ke `/sign_in`.

Ada juga bug kecil di cek `base_url NOT IN page.url`: karena `base_url =
"https://chat.deepseek.com"` adalah substring dari
`"https://chat.deepseek.com/sign_in"`, kondisi skip `goto()` bisa salah terpicu.

#### Fix di `scrapers/deepseek_scraper.py`

1. **Perbaiki cek `on_app`** — ganti substring check menjadi prefix check yang tepat
   sehingga `/sign_in`, `/settings`, dll. tidak dianggap "sudah di app".

2. **Tambah URL-stabilisation loop** — setelah `goto()`, poll URL setiap 0.3s hingga
   URL tidak berubah lagi (maks 5s). Ini memastikan React router sudah selesai
   redirect sebelum `is_session_expired()` dipanggil.

```
Sebelum: goto(base_url) → sleep(0.1s) → is_session_expired() ← SPA belum selesai ❌
Sesudah: goto(base_url) → poll URL sampai stabil (maks 5s) → is_session_expired() ✅
```

---

### Fix 2 — Qwen `showheadless` crash `TargetClosedError` (profile lock)

**File:** `browser_pool_qwen.py`
**Dipicu oleh:** `showheadless <account>` gagal dengan
`BrowserType.launch_persistent_context: Target page, context or browser has been closed`.

#### Root Cause
`restart_slot_no_headless()` memanggil `close_browser()` lalu **langsung**
`launch_browser()` tanpa jeda. `close_browser()` menutup context Playwright secara
async, tapi proses Chrome di OS masih hidup sebentar dan memegang **`SingletonLock`**
pada direktori profile (`profiles/<account>/`). Browser baru yang mencoba membuka
profile yang sama gagal karena lock belum dilepas.

Masalah yang sama ada di `stop_all_no_headless()`.

#### Fix di `browser_pool_qwen.py`

Tambah `await asyncio.sleep(2.0)` setelah `close_browser()` di dua fungsi:
- `restart_slot_no_headless()` — saat toggle ke visible
- `stop_all_no_headless()` — saat kembalikan ke headless

```
Sebelum: close_browser() → launch_browser() ← Chrome masih lock profile ❌
Sesudah: close_browser() → sleep(2.0s) → launch_browser() ✅
```

---

### Fix 3 — Profile collision antar backend (DeepSeek vs Qwen)

**File:** `scrapers/base_deepseek.py`, `scrapers/base_qwen.py`
**Dipicu oleh:** Kedua backend berjalan bersamaan; salah satunya crash atau mengalami
`SingletonLock` error meski account berbeda.

#### Root Cause
Kedua backend menyimpan profile browser ke direktori yang **sama**:
```
PROFILES_DIR / account   →   profiles/account1/
```
Jika DeepSeek worker dan Qwen worker sama-sama punya `account1`, keduanya membuka
`profiles/account1/` secara bersamaan → konflik lock di OS level.

#### Fix

Profile dipisah ke subdirektori per backend:

| Backend | Sebelum | Sesudah |
|---|---|---|
| DeepSeek | `profiles/account1/` | `profiles/deepseek/account1/` |
| Qwen | `profiles/account1/` | `profiles/qwen/account1/` |

> **Migrasi:** Profile lama di `profiles/<account>/` tidak otomatis dipindah.
> Hapus direktori `profiles/` dan biarkan worker login ulang saat pertama kali jalan,
> atau pindah manual: `profiles/account1/` → `profiles/deepseek/account1/` (DeepSeek)
> dan `profiles/qwen/account1/` (Qwen).

---

## [Unreleased] — 2026-07-26 (sesi 1)

### Fix — Round-Robin Account Rotation di Mode `new` (kedua backend)


**File:** `browser_pool_deepseek.py`, `browser_pool_qwen.py`
**Masalah:** Kedua backend tidak merotasi account saat mode `new`. Request selalu
mendapat slot pertama yang idle, yang dalam praktiknya selalu `account1`.

#### Root Cause

**DeepSeek (`browser_pool_deepseek.py`):**
`_acquire_with_account()` di second pass (mode NEW, tanpa `preferred_account`)
melakukan `for slot in self.slots` dan langsung return slot IDLE pertama yang
ditemukan — selalu slot index 0 (`account1`) selama slot itu tidak sedang BUSY.

**Qwen (`browser_pool_qwen.py`):**
`_wait_for_idle_slot()` di Prioritas 3 (mode NEW) menggunakan
`min(idle_slots, key=lambda s: s.last_used)` — memilih slot yang paling lama
idle. Karena semua slot memiliki `last_used` yang hampir sama saat traffic rendah,
slot 0 (`account1`) cenderung selalu terpilih.

#### Fix

Ditambah field `_rr_index: int = 0` di `BrowserPool.__init__()` pada kedua file.
Field ini bertindak sebagai pointer giliran (round-robin cursor).

**Logika baru (identik di kedua backend):**
```
request NEW masuk → iterasi mulai dari _rr_index
  → temukan slot[(_rr_index + i) % n] yang IDLE
  → _rr_index = (index_slot_terpilih + 1) % n   ← geser untuk request berikutnya
  → return slot
```

| Skenario | Sebelum | Sesudah |
|---|---|---|
| 3 account, 3 request NEW berurutan | acc1, acc1, acc1 | acc1, acc2, acc3 |
| acc1 sedang BUSY, ada request NEW | tunggu acc1 | langsung ambil acc2 |
| mode CONTINUE | tidak berubah (pinned ke account asal) | tidak berubah |
| `preferred_account` eksplisit | tidak berubah | tidak berubah |

---

## [Unreleased] — 2026-07-25

### Ringkasan Sesi

Sesi ini mencakup **4 iterasi perbaikan** pada backend Qwen, mulai dari
crash saat startup hingga unifikasi sistem autentikasi agar identik dengan
backend DeepSeek.

---

### Fix 1 — `AttributeError: 'NoneType' object has no attribute 'stem'`

**File:** `browser_pool_qwen.py`  
**Dipicu oleh:** Worker crash saat pertama kali connect ke VPS (`list_accounts()` dipanggil saat register).

#### Root Cause
`BrowserSlot` mendukung dua mode auth:
- **Email+password mode** → `slot.account_name = "account1"`, `slot.cookie_file = None`
- **Legacy cookie-file mode** → `slot.cookie_file = Path(...)`, `slot.account_name = None`

Tiga fungsi (`list_accounts`, `restart_slot_no_headless`, `stop_all_no_headless`) selalu
mengakses `slot.cookie_file.stem` tanpa null-check, menyebabkan crash di email+password mode.

#### Perubahan
- **Ditambah** static helper `_slot_account_name(slot) -> str`:
  - Prioritas: `account_name` → `cookie_file.stem` → `"slot{id}"` (fallback aman)
- **Diperbaiki** `list_accounts()` — ganti `slot.cookie_file.stem` → `_slot_account_name(slot)`
- **Diperbaiki** `restart_slot_no_headless()` — ganti `slot.cookie_file.stem` → `_slot_account_name(slot)`
- **Diperbaiki** `stop_all_no_headless()` — ganti `slot.cookie_file.stem` → `_slot_account_name(slot)`

---

### Fix 2 — `AttributeError: 'NoneType' object has no attribute 'name'`

**File:** `browser_pool_qwen.py`  
**Dipicu oleh:** Error saat task pertama diproses (`acquire()` dipanggil).

#### Root Cause
Masalah serupa Fix 1 namun pada akses `.name` (bukan `.stem`). Empat lokasi di
`acquire()`, `_wait_for_idle_slot()`, dan `get_cookie_path()` mengakses
`slot.cookie_file.name` tanpa null-check.

#### Perubahan
- **Ditambah** static helper `_slot_cookie_name(slot) -> str`:
  - Prioritas: `cookie_file.name` → `account_name + ".json"` → `"slot{id}.json"` (fallback)
  - Dipakai sebagai identifier untuk routing dan session affinity di pool
- **Diperbaiki** `acquire()` — log debug dan yield ganti ke `_slot_cookie_name(slot)`
- **Diperbaiki** `_wait_for_idle_slot()` — matching preferred_cookie ganti ke `_slot_cookie_name(s)`
- **Diperbaiki** `get_cookie_path()` — iterasi slot ganti ke `_slot_cookie_name(slot)`, tambah guard `None`
- **Dihapus** import `discover_cookie_files` yang tidak lagi digunakan

---

### Feature — Unifikasi Auth Qwen → Model DeepSeek (Email+Password)

**File:** `browser_pool_qwen.py`, `public_qwen.py`  
**Latar belakang:** Backend Qwen sebelumnya mendukung dua mode auth yang bisa aktif
bersamaan (email+password via `authqwen.json` *atau* legacy cookie-file). Ini menyebabkan
ambiguitas, code path yang tidak ter-cover, dan tidak konsisten dengan DeepSeek.

#### Tujuan
Menyamakan sepenuhnya alur auth Qwen dengan DeepSeek:
```
authqwen.json → AuthStore → account list
_init_slot()  → QwenScraper(account=...) → launch_browser(account)
              → ensure_authenticated()   → login jika session tidak valid
```

#### Perubahan di `browser_pool_qwen.py`

| Komponen | Sebelum | Sesudah |
|---|---|---|
| `BrowserPool.__init__()` | Deteksi mode (auth.json atau cookie-file) | SELALU baca dari `authqwen.json`; raise `RuntimeError` jika kosong |
| `BrowserPool.start()` | `if _use_auth_mode / else cookie-file` | Satu path: round-robin account dari `authqwen.json` |
| `BrowserPool._init_slot()` | `if account_name / else cookie-file` | Satu path: `QwenScraper(account=...)` → `launch_browser()` → `ensure_authenticated()` |
| `BrowserPool.add_account()` | Terima `cookie_filename: str` (path file) | Terima `account_name: str`; validasi account ada di `authqwen.json` |
| `BrowserPool.restart_slot_no_headless()` | Init ulang via `cookies_path=...` | Init ulang via `account=...` → `ensure_authenticated()` |
| Import | `from scrapers.utils import AuthStore, discover_cookie_files, setup_logger` | `discover_cookie_files` dihapus (tidak dipakai) |

#### Perubahan di `public_qwen.py`

| Komponen | Sebelum | Sesudah |
|---|---|---|
| `Session.cookie_file: Path` | Menyimpan path file cookie | **Diganti** `account_name: str` |
| `SessionStore._to_dict()` | Serialize `cookie_file` sebagai string path | Serialize `account_name` |
| `SessionStore._from_dict()` | `Path(d["cookie_file"])` | Baca `account_name`; backward compat: derive dari `cookie_file` stem jika session lama |
| `SessionStore.create()` | Param `cookie_file: Path` | Param `account_name: str` |
| `SessionStore.get_or_create()` | Param `cookie_file: Path` | Param `account_name: str` |
| `TaskProcessor._run()` | `session_cookie_file: Path` untuk session affinity | `session_account: str` |
| `preferred_cookie` resolution | Dari `existing.cookie_file.name` | Dari `f"{existing.account_name}.json"` |
| CLI `addaccount` | Prompt "Contoh: addaccount account3.json" | Prompt "Contoh: addaccount account3" + info `authqwen.json` |

#### Backward Compatibility
- `BrowserSlot.cookie_file: Path | None` dipertahankan sebagai field opsional
- `_slot_account_name()` dan `_slot_cookie_name()` menangani kedua mode
- `_from_dict()` dapat membaca session lama dari disk yang masih menyimpan format `cookie_file`

#### Format `authqwen.json` (sama dengan `auth.json` DeepSeek)
```json
[
  {"name": "account1", "email": "user@email.com", "password": "secret"},
  {"name": "account2", "email": "user2@email.com", "password": "secret2"}
]
```

---

### Fix 3 — Login tidak terpicu saat warmup + Warning `Cookie 'qwen.json' tidak ditemukan`

**File:** `scrapers/qwen_scraper.py`, `public_qwen.py`  
**Dipicu oleh:** Worker startup berhasil tapi browser tidak melakukan login; setiap request memunculkan warning routing.

#### Bug A — `ensure_authenticated()` tidak trigger login

**Root Cause:**  
Setelah `launch_browser()`, page masih `about:blank` (profile kosong) atau halaman
terakhir yang tersimpan oleh Playwright. `_is_unauthenticated()` hanya memeriksa URL dan
DOM *halaman saat ini* — karena tidak ada tombol Login di `about:blank`, fungsi ini
mengembalikan `False` (dikira sudah login) padahal session belum diverifikasi.

Perbandingan dengan DeepSeek: DeepSeek menavigasi ke `chat.deepseek.com` di
`is_session_expired()` sehingga bisa mendeteksi redirect ke `/sign_in`.

**Fix di `ensure_authenticated()` (`qwen_scraper.py`):**
```
Sebelum: launch_browser → cek DOM (about:blank) → "sudah login" ❌
Sesudah: launch_browser → goto chat.qwen.ai → cek DOM → login jika perlu ✅
```

Logika lengkap:
1. Jika sudah di `chat.qwen.ai` → skip navigate (optimasi untuk re-check)
2. Jika belum → `goto("https://chat.qwen.ai")` + `sleep(1.5s)` untuk SPA render
3. `_is_unauthenticated()` → cek URL patterns dan tombol Login
4. Jika tidak terautentikasi → `login()` → isi form email+password

**Log yang diharapkan setelah fix:**
```
Slot#0: warming up account 'account1' …
ensure_authenticated: navigasi ke chat.qwen.ai (current url: about:blank)
ensure_authenticated: tombol Login/Sign Up terdeteksi → memulai login otomatis
Login ke Qwen sebagai email@gmail.com (account: account1)
Slot#0 ✅ siap (account: account1, auth: email+password via authqwen.json)
```

#### Bug B — `Cookie 'qwen.json' tidak ditemukan di pool`

**Root Cause:**  
Mapping `model → preferred_cookie` dilakukan secara naif:
```python
# Sebelum (salah):
payload["preferred_cookie"] = payload["model"]   # "qwen" → "qwen.json"
```
Model `"qwen"` (tanpa account spesifik) berubah jadi `"qwen.json"` yang tidak cocok
dengan nama slot manapun (slot bernama `"account1.json"`, bukan `"qwen.json"`).

**Fix di `public_qwen.py`:**
```python
# Sesudah (benar):
_m = re.match(r"qwen\(([^)]+)\)", model_val, re.IGNORECASE)
preferred_cookie = _m.group(1) if _m else None
```

| Input model | Sebelum | Sesudah |
|---|---|---|
| `"qwen"` | `"qwen.json"` ❌ | `None` (any slot) ✅ |
| `"qwen-max"` | `"qwen-max.json"` ❌ | `None` (any slot) ✅ |
| `"qwen(account1)"` | `"qwen(account1).json"` ❌ | `"account1"` ✅ |

---

## File yang Dimodifikasi

### Sesi 2026-07-26 (sesi 2)

| File | Fix 1 (DS warmup) | Fix 2 (Qwen lock) | Fix 3 (profile collision) |
|---|:---:|:---:|:---:|
| `scrapers/deepseek_scraper.py` | ✅ | — | — |
| `browser_pool_qwen.py` | — | ✅ | — |
| `scrapers/base_deepseek.py` | — | — | ✅ |
| `scrapers/base_qwen.py` | — | — | ✅ |

### Sesi 2026-07-26 (sesi 1)

| File | Round-Robin Rotation |
|---|:---:|
| `browser_pool_deepseek.py` | ✅ |
| `browser_pool_qwen.py` | ✅ |

### Sesi 2026-07-25

| File | Fix 1 | Fix 2 | Auth Unifikasi | Fix 3 |
|---|:---:|:---:|:---:|:---:|
| `browser_pool_qwen.py` | ✅ | ✅ | ✅ | — |
| `public_qwen.py` | — | — | ✅ | ✅ |
| `scrapers/qwen_scraper.py` | — | — | — | ✅ |

---

## Catatan Migrasi

### Dari legacy cookie-file mode ke auth.json mode

Jika sebelumnya menggunakan cookie files (`cookies/account1.json`, dst.):

1. **Buat `cookies/authqwen.json`** dengan format:
   ```json
   [{"name": "account1", "email": "...", "password": "..."}]
   ```

2. **Hapus session lama** (format tidak kompatibel):
   ```bash
   # Windows
   del dataSession\*.json
   # Linux/Mac
   rm dataSession/*.json
   ```

3. **Hapus profile lama** jika ada (opsional, untuk first-run login bersih):
   ```bash
   rmdir /s /q profiles\account1
   ```

4. **Jalankan ulang worker:**
   ```bash
   python public.py --backend qwen --vps ws://VPS_IP:9000/ws/worker --workers 2
   ```

---

*Terakhir diperbarui: 2026-09-03.*