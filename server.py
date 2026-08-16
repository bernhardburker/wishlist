#!/usr/bin/env python3
"""
Wunschliste REST-API & Webserver für den Burkerserver
- Speichert alle Wünsche & Reservierungen atomar in data/events.json
- Speichert Einstellungen & Admin-PIN in data/settings.json
- Öffentliche Reservierungs-API für Gäste (ohne Authentifizierung)
- Admin-API zum Anlegen/Bearbeiten/Löschen von Events & Wünschen (gesichert über Admin-PIN)
- Volle CORS-Unterstützung für Subdomains & Reverse Proxies
"""

import http.server
import socketserver
import json
import os
import sys
import shutil
import tempfile
from datetime import datetime

PORT = int(os.environ.get("PORT", 8088))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIRECTORY, "data", "events.json")
SETTINGS_FILE = os.path.join(DIRECTORY, "data", "settings.json")
DEFAULT_ENV_ADMIN_PIN = os.environ.get("ADMIN_PIN", "1234")

def ensure_data_dirs():
    """Stellt sicher, dass das Datenverzeichnis existiert"""
    os.makedirs(os.path.join(DIRECTORY, "data"), exist_ok=True)

def atomic_write_json(file_path, data):
    """Schreibt JSON atomar über eine temporäre Datei (verhindert Datenverlust/Korruption)"""
    ensure_data_dirs()
    dir_name = os.path.dirname(file_path)
    with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
        json.dump(data, tf, indent=2, ensure_ascii=False)
        temp_name = tf.name
    shutil.move(temp_name, file_path)

def load_settings_from_disk():
    """Lädt Einstellungen & Admin-PIN aus data/settings.json"""
    ensure_data_dirs()
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(f"Fehler beim Laden von settings.json: {e}", file=sys.stderr)
    return {
        "adminPin": DEFAULT_ENV_ADMIN_PIN,
        "categories": [
            "Alle", "Spielzeug", "Bücher", "Kleidung",
            "Garten & Outdoor", "Elektronik", "Erlebnisse & Gutscheine",
            "Wohnen & Deko", "Sonstiges"
        ]
    }

def get_current_admin_pin():
    """Gibt den aktuell gültigen Admin-PIN zurück"""
    settings = load_settings_from_disk()
    if settings and settings.get("adminPin"):
        return str(settings.get("adminPin")).strip()
    return DEFAULT_ENV_ADMIN_PIN.strip()

def save_settings_to_disk(settings):
    """Speichert Einstellungen & Admin-PIN atomar"""
    atomic_write_json(SETTINGS_FILE, settings)

def ensure_data_file():
    """Stellt sicher, dass die Datei data/events.json existiert"""
    ensure_data_dirs()
    if not os.path.exists(DATA_FILE):
        default_data = [
            {
                "id": "haupt-wunschliste",
                "slug": "haupt-wunschliste",
                "title": "Unsere Wunschliste 🎁",
                "subtitle": "Herzlich willkommen! Hier findet ihr alle Geschenkideen.",
                "date": "",
                "icon": "🎁",
                "isArchived": False,
                "wishes": []
            }
        ]
        atomic_write_json(DATA_FILE, default_data)

def load_events_from_disk():
    """Lädt die aktuellen Events aus der JSON-Datei"""
    ensure_data_file()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Fehler beim Laden von events.json: {e}", file=sys.stderr)
        return []


class WunschlisteHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # CORS Header für Subdomain-Zugriff und Proxies
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Pin")
        # Cache deaktivieren für Live-Daten
        if self.path.startswith("/api/") or self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        """CORS Pre-Flight Anfragen beantworten"""
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, data):
        """Hilfsmethode zum Senden von JSON-Antworten"""
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json_body(self):
        """Liest den Body der Anfrage als JSON"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return None
            body = self.rfile.read(length).decode("utf-8")
            return json.loads(body)
        except Exception:
            return None

    def check_admin_auth(self):
        """Prüft den Admin-PIN Header exakt gegen den aktuell gültigen PIN"""
        provided_pin = (self.headers.get("X-Admin-Pin") or self.headers.get("Authorization", "").replace("Bearer ", "")).strip()
        if not provided_pin:
            return False
        current_pin = get_current_admin_pin()
        return provided_pin == current_pin

    def do_GET(self):
        """API Routen oder statische Dateien ausliefern"""
        path = self.path.split("?")[0]

        # 1. Healthcheck
        if path == "/api/health":
            self.send_json(200, {"status": "ok", "timestamp": datetime.now().isoformat()})
            return

        # 2. Events & Wünsche abrufen
        if path == "/api/events":
            events = load_events_from_disk()
            self.send_json(200, events)
            return

        # 3. Einstellungen abrufen (ohne PIN im Response)
        if path == "/api/settings":
            settings = load_settings_from_disk()
            public_settings = {k: v for k, v in settings.items() if k != "adminPin"}
            self.send_json(200, public_settings)
            return

        # 4. Statische Dateien normal ausliefern
        super().do_GET()

    def do_POST(self):
        """API Schreibzugriffe (Reservieren, Wünsche/Events/Settings speichern)"""
        path = self.path.split("?")[0]

        # --- Route: Admin PIN Verifizierung ---
        if path == "/api/admin/verify":
            body = self.read_json_body() or {}
            pin = (body.get("pin") or "").strip()
            current_pin = get_current_admin_pin()
            is_valid = bool(pin) and (pin == current_pin)
            self.send_json(200, {"valid": is_valid})
            return

        # --- Route: Admin PIN sicher ändern ---
        if path == "/api/admin/change-pin":
            body = self.read_json_body() or {}
            old_pin = (body.get("oldPin") or self.headers.get("X-Admin-Pin") or "").strip()
            new_pin = (body.get("newPin") or "").strip()

            current_pin = get_current_admin_pin()
            if not old_pin or old_pin != current_pin:
                self.send_json(401, {"error": "Bisherige Admin-PIN ist nicht korrekt."})
                return

            if not new_pin or len(new_pin) < 4 or len(new_pin) > 64:
                self.send_json(400, {"error": "Die neue PIN muss zwischen 4 und 64 Zeichen lang sein."})
                return

            settings = load_settings_from_disk()
            settings["adminPin"] = new_pin
            save_settings_to_disk(settings)
            self.send_json(200, {"success": True, "message": "Admin-PIN erfolgreich geändert."})
            return

        # --- Öffentliche Route: Reservierung für Gäste ---
        if path == "/api/reserve":
            body = self.read_json_body()
            if not body or "eventId" not in body or "wishId" not in body:
                self.send_json(400, {"error": "Ungültige Anfragedaten (eventId und wishId erforderlich)"})
                return

            event_id = body["eventId"]
            wish_id = body["wishId"]
            action = body.get("action", "reserve")  # 'reserve' oder 'cancel'
            name = (body.get("name") or "").strip()
            note = (body.get("note") or "").strip()
            pin = (body.get("pin") or "").strip()

            events = load_events_from_disk()
            target_event = next((e for e in events if e.get("id") == event_id or e.get("slug") == event_id), None)
            if not target_event:
                self.send_json(404, {"error": "Veranstaltung nicht gefunden"})
                return

            target_wish = next((w for w in target_event.get("wishes", []) if w.get("id") == wish_id), None)
            if not target_wish:
                self.send_json(404, {"error": "Wunsch nicht gefunden"})
                return

            if action == "reserve":
                if not name:
                    self.send_json(400, {"error": "Bitte gib deinen Namen für die Reservierung an."})
                    return
                target_wish["status"] = "reserved"
                target_wish["reservedBy"] = name
                target_wish["reservedAt"] = datetime.now().isoformat()
                target_wish["note"] = note
                target_wish["reservePin"] = pin
            elif action == "cancel":
                # Stornieren: Prüfe ob PIN übereinstimmt oder Admin auth
                if target_wish.get("reservePin") and not self.check_admin_auth():
                    if pin != target_wish.get("reservePin"):
                        self.send_json(403, {"error": "Ungültige Storno-PIN."})
                        return
                target_wish["status"] = "available"
                target_wish["reservedBy"] = ""
                target_wish["reservedAt"] = None
                target_wish["note"] = ""
                target_wish["reservePin"] = ""
            else:
                self.send_json(400, {"error": "Ungültige Aktion."})
                return

            target_wish["updatedAt"] = datetime.now().isoformat()
            atomic_write_json(DATA_FILE, events)
            self.send_json(200, {"success": True, "wish": target_wish, "events": events})
            return

        # --- Admin Route: Einstellungen speichern ---
        if path == "/api/settings":
            if not self.check_admin_auth():
                self.send_json(401, {"error": "Nicht autorisiert (Admin-PIN erforderlich)"})
                return

            body = self.read_json_body()
            if not isinstance(body, dict):
                self.send_json(400, {"error": "Ungültiges Einstellungs-Format"})
                return

            current_settings = load_settings_from_disk()
            updated_settings = {**current_settings, **body}
            save_settings_to_disk(updated_settings)
            self.send_json(200, {"success": True, "settings": {k: v for k, v in updated_settings.items() if k != "adminPin"}})
            return

        # --- Admin Route: Gesamte Events speichern / anlegen / löschen ---
        if path == "/api/events":
            if not self.check_admin_auth():
                self.send_json(401, {"error": "Nicht autorisiert (Admin-PIN erforderlich)"})
                return

            body = self.read_json_body()
            if not isinstance(body, list):
                self.send_json(400, {"error": "Erwarte Array von Veranstaltungen"})
                return

            atomic_write_json(DATA_FILE, body)
            self.send_json(200, {"success": True, "events": body})
            return

        # --- Admin Route: Einzelnen Wunsch anlegen / bearbeiten ---
        if path == "/api/wishes":
            if not self.check_admin_auth():
                self.send_json(401, {"error": "Nicht autorisiert (Admin-PIN erforderlich)"})
                return

            body = self.read_json_body()
            if not body or "eventId" not in body or "wish" not in body:
                self.send_json(400, {"error": "Ungültige Parameter (eventId und wish erforderlich)"})
                return

            event_id = body["eventId"]
            wish_data = body["wish"]
            events = load_events_from_disk()

            target_event = next((e for e in events if e.get("id") == event_id or e.get("slug") == event_id), None)
            if not target_event:
                self.send_json(404, {"error": "Veranstaltung nicht gefunden"})
                return

            wishes = target_event.setdefault("wishes", [])
            idx = next((i for i, w in enumerate(wishes) if w.get("id") == wish_data.get("id")), -1)

            if idx != -1:
                wishes[idx] = {**wishes[idx], **wish_data, "updatedAt": datetime.now().isoformat()}
            else:
                wish_data.setdefault("createdAt", datetime.now().isoformat())
                wish_data.setdefault("updatedAt", datetime.now().isoformat())
                wishes.insert(0, wish_data)

            atomic_write_json(DATA_FILE, events)
            self.send_json(200, {"success": True, "events": events})
            return

        # Unbekannte Route
        self.send_json(404, {"error": "Endpunkt nicht gefunden"})

    def do_DELETE(self):
        """Admin Route: Wunsch oder Event löschen"""
        path = self.path.split("?")[0]
        if not self.check_admin_auth():
            self.send_json(401, {"error": "Nicht autorisiert (Admin-PIN erforderlich)"})
            return

        if path == "/api/wishes":
            body = self.read_json_body()
            if not body or "eventId" not in body or "wishId" not in body:
                self.send_json(400, {"error": "eventId und wishId erforderlich"})
                return

            events = load_events_from_disk()
            target_event = next((e for e in events if e.get("id") == body["eventId"] or e.get("slug") == body["eventId"]), None)
            if not target_event:
                self.send_json(404, {"error": "Veranstaltung nicht gefunden"})
                return

            target_event["wishes"] = [w for w in target_event.get("wishes", []) if w.get("id") != body["wishId"]]
            atomic_write_json(DATA_FILE, events)
            self.send_json(200, {"success": True, "events": events})
            return

        self.send_json(404, {"error": "Endpunkt nicht gefunden"})


def run():
    ensure_data_file()
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), WunschlisteHandler) as httpd:
            print("=" * 65)
            print(f"🎁 Wunschliste Server läuft auf Port {PORT}")
            print(f"📂 Verzeichnis: {DIRECTORY}")
            print(f"💾 Datendatei:  {DATA_FILE}")
            print(f"🌐 REST API:    http://localhost:{PORT}/api/events")
            print("=" * 65)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")
        sys.exit(0)
    except Exception as e:
        print(f"Fehler: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    run()
