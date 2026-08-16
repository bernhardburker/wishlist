#!/usr/bin/env bash
# ==============================================================================
# Upgrade- & Deployment-Skript für die Wunschliste auf dem Burkerserver
# ==============================================================================

set -euo pipefail

TARGET_DIR="${1:-/mnt/data/work/wunschliste}"
PORT="${PORT:-8000}"

echo "=================================================="
echo "🎁 Starte Wunschliste Upgrade auf Burkerserver..."
echo "📂 Zielverzeichnis: $TARGET_DIR"
echo "🌐 Port:            $PORT"
echo "=================================================="

# 1. Verzeichnisse sicherstellen
mkdir -p "$TARGET_DIR/data"
mkdir -p "$TARGET_DIR/deploy"

# 2. Sicherstellen, dass Live-Daten nicht überschrieben werden
if [ ! -f "$TARGET_DIR/data/events.json" ]; then
    if [ -f "data/events.json" ]; then
        echo "📄 Initialisiere data/events.json mit Standard-Wunschliste..."
        cp "data/events.json" "$TARGET_DIR/data/events.json"
    fi
else
    echo "🔒 Bestehende Live-Daten in data/events.json bleiben geschützt."
fi

# 3. Systemd Service prüfen und neu starten
if command -v systemctl >/dev/null 2>&1; then
    if [ -f "/etc/systemd/system/wunschliste.service" ]; then
        echo "🔄 Starte systemd Dienst 'wunschliste' neu..."
        sudo systemctl restart wunschliste
    else
        echo "ℹ️ Systemd Dienst /etc/systemd/system/wunschliste.service noch nicht eingerichtet."
        echo "   Führe aus: sudo cp deploy/wunschliste.service /etc/systemd/system/ && sudo systemctl enable --now wunschliste"
    fi
fi

# 4. Smoke Test / Health Check ausführen
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
    exit 1
fi

echo "=================================================="
echo "🎉 Deployment erfolgreich abgeschlossen!"
echo "=================================================="
