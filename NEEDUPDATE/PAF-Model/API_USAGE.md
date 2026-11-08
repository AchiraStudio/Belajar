# PAF-Model API — Panduan Singkat untuk Client

API ini **kompatibel dengan format OpenAI Chat Completions**. Backend utamanya adalah **DeepSeek**. Qwen dan Grok juga tersedia lewat endpoint yang sama (lihat [bagian 10](#10-model-lain-qwen--grok)).

> Untuk instalasi server/worker lihat [`README.md`](./README.md). Dokumen ini hanya membahas **cara memanggil API**.

---

## 1. Mulai Cepat (3 langkah)

**1. Siapkan dua hal dari admin server:**
- `BASE_URL` — contoh `http://VPS_HOST:9000`
- `API_TOKEN` — contoh `paf_xxxxxxxx`

**2. Kirim request:**

```bash
curl -X POST $BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek",
    "messages": [{"role": "user", "content": "Halo, siapa kamu?"}]
  }'
```

**3. Ambil jawabannya** di `choices[0].message.content`.

Selesai. Untuk lanjut ngobrol, lihat [Session](#4-session-lanjutkan-percakapan).

---

## 2. Autentikasi

Kirim token di **setiap** request:

```
Authorization: Bearer <API_TOKEN>
```

| Status | Artinya |
|---|---|
| `401` | Token tidak ada, salah, atau sudah kedaluwarsa |
| `503` | Server belum punya token (hubungi admin) |

Jika memakai OpenAI SDK, cukup isi `api_key`:

```python
from openai import OpenAI
client = OpenAI(base_url="http://VPS_HOST:9000/v1", api_key="<API_TOKEN>")
```

---

## 3. Endpoint & Memilih Akun

| Method | Path | Fungsi |
|---|---|---|
| `POST` | `/v1/chat/completions` | Kirim pesan, dapat jawaban |
| `GET` | `/v1/models` | Lihat daftar model/akun yang sedang aktif |
| `DELETE` | `/v1/sessions/{session_id}` | Hapus sebuah session |
| `GET` | `/health` | Cek apakah ada worker yang terhubung |

### Field `model`

Akun diberi nomor **1, 2, 3, ...** dan ditulis di dalam tanda kurung.

| Nilai | Artinya |
|---|---|
| `deepseek` | Pakai akun DeepSeek mana saja yang tersedia |
| `deepseek(1)` | Pakai akun DeepSeek nomor 1 |
| `deepseek(2)` | Pakai akun DeepSeek nomor 2 |
| `qwen` / `qwen(1)` | Qwen, akun bebas / akun nomor 1 |
| `grok` / `grok(1)` | Grok, akun bebas / akun nomor 1 |

- Nama model lain (`gpt-4`, `deepseek-chat`, dll.) ditolak dengan `400`.
- Panggil `GET /v1/models` untuk melihat nomor akun yang benar-benar aktif.
- Pakai `deepseek` saja jika tidak peduli akun mana. Pakai `deepseek(1)` jika Anda ingin memaksa akun tertentu (misalnya untuk menghindari akun yang kena rate limit).

---

## 4. Session (lanjutkan percakapan)

Percakapan disimpan di sisi server lewat header **`X-Session-ID`**.

| Situasi | Yang dilakukan |
|---|---|
| **Percakapan baru** | Jangan kirim `X-Session-ID` |
| **Lanjutkan** | Kirim kembali `X-Session-ID` dari response sebelumnya |

```bash
# Turn 1 — tanpa X-Session-ID. Ambil X-Session-ID dari header response.
curl -i -X POST $BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"deepseek(1)","messages":[{"role":"user","content":"Jelaskan async/await di Python"}]}'

# Turn 2 — sertakan X-Session-ID
curl -X POST $BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -H "X-Session-ID: sess-7f3a9c1d0e2b4f6a" \
  -d '{"model":"deepseek(1)","messages":[{"role":"user","content":"Ringkas jadi 1 kalimat"}]}'
```

**Aturan penting:**
- Hanya **pesan `user` terakhir** yang dikirim ke model. **Jangan kirim ulang riwayat**; riwayat sudah ada di session.
- Session terikat ke akun yang dipakai di turn pertama, jadi lanjutan percakapan selalu kembali ke akun yang sama.
- Pesan `system`/`developer` ikut diteruskan ke model. Kirim ulang di setiap request jika ingin tetap berlaku.
- Session **tidak kedaluwarsa otomatis**. Hapus sendiri bila sudah tidak dipakai:

```bash
curl -X DELETE $BASE_URL/v1/sessions/sess-7f3a9c1d0e2b4f6a \
  -H "Authorization: Bearer $API_TOKEN"
# → {"session_id":"...","deleted":true,"workers_checked":1}
```

- Session yang sudah dihapus (atau tidak dikenal) **tidak error**; otomatis dianggap percakapan baru (`x_meta.mode_fallback: true`).

---

## 5. Field Request

Minimal hanya butuh `model` dan `messages`.

| Field | Wajib | Keterangan |
|---|---|---|
| `model` | ✅ | Lihat [bagian 3](#field-model) |
| `messages` | ✅ | Format OpenAI: `[{"role":"user","content":"..."}]` |
| `think_mode` | – | Mode berpikir DeepSeek, lihat [bagian 6](#6-fitur-deepseek) |
| `deep_think` | – | Toggle DeepThink, lihat [bagian 6](#6-fitur-deepseek) |
| `web_search` | – | Pencarian web DeepSeek, lihat [bagian 6](#6-fitur-deepseek) |
| `tools` | – | Function calling, lihat [bagian 7](#7-function-calling-tools) |
| `attachments` | – | Gambar/file (**utamakan DeepSeek**; Qwen dinonaktifkan sementara), lihat [bagian 6](#gambar--file) |
| `stream` | – | Eksperimental, lihat [bagian 6](#streaming-eksperimental) |
| `max_tokens` | – | Hanya saran panjang jawaban, **tidak dipaksakan** |
| `temperature` | – | Diterima tapi **diabaikan** |

---

## 6. Fitur DeepSeek

### Mode berpikir (`think_mode`)

> **UI baru (Okt 2026):** DeepSeek menghapus mode Instant/Expert/Vision. Yang tersisa hanya dua toggle — **DeepThink** dan **Search** — dan keduanya **aktif secara default** di situsnya. API mengikuti perilaku itu.

| `think_mode` | Efek |
|---|---|
| `auto` (**default**) | Ikuti default situs: DeepThink ON + Search ON |
| `instant` / `fast` | Paling cepat: DeepThink OFF + Search OFF |
| `thinking` / `expert` / `reasoning` | DeepThink ON + Search OFF |
| `search` / `web` | Search ON + DeepThink OFF |
| `research` | DeepThink ON + Search ON |

```json
{
  "model": "deepseek(1)",
  "think_mode": "thinking",
  "messages": [{"role": "user", "content": "Buktikan akar 2 itu irasional"}]
}
```

Kontrol yang lebih detail (opsional, mengalahkan `think_mode` jika keduanya dikirim). Keduanya default `true` (mengikuti situs):

| Field | Nilai |
|---|---|
| `deep_think` | `true` / `false` (`true` = default) |
| `web_search` | `true` / `false` (`true` = default) |

`model_tab` **usang dan diabaikan** (diterima agar client lama tidak error).

### Pencarian web

Search **aktif secara default**. Kirim `"web_search": false` untuk mematikannya (jawaban tanpa sitasi, lebih cepat).

```json
{
  "model": "deepseek",
  "think_mode": "thinking",
  "web_search": false,
  "messages": [{"role": "user", "content": "Jelaskan cara kerja mesin stirling"}]
}
```

> 🌟 **Utamakan DeepSeek untuk Analisis Gambar & Berkas:**  
> Backend **DeepSeek** adalah pilihan utama dan paling stabil untuk pemrosesan gambar dan dokumen lampiran. Pengunggahan diproses secara andal melalui pipeline Playwright paste/drop dengan verifikasi visual preview.  
> ⚠️ **Catatan Penting Qwen:** Lampiran gambar/file pada backend `qwen` **dinonaktifkan sementara** karena adanya kendala teknis pada antarmuka situs Qwen upstream. Permintaan yang menyertakan `attachments` dengan model `qwen` akan ditolak dengan HTTP `400 Bad Request`. **Selalu gunakan `deepseek` untuk input gambar/file.**

### Gambar / file

Kirim file dalam format **base64** di dalam array `attachments`:

```json
{
  "model": "deepseek",
  "messages": [{"role": "user", "content": "Tolong jelaskan isi diagram ini"}],
  "attachments": [
    {
      "filename": "diagram.png",
      "data": "<string_base64_tanpa_header_data_uri>",
      "mime_type": "image/png"
    }
  ]
}
```

**Ketentuan & Batasan:**
- **Mendukung multi-file:** Maksimal **10 file** per request atau total ukuran ter-decode maksimal **20 MB**.
- **Format:** Gambar (`image/png`, `image/jpeg`, `image/webp`, dll.) dan berkas dokumen yang didukung composer DeepSeek.
- **Data base64:** Field `data` dapat berupa base64 murni atau data URI (`data:image/png;base64,...`).
- **Tanpa mode khusus:** Mode Vision lama sudah ditiadakan oleh DeepSeek; pengunggahan langsung terintegrasi pada composer chat.

### Streaming (eksperimental)

Tambahkan `"stream": true` untuk menerima jawaban bertahap (SSE standar OpenAI, diakhiri `data: [DONE]`).

```bash
curl -N -X POST $BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"deepseek","stream":true,"messages":[{"role":"user","content":"Ceritakan tentang Jakarta"}]}'
```

Yang perlu diketahui:
- Hanya untuk `deepseek`, **tanpa `tools`**. Server harus menjalankan worker dengan `--enable-stream`; jika tidak, Anda mendapat `400`.
- Potongan datang sekitar 2x per detik (bukan per token).
- Pada `think_mode: thinking`, potongan pertama baru muncul **setelah** proses berpikir selesai. Proses berpikirnya sendiri tidak ikut di-stream.
- **Teks final yang paling akurat ada di `x_meta.full_text`** pada chunk terakhir. Potongan di tengah bisa terlewat jika tampilan web me-render ulang teks (misalnya tabel atau blok kode).
- Jika terjadi error di tengah stream, server mengirim `data: {"error": {...}}` **tanpa** `[DONE]`. Ulangi request.
- `X-Session-ID` tetap ada di header, jadi bisa dilanjutkan seperti biasa.

---

## 7. Function Calling (`tools`)

Formatnya sama dengan OpenAI.

**Langkah A — kirim `tools`:**

```json
{
  "model": "deepseek",
  "messages": [{"role": "user", "content": "Cuaca di Jakarta?"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Ambil cuaca sebuah kota",
      "parameters": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }
  }]
}
```

Jika model ingin memanggil fungsi, response berisi `finish_reason: "tool_calls"`:

```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {"name": "get_weather", "arguments": "{\"city\":\"Jakarta\"}"}
      }]
    }
  }]
}
```

**Langkah B — jalankan fungsinya di sisi Anda, lalu kirim hasilnya** dengan `X-Session-ID` yang sama:

```json
{
  "model": "deepseek",
  "tools": [ ...sama seperti sebelumnya... ],
  "messages": [
    {"role": "user", "content": "Cuaca di Jakarta?"},
    {"role": "assistant", "tool_calls": [{"id": "call_abc123", "type": "function",
       "function": {"name": "get_weather", "arguments": "{\"city\":\"Jakarta\"}"}}]},
    {"role": "tool", "tool_call_id": "call_abc123", "name": "get_weather",
     "content": "{\"tempC\": 29, \"condition\": \"berawan\"}"}
  ]
}
```

Model akan menjawab (`finish_reason: "stop"`) atau memanggil fungsi lagi. **Kirim ulang `tools` di setiap request.**

---

## 8. Response

```json
{
  "id": "chatcmpl-3fa1...",
  "object": "chat.completion",
  "model": "deepseek(1)",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Jawabannya..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 12, "completion_tokens": 48, "total_tokens": 60},
  "x_meta": {
    "session_id": "sess-7f3a9c1d0e2b4f6a",
    "backend": "deepseek",
    "account": "1",
    "conversation_url": "https://chat.deepseek.com/c/abc123",
    "mode": "new",
    "mode_fallback": false,
    "deep_think": true,
    "web_search": true,
    "response_time": 4.82
  }
}
```

**Header response:**

| Header | Isi |
|---|---|
| `X-Session-ID` | Pakai untuk melanjutkan percakapan |
| `X-Backend` | Model yang melayani (`deepseek` / `qwen` / `grok`) |
| `X-Account-Name` | Nomor akun yang dipakai (jika ada) |
| `X-Conversation-URL` | Link percakapan di situs aslinya (jika ada) |

**Catatan:**
- `usage` hanya **perkiraan**, bukan untuk penagihan.
- `x_meta.mode_fallback: true` berarti session sebelumnya hilang dan percakapan dimulai ulang. Jawaban bisa tidak nyambung dengan konteks lama.

---

## 9. Error

Semua error berbentuk `{"detail": "pesan"}` (bukan `{"error": {...}}` ala OpenAI).

| Status | Penyebab | Solusi |
|---|---|---|
| `400` | Nama `model` salah, atau `stream` tidak didukung | Periksa `model` / lihat bagian streaming |
| `401` | Token salah/kedaluwarsa | Minta token baru ke admin |
| `422` | Body request tidak valid (mis. `messages` kosong) | Perbaiki isi request |
| `429` | Akun terkena rate limit | Tunggu, atau pindah akun, misalnya `deepseek(2)` |
| `500` / `502` | Worker gagal memproses | Coba lagi |
| `503` | Server belum punya token | Hubungi admin |
| `504` | Tidak ada worker yang tersedia dalam 60 detik | Coba lagi nanti; cek `GET /health` |

⏱️ **Timeout:** satu request bisa memakan waktu hingga **330 detik** (lebih lama pada mode `thinking`). Atur timeout HTTP client Anda **≥ 330 detik**.

---

## 10. Model Lain: Qwen & Grok

Cara pakainya sama persis: ganti `model`, sisanya (autentikasi, session, tools, response, error) tidak berubah.

| | **Qwen** | **Grok** |
|---|---|---|
| `model` | `qwen` / `qwen(1)` | `grok` / `grok(1)` |
| Mode berpikir | `think_mode`: `auto` / `thinking` / `fast` | Tidak ada, jangan dikirim |
| Gambar | ❌ Dinonaktifkan sementara (Error 400; gunakan DeepSeek) | Lampirkan saja, tanpa pengaturan tambahan |
| Streaming | Tidak didukung | Tidak didukung |
| Khusus | `task_type`: `chat` (default) / `create_image` / `create_video` / `web_search` | – |

```bash
curl -X POST $BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"qwen(1)","think_mode":"thinking","messages":[{"role":"user","content":"Ringkas artikel ini"}]}'
```

Catatan:
- Field khusus DeepSeek (`deep_think`, `web_search`, `think_mode`) **jangan dikirim** ke Qwen/Grok. Tidak error, tapi tidak ada efeknya.
- Grok: jika muncul `401` **tanpa** header `WWW-Authenticate`, artinya sesi login akun Grok habis. Hubungi admin. Jika `404`, session Grok tidak ditemukan; mulai percakapan baru tanpa `X-Session-ID`.
- ⚠️ **Lampiran Gambar/File pada Qwen Dinonaktifkan:** Mengirim `attachments` ke backend `qwen` akan menghasilkan status `400 Bad Request` karena error pada composer situs Qwen upstream. **Gunakan model `deepseek` untuk semua kebutuhan analisis gambar dan berkas dokumen.**
- ⚠️ Qwen `task_type: create_image` / `create_video`: URL hasil generate saat ini **belum dikembalikan** oleh API. Anggap fitur ini belum siap dipakai.

---

## 11. Contoh Python

```python
import os
import requests

BASE_URL = "http://VPS_HOST:9000"
API_TOKEN = os.environ["PAF_API_TOKEN"]
session_id = None


def ask(message: str, model: str = "deepseek", **options) -> str:
    """options: think_mode="thinking", web_search=True, dst."""
    global session_id
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    if session_id:
        headers["X-Session-ID"] = session_id

    r = requests.post(
        f"{BASE_URL}/v1/chat/completions",
        json={"model": model, "messages": [{"role": "user", "content": message}], **options},
        headers=headers,
        timeout=330,
    )
    if not r.ok:
        raise RuntimeError(f"{r.status_code}: {r.json().get('detail')}")

    session_id = r.headers.get("X-Session-ID", session_id)
    return r.json()["choices"][0]["message"]["content"]


print(ask("Halo, siapa kamu?"))
print(ask("Apa yang barusan saya tanyakan?"))               # nyambung, session sama
print(ask("Jelaskan teorema Bayes", think_mode="thinking"))  # mode berpikir

# Contoh kirim gambar ke DeepSeek:
# import base64
# with open("foto.png", "rb") as f:
#     b64 = base64.b64encode(f.read()).decode("utf-8")
# print(ask("Apa isi gambar ini?", model="deepseek", attachments=[{"filename": "foto.png", "data": b64, "mime_type": "image/png"}]))
```

Contoh CLI lengkap ada di folder [`example/`](./example/) (`chat_deepseek.py` untuk DeepSeek).

---

## 12. Ringkasan Cepat

- ✅ Selalu kirim `Authorization: Bearer <token>`.
- ✅ Model utama: `deepseek`. Akun tertentu: `deepseek(1)`, `deepseek(2)`, dst.
- ✅ Percakapan baru → tanpa `X-Session-ID`. Lanjut → kirim `X-Session-ID`.
- ✅ Kirim **hanya pesan terbaru**, bukan seluruh riwayat.
- ✅ Mau jawaban lebih dalam → `think_mode: "thinking"`. Ingin cepat tanpa tool → `think_mode: "instant"` (DeepThink & Search default **ON**; matikan dengan `deep_think: false` / `web_search: false`).
- ✅ Kirim gambar / file → **utamakan backend `deepseek`** (cukup sertakan `attachments`). Jangan kirim lampiran ke `qwen` (dinonaktifkan sementara).
- ✅ Baca error dari `detail`.
- ✅ Timeout client ≥ 330 detik.
- ❌ Jangan kirim field khusus DeepSeek ke Qwen/Grok.