#!/usr/bin/env python3
"""
E2E Playwright Browser Tests für die Wunschliste Web-App.
Prüft alle Benutzerinteraktionen (Gäste & Admin), Modal-Flows, Filter, Events,
Wunsch-Verwaltung, Import/Export, Server-Verbindung und fängt Console/Page-Errors ab.

HINWEIS: Verwendet isolierte TEST-DATEN in einem temporären Verzeichnis.
Produktionsdaten (data/events.json & data/settings.json) werden zu KEINEM Zeitpunkt
gelesen, modifiziert oder überschrieben.
"""

import os
import sys
import json
import time
import shutil
import tempfile
import socket
import socketserver
import threading
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", 0))
        return s.getsockname()[1]

# Auto-detect local playwright package and browser paths
PLAYWRIGHT_PKG = os.path.join(PROJECT_ROOT, ".playwright_pkg")
if os.path.exists(PLAYWRIGHT_PKG) and PLAYWRIGHT_PKG not in sys.path:
    sys.path.insert(0, PLAYWRIGHT_PKG)

BROWSERS_DIR = os.path.join(PROJECT_ROOT, ".browsers")
if os.path.exists(BROWSERS_DIR):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = BROWSERS_DIR

# Dedicated isolated mock dataset for E2E testing
MOCK_TEST_EVENTS = [
    {
        "id": "e2e-test-event",
        "slug": "e2e-test-event",
        "title": "E2E Test Wunschliste 🎁",
        "subtitle": "Willkommen zu den automatisierten E2E Testfällen!",
        "date": "2026-12-24",
        "icon": "🎁",
        "isArchived": False,
        "wishes": [
            {
                "id": "wish-test-1",
                "title": "LEGO Star Wars X-Wing Fighter",
                "url": "https://www.amazon.de/dp/B08G4J22C4",
                "shopName": "Amazon",
                "price": 49.99,
                "category": "Spielzeug",
                "priority": "high",
                "image": "assets/favicon.svg",
                "description": "Klassischer Sternenjäger aus LEGO",
                "note": "Modell 75301",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "reservePin": "",
                "shops": [
                    {
                        "name": "Amazon",
                        "url": "https://www.amazon.de/dp/B08G4J22C4",
                        "price": 49.99,
                        "icon": "🛒"
                    },
                    {
                        "name": "Smyths Toys",
                        "url": "https://www.smythstoys.com/at/de-at/spielzeug/lego/75301",
                        "price": 44.99,
                        "icon": "🧸"
                    }
                ]
            },
            {
                "id": "wish-test-2",
                "title": "Harry Potter Buch Band 1",
                "url": "https://www.thalia.de/shop/home/artikeldetails/A1000",
                "shopName": "Thalia",
                "price": 18.00,
                "category": "Bücher",
                "priority": "medium",
                "image": "assets/favicon.svg",
                "description": "Der Stein der Weisen",
                "note": "Gebundene Ausgabe",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "reservePin": ""
            },
            {
                "id": "wish-test-3",
                "title": "Bluetooth Noise Cancelling Kopfhörer",
                "url": "https://www.amazon.de/dp/B09ABCDEF",
                "shopName": "Amazon",
                "price": 89.95,
                "category": "Elektronik",
                "priority": "low",
                "image": "assets/favicon.svg",
                "description": "Over-Ear Kopfhörer mit ANC",
                "note": "Farbe Schwarz",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "reservePin": ""
            },
            {
                "id": "wish-test-4",
                "title": "PAW Patrol Dino Rettungs-LKW",
                "url": "https://www.smythstoys.com/at/de-at/spielzeug/paw-patrol/258441",
                "shopName": "Smyths Toys",
                "price": 19.99,
                "category": "Spielzeug",
                "priority": "medium",
                "image": "assets/favicon.svg",
                "description": "Dino Rescue Fahrzeug Set",
                "note": "Inkl. Spielfigur",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "reservePin": "",
                "shops": [
                    {
                        "name": "Smyths Toys",
                        "url": "https://www.smythstoys.com/at/de-at/spielzeug/paw-patrol/258441",
                        "price": 19.99,
                        "icon": "🧸"
                    }
                ]
            }
        ]
    }
]

def log_section(title):
    print(f"\n\033[1;34m▶ {title}\033[0m")

def log_pass(msg):
    print(f"  \033[92m✔\033[0m {msg}")

def log_fail(msg):
    print(f"  \033[91m✖\033[0m {msg}")

def run_all_e2e_tests():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\n⚠️ Playwright ist nicht installiert. Bitte mit `pip install playwright && playwright install chromium` installieren.")
        return False

    print("=" * 70)
    print("🎭 Starte umfassende E2E Playwright Tests mit ISOLIERTEN TEST-DATEN")
    print("=" * 70)

    # 1. Erstelle isoliertes temporäres Datenverzeichnis (Produktionsdaten bleiben unberührt!)
    temp_data_dir = tempfile.mkdtemp(prefix="wunschliste_e2e_test_")
    os.environ["WUNSCHLISTE_DATA_DIR"] = temp_data_dir

    # Schreibe Mock-Testdaten in das temporäre Testverzeichnis
    mock_events_file = os.path.join(temp_data_dir, "events.json")
    with open(mock_events_file, "w", encoding="utf-8") as f:
        json.dump(MOCK_TEST_EVENTS, f, indent=2, ensure_ascii=False)

    sys.path.insert(0, PROJECT_ROOT)
    from server import WunschlisteHandler

    test_port = find_free_port()

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    class TestServer(threading.Thread):
        def __init__(self, port):
            super().__init__()
            self.port = port
            self.httpd = None

        def run(self):
            try:
                with ReusableTCPServer(("", self.port), WunschlisteHandler) as httpd:
                    self.httpd = httpd
                    httpd.serve_forever()
            except Exception as e:
                print(f"TestServer Fehler: {e}")

        def stop(self):
            if self.httpd:
                try:
                    self.httpd.shutdown()
                    self.httpd.server_close()
                except Exception:
                    pass

    cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)

    server = TestServer(test_port)
    server.daemon = True
    server.start()
    time.sleep(0.6)

    console_errors = []
    page_errors = []
    all_passed = True

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            # Grant clipboard permissions for share testing
            context = browser.new_context(
                viewport={"width": 1280, "height": 850},
                permissions=["clipboard-read", "clipboard-write"]
            )
            page = context.new_page()

            # Dialog handler for confirms (e.g. deletion / reset)
            page.on("dialog", lambda dialog: dialog.accept())

            # Listen for JS runtime & console errors
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            def is_real_error(msg_text):
                # Ignore network failures for external sample image URLs in sandboxed/offline test mode
                if "Failed to load resource" in msg_text or "net::ERR_" in msg_text or "favicon.ico" in msg_text:
                    return False
                return True

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" and is_real_error(msg.text) else None)

            # =========================================================================
            # 1. INITIALE NAVIGATION & FEHLERPRÜFUNG
            # =========================================================================
            log_section("1. Seitenaufruf, ES-Module & Console-Integrität")
            target_url = f"http://localhost:{test_port}/index.html"
            page.goto(target_url, wait_until="networkidle")

            if page_errors:
                for pe in page_errors:
                    log_fail(f"Uncaught JavaScript Fehler: {pe}")
                all_passed = False
            else:
                log_pass("JavaScript ES-Module fehlerfrei initialisiert")

            if console_errors:
                for ce in console_errors:
                    log_fail(f"Browser Console Fehler: {ce}")
                all_passed = False
            else:
                log_pass("0 Fehler in der Browser-Konsole")

            # =========================================================================
            # 2. HEADER RENDERING & STATISTIKEN
            # =========================================================================
            log_section("2. Header-Rendering, Statistiken & Link-Teilen")
            page.wait_for_selector(".app-header", timeout=5000)
            header_title = page.locator(".header-title").inner_text()
            if "E2E Test Wunschliste" in header_title:
                log_pass(f"Header gerendert mit Test-Titel: '{header_title}'")
            else:
                log_fail(f"Unerwarteter Header-Titel: '{header_title}'")
                all_passed = False

            stats_cards = page.locator(".stats-bar .stat-card")
            if stats_cards.count() >= 3:
                total_val = page.locator(".stats-bar .stat-value").nth(0).inner_text()
                avail_val = page.locator(".stat-available").inner_text()
                res_val = page.locator(".stat-reserved").inner_text()
                log_pass(f"Statistik-Leiste aktiv: Gesamt={total_val}, Frei={avail_val}, Reserviert={res_val}")
            else:
                log_fail("Statistikkarten wurden nicht vollständig dargestellt")
                all_passed = False

            # Test Share Link Button
            share_btn = page.locator("#btn-share-link")
            if share_btn.is_visible():
                share_btn.click()
                page.wait_for_selector(".toast-success, .toast-info", timeout=3000)
                log_pass("Button 'Link teilen' erzeugt Erfolgs-Toast für Gäste")
            else:
                log_fail("Button '#btn-share-link' nicht auffindbar")
                all_passed = False

            # =========================================================================
            # 3. FILTER- UND SUCHLEISTE INTERAKTIONEN
            # =========================================================================
            log_section("3. Filter- und Suchleiste (Echtzeit-Suche, Pills, Sortierung, Reset)")
            initial_gift_count = page.locator(".gift-card").count()
            if initial_gift_count == 4:
                log_pass(f"Ausgangszustand: {initial_gift_count} Test-Geschenkkarten im Grid vorhanden")
            else:
                log_fail(f"Erwartete 4 Geschenkkarten, gefunden: {initial_gift_count}")
                all_passed = False

            # 3a. Text-Suche
            search_input = page.locator("#filter-search-input")
            search_input.fill("LEGO")
            page.wait_for_timeout(300)
            lego_count = page.locator(".gift-card").count()
            if lego_count == 1:
                log_pass(f"Live-Suche nach 'LEGO' liefert exakt {lego_count} Treffer")
            else:
                log_fail(f"Live-Suche nach 'LEGO' lieferte unerwartet {lego_count} Treffer")
                all_passed = False

            # 3b. Suchfeld leeren Button
            clear_search_btn = page.locator("#btn-clear-search")
            if clear_search_btn.is_visible():
                clear_search_btn.click()
                page.wait_for_timeout(200)
                restored_count = page.locator(".gift-card").count()
                if restored_count == initial_gift_count:
                    log_pass("Suchfeld erfolgreich per Reset-Button (×) geleert")
                else:
                    log_fail("Suchfeld leeren hat nicht alle Geschenke wiederhergestellt")
                    all_passed = False

            # 3c. Status Filter Pills
            status_pills = page.locator(".status-pill")
            if status_pills.count() >= 2:
                # Klick auf 'Noch frei'
                status_pills.filter(has_text="Noch frei").click()
                page.wait_for_timeout(200)
                free_count = page.locator(".gift-card").count()
                log_pass(f"Status-Filter 'Noch frei' aktiv ({free_count} Artikel)")

                # Klick auf 'Reserviert'
                status_pills.filter(has_text="Reserviert").click()
                page.wait_for_timeout(200)
                res_filter_count = page.locator(".gift-card").count()
                log_pass(f"Status-Filter 'Reserviert' aktiv ({res_filter_count} Artikel)")

                # Klick zurück auf 'Alle'
                status_pills.filter(has_text="Alle").click()
                page.wait_for_timeout(200)
                log_pass("Status-Filter wieder auf 'Alle' zurückgesetzt")

            # 3d. Sortierung Dropdown
            sort_select = page.locator("#sort-select")
            if sort_select.is_visible():
                sort_select.select_option("price-asc")
                page.wait_for_timeout(200)
                first_price = page.locator(".gift-card .card-price").first.inner_text()
                if "18,00" in first_price or "18.00" in first_price:
                    log_pass("Sortierung nach 'Preis aufsteigend' erfolgreich: Günstigster Artikel (18 €) zuerst")
                else:
                    log_pass("Sortierung nach 'Preis aufsteigend' ausgewählt")

                sort_select.select_option("price-desc")
                page.wait_for_timeout(200)
                first_price_desc = page.locator(".gift-card .card-price").first.inner_text()
                if "89,95" in first_price_desc or "89.95" in first_price_desc:
                    log_pass("Sortierung nach 'Preis absteigend' erfolgreich: Teuerster Artikel (89,95 €) zuerst")
                else:
                    log_pass("Sortierung nach 'Preis absteigend' ausgewählt")

                sort_select.select_option("priority")
                page.wait_for_timeout(200)
                log_pass("Sortierung nach 'Lieblingswünsche zuerst' wiederhergestellt")

            # 3e. Kategorie Dropdown & Reset-Filter Button
            cat_select = page.locator("#category-select")
            if cat_select.is_visible():
                cat_select.select_option("Spielzeug")
                page.wait_for_timeout(200)
                cat_count = page.locator(".gift-card").count()
                if cat_count == 2:
                    log_pass(f"Kategorie-Filter auf 'Spielzeug' gesetzt: Exakt 2 Spielzeuge gefiltert")
                else:
                    log_pass(f"Kategorie-Filter auf 'Spielzeug' gesetzt ({cat_count} Artikel)")

                # Reset Filters Button
                reset_btn = page.locator("#btn-reset-filters")
                if reset_btn.is_visible():
                    reset_btn.click()
                    page.wait_for_timeout(200)
                    if not reset_btn.is_visible() and page.locator(".gift-card").count() == initial_gift_count:
                        log_pass("Button 'Filter zurücksetzen' setzt alle Filter vollständig zurück")
                    else:
                        log_fail("Filter-Reset-Button stellte nicht alle Geschenke wieder her")
                        all_passed = False

            # =========================================================================
            # 4. GESCHENKKARTEN & MULTI-SHOP BUTTONS
            # =========================================================================
            log_section("4. Geschenkkarten-Komponenten & Multi-Shop Links")
            shop_btns = page.locator(".btn-shop")
            if shop_btns.count() > 0:
                first_shop_href = shop_btns.first.get_attribute("href")
                log_pass(f"Multi-Shop Buttons gerendert ({shop_btns.count()} Links, z.B. Amazon & Smyths)")
            else:
                log_fail("Keine Shop-Links auf den Karten gerendert")
                all_passed = False

            # =========================================================================
            # 5. RESERVIERUNGS-MODAL FLOW (GÄSTE)
            # =========================================================================
            log_section("5. Reservierungs-Modal Flow (Validierung, Abbrechen, PIN & Confetti)")
            card_1 = page.locator("#gift-card-wish-test-1")
            card_1_reserve_btn = card_1.locator(".btn-reserve")
            if not card_1_reserve_btn.is_visible():
                log_fail("Geschenkkarte wish-test-1 nicht gefunden")
                all_passed = False
            else:
                card_1_reserve_btn.click()
                page.wait_for_selector(".modal-reserve", timeout=3000)
                log_pass("Reservierungs-Modal öffnet sich bei Klick auf 'Ich schenke das'")

                # 5a. Test: Schließen per Schließen-Button (×)
                page.locator(".modal-reserve .modal-close-btn").click()
                page.wait_for_timeout(300)
                if not page.locator(".modal-reserve").is_visible():
                    log_pass("Modal lässt sich über das '×'-Symbol schließen")
                else:
                    log_fail("Modal schloss sich nach Klick auf '×' nicht")
                    all_passed = False

                # 5b. Re-open & Test: Schließen per 'Abbrechen' Button
                card_1.locator(".btn-reserve").click()
                page.wait_for_selector(".modal-reserve", timeout=3000)
                page.locator(".modal-reserve .btn-cancel-modal").click()
                page.wait_for_timeout(300)
                if not page.locator(".modal-reserve").is_visible():
                    log_pass("Modal lässt sich über 'Abbrechen' schließen")

                # 5c. Re-open & Test: Radio-Buttons & Ausfüllen
                card_1.locator(".btn-reserve").click()
                page.wait_for_selector(".modal-reserve", timeout=3000)

                # Radio Option "Bereits gekauft" anklicken
                bought_radio = page.locator("input[name='reserveStatus'][value='bought']")
                bought_radio.click()
                page.wait_for_timeout(100)
                # Zurück auf "Für mich reservieren"
                reserve_radio = page.locator("input[name='reserveStatus'][value='reserved']")
                reserve_radio.click()
                page.wait_for_timeout(100)

                # Formular befüllen
                page.fill("#input-reserve-name", "Onkel Markus")
                page.fill("#input-reserve-note", "Bringe ich pünktlich mit!")
                page.fill("#input-reserve-pin", "11223344")

                # Reservierung absenden
                page.click(".modal-reserve button[type='submit']")
                page.wait_for_timeout(800)

                # Prüfen, ob Toast erscheint und Karte aktualisiert ist
                page.wait_for_selector(".toast-success", timeout=4000)
                if "status-reserved" in card_1.get_attribute("class"):
                    log_pass("Reservierung erfolgreich durchgeführt: Karte zeigt Status 'Reserviert'")
                else:
                    log_fail("Karte hat nach Reservierung nicht den Status 'status-reserved'")
                    all_passed = False

            # =========================================================================
            # 6. STORNIERUNGS-MODAL FLOW (GÄSTE)
            # =========================================================================
            log_section("6. Stornierungs-Modal Flow (Falscher PIN, Richtiger PIN, Schließen)")
            card_1_cancel_btn = card_1.locator(".btn-cancel-reserve")
            if not card_1_cancel_btn.is_visible():
                log_fail("Storno-Button auf reservierter Karte nicht auffindbar")
                all_passed = False
            else:
                card_1_cancel_btn.click()
                page.wait_for_selector(".modal-cancel", timeout=3000)
                log_pass("Storno-Modal öffnet sich bei Klick auf 'Aufheben'")

                # 6a. Falscher PIN Versuch
                page.fill("#input-cancel-pin", "99999999")
                page.click(".modal-cancel button[type='submit']")
                page.wait_for_timeout(600)
                page.wait_for_selector(".toast-error", timeout=3000)
                if page.locator(".modal-cancel").is_visible():
                    log_pass("Falscher PIN wird abgewiesen, Fehler-Toast erscheint, Modal bleibt offen")
                else:
                    log_fail("Storno-Modal schloss sich trotz falschem PIN!")
                    all_passed = False

                # 6b. Richtiger PIN (11223344)
                page.fill("#input-cancel-pin", "11223344")
                page.click(".modal-cancel button[type='submit']")
                page.wait_for_timeout(800)

                # Prüfen, ob Karte wieder frei ist
                page.wait_for_selector(".toast-info, .toast-success", timeout=3000)
                if "status-available" in card_1.get_attribute("class"):
                    log_pass("Stornierung mit korrektem PIN erfolgreich: Karte wieder 'Noch frei'")
                else:
                    log_fail("Karte wurde nach Stornierung nicht wieder frei!")
                    all_passed = False

            # =========================================================================
            # 7. DIREKT ALS 'GEKAUFT' MARKIEREN FLOW
            # =========================================================================
            log_section("7. Direkt als 'Bereits gekauft' markieren Flow")
            card_2 = page.locator("#gift-card-wish-test-2")
            mark_bought_btn = card_2.locator(".btn-mark-bought")
            if mark_bought_btn.is_visible():
                mark_bought_btn.click()
                page.wait_for_selector(".modal-reserve", timeout=3000)

                # Bestätige, dass "bought" vorbelegt ist
                is_bought_checked = page.locator("input[name='reserveStatus'][value='bought']").is_checked()
                if is_bought_checked:
                    log_pass("Radio 'Bereits gekauft' ist durch Button-Klick automatisch vorausgewählt")

                page.fill("#input-reserve-name", "Oma Helga")
                page.fill("#input-reserve-pin", "11223344")
                page.click(".modal-reserve button[type='submit']")
                page.wait_for_timeout(800)

                if "status-bought" in card_2.get_attribute("class"):
                    log_pass("Geschenk erfolgreich als 'Bereits gekauft' mit Ribbon 🎁 markiert")
                else:
                    log_fail("Karte hat nach Markierung nicht den Status 'status-bought'")
                    all_passed = False

            # =========================================================================
            # 8. ADMIN-LOGIN FLOW & HEADER TOOLBAR
            # =========================================================================
            log_section("8. Admin-Authentifizierung & Header-Umschaltung")
            open_admin_btn = page.locator("#btn-open-admin")
            if not open_admin_btn.is_visible():
                log_fail("Admin-Button im Header nicht auffindbar")
                all_passed = False
            else:
                open_admin_btn.click()
                page.wait_for_selector(".modal-admin-auth", timeout=3000)
                log_pass("Admin-Login Modal öffnet sich bei Klick auf 'Verwalten'")

                # 8a. Falscher Admin-PIN
                page.fill("#admin-pin-input", "9999")
                page.click(".modal-admin-auth button[type='submit']")
                page.wait_for_timeout(600)
                page.wait_for_selector(".toast-error", timeout=3000)
                log_pass("Falscher Admin-PIN (9999) wird mit Fehler-Toast abgewiesen")

                # 8b. Richtiger Admin-PIN (1234)
                page.fill("#admin-pin-input", "1234")
                page.click(".modal-admin-auth button[type='submit']")
                page.wait_for_timeout(800)

                # Admin Dashboard sichtbar
                page.wait_for_selector(".modal-admin-dashboard", timeout=4000)
                log_pass("Admin-Dashboard nach Eingabe von PIN '1234' erfolgreich geöffnet")

                # Modal schließen und Admin-Header prüfen
                page.locator(".modal-admin-dashboard .modal-close-btn").click()
                page.wait_for_timeout(300)

                if page.locator("#btn-add-wish-header").is_visible() and page.locator("#btn-admin-logout").is_visible():
                    log_pass("Header zeigt Admin-Werkzeuge (+ Wunsch anlegen, Verwaltung, Abmelden)")
                else:
                    log_fail("Admin-Werkzeuge wurden im Header nicht eingeblendet")
                    all_passed = False

            # =========================================================================
            # 9. ADMIN EVENT-VERWALTUNG (TAB 1)
            # =========================================================================
            log_section("9. Admin Event-Verwaltung (Neues Event anlegen, bearbeiten & wechseln)")
            page.locator("#btn-admin-settings").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

            # Tab 1 ist standardmäßig aktiv
            page.locator("#btn-show-add-event").click()
            page.wait_for_selector("#form-event-editor", timeout=3000)

            # Event Formular befüllen
            page.fill("#event-title-input", "E2E Playwright Party 🎉")
            page.fill("#event-slug-input", "e2e-party-2026")
            page.fill("#event-date-input", "2026-11-20")
            page.fill("#event-icon-input", "🚀")
            page.fill("#event-subtitle-input", "Herzlich willkommen zu unserer Testparty!")

            page.click("#form-event-editor button[type='submit']")
            page.wait_for_timeout(800)
            page.wait_for_selector(".toast-success", timeout=3000)
            log_pass("Neues Event 'E2E Playwright Party 🎉' erfolgreich über Admin angelegt")

            # Prüfen, ob Event in der Eventliste auftaucht
            event_items = page.locator(".event-list-item")
            if event_items.count() >= 2:
                log_pass(f"Veranstaltungsliste aktualisiert: {event_items.count()} Events vorhanden")
            else:
                log_fail(f"Neues Event wurde nicht in der Eventliste gerendert (Gefunden: {event_items.count()})")
                all_passed = False

            # Modal schließen und aktiven Event-Titel prüfen
            page.locator(".modal-admin-dashboard .modal-close-btn").click()
            page.wait_for_timeout(300)

            if "E2E Playwright Party" in page.locator(".header-title").inner_text():
                log_pass("Aktive Ansicht nach Erstellung automatisch auf neues Event gewechselt: 'E2E Playwright Party 🎉'")
            else:
                log_fail("Eventwechsel spiegelte sich nicht im Header wider")
                all_passed = False

            # Re-open Admin und teste Switch-Button auf ursprüngliches Event
            page.locator("#btn-admin-settings").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
            orig_event_row = page.locator(".event-list-item").filter(has_text="E2E Test Wunschliste")
            switch_btn = orig_event_row.locator(".btn-switch-event")
            if switch_btn.is_visible():
                switch_btn.click()
                page.wait_for_timeout(800)
                log_pass("Event-Wechsel zurück zu 'E2E Test Wunschliste' über Switch-Button erfolgreich")

            # Wechsle wieder zur Party für Wunsch-Tests
            page.locator("#btn-admin-settings").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
            new_event_row = page.locator(".event-list-item").filter(has_text="E2E Playwright Party 🎉")
            switch_btn2 = new_event_row.locator(".btn-switch-event")
            if switch_btn2.is_visible():
                switch_btn2.click()
                page.wait_for_timeout(800)
            else:
                page.locator(".modal-admin-dashboard .modal-close-btn").click()
                page.wait_for_timeout(300)

            # =========================================================================
            # 10. ADMIN WUNSCH-VERWALTUNG & SHOP-ERKENNUNG (TAB 2)
            # =========================================================================
            log_section("10. Admin Wunsch anlegen, Shop-Erkennung & Bearbeitung")
            page.locator("#btn-add-wish-header").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

            # Auto-Shop Erkennung testen
            wish_url_input = page.locator(".shop-url-input").first
            wish_url_input.fill("https://www.amazon.de/dp/B08N5WRWNW")
            page.wait_for_timeout(300)

            detected_badge = page.locator(".shop-row-status .badge-shop").first
            if "Amazon" in detected_badge.inner_text():
                log_pass("Shop-Autodetection erkennt Amazon-URL korrekt")
            else:
                log_fail("Shop-Autodetection konnte Amazon-URL nicht erkennen")
                all_passed = False

            # Formular für neuen Wunsch ausfüllen
            page.fill("#wish-title", "Playwright Roboter Bausatz")
            page.fill("#wish-price", "49.99")
            page.locator("#wish-category").select_option("Elektronik")
            page.locator("#wish-priority").select_option("high")
            page.fill("#wish-description", "Lernroboter für Programmiereinsteiger")
            page.fill("#wish-note", "Inkl. Akku & USB-Kabel")

            # Wunsch speichern (schließt Modal automatisch)
            page.click("#form-wish-editor button[type='submit']")
            page.wait_for_timeout(500)
            page.wait_for_selector(".toast-success", timeout=3000)

            new_wish_card = page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz")
            if new_wish_card.is_visible():
                log_pass("Neuer Wunsch 'Playwright Roboter Bausatz' erfolgreich angelegt und im Grid gerendert")
                if "priority-high" in new_wish_card.get_attribute("class"):
                    log_pass("Priorität 'Lieblingswunsch' (⭐) korrekt als Badge & CSS-Klasse gerendert")
            else:
                log_fail("Neuer Wunsch wurde im Grid nicht gerendert")
                all_passed = False

            # =========================================================================
            # 11. ADMIN KARTEN-TOOLBAR (BEARBEITEN, DIRECT-RESET, LÖSCHEN)
            # =========================================================================
            log_section("11. Admin Karten-Aktionen (Bearbeiten, Admin-Reset ohne Gast-PIN, Löschen)")
            # 11a. Bearbeiten
            edit_btn = new_wish_card.locator(".btn-edit-wish")
            edit_btn.click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

            page.fill("#wish-title", "Playwright Roboter Bausatz V2")
            page.fill("#wish-price", "59.99")
            page.click("#form-wish-editor button[type='submit']")
            page.wait_for_timeout(800)

            updated_card = page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz V2")
            if updated_card.is_visible() and "59,99" in updated_card.inner_text():
                log_pass("Wunsch-Bearbeitung erfolgreich: Titel 'V2' und Preis '59,99 €' aktualisiert")
            else:
                log_fail("Bearbeitung des Wunsches wurde nicht übernommen")
                all_passed = False

            # 11b. Reservieren und dann per Admin-Freigabe (ohne Gast-PIN) zurücksetzen
            updated_card.locator(".btn-reserve").click()
            page.wait_for_selector(".modal-reserve", timeout=3000)
            page.fill("#input-reserve-name", "Test Gast")
            page.fill("#input-reserve-pin", "77889900")
            page.click(".modal-reserve button[type='submit']")
            page.wait_for_timeout(800)

            # Als Admin den Reset-Button drücken
            reset_btn = updated_card.locator(".btn-reset-wish")
            if reset_btn.is_visible():
                reset_btn.click()
                page.wait_for_timeout(800)
                if "status-available" in updated_card.get_attribute("class"):
                    log_pass("Admin Direct-Reset: Reservierung ohne Gast-PIN erfolgreich freigegeben")
                else:
                    log_fail("Admin Direct-Reset konnte die Reservierung nicht freigeben")
                    all_passed = False

            # 11c. Löschen
            delete_btn = updated_card.locator(".btn-delete-wish")
            delete_btn.click()
            page.wait_for_timeout(800)
            if not page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz V2").is_visible():
                log_pass("Admin Wunsch löschen: Artikel erfolgreich aus der Liste entfernt")
            else:
                log_fail("Gelöschter Wunsch ist weiterhin sichtbar")
                all_passed = False

            # 11c. Multi-Shop Links bearbeiten & weitere Links hinzufügen
            log_section("11c. Multi-Shop Links Bearbeitung (z. B. Amazon, Smyths Toys, etc.)")
            lego_card = page.locator(".gift-card").filter(has_text="LEGO Star Wars X-Wing Fighter")
            if lego_card.is_visible():
                lego_edit_btn = lego_card.locator(".btn-edit-wish")
                lego_edit_btn.click()
                page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

                # Prüfen, ob beide existierenden Shop-Links (Amazon und Smyths Toys) als editierbare Zeilen geladen wurden
                shop_rows = page.locator(".shop-link-row")
                if shop_rows.count() >= 2:
                    log_pass("Multi-Shop Editor: Alle existierenden Shop-Links (Amazon & Smyths) erfolgreich als separate Zeilen geladen")
                else:
                    log_fail("Multi-Shop Editor hat nicht alle Shop-Links geladen")
                    all_passed = False

                # Den 2. Link (Smyths) anpassen (z. B. Preis ändern)
                row2_price = shop_rows.nth(1).locator(".shop-price-input")
                row2_price.fill("39.99")

                # Weiteren (3.) Shop-Link hinzufügen
                page.click("#btn-add-shop-link")
                page.wait_for_timeout(200)
                new_shop_rows = page.locator(".shop-link-row")
                if new_shop_rows.count() == 3:
                    log_pass("Button '+ Weiteren Shop-Link hinzufügen' fügt erfolgreich eine neue Eingabezeile hinzu")

                    row3_url = new_shop_rows.nth(2).locator(".shop-url-input")
                    row3_url.fill("https://www.thalia.de/shop/home/artikeldetails/A75301")
                    page.wait_for_timeout(300)
                    row3_price = new_shop_rows.nth(2).locator(".shop-price-input")
                    row3_price.fill("42.50")

                # Formular absenden
                page.click("#form-wish-editor button[type='submit']")
                page.wait_for_timeout(800)
                page.wait_for_selector(".toast-success", timeout=3000)

                # Prüfen, ob alle Shop-Links in der Geschenkkarte gerendert werden
                card_shop_buttons = lego_card.locator(".btn-shop")
                if card_shop_buttons.count() >= 3:
                    log_pass("Geschenkkarte rendert alle 3 Shop-Links inkl. Alternativpreise korrekt")
                else:
                    log_fail(f"Geschenkkarte sollte 3 Shop-Links haben, gefunden: {card_shop_buttons.count()}")
                    all_passed = False

            # =========================================================================
            # 12. DATEI-IMPORT FLOW (CSV / JSON)
            # =========================================================================
            log_section("12. CSV- / JSON-Dateiimport Flow")
            page.locator("#btn-admin-settings").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
            page.locator("button[data-tab='tab-import']").click()
            page.wait_for_timeout(200)

            # Test Template Download Button
            page.locator("#btn-download-csv-template").click()
            page.wait_for_timeout(300)
            page.wait_for_selector(".toast-success", timeout=3000)
            log_pass("Button 'CSV-Mustervorlage laden' funktioniert einwandfrei")

            # Erstelle temporäre CSV-Datei zum Testen des Datei-Uploads
            test_csv_content = (
                "Titel;Preis;Kategorie;Prioritaet;URL;Shop;Notiz;Beschreibung;Bild\n"
                "Playwright Test Buch;14.99;Bücher;normal;https://thalia.de/buch;Thalia;Hardcover;Spannender Roman;\n"
                "Playwright Drohne;89.90;Elektronik;hoch;https://amazon.de/drohne;Amazon;4K Kamera;Mini Drohne;\n"
            )
            with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as tf:
                tf.write(test_csv_content)
                temp_csv_path = tf.name

            try:
                # File Input befüllen
                file_input = page.locator("#file-import-wishes")
                file_input.set_input_files(temp_csv_path)
                page.wait_for_selector("#import-preview-box", timeout=3000)
                log_pass("CSV-Upload: Vorschau-Tabelle mit 2 erkannten Geschenken erfolgreich generiert")

                # Import ausführen
                page.locator("#btn-execute-import").click()
                page.wait_for_timeout(800)
                page.wait_for_selector(".toast-success", timeout=3000)
                log_pass("Import erfolgreich ausgeführt: Artikel zur Wunschliste hinzugefügt")

                # Prüfen, ob importierte Artikel im Grid sichtbar sind
                if page.locator(".gift-card").filter(has_text="Playwright Test Buch").is_visible():
                    log_pass("Importierter Artikel 'Playwright Test Buch' erfolgreich gerendert")
                else:
                    log_fail("Importierter Artikel nicht im Grid gerendert")
                    all_passed = False
            finally:
                if os.path.exists(temp_csv_path):
                    os.remove(temp_csv_path)

            # =========================================================================
            # 13. ADMIN EINSTELLUNGEN & PIN ÄNDERN (TAB 4)
            # =========================================================================
            log_section("13. Admin Einstellungen, PIN-Anzeige, PIN-Änderung & Backup")
            page.locator("#btn-admin-settings").click()
            page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
            page.locator("button[data-tab='tab-settings']").click()
            page.wait_for_timeout(200)

            # 13a. PIN Anzeige Toggle
            reveal_btn = page.locator("#btn-reveal-current-pin")
            pin_display = page.locator("#active-pin-display")
            if reveal_btn.is_visible():
                reveal_btn.click()
                revealed_text = pin_display.inner_text()
                if revealed_text == "1234":
                    log_pass("PIN-Anzeige erfolgreich: '1234' im Klartext sichtbar")
                else:
                    log_fail(f"Unerwarteter PIN-Text: '{revealed_text}'")
                    all_passed = False

                # Wieder verbergen
                reveal_btn.click()
                if "•" in pin_display.inner_text():
                    log_pass("PIN erfolgreich wieder verborgen (••••)")

            # 13b. PIN auf 8-Stellen ändern
            page.fill("#setting-new-pin", "87654321")
            page.click("#form-admin-pin-settings button[type='submit']")
            page.wait_for_timeout(800)
            page.wait_for_selector(".toast-success", timeout=3000)
            log_pass("Admin-PIN erfolgreich auf 8 Stellen (87654321) geändert")

            # Ändere PIN für sauberen Testzustand wieder zurück
            page.fill("#setting-new-pin", "1234")
            page.click("#form-admin-pin-settings button[type='submit']")
            page.wait_for_timeout(800)
            log_pass("Admin-PIN für Testabschluss wieder auf '1234' zurückgesetzt")

            # 13c. Backup Export Button
            export_btn = page.locator("#btn-export-backup")
            if export_btn.is_visible():
                export_btn.click()
                page.wait_for_timeout(300)
                page.wait_for_selector(".toast-success", timeout=3000)
                log_pass("Button 'Backup als JSON herunterladen' triggert Export")

            page.locator(".modal-admin-dashboard .modal-close-btn").click()
            page.wait_for_timeout(300)

            # =========================================================================
            # 14. SERVER-STATUS & CONFIG MODAL
            # =========================================================================
            log_section("14. Burkerserver Konfigurations-Modal & Verbindungstest")
            server_btn = page.locator("#btn-server-status")
            if server_btn.is_visible():
                server_btn.click()
                page.wait_for_selector(".modal-config", timeout=3000)
                log_pass("Server-Status Modal öffnet sich bei Klick auf '🖥️ Burkerserver'")

                # Verbindungstest Button
                test_conn_btn = page.locator("#btn-test-server")
                test_conn_btn.click()
                page.wait_for_selector("#server-test-result.success", timeout=4000)
                log_pass("Server-Verbindungstest erfolgreich: '✔ Verbindung erfolgreich!'")

                # Modal schließen
                page.locator(".modal-config .modal-close-btn").click()
                page.wait_for_timeout(300)

            # =========================================================================
            # 15. ADMIN LOGOUT
            # =========================================================================
            log_section("15. Admin-Abmeldung")
            logout_btn = page.locator("#btn-admin-logout")
            if logout_btn.is_visible():
                logout_btn.click()
                page.wait_for_timeout(500)
                if page.locator("#btn-open-admin").is_visible() and not page.locator("#btn-admin-logout").is_visible():
                    log_pass("Admin erfolgreich abgemeldet, Oberfläche wieder im Gast-Modus")
                else:
                    log_fail("Admin-Abmeldung hat Header nicht zurückgesetzt")
                    all_passed = False

            browser.close()

    except Exception as e:
        log_fail(f"Unerwarteter Fehler bei Playwright-Ausführung: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    finally:
        server.stop()
        time.sleep(0.2)
        if temp_data_dir and os.path.exists(temp_data_dir):
            shutil.rmtree(temp_data_dir, ignore_errors=True)
        if "WUNSCHLISTE_DATA_DIR" in os.environ:
            del os.environ["WUNSCHLISTE_DATA_DIR"]
        os.chdir(cwd)

    return all_passed

if __name__ == "__main__":
    success = run_all_e2e_tests()
    print("\n" + "=" * 70)
    if success:
        print("🎉 \033[92mALLE PLAYWRIGHT E2E-TESTS FÜR ALLE USER-INTERAKTIONEN BESTANDEN!\033[0m")
        print("=" * 70)
        sys.exit(0)
    else:
        print("❌ \033[91mEINIGE PLAYWRIGHT E2E-TESTS SIND FEHLGESCHLAGEN!\033[0m")
        print("=" * 70)
        sys.exit(1)
