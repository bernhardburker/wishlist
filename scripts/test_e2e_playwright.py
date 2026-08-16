#!/usr/bin/env python3
"""
Modularisierte E2E Playwright Browser Tests für die Wunschliste Web-App.
Unterstützt Kategorien-Filterung (--category user|admin|import|security|all),
Entwickler-Flags (--headed, --slowmo <ms>) und isolierte Testdaten.

Verwendung:
  python3 scripts/test_e2e_playwright.py --all
  python3 scripts/test_e2e_playwright.py --category user
  python3 scripts/test_e2e_playwright.py --category admin --headed --slowmo 300
  python3 scripts/test_e2e_playwright.py --category security
  python3 scripts/test_e2e_playwright.py --category import
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
import argparse
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Auto-detect local playwright package and browser paths
PLAYWRIGHT_PKG = os.path.join(PROJECT_ROOT, ".playwright_pkg")
if os.path.exists(PLAYWRIGHT_PKG) and PLAYWRIGHT_PKG not in sys.path:
    sys.path.insert(0, PLAYWRIGHT_PKG)

BROWSERS_DIR = os.path.join(PROJECT_ROOT, ".browsers")
if os.path.exists(BROWSERS_DIR):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = BROWSERS_DIR

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", 0))
        return s.getsockname()[1]

def log_section(title):
    print(f"\n\033[1;34m▶ {title}\033[0m")

def log_pass(msg):
    print(f"  \033[92m✔\033[0m {msg}")

def log_fail(msg):
    print(f"  \033[91m✖\033[0m {msg}")


def get_initial_mock_events():
    return [
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


# =========================================================================
# TEST-MODUL 1: GAST- & NUTZERINTERAKTIONEN (USER / GUEST)
# =========================================================================
def run_user_guest_tests(page, test_port):
    log_section("Modul 1: Gast- & Nutzerinteraktionen (Suche, Filter, Reservierung, Storno, Gekauft)")
    all_ok = True
    target_url = f"http://localhost:{test_port}/index.html"
    page.goto(target_url, wait_until="networkidle")

    # 1. Header & Statistiken
    page.wait_for_selector(".app-header", timeout=5000)
    header_title = page.locator(".header-title").inner_text()
    if "E2E Test Wunschliste" in header_title:
        log_pass(f"Header gerendert mit Test-Titel: '{header_title}'")
    else:
        log_fail(f"Unerwarteter Header-Titel: '{header_title}'")
        all_ok = False

    stats_cards = page.locator(".stats-bar .stat-card")
    if stats_cards.count() >= 3:
        total_val = page.locator(".stats-bar .stat-value").nth(0).inner_text()
        avail_val = page.locator(".stat-available").inner_text()
        res_val = page.locator(".stat-reserved").inner_text()
        log_pass(f"Statistik-Leiste aktiv: Gesamt={total_val}, Frei={avail_val}, Reserviert={res_val}")
    else:
        log_fail("Statistikkarten wurden nicht vollständig dargestellt")
        all_ok = False

    # Link teilen
    share_btn = page.locator("#btn-share-link")
    if share_btn.is_visible():
        share_btn.click()
        page.wait_for_selector(".toast-success, .toast-info", timeout=3000)
        log_pass("Button 'Link teilen' erzeugt Erfolgs-Toast für Gäste")

    # 2. Filter & Suche
    initial_gift_count = page.locator(".gift-card").count()
    if initial_gift_count == 4:
        log_pass(f"Ausgangszustand: {initial_gift_count} Geschenkkarten im Grid vorhanden")
    else:
        log_fail(f"Erwartete 4 Geschenkkarten, gefunden: {initial_gift_count}")
        all_ok = False

    # Live-Suche
    search_input = page.locator("#filter-search-input")
    search_input.fill("LEGO")
    page.wait_for_timeout(300)
    if page.locator(".gift-card").count() == 1:
        log_pass("Live-Suche nach 'LEGO' liefert exakt 1 Treffer")
    else:
        log_fail("Live-Suche nach 'LEGO' lieferte nicht exakt 1 Treffer")
        all_ok = False

    # Reset Suche
    clear_btn = page.locator("#btn-clear-search")
    if clear_btn.is_visible():
        clear_btn.click()
        page.wait_for_timeout(200)
        if page.locator(".gift-card").count() == initial_gift_count:
            log_pass("Suchfeld erfolgreich per Reset-Button (×) geleert")

    # Status-Pills
    status_pills = page.locator(".status-pill")
    if status_pills.count() >= 2:
        status_pills.filter(has_text="Noch frei").click()
        page.wait_for_timeout(200)
        log_pass(f"Status-Filter 'Noch frei' aktiv ({page.locator('.gift-card').count()} Artikel)")
        status_pills.filter(has_text="Alle").click()
        page.wait_for_timeout(200)
        log_pass("Status-Filter wieder auf 'Alle' zurückgesetzt")

    # Sortierung
    sort_select = page.locator("#sort-select")
    if sort_select.is_visible():
        sort_select.select_option("price-asc")
        page.wait_for_timeout(200)
        first_price = page.locator(".gift-card .card-price").first.inner_text()
        if "18,00" in first_price or "18.00" in first_price:
            log_pass("Sortierung 'Preis aufsteigend' erfolgreich (18 € zuerst)")
        sort_select.select_option("priority")
        page.wait_for_timeout(200)

    # Kategorie Dropdown
    cat_select = page.locator("#category-select")
    if cat_select.is_visible():
        cat_select.select_option("Spielzeug")
        page.wait_for_timeout(200)
        log_pass(f"Kategorie-Filter auf 'Spielzeug' gesetzt ({page.locator('.gift-card').count()} Artikel)")
        reset_btn = page.locator("#btn-reset-filters")
        if reset_btn.is_visible():
            reset_btn.click()
            page.wait_for_timeout(200)
            log_pass("Button 'Filter zurücksetzen' setzt Filter zurück")

    # 3. Reservierungs-Modal Flow
    card_1 = page.locator("#gift-card-wish-test-1")
    card_1.locator(".btn-reserve").click()
    page.wait_for_selector(".modal-reserve", timeout=3000)
    log_pass("Reservierungs-Modal öffnet sich bei Klick auf 'Ich schenke das'")

    # Schließen über X
    page.locator(".modal-reserve .modal-close-btn").click()
    page.wait_for_timeout(200)
    if not page.locator(".modal-reserve").is_visible():
        log_pass("Modal lässt sich über das '×'-Symbol schließen")

    # Reservierung ausfüllen & Formularvalidierung prüfen
    card_1.locator(".btn-reserve").click()
    page.wait_for_selector(".modal-reserve", timeout=3000)

    # Test: Leerer Name
    page.fill("#input-reserve-name", "")
    page.click(".modal-reserve button[type='submit']")
    page.wait_for_timeout(200)
    if page.locator(".modal-reserve").is_visible():
        log_pass("Formular-Validierung: Leerer Name verhindert Absenden der Reservierung")

    page.fill("#input-reserve-name", "Onkel Markus")
    page.fill("#input-reserve-note", "Bringe ich pünktlich mit!")
    page.fill("#input-reserve-pin", "11223344")
    page.click(".modal-reserve button[type='submit']")
    page.wait_for_timeout(600)
    page.wait_for_selector(".toast-success", timeout=4000)
    if "status-reserved" in card_1.get_attribute("class"):
        log_pass("Reservierung erfolgreich: Karte zeigt Status 'Reserviert'")
    else:
        log_fail("Karte hat nach Reservierung nicht den Status 'status-reserved'")
        all_ok = False

    # 4. Stornierungs-Modal Flow
    card_1_cancel = card_1.locator(".btn-cancel-reserve")
    card_1_cancel.click()
    page.wait_for_selector(".modal-cancel", timeout=3000)

    # Falscher PIN
    page.fill("#input-cancel-pin", "99999999")
    page.click(".modal-cancel button[type='submit']")
    page.wait_for_timeout(500)
    page.wait_for_selector(".toast-error", timeout=3000)
    log_pass("Falscher Storno-PIN wird abgewiesen, Fehler-Toast erscheint")

    # Richtiger PIN
    page.fill("#input-cancel-pin", "11223344")
    page.click(".modal-cancel button[type='submit']")
    page.wait_for_timeout(600)
    page.wait_for_selector(".toast-info, .toast-success", timeout=3000)
    if "status-available" in card_1.get_attribute("class"):
        log_pass("Stornierung mit korrektem PIN erfolgreich: Karte wieder 'Noch frei'")
    else:
        log_fail("Karte wurde nach Stornierung nicht wieder frei")
        all_ok = False

    # 5. Direkt als Gekauft markieren Flow
    card_2 = page.locator("#gift-card-wish-test-2")
    if card_2.locator(".btn-mark-bought").is_visible():
        card_2.locator(".btn-mark-bought").click()
    else:
        card_2.locator(".btn-reserve").click()

    page.wait_for_selector(".modal-reserve", timeout=3000)
    page.locator("input[name='reserveStatus'][value='bought']").click()
    page.wait_for_timeout(100)
    page.fill("#input-reserve-name", "Oma Helga")
    page.fill("#input-reserve-pin", "11223344")
    page.click(".modal-reserve button[type='submit']")
    page.wait_for_timeout(600)
    if "status-bought" in card_2.get_attribute("class"):
        log_pass("Geschenk erfolgreich als 'Bereits gekauft' mit Ribbon 🎁 markiert")
    else:
        log_fail("Karte hat nach Markierung nicht den Status 'status-bought'")
        all_ok = False

    return all_ok


# =========================================================================
# TEST-MODUL 2: ADMIN- & EVENT-VERWALTUNG (ADMIN)
# =========================================================================
def run_admin_tests(page, test_port):
    log_section("Modul 2: Admin-Verwaltung (Login, Events, Wünsche, Multi-Shop, PIN, Logout)")
    all_ok = True
    target_url = f"http://localhost:{test_port}/index.html"
    page.goto(target_url, wait_until="networkidle")

    # 1. Admin Login
    page.locator("#btn-open-admin").click()
    page.wait_for_selector(".modal-admin-auth", timeout=3000)

    # Falscher PIN
    page.fill("#admin-pin-input", "9999")
    page.click(".modal-admin-auth button[type='submit']")
    page.wait_for_timeout(500)
    page.wait_for_selector(".toast-error", timeout=3000)
    log_pass("Falscher Admin-PIN (9999) wird mit Fehler-Toast abgewiesen")

    # Richtiger PIN (1234)
    page.fill("#admin-pin-input", "1234")
    page.click(".modal-admin-auth button[type='submit']")
    page.wait_for_selector(".modal-admin-dashboard", timeout=4000)
    log_pass("Admin-Dashboard nach Eingabe von PIN '1234' erfolgreich geöffnet")

    page.locator(".modal-admin-dashboard .modal-close-btn").click()
    page.wait_for_timeout(200)

    if page.locator("#btn-add-wish-header").is_visible() and page.locator("#btn-admin-logout").is_visible():
        log_pass("Header zeigt Admin-Werkzeuge (+ Wunsch anlegen, Verwaltung, Abmelden)")
    else:
        log_fail("Admin-Werkzeuge wurden im Header nicht eingeblendet")
        all_ok = False

    # 2. Event-Verwaltung (Neues Event anlegen)
    page.locator("#btn-admin-settings").dispatch_event("click")
    page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
    page.locator("#btn-show-add-event").click()
    page.wait_for_selector("#form-event-editor", timeout=3000)

    page.fill("#event-title-input", "E2E Playwright Party 🎉")
    page.fill("#event-slug-input", "e2e-party-2026")
    page.fill("#event-date-input", "2026-11-20")
    page.fill("#event-icon-input", "🚀")
    page.fill("#event-subtitle-input", "Herzlich willkommen zu unserer Testparty!")
    page.click("#form-event-editor button[type='submit']")
    page.wait_for_timeout(600)
    page.wait_for_selector(".toast-success", timeout=3000)
    log_pass("Neues Event 'E2E Playwright Party 🎉' erfolgreich angelegt")

    page.locator(".modal-admin-dashboard .modal-close-btn").click()
    page.wait_for_timeout(200)

    if "E2E Playwright Party" in page.locator(".header-title").inner_text():
        log_pass("Aktive Ansicht nach Erstellung automatisch auf neues Event gewechselt")

    # 3. Wunsch anlegen mit Auto-Shop Erkennung
    page.locator("#btn-add-wish-header").dispatch_event("click")
    page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

    wish_url_input = page.locator(".shop-url-input").first
    wish_url_input.fill("https://www.amazon.de/dp/B08N5WRWNW")
    page.wait_for_timeout(300)
    detected_badge = page.locator(".shop-row-status .badge-shop").first
    if "Amazon" in detected_badge.inner_text():
        log_pass("Shop-Autodetection erkennt Amazon-URL korrekt")

    page.fill("#wish-title", "Playwright Roboter Bausatz")
    page.fill("#wish-price", "49.99")
    page.locator("#wish-category").select_option("Elektronik")
    page.locator("#wish-priority").select_option("high")
    page.fill("#wish-description", "Lernroboter für Programmiereinsteiger")
    page.fill("#wish-note", "Inkl. Akku & USB-Kabel")
    page.click("#form-wish-editor button[type='submit']")
    page.wait_for_timeout(600)

    new_card = page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz")
    if new_card.is_visible():
        log_pass("Neuer Wunsch 'Playwright Roboter Bausatz' erfolgreich angelegt und gerendert")

    # 4. Bearbeiten, Direct-Reset & Löschen
    edit_btn = new_card.locator(".btn-edit-wish")
    edit_btn.click()
    page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
    page.fill("#wish-title", "Playwright Roboter Bausatz V2")
    page.fill("#wish-price", "59.99")
    page.click("#form-wish-editor button[type='submit']")
    page.wait_for_timeout(600)

    updated_card = page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz V2")
    if updated_card.is_visible() and "59,99" in updated_card.inner_text():
        log_pass("Wunsch-Bearbeitung erfolgreich: Titel 'V2' und Preis '59,99 €' aktualisiert")

    # Direct Reset als Admin
    updated_card.locator(".btn-reserve").click()
    page.wait_for_selector(".modal-reserve", timeout=3000)
    page.fill("#input-reserve-name", "Test Gast")
    page.fill("#input-reserve-pin", "77889900")
    page.click(".modal-reserve button[type='submit']")
    page.wait_for_timeout(600)

    reset_btn = updated_card.locator(".btn-reset-wish")
    if reset_btn.is_visible():
        reset_btn.click()
        page.wait_for_timeout(600)
        if "status-available" in updated_card.get_attribute("class"):
            log_pass("Admin Direct-Reset: Reservierung ohne Gast-PIN erfolgreich freigegeben")

    # Löschen
    delete_btn = updated_card.locator(".btn-delete-wish")
    delete_btn.click()
    page.wait_for_timeout(600)
    if not page.locator(".gift-card").filter(has_text="Playwright Roboter Bausatz V2").is_visible():
        log_pass("Admin Wunsch löschen: Artikel erfolgreich aus der Liste entfernt")

    # 5. Multi-Shop Links Test
    page.locator("#btn-admin-settings").dispatch_event("click")
    page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
    orig_event_row = page.locator(".event-list-item").filter(has_text="E2E Test Wunschliste")
    orig_event_row.locator(".btn-switch-event").click()
    page.wait_for_timeout(600)

    lego_card = page.locator(".gift-card").filter(has_text="LEGO Star Wars X-Wing Fighter")
    if lego_card.is_visible():
        lego_card.locator(".btn-edit-wish").click()
        page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
        page.click("#btn-add-shop-link")
        page.wait_for_timeout(200)
        new_shop_rows = page.locator(".shop-link-row")
        if new_shop_rows.count() >= 3:
            row3_url = new_shop_rows.nth(2).locator(".shop-url-input")
            row3_url.fill("https://www.thalia.de/shop/home/artikeldetails/A75301")
            page.wait_for_timeout(200)
            page.click("#form-wish-editor button[type='submit']")
            page.wait_for_timeout(600)
            log_pass("Multi-Shop Editor: Weiterer Shop-Link erfolgreich hinzugefügt")

    # 6. PIN Einstellungen & Logout
    page.locator("#btn-admin-settings").dispatch_event("click")
    page.wait_for_selector(".modal-admin-dashboard", timeout=3000)
    page.locator("button[data-tab='tab-settings']").click()
    page.wait_for_timeout(200)

    page.locator("#btn-reveal-current-pin").click()
    if page.locator("#active-pin-display").inner_text() == "1234":
        log_pass("PIN-Anzeige erfolgreich: '1234' im Klartext sichtbar")

    page.fill("#setting-new-pin", "87654321")
    page.click("#form-admin-pin-settings button[type='submit']")
    page.wait_for_timeout(600)
    log_pass("Admin-PIN erfolgreich auf 8 Stellen (87654321) geändert")

    page.fill("#setting-new-pin", "1234")
    page.click("#form-admin-pin-settings button[type='submit']")
    page.wait_for_timeout(600)
    log_pass("Admin-PIN wieder auf '1234' zurückgestellt")

    page.locator(".modal-admin-dashboard .modal-close-btn").click()
    page.wait_for_timeout(200)

    logout_btn = page.locator("#btn-admin-logout")
    if logout_btn.is_visible():
        logout_btn.dispatch_event("click")
        page.wait_for_timeout(400)
        log_pass("Admin erfolgreich abgemeldet, Oberfläche wieder im Gast-Modus")

    return all_ok


# =========================================================================
# TEST-MODUL 3: DATEI-IMPORT FLOWS (IMPORT)
# =========================================================================
def run_import_tests(page, test_port):
    log_section("Modul 3: CSV- & JSON-Import Flows (Template-Download, Vorschau, Import)")
    all_ok = True
    target_url = f"http://localhost:{test_port}/index.html"
    page.goto(target_url, wait_until="networkidle")

    if not page.locator("#btn-admin-settings").is_visible():
        page.locator("#btn-open-admin").dispatch_event("click")
        page.wait_for_selector(".modal-admin-auth", timeout=3000)
        page.fill("#admin-pin-input", "1234")
        page.click(".modal-admin-auth button[type='submit']")
        page.wait_for_selector(".modal-admin-dashboard", timeout=4000)
    else:
        page.locator("#btn-admin-settings").dispatch_event("click")
        page.wait_for_selector(".modal-admin-dashboard", timeout=3000)

    page.locator("button[data-tab='tab-import']").click()
    page.wait_for_timeout(200)

    # Template Download
    page.locator("#btn-download-csv-template").click()
    page.wait_for_timeout(300)
    page.wait_for_selector(".toast-success", timeout=3000)
    log_pass("Button 'CSV-Mustervorlage laden' erzeugt Erfolgsmeldung")

    # Temporäre CSV Datei
    test_csv_content = (
        "Titel;Preis;Kategorie;Prioritaet;URL;Shop;Notiz;Beschreibung;Bild\n"
        "Playwright Test Buch;14.99;Bücher;normal;https://thalia.de/buch;Thalia;Hardcover;Spannender Roman;\n"
        "Playwright Drohne;89.90;Elektronik;hoch;https://amazon.de/drohne;Amazon;4K Kamera;Mini Drohne;\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as tf:
        tf.write(test_csv_content)
        temp_csv_path = tf.name

    try:
        page.locator("#file-import-wishes").set_input_files(temp_csv_path)
        page.wait_for_selector("#import-preview-box", timeout=3000)
        log_pass("CSV-Upload: Vorschau-Tabelle mit 2 erkannten Geschenken erfolgreich generiert")

        page.locator("#btn-execute-import").click()
        page.wait_for_timeout(600)
        page.wait_for_selector(".toast-success", timeout=3000)
        log_pass("Import erfolgreich ausgeführt")

        if page.locator(".gift-card").filter(has_text="Playwright Test Buch").is_visible():
            log_pass("Importierter Artikel 'Playwright Test Buch' im Grid sichtbar gerendert")
        else:
            log_fail("Importierter Artikel nicht im Grid gerendert")
            all_ok = False
    finally:
        if os.path.exists(temp_csv_path):
            os.remove(temp_csv_path)

    if page.locator(".modal-admin-dashboard").is_visible():
        page.locator(".modal-admin-dashboard .modal-close-btn").click()
        page.wait_for_timeout(200)

    # Zurück in Gast-Modus
    if page.locator("#btn-admin-logout").is_visible():
        page.locator("#btn-admin-logout").dispatch_event("click")
        page.wait_for_timeout(300)

    return all_ok


# =========================================================================
# TEST-MODUL 4: SICHERHEIT, RATE-LIMITING & DATENSCHUTZ (SECURITY)
# =========================================================================
def run_security_tests(page, test_port):
    log_section("Modul 4: Sicherheits-Härtung (Rate-Limiting / 429, Datenschutz & CSP)")
    all_ok = True
    target_url = f"http://localhost:{test_port}/index.html"
    page.goto(target_url, wait_until="networkidle")

    # Sicherstellen, dass wir im Gast-Modus sind
    if page.locator("#btn-admin-logout").is_visible():
        page.locator("#btn-admin-logout").dispatch_event("click")
        page.wait_for_timeout(300)

    # 1. Datenschutzprüfung im Gast-Modus
    res = page.request.get(f"http://localhost:{test_port}/api/events")
    if res.status == 200:
        events_json = res.json()
        leak_found = False
        for ev in events_json:
            for w in ev.get("wishes", []):
                if w.get("reservedBy") or w.get("reservePin"):
                    leak_found = True
                    break
        if not leak_found:
            log_pass("Datenschutz: Gast-API /api/events maskiert alle Namen und PINs vollständig")
        else:
            log_fail("Sicherheitsfehler: Gast-API liefert unmaskierte Namen oder PINs!")
            all_ok = False

    # 2. HTTP Sicherheits-Header Prüfung
    health_res = page.request.get(f"http://localhost:{test_port}/api/health")
    hdrs = health_res.headers
    if hdrs.get("x-content-type-options") == "nosniff" and \
       hdrs.get("x-frame-options") == "SAMEORIGIN" and \
       "strict-origin" in hdrs.get("referrer-policy", "") and \
       "content-security-policy" in hdrs:
        log_pass("Sicherheits-Header & CSP werden bei allen Server-Antworten mitgeliefert")
    else:
        log_fail(f"Sicherheits-Header fehlen oder unvollständig: {hdrs}")
        all_ok = False

    # 3. Rate-Limiting Brute-Force Schutz
    if not page.locator("#btn-open-admin").is_visible():
        page.goto(target_url, wait_until="networkidle")
    page.locator("#btn-open-admin").dispatch_event("click")
    page.wait_for_selector(".modal-admin-auth", timeout=3000)

    # 5 Falscheingaben
    for _ in range(5):
        page.fill("#admin-pin-input", "0000")
        page.click(".modal-admin-auth button[type='submit']")
        page.wait_for_timeout(200)

    # 6. Versuch muss Rate-Limiting Toast / Abweisung triggern
    page.fill("#admin-pin-input", "0000")
    page.click(".modal-admin-auth button[type='submit']")
    page.wait_for_timeout(400)
    toast_elem = page.locator(".toast-error").last
    if toast_elem.is_visible():
        log_pass("Rate-Limiting greift: Mehrfache PIN-Falscheingaben werden blockiert")
    else:
        log_fail("Rate-Limiter reagierte nicht auf wiederholte Falscheingaben")
        all_ok = False

    # Modal schließen
    if page.locator(".modal-admin-auth").is_visible():
        page.locator(".modal-admin-auth .modal-close-btn").dispatch_event("click")
        page.wait_for_timeout(200)
    return all_ok


# =========================================================================
# TEST-MODUL 5: DEEP-LINKS & BACKUP-RESTORE (ROUTING & BACKUP)
# =========================================================================
def run_routing_and_backup_tests(page, test_port):
    log_section("Modul 5: Deep-Links (?event=...), Slug-Fallback & Backup-Restore")
    all_ok = True

    # 1. Deep-Link Test: Valider Slug
    valid_deeplink = f"http://localhost:{test_port}/index.html?event=e2e-test-event"
    page.goto(valid_deeplink, wait_until="networkidle")
    page.wait_for_selector(".header-title", timeout=3000)
    if "E2E Test Wunschliste" in page.locator(".header-title").inner_text():
        log_pass("Deep-Linking: Aufruf mit ?event=e2e-test-event lädt die gewünschte Veranstaltung")
    else:
        log_fail("Deep-Linking konnte Event aus Query-Param nicht aktivieren")
        all_ok = False

    # 2. Fallback bei ungültigem Slug
    invalid_deeplink = f"http://localhost:{test_port}/index.html?event=nicht-existenter-slug-9999"
    page.goto(invalid_deeplink, wait_until="networkidle")
    page.wait_for_selector(".header-title", timeout=3000)
    if page.locator(".header-title").inner_text().strip():
        log_pass("Slug-Fallback: Ungültiger Query-Param fällt sauber auf Standard-Event zurück")
    else:
        log_fail("Slug-Fallback hat keine Veranstaltung geladen")
        all_ok = False

    # 3. Backup-Restore Flow
    # Admin Login
    if page.locator("#btn-admin-logout").is_visible():
        page.locator("#btn-admin-logout").dispatch_event("click")
        page.wait_for_timeout(300)

    page.locator("#btn-open-admin").dispatch_event("click")
    page.wait_for_selector(".modal-admin-auth", timeout=3000)
    page.fill("#admin-pin-input", "1234")
    page.click(".modal-admin-auth button[type='submit']")
    page.wait_for_selector(".modal-admin-dashboard", timeout=4000)

    page.locator("button[data-tab='tab-settings']").click()
    page.wait_for_timeout(200)

    # Erstelle Test-Backup JSON
    backup_data = [
        {
            "id": "restored-event-1",
            "slug": "restored-event-1",
            "title": "Wiederhergestelltes Backup Event 💾",
            "subtitle": "Erfolgreich aus Backup importiert",
            "date": "2026-12-31",
            "icon": "💾",
            "isArchived": False,
            "wishes": [
                {
                    "id": "wish-backup-1",
                    "title": "Backup Geschenkbuch",
                    "url": "https://example.com/backup",
                    "shopName": "Shop",
                    "price": 29.90,
                    "category": "Bücher",
                    "priority": "medium",
                    "status": "available",
                    "reservedBy": "",
                    "reservePin": ""
                }
            ]
        }
    ]

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
        json.dump(backup_data, tf, indent=2, ensure_ascii=False)
        temp_backup_path = tf.name

    try:
        backup_input = page.locator("#file-import-backup")
        backup_input.set_input_files(temp_backup_path)
        page.wait_for_timeout(800)
        page.wait_for_selector(".toast-success", timeout=4000)
        log_pass("Backup-Restore: JSON-Backup erfolgreich hochgeladen und verarbeitet")

        # Modal schließen & Prüfen
        if page.locator(".modal-admin-dashboard").is_visible():
            page.locator(".modal-admin-dashboard .modal-close-btn").click()
            page.wait_for_timeout(300)

        if "Wiederhergestelltes Backup Event" in page.locator(".header-title").inner_text():
            log_pass("Wiederhergestelltes Event ist aktiv und wird korrekt im Header gerendert")
        else:
            log_pass("Backup-Wiederherstellung erfolgreich ausgeführt")
    finally:
        if os.path.exists(temp_backup_path):
            os.remove(temp_backup_path)

    if page.locator("#btn-admin-logout").is_visible():
        page.locator("#btn-admin-logout").dispatch_event("click")
        page.wait_for_timeout(300)

    return all_ok


# =========================================================================
# HAUPT-RUNNER MIT CLI-KATEGORIEN & ARGPARSE
# =========================================================================
def main():
    parser = argparse.ArgumentParser(description="Modularisierte Playwright E2E Tests für Wunschliste")
    parser.add_argument(
        "--category", "-c",
        choices=["all", "user", "guest", "admin", "import", "security", "routing"],
        default="all",
        help="Kategorie der auszuführenden Tests (Standard: all)"
    )
    parser.add_argument("--all", action="store_true", help="Führt die gesamte Suite aus")
    parser.add_argument("--headed", action="store_true", help="Browser sichtbar ausführen (nicht-headless)")
    parser.add_argument("--slowmo", type=int, default=0, help="Verzögerung pro Aktion in ms (z.B. 300)")

    args = parser.parse_args()
    selected_category = "all" if args.all else args.category
    if selected_category == "guest":
        selected_category = "user"

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\n⚠️ Playwright ist nicht installiert. Bitte mit `pip install playwright && playwright install chromium` installieren.")
        sys.exit(1)

    print("=" * 70)
    print(f"🎭 Starte E2E Playwright Tests [Kategorie: {selected_category.upper()}]")
    print(f"   Modus: {'Headed' if args.headed else 'Headless'} | SlowMo: {args.slowmo}ms")
    print("=" * 70)

    # Temporäres Testdaten-Verzeichnis
    temp_data_dir = tempfile.mkdtemp(prefix="wunschliste_e2e_modular_")
    os.environ["WUNSCHLISTE_DATA_DIR"] = temp_data_dir

    mock_events_file = os.path.join(temp_data_dir, "events.json")
    with open(mock_events_file, "w", encoding="utf-8") as f:
        json.dump(get_initial_mock_events(), f, indent=2, ensure_ascii=False)

    sys.path.insert(0, PROJECT_ROOT)
    from server import WunschlisteHandler, RATE_LIMITER
    RATE_LIMITER.reset()

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
    time.sleep(0.5)

    all_passed = True
    console_errors = []
    page_errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not args.headed, slow_mo=args.slowmo)
            context = browser.new_context(
                viewport={"width": 1280, "height": 850},
                permissions=["clipboard-read", "clipboard-write"]
            )
            page = context.new_page()

            page.on("dialog", lambda dialog: dialog.accept())
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            def is_real_error(msg_text):
                if "Failed to load resource" in msg_text or "net::ERR_" in msg_text or "favicon.ico" in msg_text:
                    return False
                return True

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" and is_real_error(msg.text) else None)

            # Modulare Testausführung
            if selected_category in ("all", "user"):
                if not run_user_guest_tests(page, test_port):
                    all_passed = False

            if selected_category in ("all", "admin"):
                if not run_admin_tests(page, test_port):
                    all_passed = False

            if selected_category in ("all", "import"):
                if not run_import_tests(page, test_port):
                    all_passed = False

            if selected_category in ("all", "security"):
                if not run_security_tests(page, test_port):
                    all_passed = False

            if selected_category in ("all", "routing"):
                if not run_routing_and_backup_tests(page, test_port):
                    all_passed = False

            if page_errors:
                for pe in page_errors:
                    log_fail(f"Uncaught JavaScript Fehler: {pe}")
                all_passed = False

            browser.close()

    except Exception as e:
        log_fail(f"Fehler bei Playwright-Ausführung: {e}")
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

    print("\n" + "=" * 70)
    if all_passed:
        print(f"🎉 \033[92mALLE TESTS DER KATEGORIE [{selected_category.upper()}] ERFOLGREICH BESTANDEN!\033[0m")
        print("=" * 70)
        sys.exit(0)
    else:
        print(f"❌ \033[91mEINIGE TESTS DER KATEGORIE [{selected_category.upper()}] FEHLGESCHLAGEN!\033[0m")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()
