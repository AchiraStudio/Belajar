"""Verifikasi mandiri untuk implementasi ask_tool dan mock_paf tools."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import mock_paf
srv = mock_paf.start(0)
port = srv.server_address[1]

os.environ["PAF_BASE_URL"] = f"http://127.0.0.1:{port}"
os.environ["PAF_API_TOKEN"] = mock_paf.TOKEN
os.environ["LLM_BACKOFF_BASE"] = "0.01"

import config
config.PAF_BASE_URL = f"http://127.0.0.1:{port}"
config.PAF_API_TOKEN = mock_paf.TOKEN
config.LLM_BACKOFF_BASE = 0.01
config.LLM_RETRIES = 1

import llm

passed = 0

def check(cond, msg):
    global passed
    if not cond:
        raise SystemExit(f"GAGAL: {msg}")
    passed += 1
    print(f"  ok  {msg}")

print("=== 1. Uji ask_tool dengan berbagai tool spec")

# 1.1 Quiz Tool
quiz_spec = {
    "name": "generate_quiz",
    "description": "Menghasilkan pertanyaan kuis berdasarkan materi",
    "parameters": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "qtype": {"type": "string"},
                        "question": {"type": "string"},
                        "options": {"type": "array"},
                        "answer": {"type": "string"},
                        "explanation": {"type": "string"},
                    },
                    "required": ["qtype", "question", "answer"]
                }
            }
        },
        "required": ["questions"]
    }
}

res_quiz = llm.ask_tool("Buat 2 soal \"mcq\" dan 1 soal \"tf\" dari materi fotosintesis", quiz_spec)
check(isinstance(res_quiz, dict), "ask_tool mengembalikan dict")
check("questions" in res_quiz and len(res_quiz["questions"]) >= 3, "soal kuis terisi sesuai jumlah yang diminta")
check(all("question" in q and "explanation" in q for q in res_quiz["questions"]), "properti soal lengkap")

# Verifikasi call direkam dengan tools
last_call = mock_paf.STATE["calls"][-1]
check(last_call["tools"] is not None, "mock_paf mencatat payload tools")
check(last_call["tools"][0]["function"]["name"] == "generate_quiz", "nama fungsi di tools cocok")
check(last_call["backend"] == "deepseek", "ask_tool diproses oleh deepseek")
check(last_call["tool_choice"] == "auto", "ask_tool mengirim tool_choice='auto'")

# 1.2 Doc Summary Tool
doc_spec = {
    "name": "summarize_document",
    "description": "Ringkas dokumen dan ekstraksi konsep kunci",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "topics": {"type": "array", "items": {"type": "string"}},
            "key_concepts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "term": {"type": "string"},
                        "definition": {"type": "string"}
                    }
                }
            }
        },
        "required": ["title", "summary", "key_concepts", "topics"]
    }
}

res_doc = llm.ask_tool("Ringkas dokumen tentang biologi", doc_spec)
check(res_doc.get("title") == "Biologi Dasar", "summary tool mengembalikan title yang valid")
check("key_concepts" in res_doc and len(res_doc["key_concepts"]) >= 1, "key_concepts ada")

# 1.3 Expand Concepts Tool
concepts_spec = {
    "name": "expand_concepts",
    "description": "Ekstrak istilah konsep baru dari materi",
    "parameters": {
        "type": "object",
        "properties": {
            "concepts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "term": {"type": "string"},
                        "definition": {"type": "string"},
                        "topic": {"type": "string"}
                    }
                }
            }
        },
        "required": ["concepts"]
    }
}

res_concepts = llm.ask_tool("Perluas istilah dari catatan materi", concepts_spec)
check(isinstance(res_concepts.get("concepts"), list), "concepts berupa list")
check(len(res_concepts["concepts"]) >= 2, "istilah konsep diekstraksi")

# 1.4 Generic Schema Tool
custom_spec = {
    "name": "analyze_sentiment",
    "description": "Analisis teks",
    "parameters": {
        "type": "object",
        "properties": {
            "score": {"type": "number"},
            "verdict": {"type": "string"}
        }
    }
}
res_custom = llm.ask_tool("Analisis kalimat ini", custom_spec)
check("score" in res_custom and "verdict" in res_custom, "skema generik berhasil di-mock")

# 1.5 Note Section Tool (generate_note_section)
note_section_spec = {
    "name": "generate_note_section",
    "description": "Menghasilkan bagian catatan materi terstruktur dengan poin, kode, dan rumus",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "points": {
                "type": "array",
                "items": {"type": "string"}
            },
            "code_blocks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "language": {"type": "string"},
                        "filename": {"type": "string"},
                        "explanation": {"type": "string"},
                        "code": {"type": "string"},
                        "output": {"type": "string"}
                    }
                }
            },
            "math_formulas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "latex": {"type": "string"},
                        "explanation": {"type": "string"}
                    }
                }
            }
        },
        "required": ["title", "summary", "points"]
    }
}

res_sec = llm.ask_tool("Buat bagian catatan konsep dasar", note_section_spec)
check(isinstance(res_sec, dict), "ask_tool generate_note_section mengembalikan dict")
check(res_sec.get("title") == "Konsep Dasar", "note section memiliki title yang valid")
check("summary" in res_sec and len(res_sec.get("points", [])) >= 2, "points pada note section terisi")
check("code_blocks" in res_sec and res_sec["code_blocks"][0]["language"] == "python", "code_blocks tersedia dan valid")
check("math_formulas" in res_sec and "latex" in res_sec["math_formulas"][0], "math_formulas tersedia dan valid")

# 1.6 ask_structured helper
if hasattr(llm, "ask_structured"):
    res_struct = llm.ask_structured("Buat catatan terstruktur materi", note_section_spec, level="normal")
    check(isinstance(res_struct, dict), "ask_structured mengembalikan dict")
    check(res_struct.get("title") == "Konsep Dasar", "ask_structured mengembalikan data note section yang valid")

    # ask_structured pada level deep/detail (Grok fallback ke chat_json)
    res_struct_grok = llm.ask_structured("Buat catatan terstruktur materi mendalam", note_section_spec, level="deep")
    check(res_struct_grok.get("title") == "Konsep Dasar", "ask_structured grok fallback mengembalikan data note section")

print("=== 2. Uji retry pada bad arguments")
mock_paf.STATE["bad_arguments_once"] = True
mock_paf.STATE["bad_args_done"] = False
res_retry = llm.ask_tool("Coba retry saat format json rusak", doc_spec, tries=2)
check(res_retry.get("title") == "Biologi Dasar", "ask_tool berhasil retry saat argumen json rusak")

print("=== 3. Uji fallback HTTP 400 ke chat_json")
mock_paf.STATE["tools_unsupported"] = True
try:
    res_fb = llm.ask_tool("hasilkan JSON dengan format persis", doc_spec, tries=2)
    check(res_fb.get("title") == "Biologi Dasar", "ask_tool elegan fallback ke chat_json saat worker tolak tools")
    res_sec_fb = llm.ask_tool("Buat note_section materi ini", note_section_spec, tries=2)
    check(res_sec_fb.get("title") == "Konsep Dasar", "ask_tool note_section fallback ke chat_json dengan benar")
finally:
    mock_paf.STATE["tools_unsupported"] = False

print("=== 4. Uji kompatibilitas fungsi lama llm.py")
# 4.1 ask
ask_txt = llm.ask("Transkripsikan semua teks")
check("Teks OCR palsu" in ask_txt, "llm.ask berfungsi normal")

# 4.2 chat_json
json_res = llm.chat_json("hasilkan JSON dengan format persis", "normal")
check(json_res.get("title") == "Biologi Dasar", "llm.chat_json berfungsi normal")
json_sec = llm.chat_json("Hasilkan bagian catatan note_section dengan skema title dan points", "normal")
check(json_sec.get("title") == "Konsep Dasar", "llm.chat_json untuk note_section berfungsi normal")

# 4.3 chat_stream
chunks = []
stream_resp = llm.chat_stream("PERTANYAAN SISWA: Halo", on_chunk=chunks.append)
check(bool(chunks), "llm.chat_stream menghasilkan chunk")
check(bool(stream_resp.text), "llm.chat_stream mengembalikan text lengkap")
llm.delete_session(stream_resp.session_id)

# 4.4 chat_call
call_txt, call_sid = llm.chat_call("PERTANYAAN SISWA: Apa itu klorofil?", stream=False)
check(bool(call_txt), "llm.chat_call non-stream berfungsi normal")
llm.delete_session(call_sid)

# 4.5 health
h = llm.health()
check(h["ok"] is True, "llm.health berfungsi normal")

print("=== 5. Uji upload image/file DeepSeek & Grok (kompleks & deep)")
fake_att = [{"filename": "gambar.jpg", "data": "dGVzdA==", "mime_type": "image/jpeg"}]

# 5.1 Attachment biasa -> DeepSeek
res_vision = llm.ask("Transkripsikan semua teks pada gambar ini", "vision", attachments=fake_att)
last_c = mock_paf.STATE["calls"][-1]
check(last_c["backend"] == "deepseek", "lampiran biasa diproses oleh deepseek")
check(last_c["attachments"] == 1, "attachment tercatat di gateway")

# 5.2 Attachment ask_tool -> DeepSeek
res_tool_att = llm.ask_tool("Ringkas materi gambar", doc_spec, level="normal", attachments=fake_att)
last_c = mock_paf.STATE["calls"][-1]
check(last_c["backend"] == "deepseek", "ask_tool dengan lampiran diproses oleh deepseek")

# 5.3 Attachment untuk kebutuhan kompleks & deep -> Grok
res_deep_att = llm.ask("Analisis mendalam struktur dokumen kompleks ini", level="deep", attachments=fake_att)
last_c = mock_paf.STATE["calls"][-1]
check(last_c["backend"] == "grok", "lampiran kompleks & deep diproses oleh grok")

# 5.4 Grok tidak digunakan pada level fast atau normal
plan_fast = llm._resolve_plan("fast")
check(not any(b == "grok" for b, _ in plan_fast), "grok tidak ada di plan fast")
plan_norm = llm._resolve_plan("normal")
check(not any(b == "grok" for b, _ in plan_norm), "grok tidak ada di plan normal")
plan_deep = llm._resolve_plan("deep")
check(plan_deep[0][0] == "grok", "grok menjadi model utama di plan deep")

# 5.5 Qwen menolak attachment (guard lokal dan gateway)
try:
    llm._call_response("qwen", None, "Tes attachment qwen", attachments=fake_att)
    check(False, "qwen harus menolak attachment")
except llm.LLMError as e:
    check("tidak didukung" in str(e).lower() or e.status == 400, "qwen menolak lampiran dengan LLMError 400")

print(f"\nSemua {passed} pemeriksaan lolos dengan sukses!")
