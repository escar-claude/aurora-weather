#!/usr/bin/env python3
"""Static dev server for Aurora WX.

Identical to `python3 -m http.server` except that it sends `Cache-Control:
no-store`, so edits to styles.css / js/*.js show up on a plain reload instead
of being served from the browser's heuristic cache.

Usage: python3 devserver.py [port]     (default 5178)
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    print(f"Aurora WX dev server → http://localhost:{port}  (no-store)")
    HTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
