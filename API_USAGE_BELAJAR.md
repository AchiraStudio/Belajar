# Dokumentasi Penggunaan API (Belajar)

Dokumentasi ini menjelaskan seluruh Application Programming Interface (API) yang tersedia pada aplikasi **Belajar**, format request, parameter, dan contoh responsnya.

---

## Daftar Isi
1. [Arsitektur & Konsep Dasar](#arsitektur--konsep-dasar)
2. [Autentikasi & Sesi](#1-autentikasi--sesi)
   - [Login](#post-apilogin)
   - [Logout](#post-apilogout)
   - [Cek Sesi](#get-apisession)
   - [Status Koneksi Agent](#get-apistatus)
3. [Upload Dokumen](#2-upload-dokumen)
   - [Upload File Materi](#post-apiupload)
4. [Remote Procedure Call (RPC) API](#3-remote-procedure-call-rpc-api)
   - [Sistem & Diagnostik](#a-sistem--diagnostik) (`ping`, `llm_check`, `get_job`, `get_settings`, `save_settings`)
   - [Mata Pelajaran / Subjects](#b-mata-pelajaran--subjects) (`list_subjects`, `create_subject`, `delete_subject`)
   - [Dokumen Materi](#c-dokumen-materi) (`list_documents`, `get_document`, `update_document`, `delete_document`, `reprocess_document`)
   - [Catatan & Sesi Belajar](#d-catatan--sesi-belajar) (`save_note`, `log_study`)
   - [Kuis](#e-kuis) (`generate_quiz`, `list_quizzes`, `delete_quiz`)
   - [Pengerjaan Kuis & Spaced Repetition](#f-pengerjaan-kuis--spaced-repetition) (`start_attempt`, `start_review`, `get_attempt`, `check_answer`, `finish_attempt`, `explain_question`)
   - [Dasbor & Progres Belajar](#g-dasbor--progres-belajar) (`dashboard`, `progress`)
   - [Chat AI per Materi / DeepSeek](#h-chat-ai-per-materi--deepseek) (`chat_start`, `chat_get`, `chat_send`, `chat_delete`)
5. [WebSocket Bridge](#4-websocket-bridge)
6. [Penanganan Error & Kode Status HTTP](#5-penanganan-error--kode-status-http)
7. [Contoh Penggunaan (JavaScript / Fetch & cURL)](#6-contoh-penggunaan)

---

## Arsitektur & Konsep Dasar

Aplikasi ini menggunakan model **Hybrid VPS + Local Agent**:
* **VPS (Server Express / `server.js`)**: Menangani antarmuka web, otentikasi sesi cookie, rate limiting, dan menjadi reverse proxy WebSocket (`/bridge`).
* **PC Lokal (Agent Python / `agent.py`)**: Menyimpan SQLite (`data/belajar.db`), file dokumen fisik, serta menjalankan AI pipeline (ekstraksi, OCR, LLM Qwen/Grok via PAF Gateway).
* Sebagian besar fungsi aplikasi dipanggil melalui **RPC Pattern**:
  `POST /api/rpc/:action`
  Payload diteruskan secara aman melalui WebSocket bridge ke PC lokal, diproses oleh handler Python, dan hasilnya dikembalikan sebagai respons JSON.

### Format Respons Sukses
```json
{
  "ok": true,
  "data": { ... }
}
```

### Format Respons Error
```json
{
  "error": "Pesan kesalahan yang ramah pengguna"
}
```
Jika PC lokal sedang mati/tidak terhubung:
```json
{
  "error": "PC lokal sedang offline. Nyalakan agent lalu coba lagi.",
  "offline": true
}
```

---

## 1. Autentikasi & Sesi

Aplikasi menggunakan autentikasi berbasis cookie bertanda tangan HMAC-SHA256 (`sid`).

### `POST /api/login`
Masuk ke aplikasi menggunakan password aplikasi.
* **Rate limit**: Maksimal 6 percobaan per menit per IP.
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "password": "password_rahasia_anda"
  }
  ```
* **Respons Sukses (200)**:
  * Mengembalikan cookie `sid` pada header `Set-Cookie` (`HttpOnly`, `SameSite=Strict`, `Max-Age=30 hari`).
  ```json
  { "ok": true }
  ```
* **Respons Gagal**:
  * `401 Unauthorized`: `{"error": "Password salah"}`
  * `429 Too Many Requests`: `{"error": "Terlalu banyak percobaan. Coba lagi sebentar."}`

---

### `POST /api/logout`
Keluar dari aplikasi dan menghapus cookie sesi.
* **Headers**: Mengirimkan cookie `sid`.
* **Respons Sukses (200)**:
  ```json
  { "ok": true }
  ```

---

### `GET /api/session`
Mengecek apakah sesi pengguna saat ini masih valid atau belum login.
* **Respons (200)**:
  ```json
  {
    "authenticated": true
  }
  ```

---

### `GET /api/status`
Mengecek apakah PC lokal (agent Python) sedang aktif dan terhubung ke VPS bridge.
* **Auth**: Wajib login.
* **Respons (200)**:
  ```json
  {
    "agent": true
  }
  ```

---

## 2. Upload Dokumen

### `POST /api/upload`
Mengunggah file materi baru untuk diproses secara otomatis oleh AI pipeline di PC lokal.
* **Auth**: Wajib login. Agent lokal wajib online.
* **Content-Type**: `multipart/form-data`
* **Format File yang Didukung**: `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.txt`, `.md`.
* **Batas Ukuran**: Default 40 MB (`MAX_UPLOAD_MB`).
* **Form Fields**:
  | Field | Tipe | Wajib | Keterangan |
  | :--- | :--- | :--- | :--- |
  | `file` | File Binary | Ya | Berkas materi pembelajaran. |
  | `subject_id` | Integer | Tidak | ID mata pelajaran tujuan. |
  | `new_subject`| String | Tidak | Buat mata pelajaran baru jika belum ada. |
  | `title` | String | Tidak | Judul kustom dokumen (maksimal 120 karakter). |
  | `style` | String | Tidak | Gaya catatan AI: `"ringkas"` (default), `"detail"`, atau `"cornell"`. |

* **Respons Sukses (200)**:
  ```json
  {
    "ok": true,
    "data": {
      "doc_id": 12,
      "job_id": 45
    }
  }
  ```

---

## 3. Remote Procedure Call (RPC) API

Semua endpoint berikut dipanggil menggunakan:
* **Method**: `POST`
* **URL**: `/api/rpc/:action`
* **Header**: `Content-Type: application/json`
* **Auth**: Wajib login.

---

### A. Sistem & Diagnostik

#### 1. `ping`
Mengecek versi aplikasi, waktu server lokal, dan konfigurasi token LLM.
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "version": "1.0.0",
      "time": 1729681200,
      "llm_configured": true
    }
  }
  ```

#### 2. `llm_check`
Mengetes konektivitas ke gateway PAF-Model (Qwen & Grok).
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "ok": true,
      "backend": "qwen",
      "model": "qwen-max",
      "latency_ms": 320
    }
  }
  ```

#### 3. `get_job`
Memantau kemajuan pekerjaan asinkron (misal: ekstraksi dokumen atau generate kuis).
* **Payload**:
  ```json
  {
    "id": 45
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "id": 45,
      "kind": "process_document",
      "status": "running",
      "progress": 65,
      "message": "Membaca halaman 5 dari 8",
      "error": null
    }
  }
  ```

#### 4. `get_settings`
Mengambil preferensi pengaturan belajar pengguna dan zona waktu.
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "settings": {
        "daily_goal_min": "15",
        "weekly_goal_min": "100",
        "notes_style": "ringkas",
        "language": "auto"
      },
      "timezone": "Asia/Jakarta"
    }
  }
  ```

#### 5. `save_settings`
Menyimpan perubahan pengaturan preferensi belajar.
* **Payload**:
  ```json
  {
    "settings": {
      "daily_goal_min": 20,
      "weekly_goal_min": 120,
      "notes_style": "cornell"
    }
  }
  ```
* **Respons**: Mengembalikan objek `settings` yang telah diperbarui.

---

### B. Mata Pelajaran / Subjects

#### 1. `list_subjects`
Mengambil semua daftar mata pelajaran beserta jumlah dokumen di dalamnya.
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "subjects": [
        {
          "id": 1,
          "name": "Kalkulus II",
          "color": "#4f7cac",
          "doc_count": 5,
          "created_at": 1729600000
        }
      ]
    }
  }
  ```

#### 2. `create_subject`
Membuat mata pelajaran baru.
* **Payload**:
  ```json
  {
    "name": "Struktur Data",
    "color": "#c0793f"
  }
  ```
  *(Catatan: `color` opsional dalam format hex `#xxxxxx`)*
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "subject": {
        "id": 2,
        "name": "Struktur Data",
        "color": "#c0793f",
        "created_at": 1729681200
      }
    }
  }
  ```

#### 3. `delete_subject`
Menghapus mata pelajaran beserta relasinya.
* **Payload**:
  ```json
  {
    "id": 2
  }
  ```
* **Respons**: `{ "ok": true, "data": {} }`

---

### C. Dokumen Materi

#### 1. `list_documents`
Mengambil daftar dokumen yang telah diunggah.
* **Payload**:
  ```json
  {
    "subject_id": 1
  }
  ```
  *(Catatan: `subject_id` opsional; kosongkan untuk mengambil semua dokumen)*
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "documents": [
        {
          "id": 12,
          "subject_id": 1,
          "title": "Bab 3 - Turunan Implisit",
          "filename": "turunan.pdf",
          "size": 184412,
          "status": "ready",
          "page_count": 14,
          "style": "ringkas",
          "quiz_count": 2,
          "job_progress": 100
        }
      ]
    }
  }
  ```

#### 2. `get_document`
Mengambil isi lengkap dokumen: ringkasan AI, konsep kunci, topik, catatan personal, dan daftar kuis terkait.
* **Payload**:
  ```json
  {
    "id": 12
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "document": {
        "id": 12,
        "title": "Bab 3 - Turunan Implisit",
        "status": "ready",
        "key_concepts": ["Diferensiasi", "Fungsi Implisit", "Aturan Rantai"],
        "topics": ["Kalkulus"],
        "summary": "Materi membahas turunan dari variabel x dan y..."
      },
      "subject": { "id": 1, "name": "Kalkulus II", "color": "#4f7cac" },
      "note": { "content_md": "## Catatan Pribadi...", "edited": 1 },
      "quizzes": [ ... ],
      "job": null
    }
  }
  ```

#### 3. `update_document`
Mengubah judul dokumen atau memindahkan mata pelajaran.
* **Payload**:
  ```json
  {
    "id": 12,
    "title": "Bab 3 - Turunan Implisit (Revisi)",
    "subject_id": 1
  }
  ```
* **Respons**: `{ "ok": true, "data": {} }`

#### 4. `delete_document`
Menghapus dokumen dari database beserta file fisiknya di disk PC lokal.
* **Payload**:
  ```json
  {
    "id": 12
  }
  ```
* **Respons**: `{ "ok": true, "data": {} }`

#### 5. `reprocess_document`
Menjalankan ulang pemrosesan AI (misal ingin mengganti gaya catatan atau mengulang bagian yang gagal).
* **Payload**:
  ```json
  {
    "id": 12,
    "style": "cornell",
    "force": true,
    "reextract": false
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "job_id": 48
    }
  }
  ```

---

### D. Catatan & Sesi Belajar

#### 1. `save_note`
Menyimpan editan catatan pribadi berbasis Markdown pada dokumen tertentu.
* **Payload**:
  ```json
  {
    "document_id": 12,
    "content_md": "# Rangkuman Singkat\n1. Aturan rantai adalah..."
  }
  ```
* **Respons**: `{ "ok": true, "data": {} }`

#### 2. `log_study`
Mencatat durasi membaca/belajar manual untuk penghitungan streak harian.
* **Payload**:
  ```json
  {
    "seconds": 60,
    "document_id": 12
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "streak": {
        "current_streak": 5,
        "today_done": true,
        "seconds_today": 960,
        "freezes_available": 1
      }
    }
  }
  ```

---

### E. Kuis

#### 1. `generate_quiz`
Membuat paket kuis baru berbasis materi dokumen menggunakan AI.
* **Payload**:
  ```json
  {
    "document_id": 12,
    "title": "Kuis Latihan Turunan",
    "count": 10,
    "difficulty": "mixed",
    "types": ["mcq", "tf", "short"],
    "quality": "normal"
  }
  ```
  | Parameter | Pilihan | Default |
  | :--- | :--- | :--- |
  | `difficulty` | `"easy"`, `"medium"`, `"hard"`, `"mixed"` | `"mixed"` |
  | `types` | Kombinasi dari `["mcq", "tf", "short"]` | `["mcq", "tf"]` |
  | `quality` | `"normal"` (Qwen auto), `"high"` (Qwen thinking) | `"normal"` |
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "job_id": 50
    }
  }
  ```

#### 2. `list_quizzes`
Mengambil daftar kuis yang ada.
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "quizzes": [
        {
          "id": 5,
          "title": "Kuis Latihan Turunan",
          "difficulty": "mixed",
          "source_title": "Bab 3 - Turunan Implisit",
          "question_count": 10,
          "attempt_count": 3,
          "last_pct": 80
        }
      ]
    }
  }
  ```

#### 3. `delete_quiz`
Menghapus kuis beserta butir soal dan riwayat pengerjaannya.
* **Payload**:
  ```json
  {
    "id": 5
  }
  ```
* **Respons**: `{ "ok": true, "data": {} }`

---

### F. Pengerjaan Kuis & Spaced Repetition

#### 1. `start_attempt`
Memulai sesi baru untuk mengerjakan kuis.
* **Payload**:
  ```json
  {
    "quiz_id": 5,
    "mode": "practice",
    "shuffle": true,
    "time_limit_min": 15
  }
  ```
  | Parameter | Pilihan | Keterangan |
  | :--- | :--- | :--- |
  | `mode` | `"practice"` atau `"exam"` | Mode `practice` memberikan umpan balik jawaban langsung. Mode `exam` mengunci jawaban hingga selesai. |
* **Respons**: Mengembalikan objek `attempt` dan daftar `questions`.

#### 2. `start_review`
Memulai sesi kuis adaptif untuk mengulang **soal-soal lemah** (soal yang pernah dijawab salah atau butuh pengulangan berjarak / spaced repetition).
* **Payload**:
  ```json
  {
    "count": 10,
    "subject_id": 1
  }
  ```
* **Respons**: Sama seperti format `start_attempt`.

#### 3. `get_attempt`
Mengambil progres pengerjaan sesi kuis saat ini (misal saat halaman dimuat ulang).
* **Payload**:
  ```json
  {
    "attempt_id": 23
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "attempt": {
        "id": 23,
        "quiz_id": 5,
        "mode": "practice",
        "started_at": 1729682000,
        "finished_at": null,
        "score": 4,
        "total": 10
      },
      "questions": [
        {
          "id": 101,
          "qtype": "mcq",
          "question": "Berapakah turunan dari sin(x)?",
          "options": ["cos(x)", "-cos(x)", "tan(x)", "sec(x)"],
          "topic": "Trigonometri",
          "position": 1,
          "given": "cos(x)",
          "correct": true,
          "revealed": true
        }
      ]
    }
  }
  ```

#### 4. `check_answer`
Memeriksa jawaban untuk satu butir soal secara instan (khusus mode `practice`).
* **Payload**:
  ```json
  {
    "attempt_id": 23,
    "question_id": 101,
    "given": "cos(x)"
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "answer": "cos(x)",
      "correct": true,
      "explanation": "Turunan dari fungsi sinus adalah cosinus.",
      "feedback": "Tepat sekali!"
    }
  }
  ```

#### 5. `finish_attempt`
Menyelesaikan sesi kuis, mengirimkan semua jawaban akhir, dan menghitung skor total.
* **Payload**:
  ```json
  {
    "attempt_id": 23,
    "duration": 340,
    "answers": {
      "101": "cos(x)",
      "102": "Benar"
    }
  }
  ```
* **Respons**: Mengembalikan status kuis yang telah selesai dengan total nilai dan statistik retensi.

#### 6. `explain_question`
Meminta AI (Grok atau Qwen deep thinking) memberikan penjelasan mendalam langkah demi langkah mengenai konsep pada soal tersebut.
* **Payload**:
  ```json
  {
    "question_id": 101,
    "attempt_id": 23
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "cached": false,
      "job_id": 55
    }
  }
  ```
  *(Jika penjelasan sudah pernah dibuat sebelumnya, akan langsung mengembalikan `"cached": true, "text": "..."`)*

---

### G. Dasbor & Progres Belajar

#### 1. `dashboard`
Mengambil ringkasan beranda utama (streak harian, heatmap aktivitas, target mingguan, dokumen terbaru, dan rekomendasi review soal).
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "streak": { "current_streak": 7, "freezes_available": 1, "today_done": true },
      "heatmap": [ { "day": "2026-10-23", "seconds": 1200, "quizzes": 2 } ],
      "weekly": { "current_sec": 7200, "goal_sec": 6000, "pct": 120 },
      "recent_docs": [ ... ],
      "recent_attempts": [ ... ],
      "weak_topics": [ ... ],
      "weak_count": 4
    }
  }
  ```

#### 2. `progress`
Mengambil analitik lengkap statistik belajar (grafik tren skor kuis, matriks topik yang kuat/lemah, histori belajar 14 hari).
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "overall": { "total_study_sec": 28400, "total_quizzes": 15, "avg_score_pct": 84 },
      "trend": [ ... ],
      "topics": [
        { "topic": "Kalkulus", "level": "strong", "correct_pct": 92 },
        { "topic": "Aljabar Linear", "level": "weak", "correct_pct": 54 }
      ],
      "study_days": [ ... ]
    }
  }
  ```

---

### H. Chat AI per Materi / DeepSeek

Fitur tanya-jawab interaktif per materi menggunakan model **DeepSeek** (fallback **Qwen**). Mendukung dua mode pada gateway PAF:
* **Mode NEW**: Sesi baru dibuat, sistem secara otomatis merangkai seluruh konteks materi (metadata, ringkasan, konsep kunci, dan catatan per bagian). Injeksi konteks dikirim ke gateway dengan `mode: "new"`. Gateway menyimpan sesi server-side dan mengembalikan `X-Session-ID` (`gateway_session_id`). Selama proses persiapan berlangsung (`status: "preparing"`), status dapat dipantau dan input dikunci sampai status menjadi `"ready"`.
* **Mode CONTINUE**: Saat siswa mengirimkan pertanyaan, request dikirim dengan header `X-Session-ID` dan `mode: "continue"`. Model DeepSeek melanjutkan percakapan menggunakan memori sesi yang sudah memuat seluruh konteks materi tanpa perlu mengirim ulang teks materi. Sesi dipertahankan hingga pengguna menghapus sesi chat (`chat_delete`).

#### 1. `chat_start`
Memulai sesi chat baru atau melanjutkan sesi yang sudah ada untuk sebuah dokumen materi.
* **Payload**:
  ```json
  {
    "document_id": 12
  }
  ```
* **Respons (Mode NEW)**:
  ```json
  {
    "ok": true,
    "data": {
      "session": {
        "id": 1,
        "document_id": 12,
        "status": "preparing",
        "created_at": 1729700000.0,
        "updated_at": 1729700000.0
      },
      "document": { "id": 12, "title": "Pengantar Biologi Sel" },
      "messages": [],
      "mode": "new",
      "job_id": 42
    }
  }
  ```
* **Respons (Mode CONTINUE)**:
  ```json
  {
    "ok": true,
    "data": {
      "session": {
        "id": 1,
        "document_id": 12,
        "status": "ready",
        "created_at": 1729700000.0,
        "updated_at": 1729700050.0
      },
      "document": { "id": 12, "title": "Pengantar Biologi Sel" },
      "messages": [
        { "id": 1, "role": "user", "content": "Jelaskan fungsi mitokondria?", "ts": 1729700020.0 },
        { "id": 2, "role": "assistant", "content": "Mitokondria adalah organel...", "ts": 1729700025.0 }
      ],
      "mode": "continue"
    }
  }
  ```

#### 2. `chat_get`
Mengambil status sesi chat dan riwayat pesan (digunakan untuk polling saat persiapan konteks berlangsung).
* **Payload**:
  ```json
  {
    "session_id": 1
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "session": { "id": 1, "document_id": 12, "status": "ready", ... },
      "document": { "id": 12, "title": "Pengantar Biologi Sel" },
      "messages": [ ... ]
    }
  }
  ```

#### 3. `chat_send`
Mengirim pertanyaan pengguna dan mendapatkan jawaban dari model DeepSeek (mode CONTINUE & STREAM).
* **Payload**:
  ```json
  {
    "session_id": 1,
    "message": "Apa perbedaan utama reaksi terang dan siklus Calvin?",
    "stream": true
  }
  ```
* **Respons RPC Standar (`POST /api/rpc/chat_send`)**:
  ```json
  {
    "ok": true,
    "data": {
      "response": "Perbedaan utama terletak pada lokasi dan kebutuhan cahaya...",
      "messages": [ ... ]
    }
  }
  ```
* **Endpoint Streaming SSE (`POST /api/chat/send`)**:
  Endpoint ini menggunakan format SSE (`text/event-stream`) untuk menampilkan jawaban secara bertahap (streaming):
  - Tiap potongan teks dikirim sebagai: `data: {"type":"chunk","chunk":"kata demi kata..."}`
  - Respons selesai dikirim sebagai: `data: {"type":"done","data":{"response":"...","messages":[...]}}`
  - Jika error: `data: {"type":"error","error":"pesan error"}`

#### 4. `chat_delete`
Menghapus sesi chat untuk materi terkait beserta semua riwayat pesannya.
* **Payload**:
  ```json
  {
    "session_id": 1
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {}
  }
  ```

#### 5. `notes_ask`
Panel Tanya pada catatan: menjawab pertanyaan singkat tentang teks yang diseleksi pengguna di halaman catatan. **Bersesi** — pertanyaan pertama (tanpa `ask_session_id`) menginjeksi seluruh isi materi ke sesi gateway baru (mode NEW) sekaligus menjawab; pertanyaan berikutnya melanjutkan sesi yang sama (mode CONTINUE) tanpa injeksi ulang. Sesi chat per materi tidak tersentuh. Respons memuat `ask_session_id` yang dikirim ulang oleh klien pada pertanyaan berikutnya; sesi dibersihkan lewat `notes_ask_delete`.
* **Payload**:
  ```json
  {
    "document_id": 1,
    "quote": "reaksi terang menghasilkan ATP dan NADPH",
    "question": "Jelaskan teks ini dengan bahasa sederhana.",
    "ask_session_id": 12,
    "stream": true
  }
  ```
  (`ask_session_id` opsional: hilangkan pada pertanyaan pertama.)
* **Respons RPC Standar (`POST /api/rpc/notes_ask`)**:
  ```json
  {
    "ok": true,
    "data": {
      "answer": "Teks itu menjelaskan... Contoh: seperti panel surya.",
      "ask_session_id": 12,
      "mode": "new"
    }
  }
  ```
* **Endpoint Streaming SSE (`POST /api/notes/ask`)**:
  Endpoint ini menggunakan format SSE (`text/event-stream`) untuk menampilkan jawaban secara bertahap (streaming):
  - Tiap potongan teks dikirim sebagai: `data: {"type":"chunk","chunk":"kata demi kata..."}`
  - Respons selesai dikirim sebagai: `data: {"type":"done","data":{"answer":"...","ask_session_id":12,"mode":"new"}}`
  - Jika error: `data: {"type":"error","error":"pesan error"}`

#### 6. `notes_ask_delete`
Menutup sesi panel Tanya: menghapus sesi di gateway PAF lalu barisnya di database. Dipanggil saat panel ditutup/halaman materi ditinggalkan.
* **Payload**:
  ```json
  {
    "ask_session_id": 12
  }
  ```
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {}
  }
  ```



### i. Game Interaktif, Peta Penguasaan & Kartu Belajar (v2.0)

Game interaktif dijalankan langsung bersama model DeepSeek dalam mode streaming, di mana agent lokal bertindak sebagai wasit penyimpan rahasia, penilai performa, dan pengelola model penguasaan konsep.

#### 1. `play_hub`
Mengambil data utama hub game: daftar mode, sesi game aktif untuk dilanjutkan, profil XP/level, ringkasan kartu jatuh tempo, misi harian, dan statistik penguasaan.
* **Payload**: `{}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "modes": [...],
      "active_run": null,
      "profile": { "level": 2, "xp": 120, "level_start": 100, "next": 300 },
      "streak": { "current": 7, "longest": 10 },
      "cards_due_count": 5,
      "weak_concepts_count": 2,
      "mastered_concepts_count": 8,
      "quests": [...]
    }
  }
  ```

#### 2. `play_scope_info`
Mengecek kesiapan konsep materi atau mata pelajaran untuk dimainkan.
* **Payload**: `{"document_id": 1}` atau `{"subject_id": 2}`
* **Respons**:
  ```json
  {
    "ok": true,
    "data": {
      "source": { "kind": "document", "id": 1, "title": "Fotosintesis" },
      "concept_count": 12,
      "ready": true,
      "topics": [...]
    }
  }
  ```

#### 3. `play_turn` (RPC & SSE Streaming)
Menjalankan siklus giliran permainan:
- `op: "start"`: Memulai permainan baru dan memanggil AI mode NEW.
- `op: "answer"`: Mengirimkan jawaban pengguna, memicu penilaian, dan meminta giliran berikutnya.
- `op: "hint"`: Meminta petunjuk bertingkat sokratik (tingkat 1–3).
- `op: "retry"`: Mengulang giliran yang mengalami kendala teknis.

* **Endpoint Streaming SSE (`POST /api/play/turn`)**:
  - Potongan narasi dikirim sebagai: `data: {"type":"chunk","chunk":"..."}`
  - Heartbeat dikirim tiap 15 detik: `: ping`
  - Respons selesai: `data: {"type":"done","data":{"turn":{...},"run":{...},"rewards":{...}}}`

#### 4. `play_turn_get`
Mengambil data satu giliran (digunakan untuk pemulihan koneksi atau polling saat koneksi stream terputus).
* **Payload**: `{"turn_id": 10}`

#### 5. `play_get`
Mengambil data detail sesi permainan dan seluruh riwayat gilirannya (rahasia disembunyikan untuk giliran yang belum selesai).
* **Payload**: `{"run_id": 3}`

#### 6. `play_finish`
Menutup sesi permainan aktif secara resmi, mengklaim bonus XP akhir permainan (+25 selesai, +15 akurasi >=80%), dan menghapus sesi di gateway.
* **Payload**: `{"run_id": 3}`

#### 7. `play_abandon`
Membatalkan sesi permainan yang sedang berlangsung dan membebaskan sesi di gateway.
* **Payload**: `{"run_id": 3}`

#### 8. `play_flag`
Menandai bahwa soal pada giliran tertentu keliru; membatalkan bukti performa giliran tersebut dan menghitung ulang skor penguasaan konsep di database.
* **Payload**: `{"turn_id": 10}`

#### 9. `play_history`
Mengambil riwayat sesi permainan yang telah selesai.
* **Payload**: `{"limit": 20}`

#### 10. `mastery_map`
Peta penguasaan konsep visual komprehensif, mengelompokkan konsep per topik beserta statusnya (`baru`, `dikenal`, `paham`, `kuasai`).
* **Payload**: `{"document_id": 1}` atau `{}` untuk seluruh materi

#### 11. `quests_get`
Mendapatkan 3 misi harian untuk tanggal hari ini beserta status penyelesaiannya.
* **Payload**: `{}`

#### 12. `concepts_list` & `concepts_expand`
- `concepts_list`: Mengambil daftar istilah materi (`{"document_id": 1}`).
- `concepts_expand`: Menjalankan job latar belakang AI untuk menambah istilah baru dari materi (`{"document_id": 1, "count": 15}`).

#### 13. Kartu Belajar SM-2 (`cards_due`, `cards_review`, `cards_build`, `cards_stats`, `cards_export`)
- `cards_due`: Mengambil kartu belajar yang jatuh tempo hari ini (`limit`).
- `cards_review`: Mengirim nilai evaluasi kartu (1=lagi, 3=sulit, 4=baik, 5=mudah) untuk dijadwalkan ulang oleh algoritma SM-2.
- `cards_build`: Membangun kartu belajar dari seluruh konsep materi.
- `cards_stats`: Statistik status kartu per materi.
- `cards_export`: Mengekspor kartu ke format TSV 3-kolom yang kompatibel dengan Anki.

---

## 4. WebSocket Bridge

Endpoint WebSocket digunakan secara eksklusif oleh PC Lokal ([agent.py](file:///C:/Users/RYR/Desktop/MyLearn/agent.py)) untuk membuka koneksi bolak-balik ke VPS:

* **URL**: `ws://HOST:PORT/bridge` (atau `wss://domain.com/bridge` jika menggunakan HTTPS).
* **Otentikasi**:
  * Melalui Header: `Authorization: Bearer <BRIDGE_TOKEN>`
  * Atau melalui Query Parameter: `?token=<BRIDGE_TOKEN>`
* **Format Pesan**: JSON berisi `req_id`, `action`, payload parameter, dan hasil pengembalian (`ok`, `data`, atau `error`).

---

## 5. Penanganan Error & Kode Status HTTP

| HTTP Code | Arti | Contoh Kasus |
| :--- | :--- | :--- |
| `200 OK` | Berhasil | Permintaan diproses dan mengembalikan JSON dengan `"ok": true`. |
| `400 Bad Request` | Permintaan Tidak Valid | Parameter tidak lengkap, file rusak, atau kesalahan validasi bisnis (`UserError`). |
| `401 Unauthorized` | Belum Login | Cookie sesi tidak ada, kedaluwarsa, atau token bridge tidak valid. |
| `404 Not Found` | Tidak Ditemukan | Endpoint salah atau nama `action` RPC tidak ada dalam daftar yang diizinkan. |
| `429 Too Many Requests` | Terlalu Banyak Request | Gagal login lebih dari 6 kali dalam kurun waktu 1 menit. |
| `503 Service Unavailable` | Agent Offline | PC Lokal Windows sedang mati atau `agent.py` belum menyala. |
| `504 Gateway Timeout` | Timeout | Agent lokal tidak merespons dalam batas waktu (25 detik untuk RPC biasa, 120 detik untuk upload). |
| `500 Internal Error` | Kesalahan Server | Galat tak terduga pada server Express. |

---

## 6. Contoh Penggunaan

### Contoh Menggunakan JavaScript (`fetch`)

```javascript
// 1. Login ke aplikasi
async function login(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// 2. Memanggil RPC (misal: mengambil data dashboard)
async function callRpc(action, payload = {}) {
  const res = await fetch(`/api/rpc/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result.data;
}

// Contoh pemakaian:
(async () => {
  await login('password_rahasia_anda');
  
  // Mengambil ringkasan beranda
  const dashData = await callRpc('dashboard');
  console.log('Streak saat ini:', dashData.streak.current_streak);

  // Mengambil daftar materi
  const docs = await callRpc('list_documents');
  console.log('Daftar dokumen:', docs.documents);
})();
```

---

### Contoh Menggunakan `cURL`

#### 1. Login dan Simpan Cookie
```bash
curl -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"password":"password_rahasia_anda"}'
```

#### 2. Panggil RPC Dashboard
```bash
curl -X POST http://localhost:3000/api/rpc/dashboard \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{}'
```

#### 3. Upload Dokumen PDF
```bash
curl -X POST http://localhost:3000/api/upload \
  -b cookies.txt \
  -F "file=@/path/ke/materi.pdf" \
  -F "title=Bab 1 Pendahuluan" \
  -F "style=ringkas"
```
