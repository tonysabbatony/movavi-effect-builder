from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, sys, webbrowser
project = Path(__file__).resolve().parent
os.chdir(project)

class BuilderHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

with ThreadingHTTPServer(("127.0.0.1", 0), BuilderHandler) as server:
    url = f"http://127.0.0.1:{server.server_port}/index.html?version=0.13.1"
    print("Movavi Effect Builder v0.13.1 — collections and effect catalog", flush=True)
    print("Project:", project, flush=True)
    print("Open:", url, flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
