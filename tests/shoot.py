"""Screenshot semua halaman: python shoot.py OUT_DIR  (butuh stack demo hidup)."""
import sys, os, requests
from pathlib import Path
from playwright.sync_api import sync_playwright
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
B = "http://127.0.0.1:3060"
s = requests.Session(); s.post(B + "/api/login", json={"password": "demo-password-123"})
rpc = lambda a, **k: s.post(f"{B}/api/rpc/{a}", json=k).json()["data"]
att = rpc("start_attempt", quiz_id=1, mode="practice"); aid = att["attempt"]["id"]
q0 = att["questions"][0]; rpc("check_answer", attempt_id=aid, question_id=q0["id"], given="2" if q0["qtype"] == "mcq" else "false")
exam = rpc("start_attempt", quiz_id=2, mode="exam", time_limit_min=12)["attempt"]["id"]
pages = [("login", None), ("home", "#/"), ("materi", "#/materi"), ("doc", "#/materi/1"), ("quizlist", "#/materi/1?tab=kuis"),
         ("kuis", "#/kuis"), ("runner", f"#/latihan/{aid}"), ("exam", f"#/latihan/{exam}"), ("hasil", "#/hasil/1"), ("progres", "#/progres")]
only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--no-sandbox"])
    for scheme in ("light", "dark"):
        for dev, vp in (("desktop", {"width": 1366, "height": 860}), ("mobile", {"width": 390, "height": 844})):
            if scheme == "dark" and dev == "mobile" and not only: pass
            ctx = b.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1)
            page = ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            for name, hsh in pages:
                if only and name not in only: continue
                if name == "login":
                    page.goto(B + "/"); page.wait_for_selector("#pw")
                else:
                    if not page.url.startswith(B) or "pw" in (page.content()[:0] or ""): pass
                    page.goto(B + "/"); 
                    if page.query_selector("#pw"):
                        page.fill("#pw", "demo-password-123"); page.keyboard.press("Enter")
                    page.wait_for_selector(".shell", timeout=8000)
                    page.evaluate(f"location.hash='{hsh}'"); page.wait_for_timeout(900)
                page.wait_for_timeout(250)
                page.screenshot(path=str(out / f"{name}-{dev}-{scheme}.png"), full_page=(dev == "desktop" and name in ("home", "progres", "doc", "hasil")))
            if errs: print(dev, scheme, "ERRORS:", errs[:3])
            ctx.close()
    b.close()
print("shots:", len(list(out.glob("*.png"))))
