# Local dev server with caching disabled:  python3 tools/serve.py  → http://localhost:8537
# Open http://localhost:8537/?export once after changing the generator: the page posts the prebuilt
# city (assets/city.bin, assets/ground.webp, assets/ground-m.webp) back here.
import http.server, functools, os, re, urllib.parse
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_POST(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path == "/__log":
            data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            with open("tools/browser.log", "ab") as f: f.write(data + b"\n")
            self.send_response(200); self.end_headers(); return
        name = (q.get("name") or [""])[0]
        if u.path != "/__save" or not re.fullmatch(r"[a-z0-9\-]+\.(webp|png|js)", name):
            self.send_response(400); self.end_headers(); return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        folder = "js" if name.endswith(".js") else "assets"
        with open(os.path.join(folder, name), "wb") as f: f.write(data)
        self.send_response(200); self.end_headers(); print("saved", name, len(data), flush=True)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("", 8537), functools.partial(H, directory=".")).serve_forever()
