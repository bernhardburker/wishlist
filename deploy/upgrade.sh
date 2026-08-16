#!/usr/bin/env bash
# ==============================================================================
# Upgrade- & Deployment-Skript für die Wunschliste auf dem Burkerserver
# ==============================================================================

set -euo pipefail

SRC_DIR="$(pwd)"
PORT="${PORT:-8088}"

# Intelligente Zielverzeichnis-Erkennung (beschreibbares Verzeichnis wählen)
if [ -n "${1:-}" ]; then
    TARGET_DIR="$1"
elif [ -d "/mnt/data/work/wunschliste" ] && [ -w "/mnt/data/work/wunschliste" ]; then
    TARGET_DIR="/mnt/data/work/wunschliste"
elif [ -d "$HOME/wunschliste" ] || mkdir -p "$HOME/wunschliste" 2>/dev/null; then
    TARGET_DIR="$HOME/wunschliste"
else
    TARGET_DIR="$SRC_DIR"
fi

echo "=================================================="
echo "🎁 Starte Wunschliste Upgrade auf Burkerserver..."
echo "📂 Quellverzeichnis: $SRC_DIR"
echo "📂 Zielverzeichnis:  $TARGET_DIR"
echo "🌐 Port:             $PORT"
echo "=================================================="

# 1. Zielverzeichnisse sicherstellen
mkdir -p "$TARGET_DIR/data"
mkdir -p "$TARGET_DIR/deploy"
mkdir -p "$TARGET_DIR/css"
mkdir -p "$TARGET_DIR/js"
mkdir -p "$TARGET_DIR/assets"
mkdir -p "$TARGET_DIR/scripts"

# 2. Dateien synchronisieren (falls Quell- und Zielverzeichnis unterschiedlich sind)
SRC_REAL="$(realpath "$SRC_DIR" 2>/dev/null || echo "$SRC_DIR")"
TARGET_REAL="$(realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")"

if [ "$SRC_REAL" != "$TARGET_REAL" ]; then
    echo "📦 Kopiere aktualisierte Anwendungsdateien nach $TARGET_DIR..."
    cp -f "$SRC_DIR/server.py" "$TARGET_DIR/"
    cp -f "$SRC_DIR/index.html" "$TARGET_DIR/"
    cp -f "$SRC_DIR/README.md" "$TARGET_DIR/"
    [ -d "$SRC_DIR/css" ] && cp -rf "$SRC_DIR/css/." "$TARGET_DIR/css/"
    [ -d "$SRC_DIR/js" ] && cp -rf "$SRC_DIR/js/." "$TARGET_DIR/js/"
    [ -d "$SRC_DIR/assets" ] && cp -rf "$SRC_DIR/assets/." "$TARGET_DIR/assets/"
    [ -d "$SRC_DIR/scripts" ] && cp -rf "$SRC_DIR/scripts/." "$TARGET_DIR/scripts/"
    [ -d "$SRC_DIR/deploy" ] && cp -rf "$SRC_DIR/deploy/." "$TARGET_DIR/deploy/"
fi

# 3. Sicherstellen, dass Live-Daten nicht überschrieben werden
if [ ! -f "$TARGET_DIR/data/events.json" ]; then
    if [ -f "$SRC_DIR/data/events.json" ]; then
        echo "📄 Initialisiere data/events.json mit Standard-Wunschliste..."
        cp "$SRC_DIR/data/events.json" "$TARGET_DIR/data/events.json"
    fi
else
    echo "🔒 Bestehende Live-Daten in data/events.json bleiben geschützt."
fi

if [ -f "$SRC_DIR/data/default-wishes.js" ]; then
    cp -f "$SRC_DIR/data/default-wishes.js" "$TARGET_DIR/data/default-wishes.js" 2>/dev/null || true
fi

# 4. Laufenden Alt-Prozess auf Port $PORT beenden
echo "🛑 Beende laufende Alt-Prozesse auf Port $PORT..."
fuser -k -9 "${PORT}/tcp" 2>/dev/null || true
lsof -ti:"${PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
pkill -9 -f "$TARGET_DIR/server.py" 2>/dev/null || true
pkill -9 -f "python3.*server.py" 2>/dev/null || true
sleep 1

# 5. Systemd Service registrieren & Dienst starten
SERVICE_STARTED=false
PYTHON_BIN="$(command -v python3 || echo /usr/bin/python3)"

# Systemd User-Unit mit aktuellem TARGET_DIR dynamisch erzeugen
mkdir -p "$HOME/.config/systemd/user" 2>/dev/null || true
cat <<EOF > "$HOME/.config/systemd/user/wunschliste.service"
[Unit]
Description=Wunschliste REST-API & Webserver (Burkerserver)
After=network.target

[Service]
Type=simple
WorkingDirectory=$TARGET_DIR
ExecStart=$PYTHON_BIN $TARGET_DIR/server.py
Restart=always
RestartSec=3
Environment=PORT=$PORT
Environment=ADMIN_PIN=1234
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF

if command -v systemctl >/dev/null 2>&1; then
    # D-Bus & XDG Umgebungsvariablen für Nicht-Login-Sessions / CI-Runner setzen
    export XDG_RUNTIME_DIR="/run/user/$(id -u 2>/dev/null || echo 1000)"
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"

    if systemctl --user daemon-reload >/dev/null 2>&1 && \
       systemctl --user enable wunschliste >/dev/null 2>&1 && \
       systemctl --user restart wunschliste >/dev/null 2>&1; then
        echo "✔ systemd user service 'wunschliste' erfolgreich neu gestartet."
        SERVICE_STARTED=true
    fi
fi

# Fallback: Falls systemd D-Bus in der Runner-Umgebung nicht erreichbar ist, direkter Daemon-Start via setsid
if [ "$SERVICE_STARTED" = false ]; then
    echo "ℹ️ Systemd D-Bus nicht direkt ansprechbar. Starte Python-Server direkt als Daemon..."
    cd "$TARGET_DIR"
    if command -v setsid >/dev/null 2>&1; then
        setsid "$PYTHON_BIN" -u "$TARGET_DIR/server.py" >> "$TARGET_DIR/server.log" 2>&1 &
    else
        nohup "$PYTHON_BIN" -u "$TARGET_DIR/server.py" >> "$TARGET_DIR/server.log" 2>&1 &
    fi
    disown -a 2>/dev/null || true
fi

# 6. Smoke Test / Health Check ausführen
echo "🔍 Führe Health Check gegen http://127.0.0.1:$PORT/api/health durch..."
HEALTHY=false
for i in {1..20}; do
    if curl --fail --silent "http://127.0.0.1:$PORT/api/health" > /dev/null; then
        echo "✔ Server antwortet erfolgreich auf Port $PORT!"
        HEALTHY=true
        break
    fi
    echo "   Warte auf Server (Versuch $i/20)..."
    sleep 1
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Health Check fehlgeschlagen! Bitte Server-Logs prüfen."
    if [ -f "$TARGET_DIR/server.log" ]; then
        echo "--- Letzte Zeilen aus $TARGET_DIR/server.log ---"
        tail -n 30 "$TARGET_DIR/server.log" || true
    fi
    exit 1
fi

echo "=================================================="
echo "🎉 Deployment erfolgreich abgeschlossen!"
echo "=================================================="
