"""Seed data uji e2e game: satu dokumen siap dengan 6 istilah dan potongan materi. Memakai DATA_DIR dari env."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import db  # noqa: E402
from common import jdump  # noqa: E402

db.init()
ts = db.now()
terms = ["Fotosintesis", "Klorofil", "Stomata", "Respirasi", "Mitokondria", "Enzim"]
doc = db.run("INSERT INTO documents(title,filename,status,key_concepts,topics,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
             ("Biologi E2E", "e2e.pdf", "ready", jdump([{"term": t, "definition": f"Definisi {t} untuk uji e2e"} for t in terms]),
              jdump(["Sel"]), "Ringkasan e2e", ts, ts))
for i, t in enumerate(terms):
    db.run("INSERT INTO chunks(document_id,idx,label,text) VALUES(?,?,?,?)", (doc, i, f"Halaman {i + 1}", f"{t} dijelaskan. " * 20))
print(doc)
