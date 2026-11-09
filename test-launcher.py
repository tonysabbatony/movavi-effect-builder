"""Launch the actual Mac starter from an unrelated directory and verify delivery.
The starter's --no-browser argument suppresses only the browser window for CI.
"""
from pathlib import Path
import os
import selectors
import subprocess
import tempfile
import time
import urllib.request

project = Path(__file__).resolve().parent
process = subprocess.Popen([str(project / 'START_MAC.command'), '--no-browser'],
                           cwd=tempfile.gettempdir(), stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, text=True)
try:
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    lines = []
    pending = ''
    deadline = time.monotonic() + 15
    url = None
    while time.monotonic() < deadline:
        if not selector.select(1):
            continue
        pending += os.read(process.stdout.fileno(), 65536).decode()
        while '\n' in pending:
            line, pending = pending.split('\n', 1)
            lines.append(line)
        urls = [line.removeprefix('Open: ') for line in lines if line.startswith('Open: ')]
        if urls:
            url = urls[0]
            break
    assert url, lines
    assert 'version=0.12' in url
    assert 'Project: ' + str(project) in lines
    with urllib.request.urlopen(url) as response:
        html = response.read().decode()
        assert response.headers['Cache-Control'] == 'no-store, max-age=0'
        assert '<title>Movavi Effect Builder v0.12</title>' in html
        assert 'Preview calibration pending' not in html
        assert 'ISF Bloom2 preview' in html
    base = url.split('/index.html')[0]
    for name in ['app.js', 'bloom-contract.js', 'mobile-package.js']:
        with urllib.request.urlopen(base + '/' + name) as response:
            assert response.read() == (project / name).read_bytes(), name
            assert response.headers['Cache-Control'] == 'no-store, max-age=0'
    print('PASS actual launcher from unrelated cwd; v0.12 path/title; exact JS bytes; no-store headers')
finally:
    process.terminate()
    process.wait(timeout=5)
