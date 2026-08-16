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
import shutil
import tempfile

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
        ("CSS-Stylesheets eingebunden", 'href="./css/index.css' in html),
        ("Root-Container für Header", 'id="header-root"' in html),
        ("Root-Container für Filter", 'id="filter-root"' in html),
        ("Root-Container für Geschenke-Grid", 'id="grid-root"' in html),
        ("Root-Container für Modals", 'id="modal-root"' in html),
        ("JavaScript Modul-Startpunkt eingebunden", 'src="./js/app.js' in html)
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

def test_js_module_integrity():
    print("\n📦 4. Überprüfe JavaScript ES-Module, Imports & Exports...")
    import glob

    js_files = glob.glob(os.path.join(PROJECT_ROOT, "js/**/*.js"), recursive=True) + [
        os.path.join(PROJECT_ROOT, "data", "default-wishes.js")
    ]

    def extract_exports(filepath):
        exports = set()
        has_default = False
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        for m in re.finditer(r'export\s+(?:const|let|var|function\*?|class|async\s+function\*?)\s+([a-zA-Z0-9_$]+)', content):
            exports.add(m.group(1))

        for m in re.finditer(r'export\s*\{([^}]+)\}', content):
            for item in m.group(1).split(','):
                item = item.strip()
                if not item:
                    continue
                if ' as ' in item:
                    exports.add(item.split(' as ')[1].strip())
                else:
                    exports.add(item)

        if re.search(r'export\s+default\s+', content):
            has_default = True

        return exports, has_default

    file_exports = {f: extract_exports(f) for f in js_files}
    errors = []

    for f in js_files:
        rel_f = os.path.relpath(f, PROJECT_ROOT)
        with open(f, "r", encoding="utf-8") as handle:
            content = handle.read()

        for m in re.finditer(r'import\s+(?:(\{[^}]+\})|([a-zA-Z0-9_$]+)|\*\s+as\s+[a-zA-Z0-9_$]+)\s+from\s+[\'\"]([^\'\"]+)[\'\"]', content):
            named_imports, default_import, target_rel = m.groups()
            target_path = os.path.normpath(os.path.join(os.path.dirname(f), target_rel))

            if not os.path.exists(target_path):
                errors.append(f"[{rel_f}] Importiert nicht existierende Datei: {target_rel}")
                continue

            target_exp, target_has_default = file_exports.get(target_path, (set(), False))

            if default_import and not target_has_default:
                errors.append(f"[{rel_f}] Default-Import '{default_import}' existiert nicht in {target_rel}")

            if named_imports:
                raw_items = named_imports.strip('{}').split(',')
                for item in raw_items:
                    item = item.strip()
                    if not item:
                        continue
                    orig_name = item.split(' as ')[0].strip()
                    if orig_name not in target_exp:
                        errors.append(f"[{rel_f}] Named-Import '{orig_name}' fehlt in {target_rel}")

    if errors:
        for err in errors:
            log_fail(err)
        return False

    log_pass(f"Alle {len(js_files)} ES-Module auf konsistente Imports & Exports geprüft (0 Fehler)")
    return True

def test_server_and_routes():
    print("\n🚀 5. Überprüfe lokalen Webserver & REST-API Endpunkte...")
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

    # Isolated temporary data directory for server tests (production data is never modified)
    temp_data_dir = tempfile.mkdtemp(prefix="wunschliste_app_test_")
    os.environ["WUNSCHLISTE_DATA_DIR"] = temp_data_dir

    sample_test_events = [
        {
            "id": "test-event-ci",
            "slug": "test-event-ci",
            "title": "CI Test Event 🎁",
            "subtitle": "Test Event",
            "date": "2026-10-10",
            "icon": "🎁",
            "isArchived": False,
            "wishes": [
                {
                    "id": "wish-ci-1",
                    "title": "CI Test Geschenk",
                    "url": "https://example.com/item",
                    "price": 25.00,
                    "category": "Spielzeug",
                    "priority": "medium",
                    "status": "available",
                    "reservedBy": "",
                    "reservePin": ""
                }
            ]
        }
    ]
    with open(os.path.join(temp_data_dir, "events.json"), "w", encoding="utf-8") as f:
        json.dump(sample_test_events, f, indent=2, ensure_ascii=False)

    # Bypass proxy for test localhost connections
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    urllib.request.install_opener(opener)

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
                        # Prüfe Sicherheitsheader bei /api/health
                        if url == "/api/health":
                            hdrs = res.headers
                            if hdrs.get("X-Content-Type-Options") == "nosniff" and \
                               hdrs.get("X-Frame-Options") == "SAMEORIGIN" and \
                               "strict-origin" in hdrs.get("Referrer-Policy", "") and \
                               "Content-Security-Policy" in hdrs:
                                log_pass("Sicherheit: HTTP-Sicherheitsheader & CSP einwandfrei konfiguriert")
                            else:
                                log_fail("Sicherheit: HTTP-Sicherheitsheader oder CSP fehlen / unvollständig")
                                all_ok = False
                    else:
                        log_fail(f"HTTP {res.status}: {url}")
                        all_ok = False
            except Exception as e:
                log_fail(f"Fehler bei {url}: {e}")
                all_ok = False

        # Test Rate-Limiting / Brute-Force-Schutz
        try:
            from server import RATE_LIMITER
            RATE_LIMITER.reset()

            # 5 falsche Versuche senden
            for i in range(5):
                wrong_verify = json.dumps({"pin": "wrong9999"}).encode("utf-8")
                req_w = urllib.request.Request(
                    f"http://localhost:{PORT}/api/admin/verify",
                    data=wrong_verify,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req_w) as res_w:
                    pass  # Status 200 mit valid=False

            # 6. Versuch muss HTTP 429 Too Many Requests liefern
            req_blocked = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/verify",
                data=wrong_verify,
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req_blocked) as res_b:
                    log_fail(f"Rate-Limiting fehlgeschlagen: 6. Fehlversuch wurde nicht blockiert (Status {res_b.status})")
                    all_ok = False
            except urllib.error.HTTPError as he:
                if he.code == 429:
                    log_pass("Sicherheit: Rate-Limiter sperrt nach 5 Fehlversuchen zuverlässig mit HTTP 429")
                else:
                    log_fail(f"Unerwarteter Statuscode bei Rate-Limit: {he.code}")
                    all_ok = False

            # Limiter zurücksetzen für weitere Tests
            RATE_LIMITER.reset()
        except Exception as e:
            log_fail(f"Fehler bei Rate-Limiting Test: {e}")
            all_ok = False

        # Test POST /api/reserve (Reservieren, falscher PIN beim Stornieren, richtiger PIN beim Stornieren)
        try:
            from server import load_events_from_disk, save_events_to_disk
            current_events = load_events_from_disk()
            if current_events and current_events[0].get("wishes"):
                test_event_id = current_events[0]["id"]
                avail_wishes = [w for w in current_events[0]["wishes"] if w.get("status") == "available"]
                if avail_wishes:
                    test_wish = avail_wishes[0]
                else:
                    test_wish = current_events[0]["wishes"][0]
                    test_wish["status"] = "available"
                    test_wish["reservedBy"] = ""
                    test_wish["reservePin"] = ""
                    save_events_to_disk(current_events)
                test_wish_id = test_wish["id"]

                # 1. Reservieren mit PIN
                reserve_data = json.dumps({
                    "eventId": test_event_id,
                    "wishId": test_wish_id,
                    "action": "reserve",
                    "name": "Test Gast",
                    "note": "Freue mich",
                    "pin": "87654321"
                }).encode("utf-8")
                req = urllib.request.Request(
                    f"http://localhost:{PORT}/api/reserve",
                    data=reserve_data,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req) as res:
                    if res.status == 200:
                        resp_json = json.loads(res.read().decode("utf-8"))
                        if resp_json.get("success") and resp_json.get("wish", {}).get("status") == "reserved":
                            log_pass("POST /api/reserve: Reservierungs-API mit 8-stelligem PIN funktioniert einwandfrei")
                        else:
                            log_fail(f"POST /api/reserve antwortete ohne Erfolg: {resp_json}")
                            all_ok = False
                    else:
                        log_fail(f"POST /api/reserve Status: {res.status}")
                        all_ok = False

                # 1b. Datenschutz-Prüfung: GET /api/events ohne Admin-Header darf den Namen NICHT anzeigen
                req_guest = urllib.request.Request(f"http://localhost:{PORT}/api/events")
                with urllib.request.urlopen(req_guest) as res_guest:
                    guest_events = json.loads(res_guest.read().decode("utf-8"))
                    guest_wish = next((w for ev in guest_events for w in ev.get("wishes", []) if w["id"] == test_wish_id), None)
                    if guest_wish and guest_wish.get("reservedBy") == "" and guest_wish.get("reservePin") == "":
                        log_pass("Datenschutz: Gast-API blendet Namen (reservedBy) und PINs zuverlässig aus")
                    else:
                        log_fail(f"Datenschutz-Verletzung: Gast-API liefert sensible Daten: {guest_wish}")
                        all_ok = False

                # 1c. Admin-Prüfung: GET /api/events mit Admin-PIN zeigt den Namen an
                req_admin = urllib.request.Request(
                    f"http://localhost:{PORT}/api/events",
                    headers={"X-Admin-Pin": "1234"}
                )
                with urllib.request.urlopen(req_admin) as res_admin:
                    admin_events = json.loads(res_admin.read().decode("utf-8"))
                    admin_wish = next((w for ev in admin_events for w in ev.get("wishes", []) if w["id"] == test_wish_id), None)
                    if admin_wish and admin_wish.get("reservedBy") == "Test Gast":
                        log_pass("Admin-Zugriff: Admin-API liefert den Reservierungsnamen (Test Gast) korrekt")
                    else:
                        log_fail(f"Admin-Fehler: Admin sieht Reservierungsnamen nicht: {admin_wish}")
                        all_ok = False

                # 2. Stornieren mit FALSCHEM PIN -> muss abgewiesen werden (HTTP 403)
                cancel_wrong_data = json.dumps({
                    "eventId": test_event_id,
                    "wishId": test_wish_id,
                    "action": "cancel",
                    "pin": "00000000"
                }).encode("utf-8")
                req_wrong = urllib.request.Request(
                    f"http://localhost:{PORT}/api/reserve",
                    data=cancel_wrong_data,
                    headers={"Content-Type": "application/json"}
                )
                try:
                    with urllib.request.urlopen(req_wrong) as res:
                        log_fail(f"Sicherheitsfehler: Stornierung mit falschem PIN wurde mit Status {res.status} akzeptiert!")
                        all_ok = False
                except urllib.error.HTTPError as he:
                    if he.code == 403:
                        log_pass("Sicherheit: Stornierungsversuch mit falschem PIN wird mit HTTP 403 abgewiesen")
                    else:
                        log_fail(f"Unerwarteter HTTP Status bei falschem Storno-PIN: {he.code}")
                        all_ok = False

                # 3. Stornieren mit RICHTIGEM PIN -> muss erfolgreich freigegeben werden
                cancel_correct_data = json.dumps({
                    "eventId": test_event_id,
                    "wishId": test_wish_id,
                    "action": "cancel",
                    "pin": "87654321"
                }).encode("utf-8")
                req_correct = urllib.request.Request(
                    f"http://localhost:{PORT}/api/reserve",
                    data=cancel_correct_data,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req_correct) as res:
                    if res.status == 200:
                        resp_json = json.loads(res.read().decode("utf-8"))
                        if resp_json.get("success") and resp_json.get("wish", {}).get("status") == "available":
                            log_pass("POST /api/reserve: Reservierung aufheben mit richtigem PIN funktioniert einwandfrei")
                        else:
                            log_fail(f"Stornierung mit richtigem PIN fehlgeschlagen: {resp_json}")
                            all_ok = False
                    else:
                        log_fail(f"Storno mit richtigem PIN HTTP Status: {res.status}")
                        all_ok = False
            else:
                log_fail("Keine Events oder Wünsche zum Testen von POST /api/reserve vorhanden")
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

        # Test POST /api/admin/change-pin to 8-digit PIN (87654321)
        try:
            change_data = json.dumps({"oldPin": "1234", "newPin": "87654321"}).encode("utf-8")
            req = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/change-pin",
                data=change_data,
                headers={"Content-Type": "application/json", "X-Admin-Pin": "1234"}
            )
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    resp_json = json.loads(res.read().decode("utf-8"))
                    if resp_json.get("success"):
                        log_pass("POST /api/admin/change-pin: PIN erfolgreich auf 8 Stellen (87654321) geändert")
                    else:
                        log_fail(f"POST /api/admin/change-pin: Fehlerhafte Antwort: {resp_json}")
                        all_ok = False

            # Verify that old PIN 1234 is now REJECTED
            verify_old = json.dumps({"pin": "1234"}).encode("utf-8")
            req_old = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/verify",
                data=verify_old,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_old) as res:
                resp_json = json.loads(res.read().decode("utf-8"))
                if resp_json.get("valid") is False:
                    log_pass("Sicherheit: Alte PIN 1234 wird erfolgreich abgewiesen")
                else:
                    log_fail("Sicherheitsfehler: Alte PIN 1234 wird immer noch akzeptiert!")
                    all_ok = False

            # Verify that new 8-digit PIN 87654321 is ACCEPTED
            verify_new = json.dumps({"pin": "87654321"}).encode("utf-8")
            req_new = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/verify",
                data=verify_new,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_new) as res:
                resp_json = json.loads(res.read().decode("utf-8"))
                if resp_json.get("valid") is True:
                    log_pass("Sicherheit: Neue 8-stellige PIN 87654321 wird erfolgreich akzeptiert")
                else:
                    log_fail("Fehler: Neue 8-stellige PIN 87654321 wird nicht akzeptiert!")
                    all_ok = False

            # Change back to 1234 for test cleanup
            change_back = json.dumps({"oldPin": "87654321", "newPin": "1234"}).encode("utf-8")
            req_back = urllib.request.Request(
                f"http://localhost:{PORT}/api/admin/change-pin",
                data=change_back,
                headers={"Content-Type": "application/json", "X-Admin-Pin": "87654321"}
            )
            with urllib.request.urlopen(req_back) as res:
                pass
        except Exception as e:
            log_fail(f"Fehler bei PIN Change Test: {e}")
            all_ok = False

    finally:
        server.stop()
        time.sleep(0.2)
        if temp_data_dir and os.path.exists(temp_data_dir):
            shutil.rmtree(temp_data_dir, ignore_errors=True)
        if "WUNSCHLISTE_DATA_DIR" in os.environ:
            del os.environ["WUNSCHLISTE_DATA_DIR"]
        os.chdir(cwd)

    return all_ok

def main():
    print("=" * 65)
    print("🧪 Starte CI Testsuite für Wunschliste Web-App")
    print("=" * 65)

    t1 = test_file_structure()
    t2 = test_html_integrity()
    t3 = test_css_variables()
    t4 = test_js_module_integrity()
    t5 = test_server_and_routes()

    print("\n" + "=" * 65)
    if t1 and t2 and t3 and t4 and t5:
        print("🎉 \033[92mALLE CI-TESTS ERFOLGREICH BESTANDEN!\033[0m")
        print("=" * 65)
        sys.exit(0)
    else:
        print("❌ \033[91mEINIGE CI-TESTS SIND FEHLGESCHLAGEN!\033[0m")
        print("=" * 65)
        sys.exit(1)

if __name__ == "__main__":
    main()
