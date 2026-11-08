"""Gateway PAF-Model tiruan untuk pengujian (meniru perilaku API_USAGE.md)."""
from __future__ import annotations

import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("MOCK_TOKEN", "paf_testtoken_1234567890")
STATE = {"calls": [], "sessions": set(), "deleted": [], "fail_first_qwen": os.environ.get("MOCK_FAIL_QWEN") == "1",
         "failed_once": False, "bad_json_once": os.environ.get("MOCK_BAD_JSON") == "1", "bad_done": False,
         "tools_unsupported": os.environ.get("MOCK_TOOLS_UNSUPPORTED") == "1",
         "bad_arguments_once": False, "bad_args_done": False}
LOCK = threading.Lock()


def make_questions(prompt: str) -> str:
    counts = re.findall(r'(\d+) soal "(\w+)"', prompt)
    label = re.search(r"MATERI \(bagian: (.*?)\):", prompt)
    source = label.group(1) if label else "Halaman 1"
    out = []
    if not counts:
        counts = [("2", "mcq"), ("1", "tf"), ("1", "short")]
    for num, kind in counts:
        for _ in range(int(num)):
            with LOCK:
                STATE["qn"] = STATE.get("qn", 0) + 1
                n = STATE["qn"]
            base = {"explanation": f"Penjelasan soal {n}.",
                    "deep_explanation": f"Penjelasan mendalam soal {n}.",
                    "topic": "Fotosintesis" if n % 2 else "Respirasi",
                    "source": source.split(" – ")[0]}
            subjects = ["pigmen hijau", "organel penghasil energi", "gas yang diserap daun", "hasil akhir glikolisis",
                        "lokasi reaksi terang", "molekul pembawa energi", "enzim pencernaan pati", "fungsi stomata",
                        "bahan baku fotosintesis", "tahap siklus Calvin", "peran air", "produk sampingan oksigen"]
            q = f"Apakah yang dimaksud dengan {subjects[n % len(subjects)]} dan bagaimana kaitannya dengan konsep nomor {n * 7} ({kind})?"
            if kind == "mcq":
                out.append({"type": "mcq", "qtype": "mcq", "question": q,
                            "options": [f"Opsi A{n}", f"Opsi B{n}", f"Opsi C{n}", f"Opsi D{n}"],
                            "answer_index": 0, "answer": "0", **base})
            elif kind == "tf":
                out.append({"type": "tf", "qtype": "tf", "question": q, "answer": n % 2 == 0, **base})
            else:
                out.append({"type": "short", "qtype": "short", "question": q, "answer": "klorofil", "keywords": ["klorofil"], **base})
    return json.dumps(out)


NOTE_SECTION_MOCK = {
    "title": "Konsep Dasar",
    "summary": "Pembahasan mengenai materi dasar dan implementasinya.",
    "points": [
        "Konsep pertama menjelaskan prinsip dasar aljabar dan struktur data.",
        "Konsep kedua membahas efisiensi komputasi."
    ],
    "code_blocks": [
        {
            "language": "python",
            "filename": "contoh.py",
            "explanation": "Contoh fungsi perhitungan sederhana:",
            "code": "def hitung(a, b):\n    return a + b",
            "output": "15"
        }
    ],
    "math_formulas": [
        {
            "latex": "f(x) = x^{2} + 2x + 1",
            "explanation": "Persamaan kuadrat sederhana."
        },
        {
            "latex": "\\[ E = mc^2 \\]",
            "explanation": "Energi foton \\(E = h f\\) dan hubungan massa-energi:"
        }
    ],
    "tables": [
        {
            "headers": ["Besaran", "Simbol", "Satuan"],
            "rows": [
                ["Energi", "$E$", "J", "catatan liar"]
            ]
        }
    ],
    "relations": [
        {
            "from_concept": "Konsep pertama",
            "to_concept": "Konsep kedua",
            "relation": "menjadi dasar dari"
        }
    ]
}


def make_tool_arguments(name: str, tool_def: dict, prompt: str) -> str:
    params = tool_def.get("parameters", {}) if isinstance(tool_def, dict) else {}
    props = params.get("properties", {}) if isinstance(params, dict) else {}

    # 0. Mind map: pohon sengaja dibuat "kotor" (sibling kembar, label kosong, relasi tak valid)
    #    supaya mindmap.normalize_tree ikut teruji lewat jalur job sungguhan.
    if "mindmap" in name.lower() or ("root" in props and "relations" in props):
        data = {
            "root": {"label": "Fotosintesis", "detail": "Proses tumbuhan membuat makanan dari cahaya.", "children": [
                {"label": "Reaksi Terang", "detail": "Terjadi di tilakoid.", "children": [
                    {"label": "ATP dan NADPH", "detail": "Hasil reaksi terang."},
                    {"label": "Fotolisis air", "children": []},
                    {"label": "  ", "children": []},
                ]},
                {"label": "Siklus Calvin", "children": [{"label": "Fiksasi CO2"}, {"label": "fiksasi co2"}]},
                {"label": "Reaksi Terang"},
                {"label": "Struktur Daun", "children": [{"label": "Stomata"}, {"label": "Kloroplas"}]},
            ]},
            "relations": [
                {"from": "ATP dan NADPH", "to": "Siklus Calvin", "label": "menyediakan energi"},
                {"from": "Stomata", "to": "Fiksasi CO2", "label": "memasok"},
                {"from": "Stomata", "to": "Kloroplas", "label": "satu cabang (dibuang)"},
                {"from": "Tidak Ada", "to": "Stomata", "label": "tak resolve"},
            ],
        }
        return json.dumps(data)

    # 0b. Catatan Terstruktur / Note Section
    if "generate_note_section" in name.lower() or "note_section" in name.lower() or ("points" in props and "title" in props):
        return json.dumps(NOTE_SECTION_MOCK)

    # 1. Kuis / Questions
    if "quiz" in name.lower() or "question" in name.lower() or "questions" in props or "soal" in name.lower():
        qs = json.loads(make_questions(prompt))
        if "questions" in props:
            return json.dumps({"questions": qs})
        if "soal" in props:
            return json.dumps({"soal": qs})
        return json.dumps({"questions": qs})

    # 2. Ringkasan Dokumen (Doc Summary)
    if "summar" in name.lower() or "doc" in name.lower() or "summary" in props or "ringkasan" in name.lower():
        data = {
            "title": "Biologi Dasar",
            "summary": "Ringkasan materi biologi dasar.",
            "key_concepts": [{"term": "Klorofil", "definition": "Pigmen hijau."}],
            "topics": ["Fotosintesis", "Respirasi"],
        }
        if props:
            filtered = {k: v for k, v in data.items() if k in props}
            return json.dumps(filtered or data)
        return json.dumps(data)

    # 3. Istilah / Concepts
    if "concept" in name.lower() or "istilah" in name.lower() or "concepts" in props:
        data = {
            "concepts": [
                {"term": "Stomata", "definition": "Pori-pori pada epidermis daun untuk pertukaran gas.", "topic": "Fotosintesis"},
                {"term": "Tilakoid", "definition": "Membran pipih tempat terjadinya reaksi terang.", "topic": "Fotosintesis"},
                {"term": "Stroma", "definition": "Cairan kental di kloroplas tempat siklus Calvin.", "topic": "Fotosintesis"},
            ]
        }
        if "concepts" in props:
            return json.dumps(data)
        return json.dumps(data["concepts"])

    # 4. Fallback umum berdasarkan skema properties
    out = {}
    for k, v in props.items():
        t = v.get("type", "string") if isinstance(v, dict) else "string"
        if t == "string":
            out[k] = f"nilai_{k}"
        elif t in ("integer", "number"):
            out[k] = 1
        elif t == "boolean":
            out[k] = True
        elif t == "array":
            out[k] = []
        elif t == "object":
            out[k] = {}
        else:
            out[k] = None
    return json.dumps(out)


# Balasan catatan "berantakan" untuk bagian materi yang memuat kode/rumus (dipicu aturan kode di prompt):
# fence menempel di akhir kalimat, bahasa berhuruf kapital, komentar "#", baris kosong ganda (PEP8), "\\n" di
# string kode, rumus Unicode, dan baris LaTeX tanpa pembatas. Dipakai smoke_codemath.py.
CODE_NOTE_REPLY = (
    "### Fungsi luas\n"
    "Fungsi ini menghitung luas persegi panjang. Berikut kodenya: ```Python luas.py\n"
    "# Hitung luas\n"
    "def luas(p, l):\n"
    "    print(\"Luas:\\n\", p * l)\n"
    "\n\n"
    "def keliling(p, l):\n"
    "    return 2 * (p + l)\n"
    "```\n"
    "Rumus: \\frac{a}{b} = c\n"
    "Luas $p × l ≤ x²$ dan D = b^2 - 4ac\n"
    "~~~sql\nSELECT * FROM siswa;"
)


def reply_for(prompt: str, backend: str) -> str:
    if "ATURAN KODE PROGRAM" in prompt and "Pedoman Gaya" in prompt:
        return CODE_NOTE_REPLY
    if "Transkripsikan semua teks" in prompt:
        return "Teks OCR palsu: papan tulis tentang fotosintesis.\nDeskripsi visual: diagram daun."
    if "hasilkan JSON dengan format persis" in prompt:
        return json.dumps({"title": "Biologi Dasar", "summary": "Ringkasan materi biologi dasar.",
                           "key_concepts": [{"term": "Klorofil", "definition": "Pigmen hijau."}],
                           "topics": ["Fotosintesis", "Respirasi"]})
    if ("generate_note_section" in prompt.lower() or "catatan terstruktur" in prompt.lower() or "note_section" in prompt.lower()) and "Pedoman Gaya" not in prompt:
        return json.dumps(NOTE_SECTION_MOCK)
    if "Buat tepat:" in prompt:
        if STATE["bad_json_once"] and not STATE["bad_done"]:
            STATE["bad_done"] = True
            return "Tentu! Ini soalnya: bukan json"
        return "```json\n" + make_questions(prompt) + "\n```"
    if "Nilai jawaban singkat" in prompt:
        data = json.loads(prompt.split("DATA:\n", 1)[1])
        return json.dumps([{"id": d["id"], "score": 1.0 if "klorofil" in d["jawaban"].lower() else 0.0,
                            "feedback": "Dinilai oleh AI tiruan."} for d in data])
    if "ingin memahami lebih dalam" in prompt:
        return f"## Penjelasan mendalam\nDari backend {backend}. Langkah 1 ..."
    if "TEKS YANG DIPERTANYAKAN" in prompt:
        # panel Tanya: prompt NEW menyertakan catatan lengkap; CONTINUE tidak
        follow = "" if "CATATAN LENGKAP MATERI" in prompt else " (lanjutan)"
        return f"Penjelasan singkat{follow} dari {backend}: teks itu menjelaskan inti materi dengan bahasa awam. Contoh: seperti baterai yang diisi ulang."
    if "konteks materi yang harus kamu pelajari" in prompt or "konteks materi" in prompt.lower():
        return f"Halo! Saya tutor AI DeepSeek. Saya sudah mempelajari seluruh materi ini dan siap membantu menjawab pertanyaanmu."
    if backend == "deepseek" or "PERTANYAAN SISWA:" in prompt:
        return f"Jawaban dari DeepSeek ({backend}): Konsep tersebut dijelaskan pada bagian materi."
    return ("### Poin penting\n- **Fotosintesis** mengubah cahaya matahari, air, dan karbon dioksida menjadi glukosa dan oksigen.\n"
            "- Terjadi di **kloroplas**, tepatnya pada membran tilakoid (reaksi terang) dan stroma (siklus Calvin).\n"
            "  - Reaksi terang menghasilkan ATP dan NADPH.\n  - Siklus Calvin memakai ATP dan NADPH untuk mengikat CO2.\n\n"
            "### Perbandingan tahap\n| Tahap | Lokasi | Hasil |\n|---|---|---|\n| Reaksi terang | Tilakoid | ATP, NADPH, O2 |\n"
            "| Siklus Calvin | Stroma | Glukosa |\n\n> Ingat: oksigen berasal dari pemecahan air, bukan dari karbon dioksida.\n\n"
            "### Rumus\n`6CO2 + 6H2O -> C6H12O6 + 6O2`\n\n1. Cahaya diserap klorofil.\n2. Air dipecah, oksigen dilepas.\n3. Energi disimpan sebagai glukosa.\n\n"
            "Energi foton \\(E = h f\\) dan hubungan massa-energi:\n\\[ E = mc^2 \\]\n"
            "| Besaran | Simbol | Satuan |\n| --- | --- |\n| Energi | $E$ | J | catatan liar |")


# ---------------------------------------------------------------- game master palsu (game v2)
# Kontrol uji: STATE["gm"]["fail"] = ["nomarker", "badjson", "badleak"] dikonsumsi berurutan oleh
# balasan permainan berikutnya; STATE["gm"]["delay"] = jeda antar-chunk (detik); chunk_size mengecil.
STATE["gm"] = {"fail": [], "delay": float(os.environ.get("MOCK_GM_DELAY", "0") or 0), "chunk_size": 17, "ctx": {}}


def _marker(prompt: str):
    last = None
    for m in re.finditer(r"#modus=(\w+) #aksi=(\w+)([^\n]*)", prompt):
        last = m
    if not last:
        return None
    rest = last.group(3)
    g = re.search(r"#giliran=(\d+)/(\d+)", rest)
    f = re.search(r"#fokus=([^\n]*)", rest)
    lv = re.search(r"#level=(\d)", rest)
    return {"game": last.group(1), "aksi": last.group(2), "n": int(g.group(1)) if g else 1,
            "total": int(g.group(2)) if g else 1, "focus": [t for t in (f.group(1).split("|") if f else []) if t],
            "level": int(lv.group(1)) if lv else 0}


def _items(game: str, focus: list, count: int, n0: int) -> list:
    focus = focus or ["Klorofil"]
    items = []
    for i in range(count):
        term, n = focus[i % len(focus)], n0 + i
        if game == "ajari":
            items.append({"konsep": term, "public": {"prompt": f"Aku belum paham {term}. Bisa jelaskan dengan kata-katamu, dan kenapa itu penting?"},
                          "secret": {"poin_kunci": [f"inti {term}", "contoh nyata"]}})
        elif game == "detektif":
            items.append({"konsep": term, "public": {"title": f"Salah kaprah {term}", "sentences": [
                f"{term} adalah bagian penting dalam materi ini.", "Ia bekerja dengan cara yang teratur.", "Semua proses ini terjadi tanpa membutuhkan energi apa pun.",
                "Hasilnya dipakai oleh bagian lain.", "Proses ini terus berulang."]}, "secret": {"wrong": [2], "benar": {"2": "Proses ini membutuhkan energi."}}})
        elif game == "petualangan":
            if n % 3 == 0:
                items.append({"konsep": term, "public": {"scene": f"Kamu tiba di gerbang batu yang dijaga makhluk aneh (adegan {n}).",
                                                          "challenge": {"type": "short", "question": f"Sebutkan pigmen hijau pada tumbuhan terkait {term}?"}},
                              "secret": {"answer": "klorofil", "keywords": ["klorofil"], "explain": "Pigmen hijau itu klorofil."}})
            else:
                items.append({"konsep": term, "public": {"scene": f"Jembatan tua menghadang jalanmu di adegan {n}.",
                                                          "challenge": {"type": "choice", "question": f"Manakah pernyataan yang benar tentang {term}?",
                                                                        "options": [f"Pernyataan benar tentang {term}", f"Keliru satu {n}", f"Keliru dua {n}"]}},
                              "secret": {"answer_id": "0", "explain": f"Yang benar adalah pernyataan pertama ({term})."}})
        elif game == "kasus":
            items.append({"konsep": term, "public": {"scenario": f"Seorang petani melihat daun tanamannya menguning padahal air cukup (kasus {n}).",
                                                      "question": "Apa langkah paling masuk akal yang perlu dipertimbangkan?",
                                                      "options": [f"Periksa penyebab yang berhubungan dengan {term}", f"Abaikan saja {n}", f"Tambah garam {n}"]},
                          "secret": {"answer_id": "0", "why": f"Karena itu berkaitan dengan {term}."}})
        else:  # kilat / boss
            kind = ("mcq", "tf", "short")[n % 3]
            q = f"Pertanyaan nomor {n} yang cukup panjang mengenai {term}, apa pernyataan yang tepat?"
            if kind == "mcq":
                items.append({"konsep": term, "public": {"type": "mcq", "question": q, "options": [f"Benar {n}", f"Salah A{n}", f"Salah B{n}", f"Salah C{n}"]},
                              "secret": {"answer_index": 0, "explanation": f"Penjelasan {n}."}})
            elif kind == "tf":
                items.append({"konsep": term, "public": {"type": "tf", "question": q}, "secret": {"answer": True, "explanation": f"Penjelasan {n}."}})
            else:
                items.append({"konsep": term, "public": {"type": "short", "question": q},
                              "secret": {"answer": "klorofil", "keywords": ["klorofil"], "explanation": f"Penjelasan {n}."}})
    return items


def game_reply(prompt: str, sid: str) -> str:
    gm = STATE["gm"]
    ctx = _marker(prompt)
    if ctx and ctx["aksi"] == "fix":
        ctx = gm["ctx"].get(sid) or ctx
    if not ctx:
        return "Halo."
    if ctx["aksi"] != "fix":
        gm["ctx"][sid] = ctx
    game, aksi = ctx["game"], ctx["aksi"]
    if aksi == "hint":
        return f"Petunjuk tingkat {ctx['level']}: coba ingat peran utama konsep itu."
    narration = f"Narasi {game} ({aksi}) giliran {ctx['n']}."
    judgement, nxt, end = None, None, False
    if aksi in ("start", "batch"):
        want = int((re.search(r"Buat (\d+) soal", prompt) or [0, 0])[1] or 0)
        nxt = {"batch": _items(game, ctx["focus"], want, ctx["n"] * 10)} if want else _items(game, ctx["focus"], 1, ctx["n"])[0]
    elif aksi == "answer":
        final = "JAWABAN TERAKHIR" in prompt
        m = re.search(r"<<<GILIRAN\n(.*?)\nGILIRAN>>>", prompt, re.S)
        ans = json.loads(m.group(1)).get("jawaban_pelajar", {}) if m else {}
        text = str(ans.get("text") or ans.get("reason") or "")
        if game == "ajari":
            long = len(text) > 40
            judgement = {"skor": 0.2, "rubrik": {"akurat": 3 if long else 1, "lengkap": 2 if long else 1, "jelas": 3 if long else 1, "contoh": 2 if long else 0},
                         "umpan_balik": "Penjelasanmu sudah cukup jelas." if long else "Masih terlalu singkat.", "miskonsepsi": "" if long else "Belum menyebut peran inti."}
        elif game == "kasus" and text:
            judgement = {"skor": 0.9, "umpan_balik": "Alasanmu masuk akal."}
        elif game == "detektif" and ans.get("correction"):
            judgement = {"skor": 1.0, "umpan_balik": "Koreksimu tepat."}
        elif game == "petualangan" and ans.get("text"):
            judgement = {"skor": 1.0 if "klorofil" in text.lower() else 0.0}
        if not final:
            nxt = _items(game, ctx["focus"], 1, ctx["n"])[0]
        end = final
    elif aksi == "report":
        m = re.search(r"<<<HASIL\n(.*?)\nHASIL>>>", prompt, re.S)
        res = json.loads(m.group(1)) if m else []
        judgement = {"items": {str(r["idx"]): 0.9 for r in res if r.get("benar") is None}}
        narration = "## Rapor Ujian\nKekuatanmu ada pada topik dasar. Ulangi bagian yang masih keliru."
        end = True
    data = {"judgement": judgement, "next": nxt, "state_delta": {"location": "Gerbang Batu"} if game == "petualangan" else {}, "end": end}
    fail = gm["fail"].pop(0) if gm["fail"] else None
    if fail == "nomarker":
        return narration + " (lupa blok data)"
    if fail == "badjson":
        return narration + "\n<<<GAME_DATA\n{bukan json\nGAME_DATA>>>"
    if fail == "badleak" and nxt and not isinstance(nxt.get("batch"), list) and game == "kasus":
        nxt["public"]["scenario"] = f"Kasus tentang {(ctx['focus'] or ['Klorofil'])[0]} dibahas di sini, ini skenario bocor yang sangat panjang sekali."
    return narration + "\n\n<<<GAME_DATA\n" + json.dumps(data, ensure_ascii=False) + "\nGAME_DATA>>>"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj, headers=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self._send(401, {"detail": "Invalid API token."}, {"WWW-Authenticate": "Bearer"})
            return False
        return True

    def do_GET(self):
        if not self._auth():
            return
        if self.path == "/v1/models":
            self._send(200, {"object": "list", "data": [{"id": "deepseek"}, {"id": "qwen"}, {"id": "grok"}]})
        else:
            self._send(404, {"detail": "not found"})

    def do_DELETE(self):
        if not self._auth():
            return
        sid = self.path.rsplit("/", 1)[-1]
        with LOCK:
            found = sid in STATE["sessions"]
            STATE["sessions"].discard(sid)
            STATE["deleted"].append(sid)
        self._send(200, {"session_id": sid, "deleted": found, "workers_checked": 1})

    def do_POST(self):
        if not self._auth():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        model = body.get("model", "")
        backend = re.match(r"^(deepseek|qwen|grok)", model)
        if not backend:
            return self._send(400, {"detail": f"Unknown model: '{model}'."})
        backend = backend.group(1)
        if backend == "qwen" and body.get("attachments"):
            return self._send(400, {"detail": "Input gambar atau file untuk backend Qwen dinonaktifkan sementara karena kendala pada web Qwen upstream."})
        prompt = body["messages"][-1]["content"]

        req_sid = self.headers.get("X-Session-ID") or body.get("session_id")
        req_mode = body.get("mode")

        with LOCK:
            fallback = False
            if req_sid and (req_mode or "continue") == "continue" and req_sid not in STATE["sessions"]:
                sid = "sess-" + os.urandom(8).hex()      # gateway membuat sesi baru tanpa konteks
                mode, fallback = "new", True
                STATE["sessions"].add(sid)
            elif req_sid:
                sid = req_sid
                mode = req_mode or "continue"
                STATE["sessions"].add(sid)
            else:
                sid = "sess-" + os.urandom(8).hex()
                mode = req_mode or "new"
                STATE["sessions"].add(sid)

            is_stream = bool(body.get("stream"))
            STATE["calls"].append({"backend": backend, "mode": mode, "sid": sid,
                                   "think": body.get("think_mode"),
                                   "stream": is_stream,
                                   "attachments": len(body.get("attachments") or []),
                                   "tools": body.get("tools"),
                                   "tool_choice": body.get("tool_choice"),
                                   "prompt": prompt[:8000],
                                   "kind": ("vision" if "Transkripsikan" in prompt else "other")})
            if STATE["fail_first_qwen"] and backend == "qwen" and not STATE["failed_once"]:
                STATE["failed_once"] = True
                return self._send(429, {"detail": "Rate limit tiruan"})

        meta_extra = {"mode_fallback": True} if fallback else {}

        if body.get("tools"):
            if STATE.get("tools_unsupported"):
                return self._send(400, {"detail": "Gateway/worker does not support tools."})
            if is_stream:
                return self._send(400, {"detail": "Tool calling is not supported in streaming mode."})

            tools_list = body.get("tools") or []
            tool_0 = tools_list[0].get("function", {}) if isinstance(tools_list[0], dict) else {}
            tool_name = tool_0.get("name", "function_call")
            if isinstance(body.get("tool_choice"), dict):
                return self._send(422, {"detail": "Input should be a valid string"})
            elif isinstance(body.get("tool_choice"), str) and body["tool_choice"] not in ("auto", "none", "required"):
                tool_name = body["tool_choice"]

            tool_def = tool_0
            for t in tools_list:
                if isinstance(t, dict):
                    fn = t.get("function", {})
                    if fn.get("name") == tool_name:
                        tool_def = fn
                        break

            if STATE.get("bad_arguments_once") and not STATE.get("bad_args_done"):
                STATE["bad_args_done"] = True
                args_json = "bukan json {["
            else:
                args_json = make_tool_arguments(tool_name, tool_def, prompt)

            call_id = "call_" + os.urandom(8).hex()
            self._send(200, {
                "id": "chatcmpl-" + os.urandom(6).hex(),
                "object": "chat.completion",
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": args_json,
                            },
                        }],
                    },
                    "finish_reason": "tool_calls",
                }],
                "x_meta": {"session_id": sid, "mode": mode, **meta_extra},
            }, {"X-Session-ID": sid, "X-Backend": backend})
            return

        rf = body.get("response_format")
        if isinstance(rf, dict):
            rf_js = rf.get("json_schema", {}) if isinstance(rf.get("json_schema"), dict) else {}
            rf_name = rf_js.get("name", "")
            rf_props = rf_js.get("schema", {}).get("properties", {}) if isinstance(rf_js.get("schema"), dict) else {}
            if (
                "generate_note_section" in rf_name.lower()
                or "note_section" in rf_name.lower()
                or ("points" in rf_props and "title" in rf_props)
            ):
                text = json.dumps(NOTE_SECTION_MOCK)
            else:
                text = game_reply(prompt, sid) if "#modus=" in prompt else reply_for(prompt, backend)
        else:
            text = game_reply(prompt, sid) if "#modus=" in prompt else reply_for(prompt, backend)

        if is_stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Session-ID", sid)
            self.send_header("X-Backend", backend)
            self.end_headers()

            words = text.split(" ")
            if "#modus=" in prompt:
                size = STATE["gm"]["chunk_size"]
                chunks = [text[i:i + size] for i in range(0, len(text), size)]
            elif len(words) > 3:
                mid1 = len(words) // 3
                mid2 = (len(words) * 2) // 3
                chunks = [
                    " ".join(words[:mid1]) + " ",
                    " ".join(words[mid1:mid2]) + " ",
                    " ".join(words[mid2:]),
                ]
            else:
                chunks = [text]

            for c in chunks:
                if STATE["gm"]["delay"]:
                    import time as _t
                    _t.sleep(STATE["gm"]["delay"])
                chunk_obj = {
                    "id": "chatcmpl-stream",
                    "object": "chat.completion.chunk",
                    "model": model,
                    "choices": [{"index": 0, "delta": {"content": c}, "finish_reason": None}],
                }
                self.wfile.write(f"data: {json.dumps(chunk_obj)}\n\n".encode("utf-8"))
                self.wfile.flush()

            final_obj = {
                "id": "chatcmpl-stream",
                "object": "chat.completion.chunk",
                "model": model,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                "x_meta": {"session_id": sid, "mode": mode, "full_text": text, **meta_extra},
            }
            self.wfile.write(f"data: {json.dumps(final_obj)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            return

        self._send(200, {"id": "chatcmpl-x", "object": "chat.completion", "model": model,
                         "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                                      "finish_reason": "stop"}],
                         "x_meta": {"session_id": sid, "mode": mode, **meta_extra}}, {"X-Session-ID": sid, "X-Backend": backend})


class _Server(ThreadingHTTPServer):
    daemon_threads = True


def start(port: int = 0):
    srv = _Server(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == "__main__":
    srv = start(int(sys.argv[1]) if len(sys.argv) > 1 else 9100)
    print("mock PAF di port", srv.server_address[1], flush=True)
    threading.Event().wait()
