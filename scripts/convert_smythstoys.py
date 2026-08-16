#!/usr/bin/env python3
"""
Smyths Toys Wunschlisten Konverter
Konvertiert geteilte Smyths Toys Wunschlisten (URL oder gespeicherte HTML) in:
  1. Eine importierbare JSON-Datei (kompatibel mit dem Wunschliste-Import & State)
  2. Eine importierbare CSV-Datei (kompatibel mit dem CSV-Import & Excel)
"""

import sys
import json
import re
import os
import urllib.request
import urllib.error
import argparse


def fetch_html_from_url(url):
    """Lädt den HTML-Inhalt von der angegebenen Smyths Toys URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise RuntimeError(f"Fehler beim Abrufen der URL {url}: {e}")


def parse_nuxt_payload(html_content):
    """Extrahiert und deserialisiert das Nuxt 3 devalue Payload aus dem HTML."""
    script_matches = re.findall(r"<script[^>]*>(.*?)</script>", html_content, re.DOTALL)
    
    payload = None
    for script_text in script_matches:
        script_text = script_text.strip()
        if script_text.startswith("[[") and ("ShallowReactive" in script_text or "products" in script_text):
            try:
                payload = json.loads(script_text)
                break
            except Exception:
                continue

    if not payload:
        raise ValueError("Kein passendes Nuxt-Payload im HTML gefunden.")

    def resolve(idx, seen=None):
        if seen is None:
            seen = set()
        if isinstance(idx, int):
            if idx < 0 or idx >= len(payload):
                return idx
            if idx in seen:
                return f"<circular {idx}>"
            val = payload[idx]
            if isinstance(val, (str, int, float, bool)) or val is None:
                return val
            elif isinstance(val, list):
                if len(val) == 2 and isinstance(val[0], str) and isinstance(val[1], int):
                    return resolve(val[1], seen | {idx})
                return [resolve(x, seen | {idx}) for x in val]
            elif isinstance(val, dict):
                return {k: resolve(v, seen | {idx}) for k, v in val.items()}
        return idx

    # Suche nach dem Wunschlisten-Objekt (enthält id, name, shareUrl, products)
    wishlist_obj = None
    for i, item in enumerate(payload):
        if isinstance(item, dict) and "products" in item and "shareUrl" in item:
            wishlist_obj = resolve(i)
            break

    if not wishlist_obj:
        raise ValueError("Wunschlisten-Datenstruktur konnte im Payload nicht identifiziert werden.")

    return wishlist_obj


def map_category(url, title):
    """Ordnet anhand des Links und Titels eine passende Kategorie zu."""
    url_lower = (url or "").lower()
    title_lower = (title or "").lower()

    if "/outdoor/" in url_lower or "/garten/" in url_lower:
        return "Garten & Outdoor"
    if "/gaming/" in url_lower:
        return "Elektronik"
    if any(k in title_lower for k in ["buch", "buecher", "hörspiel", "tonie"]):
        return "Bücher"
    if any(k in url_lower for k in ["kleidung", "mode", "schuhe"]):
        return "Kleidung"
    if "/spielzeug/" in url_lower:
        return "Spielzeug"
    return "Spielzeug"


def convert_wishlist_to_wishes(wishlist_data):
    """Konvertiert die Rohdaten der Wunschliste in das Datenformat der App."""
    raw_products = wishlist_data.get("products", [])
    wishlist_name = wishlist_data.get("name", "Smyths Toys Wunschliste")
    
    converted_wishes = []
    
    for idx, p in enumerate(raw_products):
        code = str(p.get("code", "")).strip()
        name = str(p.get("name", "")).strip()
        raw_url = str(p.get("url", "")).strip()
        
        if raw_url.startswith("/"):
            full_url = f"https://www.smythstoys.com{raw_url}"
        elif raw_url.startswith("http"):
            full_url = raw_url
        else:
            full_url = f"https://www.smythstoys.com/at/de-at/p/{code}" if code else ""

        price_obj = p.get("prices", {})
        if isinstance(price_obj, dict):
            price_val = float(price_obj.get("value", 0.0))
        elif isinstance(price_obj, (int, float)):
            price_val = float(price_obj)
        else:
            price_val = 0.0

        img_url = str(p.get("imgUrl", "")).strip()
        if img_url and "image.smythstoys.com" in img_url and not re.search(r"\.(jpg|jpeg|png|webp)($|\?)", img_url, re.I):
            img_url += ".jpg"

        category = map_category(raw_url, name)
        note = f"Art.-Nr. {code}" if code else ""
        desc = ""

        converted_wishes.append({
            "id": f"smyths-{code}" if code else f"smyths-wish-{idx+1}",
            "title": name,
            "url": full_url,
            "price": price_val,
            "category": category,
            "priority": "medium",
            "image": img_url,
            "description": desc,
            "shopName": "Smyths Toys",
            "status": "available",
            "reservedBy": "",
            "reservedAt": None,
            "note": note,
            "reservePin": ""
        })

    return {
        "id": wishlist_data.get("id", "smyths-wishlist"),
        "name": wishlist_name,
        "shareUrl": wishlist_data.get("shareUrl", ""),
        "subTotal": wishlist_data.get("subTotal", {}),
        "wishes": converted_wishes
    }


def export_json(wishes, file_path):
    """Speichert die Wünsche als JSON-Datei."""
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(wishes, f, indent=2, ensure_ascii=False)
    print(f"JSON-Datei erfolgreich erstellt: {file_path}")


def export_csv(wishes, file_path):
    """Speichert die Wünsche als CSV-Datei mit UTF-8-BOM und Semikolon-Trennzeichen."""
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    headers = ["Titel", "Shop-Link", "Preis", "Kategorie", "Priorität", "Bild-URL", "Notiz", "Beschreibung"]
    
    rows = []
    for w in wishes:
        price_formatted = f"{w['price']:.2f}".replace(".", ",")
        prio_text = "Hoch" if w.get("priority") == "high" else ("Niedrig" if w.get("priority") == "low" else "Normal")
        rows.append([
            w.get("title", ""),
            w.get("url", ""),
            price_formatted,
            w.get("category", "Spielzeug"),
            prio_text,
            w.get("image", ""),
            w.get("note", ""),
            w.get("description", "")
        ])

    with open(file_path, "w", encoding="utf-8-sig") as f:
        escaped_headers = [f'"{h.replace(chr(34), chr(34)+chr(34))}"' for h in headers]
        f.write(";".join(escaped_headers) + "\r\n")
        for row in rows:
            escaped_cols = [f'"{str(col).replace(chr(34), chr(34)+chr(34))}"' for col in row]
            f.write(";".join(escaped_cols) + "\r\n")
            
    print(f"CSV-Datei erfolgreich erstellt: {file_path}")


def main():
    parser = argparse.ArgumentParser(description="Smyths Toys Wunschliste Konverter")
    parser.add_argument("source", help="URL der geteilten Wunschliste oder lokaler Pfad zur HTML-Datei")
    parser.add_argument("--json", dest="json_out", default="data/smythstoys_import.json", help="Ausgabepfad für JSON")
    parser.add_argument("--csv", dest="csv_out", default="data/smythstoys_import.csv", help="Ausgabepfad für CSV")
    
    args = parser.parse_args()

    source = args.source
    if os.path.isfile(source):
        with open(source, "r", encoding="utf-8") as f:
            html = f.read()
    else:
        print(f"Lade Wunschliste von URL: {source}")
        html = fetch_html_from_url(source)

    wishlist_data = parse_nuxt_payload(html)
    result = convert_wishlist_to_wishes(wishlist_data)
    wishes = result["wishes"]

    print(f"\nGefundene Wunschliste: {result['name']} mit {len(wishes)} Artikeln")
    
    export_json(wishes, args.json_out)
    export_csv(wishes, args.csv_out)
    print("\nFertig! Die Dateien können jetzt direkt über die Admin-Oberfläche importiert werden.")


if __name__ == "__main__":
    main()
