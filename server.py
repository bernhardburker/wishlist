#!/usr/bin/env python3
"""
Wunschliste REST-API & Webserver für den Burkerserver
- Speichert alle Wünsche & Reservierungen atomar in data/events.json
- Speichert Einstellungen & Admin-PIN in data/settings.json
- Öffentliche Reservierungs-API für Gäste (ohne Authentifizierung)
- Admin-API zum Anlegen/Bearbeiten/Löschen von Events & Wünschen (gesichert über Admin-PIN)
- Volle CORS-Unterstützung für Subdomains & Reverse Proxies
- IP-basiertes Rate-Limiting & PIN-Brute-Force-Schutz
- HTTP-Sicherheits-Header & Content Security Policy (CSP)
- Thread-sichere Schreibzugriffe via Concurrency Lock
"""

import http.server
import socketserver
import json
import os
import sys
import shutil
import tempfile
import threading
import time
from datetime import datetime

PORT = int(os.environ.get("PORT", 8088))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ENV_ADMIN_PIN = os.environ.get("ADMIN_PIN", "1234")

# Globaler Lock für atomare Dateioperationen
DATA_LOCK = threading.Lock()
RATE_LIMIT_LOCK = threading.Lock()


class RateLimiter:
    """In-Memory IP-basiertes Rate-Limiting zum Schutz vor PIN-Brute-Force"""
    def __init__(self, max_attempts=5, window_seconds=60, lockout_seconds=300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self.failed_attempts = {}  # ip -> [timestamps]
        self.lockouts = {}         # ip -> lockout_until_timestamp

    def is_rate_limited(self, ip):
        with RATE_LIMIT_LOCK:
            now = time.time()
            if ip in self.lockouts:
                if now < self.lockouts[ip]:
                    retry_after = int(self.lockouts[ip] - now) + 1
                    return True, retry_after
                else:
                    del self.lockouts[ip]
                    self.failed_attempts.pop(ip, None)

            attempts = [t for t in self.failed_attempts.get(ip, []) if now - t < self.window_seconds]
            self.failed_attempts[ip] = attempts
            if len(attempts) >= self.max_attempts:
                self.lockouts[ip] = now + self.lockout_seconds
                return True, self.lockout_seconds

            return False, 0

    def record_failure(self, ip):
        with RATE_LIMIT_LOCK:
            now = time.time()
            attempts = [t for t in self.failed_attempts.get(ip, []) if now - t < self.window_seconds]
            attempts.append(now)
            self.failed_attempts[ip] = attempts
            if len(attempts) >= self.max_attempts:
                self.lockouts[ip] = now + self.lockout_seconds
                return True, self.lockout_seconds
            return False, 0

    def record_success(self, ip):
        with RATE_LIMIT_LOCK:
            self.failed_attempts.pop(ip, None)
            self.lockouts.pop(ip, None)

    def reset(self):
        with RATE_LIMIT_LOCK:
            self.failed_attempts.clear()
            self.lockouts.clear()


RATE_LIMITER = RateLimiter(max_attempts=5, window_seconds=60, lockout_seconds=300)


def get_data_dir():
    """Gibt das aktuelle Datenverzeichnis zurück (konfigurierbar via WUNSCHLISTE_DATA_DIR)"""
    return os.environ.get("WUNSCHLISTE_DATA_DIR", os.path.join(DIRECTORY, "data"))

def get_events_file():
    """Gibt den Pfad zu events.json zurück"""
    return os.path.join(get_data_dir(), "events.json")

def get_settings_file():
    """Gibt den Pfad zu settings.json zurück"""
    return os.path.join(get_data_dir(), "settings.json")

def ensure_data_dirs():
    """Stellt sicher, dass das Datenverzeichnis existiert"""
    os.makedirs(get_data_dir(), exist_ok=True)

def atomic_write_json(file_path, data):
    """Schreibt JSON atomar über eine temporäre Datei (verhindert Datenverlust/Korruption)"""
    with DATA_LOCK:
        ensure_data_dirs()
        dir_name = os.path.dirname(file_path)
        with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
            json.dump(data, tf, indent=2, ensure_ascii=False)
            temp_name = tf.name
        shutil.move(temp_name, file_path)

def load_settings_from_disk():
    """Lädt Einstellungen & Admin-PIN aus settings.json"""
    with DATA_LOCK:
        ensure_data_dirs()
        settings_file = get_settings_file()
        if os.path.exists(settings_file):
            try:
                with open(settings_file, "r", encoding="utf-8") as f:
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
    atomic_write_json(get_settings_file(), settings)

def ensure_data_file():
    """Stellt sicher, dass die Datei events.json existiert"""
    ensure_data_dirs()
    events_file = get_events_file()
    if not os.path.exists(events_file):
        source_template = os.path.join(DIRECTORY, "data", "events.json")
        if os.path.exists(source_template) and os.path.abspath(source_template) != os.path.abspath(events_file):
            try:
                shutil.copyfile(source_template, events_file)
                return
            except Exception as e:
                print(f"Fehler beim Kopieren von events.json Template: {e}", file=sys.stderr)

        default_data = [
            {
                "id": "karin-wunschliste",
                "slug": "karin-wunschliste",
                "title": "Karins Wunschliste 🎁",
                "subtitle": "Herzlich willkommen! Hier findet ihr alle Geschenkideen.",
                "date": "2026-09-15",
                "icon": "🎁",
                "isArchived": False,
                "wishes": []
            }
        ]
        atomic_write_json(events_file, default_data)

def load_events_from_disk():
    """Lädt die aktuellen Events aus der JSON-Datei"""
    with DATA_LOCK:
        ensure_data_file()
        events_file = get_events_file()
        try:
            with open(events_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Fehler beim Laden von events.json: {e}", file=sys.stderr)
            return []

def save_events_to_disk(events):
    """Speichert Events atomar in die JSON-Datei"""
    atomic_write_json(get_events_file(), events)


def sanitize_wish_for_guests(wish):
    """Entfernt sensible Daten wie Namen und PIN für nicht-Admin Gäste"""
    if not isinstance(wish, dict):
        return wish
    w_copy = dict(wish)
    w_copy["hasReservePin"] = bool(w_copy.get("reservePin"))
    w_copy["reservedBy"] = ""
    w_copy["reservePin"] = ""
    w_copy["reserveNote"] = ""
    return w_copy

def sanitize_events_for_guests(events):
    """Bereinigt alle Events für Gäste: Verbirgt Käufer-/Reservierungsnamen und PINs"""
    if not isinstance(events, list):
        return events
    sanitized = []
    for ev in events:
        if not isinstance(ev, dict):
            sanitized.append(ev)
            continue
        ev_copy = dict(ev)
        if "wishes" in ev_copy and isinstance(ev_copy["wishes"], list):
            ev_copy["wishes"] = [sanitize_wish_for_guests(w) for w in ev_copy["wishes"]]
        sanitized.append(ev_copy)
    return sanitized


class WunschlisteHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def get_client_ip(self):
        """Ermittelt die IP-Adresse des Clients (inkl. Reverse-Proxy Support)"""
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if self.client_address:
            return str(self.client_address[0])
        return "127.0.0.1"

    def end_headers(self):
        # CORS Header für Subdomain-Zugriff und Proxies
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Pin")
        # Sicherheits-Header
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: http:; connect-src 'self' http: https:; frame-ancestors 'self';")
        # Cache deaktivieren für Live-Daten & aktuelle Web-Assets
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        """CORS Pre-Flight Anfragen beantworten"""
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, data, extra_headers=None):
        """Hilfsmethode zum Senden von JSON-Antworten"""
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, str(v))
        self.end_headers()
        self.wfile.write(payload)

    def send_rate_limited(self, retry_after):
        """Sendet standardisierte 429 Too Many Requests Antwort"""
        self.send_json(
            429,
            {"error": "Zu viele Fehlversuche. Bitte warte einen Moment, bevor du es erneut versuchst.", "retryAfter": retry_after},
            extra_headers={"Retry-After": retry_after}
        )

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

        # 2. Events & Wünsche abrufen (sowohl /api/events als auch statischer Pfad /data/events.json)
        if path in ("/api/events", "/data/events.json"):
            events = load_events_from_disk()
            if not self.check_admin_auth():
                events = sanitize_events_for_guests(events)
            self.send_json(200, events)
            return

        # 3. Einstellungen abrufen (ohne PIN im Response)
        if path in ("/api/settings", "/data/settings.json"):
            settings = load_settings_from_disk()
            public_settings = {k: v for k, v in settings.items() if k != "adminPin"}
            self.send_json(200, public_settings)
            return

        # 4. Statische Dateien normal ausliefern
        super().do_GET()

    def do_POST(self):
        """API Schreibzugriffe (Reservieren, Wünsche/Events/Settings speichern)"""
        path = self.path.split("?")[0]
        client_ip = self.get_client_ip()

        # --- Route: Admin PIN Verifizierung ---
        if path == "/api/admin/verify":
            is_limited, retry_after = RATE_LIMITER.is_rate_limited(client_ip)
            if is_limited:
                self.send_rate_limited(retry_after)
                return

            body = self.read_json_body() or {}
            pin = (body.get("pin") or "").strip()
            current_pin = get_current_admin_pin()
            is_valid = bool(pin) and (pin == current_pin)

            if is_valid:
                RATE_LIMITER.record_success(client_ip)
            else:
                RATE_LIMITER.record_failure(client_ip)

            self.send_json(200, {"valid": is_valid})
            return

        # --- Route: Admin PIN sicher ändern ---
        if path == "/api/admin/change-pin":
            is_limited, retry_after = RATE_LIMITER.is_rate_limited(client_ip)
            if is_limited:
                self.send_rate_limited(retry_after)
                return

            body = self.read_json_body() or {}
            old_pin = (body.get("oldPin") or self.headers.get("X-Admin-Pin") or "").strip()
            new_pin = (body.get("newPin") or "").strip()

            current_pin = get_current_admin_pin()
            if not old_pin or old_pin != current_pin:
                RATE_LIMITER.record_failure(client_ip)
                self.send_json(401, {"error": "Bisherige Admin-PIN ist nicht korrekt."})
                return

            if not new_pin or len(new_pin) < 4 or len(new_pin) > 64:
                self.send_json(400, {"error": "Die neue PIN muss zwischen 4 und 64 Zeichen lang sein."})
                return

            RATE_LIMITER.record_success(client_ip)
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
            action = body.get("action", "reserve")  # 'reserve', 'bought' oder 'cancel'
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

            if action in ("reserve", "bought"):
                if not name:
                    self.send_json(400, {"error": "Bitte gib deinen Namen für die Reservierung an."})
                    return

                # Falls bereits reserviert und ein PIN gesetzt ist: PIN prüfen (außer Admin)
                admin_authenticated = self.check_admin_auth() or (pin and pin == get_current_admin_pin())
                if target_wish.get("status") in ("reserved", "bought") and target_wish.get("reservePin") and not admin_authenticated:
                    is_limited, retry_after = RATE_LIMITER.is_rate_limited(client_ip)
                    if is_limited:
                        self.send_rate_limited(retry_after)
                        return

                    if str(pin).strip() != str(target_wish.get("reservePin")).strip():
                        RATE_LIMITER.record_failure(client_ip)
                        self.send_json(403, {"error": "Ungültige Storno-PIN."})
                        return
                    RATE_LIMITER.record_success(client_ip)

                target_wish["status"] = "bought" if action == "bought" else "reserved"
                target_wish["reservedBy"] = name
                target_wish["reservedAt"] = datetime.now().isoformat()
                target_wish["reserveNote"] = note
                if pin or not target_wish.get("reservePin"):
                    target_wish["reservePin"] = pin

            elif action == "cancel":
                # Stornieren: Prüfe ob PIN übereinstimmt oder Admin auth
                admin_authenticated = self.check_admin_auth() or (pin and pin == get_current_admin_pin())
                if target_wish.get("reservePin") and not admin_authenticated:
                    is_limited, retry_after = RATE_LIMITER.is_rate_limited(client_ip)
                    if is_limited:
                        self.send_rate_limited(retry_after)
                        return

                    if str(pin).strip() != str(target_wish.get("reservePin")).strip():
                        RATE_LIMITER.record_failure(client_ip)
                        self.send_json(403, {"error": "Ungültige Storno-PIN."})
                        return
                    RATE_LIMITER.record_success(client_ip)

                target_wish["status"] = "available"
                target_wish["reservedBy"] = ""
                target_wish["reservedAt"] = None
                target_wish["reserveNote"] = ""
                target_wish["reservePin"] = ""
            else:
                self.send_json(400, {"error": "Ungültige Aktion."})
                return

            target_wish["updatedAt"] = datetime.now().isoformat()
            save_events_to_disk(events)

            if not self.check_admin_auth():
                resp_wish = sanitize_wish_for_guests(target_wish)
                resp_events = sanitize_events_for_guests(events)
            else:
                resp_wish = target_wish
                resp_events = events

            self.send_json(200, {"success": True, "wish": resp_wish, "events": resp_events})
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

            save_events_to_disk(body)
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

            save_events_to_disk(events)
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
            save_events_to_disk(events)
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
            print(f"💾 Datendatei:  {get_events_file()}")
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
