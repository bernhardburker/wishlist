#!/usr/bin/env python3
"""
E2E Playwright Browser Tests für die Wunschliste Web-App.
Prüft echtes Rendering, ES-Modul-Ladeverhalten, UI-Interaktionen und fängt Console/Page-Errors ab.
"""

import os
import sys
import json
import time
import socketserver
import threading
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_PORT = 8998

def log_pass(msg):
    print(f"  \033[92m✔\033[0m {msg}")

def log_fail(msg):
    print(f"  \033[91m✖\033[0m {msg}")

def run_playwright_tests():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\n⚠️ Playwright ist nicht installiert. Bitte mit `pip install playwright && playwright install chromium` installieren.")
        return False

    print("\n🎭 Starte E2E Playwright Tests in Chromium (Headless)...")

    sys.path.insert(0, PROJECT_ROOT)
    from server import WunschlisteHandler

    class TestServer(threading.Thread):
        def run(self):
            socketserver.TCPServer.allow_reuse_address = True
            with socketserver.TCPServer(("", TEST_PORT), WunschlisteHandler) as httpd:
                self.httpd = httpd
                httpd.serve_forever()
        def stop(self):
            self.httpd.shutdown()

    cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)

    events_backup = None
    events_file = os.path.join(PROJECT_ROOT, "data", "events.json")
    if os.path.exists(events_file):
        with open(events_file, "r", encoding="utf-8") as f:
            events_backup = f.read()

    server = TestServer()
    server.daemon = True
    server.start()
    time.sleep(0.6)

    console_errors = []
    page_errors = []
    all_passed = True

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            # Listen for JS runtime & console errors
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            # 1. Navigation
            target_url = f"http://localhost:{TEST_PORT}/index.html"
            page.goto(target_url, wait_until="networkidle")

            # Check for immediate JS errors
            if page_errors:
                for pe in page_errors:
                    log_fail(f"Uncaught JavaScript Fehler: {pe}")
                all_passed = False
            else:
                log_pass("JavaScript ES-Module fehlerfrei geladen (Keine Syntax- oder Importfehler)")

            if console_errors:
                for ce in console_errors:
                    log_fail(f"Browser Console Fehler: {ce}")
                all_passed = False
            else:
                log_pass("Browser-Konsole meldet 0 Fehler")

            # 2. Header & Titel Rendering
            page.wait_for_selector("#header-root", timeout=5000)
            title_text = page.locator(".header-title").inner_text()
            if len(title_text) > 0:
                log_pass(f"Header erfolgreich gerendert: '{title_text}'")
            else:
                log_fail("Header-Titel ist leer")
                all_passed = False

            # 3. Geschenkkarten Rendering
            page.wait_for_selector(".gift-card", timeout=5000)
            card_count = page.locator(".gift-card").count()
            if card_count > 0:
                log_pass(f"Geschenke-Grid gerendert: {card_count} Geschenke gefunden")
            else:
                log_fail("Keine Geschenkkarten gerendert")
                all_passed = False

            # 4. Multi-Shop-Links Prüfung
            shop_links = page.locator(".shop-link-btn")
            if shop_links.count() > 0:
                log_pass(f"Multi-Shop Buttons gerendert: {shop_links.count()} Shop-Links vorhanden")
            else:
                log_fail("Keine Shop-Links gefunden")
                all_passed = False

            # 5. Filterleiste Test
            filter_buttons = page.locator(".filter-btn")
            if filter_buttons.count() > 1:
                # Klick auf den zweiten Filter
                category_name = filter_buttons.nth(1).inner_text().split("\n")[0].strip()
                filter_buttons.nth(1).click()
                page.wait_for_timeout(300)
                filtered_cards = page.locator(".gift-card").count()
                log_pass(f"Filter-Interaktion getestet: Kategorie '{category_name}' ({filtered_cards} Artikel)")
                # Zurück zu "Alle"
                filter_buttons.nth(0).click()
                page.wait_for_timeout(200)
            else:
                log_fail("Zu wenige Filter-Buttons gefunden")
                all_passed = False

            # 6. Reservierungs-Modal Flow
            reserve_btn = page.locator(".btn-reserve:not([disabled])").first
            if reserve_btn.is_visible():
                reserve_btn.click()
                page.wait_for_selector("#reserve-modal.active", timeout=3000)
                log_pass("Reservierungs-Modal öffnet sich korrekt bei Klick")

                # Eingabe Name & 8-stelliger PIN
                page.fill("#reserve-name", "Playwright E2E Tester")
                page.fill("#reserve-pin", "88776655")
                page.fill("#reserve-note", "Automatisch getestet via Playwright")
                
                # Absenden
                page.click("#reserve-submit-btn")
                page.wait_for_timeout(600)
                
                # Modal geschlossen und Toast / Badge aktualisiert
                is_modal_closed = not page.locator("#reserve-modal.active").is_visible()
                if is_modal_closed:
                    log_pass("Reservierung erfolgreich ausgeführt (Name + 8-stelliger PIN)")
                else:
                    log_fail("Reservierungs-Modal schloss sich nach Absenden nicht")
                    all_passed = False
            else:
                log_fail("Kein aktiver Reservieren-Button gefunden")
                all_passed = False

            # 7. Admin-Modal Login Test
            admin_open_btn = page.locator("#btn-admin-login")
            if admin_open_btn.is_visible():
                admin_open_btn.click()
                page.wait_for_selector("#admin-modal.active", timeout=3000)
                log_pass("Admin-Modal öffnet sich bei Klick")

                # PIN eingeben (1234)
                page.fill("#admin-pin-input", "1234")
                page.click("#admin-pin-submit")
                page.wait_for_timeout(600)

                # Prüfen, ob Admin-Ansicht sichtbar ist
                admin_view = page.locator(".admin-dashboard, .admin-event-manager, #admin-view-container")
                if admin_view.count() > 0 or page.locator("button:has-text('Neuer Wunsch')").is_visible():
                    log_pass("Admin-Authentifizierung & Admin-Ansicht erfolgreich im Browser verifiziert")
                else:
                    log_fail("Admin-Dashboard nach PIN-Eingabe nicht geladen")
                    all_passed = False

            browser.close()

    except Exception as e:
        log_fail(f"Unerwarteter Fehler bei Playwright-Ausführung: {e}")
        all_passed = False
    finally:
        server.stop()
        if events_backup is not None:
            with open(events_file, "w", encoding="utf-8") as f:
                f.write(events_backup)
        settings_file = os.path.join(PROJECT_ROOT, "data", "settings.json")
        if os.path.exists(settings_file):
            os.remove(settings_file)
        os.chdir(cwd)

    return all_passed

if __name__ == "__main__":
    print("=" * 65)
    print("🎭 Wunschliste E2E Browser Testsuite (Playwright)")
    print("=" * 65)
    success = run_playwright_tests()
    print("\n" + "=" * 65)
    if success:
        print("🎉 \033[92mALLE PLAYWRIGHT E2E-TESTS ERFOLGREICH BESTANDEN!\033[0m")
        print("=" * 65)
        sys.exit(0)
    else:
        print("❌ \033[91mEINIGE PLAYWRIGHT-TESTS SIND FEHLGESCHLAGEN!\033[0m")
        print("=" * 65)
        sys.exit(1)
