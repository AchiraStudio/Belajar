"""Uji unit murni untuk play_protocol (tanpa DB/jaringan)."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.update({"DATA_DIR": "/tmp/belajar-proto-unused", "BRIDGE_URL": "ws://x/b", "BRIDGE_TOKEN": "t" * 20,
                   "PAF_API_TOKEN": "x"})

import play_protocol as P  # noqa: E402

n = 0


def check(cond, msg):
    global n
    if not cond:
        raise SystemExit(f"GAGAL: {msg}")
    n += 1
    print("  ok -", msg)


def stream(chunks):
    sp, shown = P.StreamSplitter(), ""
    for c in chunks:
        shown += sp.feed(c)
    return shown + sp.flush(), sp


REPLY = 'Halo!\n\nIni narasi.\n\n<<<GAME_DATA\n{"judgement": null, "next": {"public": {"a": 1}, "secret": {"b": 2}}, "end": false}\nGAME_DATA>>>'

print("StreamSplitter")
shown, sp = stream([REPLY])
check(shown.strip() == "Halo!\n\nIni narasi." and sp.found, "satu chunk: narasi diteruskan, data tidak")
for size in (1, 2, 3, 5, 7, 11):
    chunks = [REPLY[i:i + size] for i in range(0, len(REPLY), size)]
    shown, sp = stream(chunks)
    check("<<<" not in shown and "GAME" not in shown and shown.strip() == "Halo!\n\nIni narasi.",
          f"penanda terpotong antar-chunk (ukuran {size}) tidak bocor")
shown, sp = stream(["Tanpa blok data sama sekali."])
check(shown == "Tanpa blok data sama sekali." and not sp.found, "tanpa penanda: seluruh teks adalah narasi (flush)")
shown, _ = stream(["Ada <<", "<GAME", "_DATA {}"])
check(shown == "Ada ", "penanda terbelah di tiga chunk tetap dikenali")
shown, _ = stream(["a < b << c ", "lalu selesai"])
check(shown == "a < b << c lalu selesai", "tanda < biasa tidak ditelan")

print("parse_reply")
narr, data = P.parse_reply(REPLY)
check(narr == "Halo!\n\nIni narasi." and data["next"]["public"] == {"a": 1} and data["end"] is False, "balasan normal")
check(data["judgement"] is None and data["state_delta"] == {}, "judgement null dan state_delta kosong")
narr, data = P.parse_reply("x\n<<<GAME_DATA\n```json\n{\"next\": null, \"end\": true}\n```\nGAME_DATA>>>")
check(data["end"] is True and data["next"] is None, "fence ``` di dalam blok ditoleransi")
narr, data = P.parse_reply("x\n<<<GAME_DATA\n{\"next\": null, \"end\": true}")
check(data["end"] is True, "penutup GAME_DATA>>> hilang tetap diterima")
for bad, why in (("tidak ada penanda", "tanpa penanda"), ("x\n<<<GAME_DATA\nbukan json\nGAME_DATA>>>", "JSON rusak"),
                 ("x\n<<<GAME_DATA\n[1,2]\nGAME_DATA>>>", "bukan objek"),
                 ("x\n<<<GAME_DATA\n{\"next\": 5}\nGAME_DATA>>>", "'next' salah tipe")):
    try:
        P.parse_reply(bad)
        check(False, why)
    except P.ProtocolError:
        check(True, f"ProtocolError: {why}")
narr, data = P.parse_reply('x\n<<<GAME_DATA\n{"next": {"public": {"f": "\\frac{a}{b}"}}, "judgement": null}\nGAME_DATA>>>')
check("frac" in data["next"]["public"]["f"], "LaTeX (\\frac) di dalam JSON tidak rusak")
narr, data = P.parse_reply("<think>rahasia</think>Narasi.\n<<<GAME_DATA\n{\"next\": null}\nGAME_DATA>>>")
check("rahasia" not in narr and narr.startswith("Narasi"), "blok <think> dibuang dari narasi")

print("judgement tak tepercaya")
mk = lambda j: P.parse_reply("n\n<<<GAME_DATA\n" + j + "\nGAME_DATA>>>")[1]["judgement"]  # noqa: E731
check(mk('{"judgement": {"skor": 7}}')["skor"] == 1.0, "skor > 1 di-clamp ke 1")
check(mk('{"judgement": {"skor": -3}}')["skor"] == 0.0, "skor < 0 di-clamp ke 0")
check(mk('{"judgement": {"skor": "abc"}}')["skor"] == -1.0, "skor tak valid ditandai -1 (agent memutuskan)")
j = mk('{"judgement": {"skor": 0.1, "rubrik": {"akurat": 3, "lengkap": 2, "jelas": 3, "contoh": 1}}}')
check(abs(j["skor"] - 9 / 12) < 1e-9, "rubrik lengkap menggantikan skor AI (dihitung agent)")
j = mk('{"judgement": {"rubrik": {"akurat": 99, "lengkap": -5, "jelas": 3, "contoh": 3}}}')
check(j["rubrik"]["akurat"] == 3 and j["rubrik"]["lengkap"] == 0, "nilai rubrik di-clamp ke 0..3")
j = mk('{"judgement": {"skor": 1, "umpan_balik": "' + "x" * 900 + '"}}')
check(len(j["umpan_balik"]) <= 500, "umpan balik dipotong")
check(mk('{"judgement": "bagus"}') is None, "judgement bukan objek diabaikan")
d = P.parse_reply('n\n<<<GAME_DATA\n{"judgement": null, "hp": 99, "xp": 9999, "state_delta": {"hp": 5}}\nGAME_DATA>>>')[1]
check("xp" not in d and "hp" not in d, "field di luar skema (xp/hp) dibuang")

print("skema tipe & ketahanan penanda")
check(hasattr(P, "JudgementData") and hasattr(P, "NextTurnData") and hasattr(P, "StateDeltaData") and hasattr(P, "GameDataResult"),
      "skema TypedDict tersedia")
narr, data = P.parse_reply("x\n<<< GAME_DATA\n```json\n```\n{\"next\": {\"public\": {\"q\": \"soal \\\\sqrt{x}\"}}, \"end\": false}\n```\nGAME_DATA >>>")
check(data["end"] is False and "sqrt" in data["next"]["public"]["q"], "penanda dengan spasi dan double fence ditoleransi")

print(f"\nSemua {n} pemeriksaan lolos.")
