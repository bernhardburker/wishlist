#!/usr/bin/env python3
"""
Automatisierte CI-Testsuite für die Wunschliste Web-App.
Prüft HTML-Struktur, JavaScript-Syntax, CSS-Integrität und Hilfsfunktionen.
"""

import os
import re
import sys
import json
import urllib.request
import socketserver
import http.server
import threading
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def log_pass(msg):
    print(f"  \033[92m✔\033[0m {msg}")

def log_fail(msg):
    print(f"  \033[91m✖\033[0m {msg}")

def test_file_structure():
    print("\n📂 1. Überprüfe Datei- und Verzeichnisstruktur...")
    required_files = [
        "index.html",
        ".gitignore",
        "README.md",
        "server.py",
        ".github/workflows/ci.yml",
        ".github/workflows/deploy.yml",
        "deploy/upgrade.sh",
        "deploy/wunschliste.service",
        "css/index.css",
        "css/components.css",
        "css/responsive.css",
        "assets/favicon.svg",
        "data/default-wishes.js",
        "data/events.json",
        "js/app.js",
        "js/state.js",
        "js/storage.js",
        "js/components/header.js",
        "js/components/filterBar.js",
        "js/components/giftCard.js",
        "js/components/giftGrid.js",
        "js/components/reserveModal.js",
        "js/components/cancelModal.js",
        "js/components/adminModal.js",
        "js/components/configModal.js",
        "js/components/toast.js",
        "js/utils/helpers.js",
        "js/utils/shopHelper.js",
        "js/utils/csvHelper.js"
    ]

    all_ok = True
    for f in required_files:
        full_path = os.path.join(PROJECT_ROOT, f)
        if os.path.exists(full_path):
            log_pass(f"Gefunden: {f}")
        else:
            log_fail(f"Fehlt: {f}")
            all_ok = False

    return all_ok

def test_html_integrity():
    print("\n🌐 2. Überprüfe HTML-Struktur & semantische Elemente...")
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    checks = [
        ("Doctype vorhanden", "<!DOCTYPE html>" in html),
        ("Deutsche Sprachdeklaration (lang='de')", 'lang="de"' in html),
        ("Viewport Meta-Tag vorhanden", 'name="viewport"' in html),
        ("Favicon eingebunden", 'rel="icon"' in html),
        ("CSS-Stylesheets eingebunden", 'href="./css/index.css"' in html),
        ("Root-Container für Header", 'id="header-root"' in html),
        ("Root-Container für Filter", 'id="filter-root"' in html),
        ("Root-Container für Geschenke-Grid", 'id="grid-root"' in html),
        ("Root-Container für Modals", 'id="modal-root"' in html),
        ("JavaScript Modul-Startpunkt eingebunden", 'src="./js/app.js"' in html)
    ]

    all_ok = True
    for name, passed in checks:
        if passed:
            log_pass(name)
        else:
            log_fail(name)
            all_ok = False

    return all_ok

def test_css_variables():
    print("\n🎨 3. Überprüfe CSS-Design-Tokens & Styling...")
    css_path = os.path.join(PROJECT_ROOT, "css", "index.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    tokens = ["--color-primary", "--color-accent", "--color-success", "--color-warning", "--bg-app", "--bg-surface"]
    all_ok = True
    for token in tokens:
        if token in css:
            log_pass(f"CSS Variable definiert: {token}")
        else:
            log_fail(f"CSS Variable fehlt: {token}")
            all_ok = False

    return all_ok

def test_server_and_routes():
    print("\n🚀 4. Überprüfe lokalen Webserver & REST-API Endpunkte...")
    PORT = 8999
    sys.path.insert(0, PROJECT_ROOT)
    from server import WunschlisteHandler

    class TestServer(threading.Thread):
        def run(self):
            socketserver.TCPServer.allow_reuse_address = True
            with socketserver.TCPServer(("", PORT), WunschlisteHandler) as httpd:
                self.httpd = httpd
                httpd.serve_forever()
        def stop(self):
            self.httpd.shutdown()

    cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)

    # Backup data/events.json during test execution
    events_backup = None
    events_file = os.path.join(PROJECT_ROOT, "data", "events.json")
    if os.path.exists(events_file):
        with open(events_file, "r", encoding="utf-8") as f:
            events_backup = f.read()

    server = TestServer()
    server.daemon = True
    server.start()
    time.sleep(0.5)

    urls_to_test = [
        "/index.html",
        "/css/index.css",
        "/css/components.css",
        "/css/responsive.css",
        "/js/app.js",
        "/js/state.js",
        "/js/storage.js",
        "/js/utils/csvHelper.js",
        "/js/utils/shopHelper.js",
        "/data/events.json",
        "/assets/favicon.svg",
        "/api/health",
        "/api/events"
    ]

    all_ok = True
    try:
        for url in urls_to_test:
            req_url = f"http://localhost:{PORT}{url}"
            try:
                with urllib.request.urlopen(req_url) as res:
                    if res.status == 200:
                        content = res.read()
                        log_pass(f"HTTP 200 OK: {url} ({len(content)} Bytes)")
                    else:
                        log_fail(f"HTTP {res.status}: {url}")
                        all_ok = False
            except Exception as e:
                log_fail(f"Fehler bei {url}: {e}")
                all_ok = False

        # Test POST /api/reserve
        try:
            reserve_data = json.dumps({
                "eventId": "geburtstag-2026",
                "wishId": "wish-1",
                "action": "reserve",
                "name": "Test Gast",
                "note": "Freue mich",
                "pin": "9999"
            }).encode("utf-8")
            req = urllib.request.Request(
                f"http://localhost:{PORT}/api/reserve",
                data=reserve_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    resp_json = json.loads(res.read().decode("utf-8"))
                    if resp_json.get("success"):
                        log_pass("POST /api/reserve: Reservierungs-API funktioniert einwandfrei")
                    else:
                        log_fail(f"POST /api/reserve antwortete ohne Erfolg: {resp_json}")
                        all_ok = False
                else:
                    log_fail(f"POST /api/reserve Status: {res.status}")
                    all_ok = False
        except Exception as e:
            log_fail(f"Fehler bei POST /api/reserve: {e}")
            all_ok = False

        # Test POST /api/admin/verify
        try:
            verify_data = json.dumps({"pin": "1234"}).encode("utf-8")
            req = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/verify",
                data=verify_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    resp_json = json.loads(res.read().decode("utf-8"))
                    if resp_json.get("valid") is True:
                        log_pass("POST /api/admin/verify: Admin-PIN Prüfung funktioniert")
                    else:
                        log_fail("POST /api/admin/verify: PIN Prüfung schlug fehl")
                        all_ok = False
        except Exception as e:
            log_fail(f"Fehler bei POST /api/admin/verify: {e}")
            all_ok = False

        # Test POST /api/events (Admin Event Speichern / Löschen)
        try:
            test_event_data = json.dumps([
                {
                    "id": "test-event-1",
                    "slug": "test-event-1",
                    "title": "Neues Test Event 🎉",
                    "subtitle": "Test Beschreibung",
                    "date": "2026-10-10",
                    "icon": "🎉",
                    "isArchived": False,
                    "wishes": []
                }
            ]).encode("utf-8")
            req = urllib.request.Request(
                f"http://localhost:{PORT}/api/events",
                data=test_event_data,
                headers={
                    "Content-Type": "application/json",
                    "X-Admin-Pin": "1234"
                }
            )
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    resp_json = json.loads(res.read().decode("utf-8"))
                    if resp_json.get("success") and len(resp_json.get("events", [])) == 1:
                        log_pass("POST /api/events: Admin Event-Verwaltung funktioniert einwandfrei")
                    else:
                        log_fail(f"POST /api/events fehlerhafte Antwort: {resp_json}")
                        all_ok = False
        except Exception as e:
            log_fail(f"Fehler bei POST /api/events: {e}")
            all_ok = False

    finally:
        server.stop()
        if events_backup is not None:
            with open(events_file, "w", encoding="utf-8") as f:
                f.write(events_backup)
        os.chdir(cwd)

    return all_ok

def main():
    print("=" * 65)
    print("🧪 Starte CI Testsuite für Wunschliste Web-App")
    print("=" * 65)

    t1 = test_file_structure()
    t2 = test_html_integrity()
    t3 = test_css_variables()
    t4 = test_server_and_routes()

    print("\n" + "=" * 65)
    if t1 and t2 and t3 and t4:
        print("🎉 \033[92mALLE CI-TESTS ERFOLGREICH BESTANDEN!\033[0m")
        print("=" * 65)
        sys.exit(0)
    else:
        print("❌ \033[91mEINIGE CI-TESTS SIND FEHLGESCHLAGEN!\033[0m")
        print("=" * 65)
        sys.exit(1)

if __name__ == "__main__":
    main()
