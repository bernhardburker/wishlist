#!/usr/bin/env python3
"""
Einfacher lokaler HTTP-Server zum schnellen Testen der Wunschliste im Browser.
Starten mit: python3 server.py
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Cache deaktivieren für sofortiges Feedback beim Entwickeln
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run():
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("=" * 60)
            print(f"🎁 Wunschliste Server läuft unter: http://localhost:{PORT}")
            print(f"📂 Verzeichnis: {DIRECTORY}")
            print("Drücke Strg+C zum Beenden.")
            print("=" * 60)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")
    except Exception as e:
        print(f"Fehler: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run()
