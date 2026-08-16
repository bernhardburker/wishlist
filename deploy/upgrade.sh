#!/usr/bin/env bash
# ==============================================================================
# Upgrade- & Deployment-Skript für die Wunschliste auf dem Burkerserver
# ==============================================================================

set -euo pipefail

TARGET_DIR="${1:-/mnt/data/work/wunschliste}"
PORT="${PORT:-8088}"
SRC_DIR="$(pwd)"

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
if [ "$SRC_DIR" != "$TARGET_DIR" ]; then
    echo "📦 Kopiere aktualisierte Anwendungsdateien nach $TARGET_DIR..."
    cp -f "$SRC_DIR/server.py" "$TARGET_DIR/" 2>/dev/null || true
    cp -f "$SRC_DIR/index.html" "$TARGET_DIR/" 2>/dev/null || true
    cp -f "$SRC_DIR/README.md" "$TARGET_DIR/" 2>/dev/null || true
    [ -d "$SRC_DIR/css" ] && cp -rf "$SRC_DIR/css/"* "$TARGET_DIR/css/" 2>/dev/null || true
    [ -d "$SRC_DIR/js" ] && cp -rf "$SRC_DIR/js/"* "$TARGET_DIR/js/" 2>/dev/null || true
    [ -d "$SRC_DIR/assets" ] && cp -rf "$SRC_DIR/assets/"* "$TARGET_DIR/assets/" 2>/dev/null || true
    [ -d "$SRC_DIR/scripts" ] && cp -rf "$SRC_DIR/scripts/"* "$TARGET_DIR/scripts/" 2>/dev/null || true
    [ -d "$SRC_DIR/deploy" ] && cp -rf "$SRC_DIR/deploy/"* "$TARGET_DIR/deploy/" 2>/dev/null || true
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

# 4. Systemd Service registrieren & Dienst starten
SERVICE_STARTED=false

# Systemd User-Unit bereitstellen (falls beschreibbar)
if [ -f "$TARGET_DIR/deploy/wunschliste.service" ]; then
    mkdir -p "$HOME/.config/systemd/user" 2>/dev/null || true
    cp -f "$TARGET_DIR/deploy/wunschliste.service" "$HOME/.config/systemd/user/wunschliste.service" 2>/dev/null || true
fi

if command -v systemctl >/dev/null 2>&1; then
    # D-Bus & XDG Umgebungsvariablen für Nicht-Login-Sessions / CI-Runner setzen
    export XDG_RUNTIME_DIR="/run/user/$(id -u 2>/dev/null || echo 1000)"
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"

    if systemctl --user daemon-reload >/dev/null 2>&1 && \
       systemctl --user enable wunschliste >/dev/null 2>&1 && \
       systemctl --user restart wunschliste >/dev/null 2>&1; then
        echo "✔ systemd user service 'wunschliste' erfolgreich neu gestartet."
        SERVICE_STARTED=true
    elif [ -f "/etc/systemd/system/wunschliste.service" ] && sudo -n systemctl restart wunschliste >/dev/null 2>&1; then
        echo "✔ systemd system service 'wunschliste' erfolgreich neu gestartet."
        SERVICE_STARTED=true
    fi
fi

# Fallback: Falls systemd D-Bus in der Runner-Umgebung nicht erreichbar ist, direkter Daemon-Start
if [ "$SERVICE_STARTED" = false ]; then
    echo "ℹ️ Systemd D-Bus nicht direkt ansprechbar. Starte Python-Server als Hintergrunddienst..."
    pkill -f "python3.*server.py" 2>/dev/null || true
    sleep 1
    cd "$TARGET_DIR"
    nohup /usr/bin/python3 "$TARGET_DIR/server.py" >> "$TARGET_DIR/server.log" 2>&1 &
fi

# 5. Smoke Test / Health Check ausführen
echo "🔍 Führe Health Check gegen http://127.0.0.1:$PORT/api/health durch..."
HEALTHY=false
for i in {1..15}; do
    if curl --fail --silent "http://127.0.0.1:$PORT/api/health" > /dev/null; then
        echo "✔ Server antwortet erfolgreich auf Port $PORT!"
        HEALTHY=true
        break
    fi
    echo "   Warte auf Server (Versuch $i/15)..."
    sleep 2
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Health Check fehlgeschlagen! Bitte Server-Logs prüfen."
    if [ -f "$TARGET_DIR/server.log" ]; then
        echo "Letzte Zeilen aus $TARGET_DIR/server.log:"
        tail -n 25 "$TARGET_DIR/server.log"
    fi
    exit 1
fi

echo "=================================================="
echo "🎉 Deployment erfolgreich abgeschlossen!"
echo "=================================================="
