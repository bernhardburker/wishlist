#!/usr/bin/env python3
"""
Amazon Wunschlisten Konverter & Smyths Toys Matcher
--------------------------------------------------
Liest eine Amazon-Wunschliste (URL oder HTML-Datei) ein und:
  1. Extrahiert alle Artikel (Titel, Preis, Bild-URL, Amazon-Link, ASIN)
  2. Gleicht die Artikel mit der bestehenden Smyths Toys Wunschliste ab (Fuzzy-Matching)
  3. Bietet verschiedene Modi:
     - 'merge': Kombiniert Duplikate (z. B. günstigeren Preis wählen oder Shop-Vergleich), fügt neue hinzu
     - 'new-only': Exportiert nur Artikel, die noch nicht auf der Smyths-Liste stehen
     - 'all': Exportiert alle Amazon-Artikel als eigenständige Wünsche
  4. Gibt die Ergebnisse als JSON und CSV für den direkten Web-App-Import aus.
"""

import sys
import json
import re
import os
import urllib.request
import urllib.error
import argparse
import difflib
from html.parser import HTMLParser
from html import unescape


def fetch_html_from_url(url):
    """Lädt den HTML-Inhalt einer Amazon Wunschliste herunter."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code in (403, 503):
            raise RuntimeError(
                f"Amazon hat den automatischen Download blockiert (HTTP {e.code}).\n"
                f"TIPP: Bitte öffne die Wunschliste im Browser, drücke 'Strg + S' (Seite speichern unter...), "
                f"und gib den Pfad zur gespeicherten .html Datei an."
            )
        raise RuntimeError(f"Fehler beim Abrufen der URL {url}: {e}")
    except Exception as e:
        raise RuntimeError(f"Fehler beim Abrufen der URL {url}: {e}")


def parse_price(price_str):
    """Extrahiert einen Float-Preis aus Text wie '19,99 €' oder '€ 19.99'."""
    if not price_str:
        return 0.0
    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", str(price_str).replace(".", "").replace(",", "."))
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    # Fallback mit direktem Kommatausch
    cleaned = re.sub(r"[^\d,.]", "", str(price_str))
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def clean_amazon_image_url(url):
    """Entfernt Bildverkleinerungen aus Amazon CDN-URLs für beste Auflösung."""
    if not url:
        return ""
    # Entfernt Modifikatoren wie ._SL500_ oder ._SY80_ etc.
    return re.sub(r"\._[A-Z0-9_\-]+_\.", ".", url)


def parse_amazon_html(html_content):
    """
    Extrahiert Produkte aus dem Amazon Wunschlisten-HTML.
    Unterstützt verschiedene Amazon-Layouts (Desktop, G-Items, JSON-State in Scripts).
    """
    items = []
    seen_asins = set()

    # 1. Regex-basierte Extraktion der einzelnen Listenelemente (g-item-sortable oder item_...)
    # Suche nach Blöcken mit item_ oder data-itemid
    item_blocks = re.findall(r'(<li[^>]+(?:data-itemid|id="item_)[^>]*>.*?</li>)', html_content, re.DOTALL | re.IGNORECASE)
    
    if not item_blocks:
        # Fallback auf div-basierte Elemente
        item_blocks = re.findall(r'(<div[^>]+id="itemMain_[^>]*>.*?</div>\s*</div>\s*</div>)', html_content, re.DOTALL | re.IGNORECASE)

    for block in item_blocks:
        # ASIN suchen
        asin_match = re.search(r'data-itemprimeinfo="[^"]*ASIN%3A([A-Z0-9]{10})', block, re.IGNORECASE) or \
                     re.search(r'/dp/([A-Z0-9]{10})', block, re.IGNORECASE) or \
                     re.search(r'name="ASIN"[^>]*value="([A-Z0-9]{10})"', block, re.IGNORECASE) or \
                     re.search(r'data-asin="([A-Z0-9]{10})"', block, re.IGNORECASE)
        asin = asin_match.group(1) if asin_match else ""

        # Titel & Link suchen
        title_match = re.search(r'id="itemName_[^>]*title="([^"]+)"', block, re.DOTALL) or \
                      re.search(r'id="itemName_[^>]*>([^<]+)</a>', block, re.DOTALL) or \
                      re.search(r'<a[^>]+class="[^"]*a-link-normal[^"]*"[^>]+title="([^"]+)"', block, re.DOTALL)
        
        raw_title = title_match.group(1).strip() if title_match else ""
        title = unescape(re.sub(r"\s+", " ", raw_title)).strip()

        if not title:
            continue

        # Link extrahieren
        url_match = re.search(r'href="([^"]*/(?:dp|gp/product)/[A-Z0-9]{10}[^"]*)"', block, re.IGNORECASE) or \
                    re.search(r'id="itemName_[^>]*href="([^"]+)"', block, re.IGNORECASE)
        
        raw_url = url_match.group(1) if url_match else ""
        if raw_url.startswith("/"):
            product_url = f"https://www.amazon.de{raw_url.split('?')[0]}"
        elif raw_url.startswith("http"):
            product_url = raw_url.split("?")[0]
        elif asin:
            product_url = f"https://www.amazon.de/dp/{asin}"
        else:
            product_url = ""

        # Preis extrahieren
        # Suche nach a-price-whole oder a-offscreen oder data-price
        price_match = re.search(r'<span class="a-offscreen">([^<]+)</span>', block) or \
                      re.search(r'id="itemPrice_[^>]*>\s*<span>([^<]+)</span>', block) or \
                      re.search(r'data-price="([^"]+)"', block)
        
        price_val = parse_price(price_match.group(1)) if price_match else 0.0

        # Bild extrahieren
        img_match = re.search(r'<img[^>]+src="([^"]+media-amazon\.com/images/[^"]+)"', block, re.IGNORECASE) or \
                    re.search(r'<img[^>]+src="([^"]+ssl-images-amazon\.com/images/[^"]+)"', block, re.IGNORECASE)
        
        img_url = clean_amazon_image_url(img_match.group(1)) if img_match else ""

        # Notiz / Wunschpriorität / Kommentar
        comment_match = re.search(r'id="itemComment_[^>]*>([^<]+)</span>', block)
        note = comment_match.group(1).strip() if comment_match else ""

        item_key = asin or title.lower()
        if item_key in seen_asins:
            continue
        seen_asins.add(item_key)

        items.append({
            "asin": asin,
            "title": title,
            "url": product_url,
            "price": price_val,
            "image": img_url,
            "note": note,
            "shopName": "Amazon"
        })

    # 2. Fallback: Wenn keine Blöcke erkannt wurden, versuche generische ASIN & Product Extraction
    if not items:
        asin_links = re.findall(r'<a[^>]+href="([^"]*(?:/dp/|/gp/product/)([A-Z0-9]{10})[^"]*)"[^>]*title="([^"]+)"', html_content, re.IGNORECASE)
        for link, asin, title in asin_links:
            if asin in seen_asins:
                continue
            seen_asins.add(asin)
            clean_title = unescape(re.sub(r"\s+", " ", title)).strip()
            items.append({
                "asin": asin,
                "title": clean_title,
                "url": f"https://www.amazon.de/dp/{asin}",
                "price": 0.0,
                "image": "",
                "note": "",
                "shopName": "Amazon"
            })

    return items


def map_category(title, url=""):
    """Automatische Kategorie-Zuordnung für Amazon-Artikel."""
    text = f"{title} {url}".lower()
    if any(k in text for k in ["scooter", "roller", "outdoor", "ball", "fußball", "fahrrad", "helm", "garten", "wasser"]):
        return "Garten & Outdoor"
    if any(k in text for k in ["buch", "taschenbuch", "gebundene ausgabe", "tonie", "hörspiel", "lesemaus", "tiptoi"]):
        return "Bücher"
    if any(k in text for k in ["switch", "playstation", "ps5", "xbox", "game", "kopfhörer", "tablet", "kamera", "elektronik"]):
        return "Elektronik"
    if any(k in text for k in ["t-shirt", "pullover", "socken", "schuhe", "mütze", "kleidung", "hose", "jacke"]):
        return "Kleidung"
    if any(k in text for k in ["gutschein", "ticket", "eintritt", "erlebnis"]):
        return "Erlebnisse & Gutscheine"
    return "Spielzeug"


def normalize_title_for_comparison(title):
    """Bereinigt Titel für den String-Abgleich (Kleinbuchstaben, Sonderzeichen entfernt)."""
    cleaned = title.lower()
    # Umlaute normalisieren für besseres Matching
    cleaned = cleaned.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss")
    # Satzzeichen und Sonderzeichen durch Leerzeichen ersetzen
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    # Dimensionsangaben vereinheitlichen (12,5 cm → 125cm etc.)
    cleaned = re.sub(r"(\d+)[,.](\d+)\s*cm", r"\1\2cm", cleaned)
    # Stopwörter entfernen
    stopwords = {"der", "die", "das", "mit", "und", "fur", "fur", "set", "von",
                 "in", "ein", "eine", "ab", "ca", "cm", "fur", "Jahre", "jahre",
                 "inkl", "inkl", "inkl", "offizielles", "offizieller", "official",
                 "mehrfarbig", "Mehrfarbig", "pack"}
    words = [w for w in cleaned.split() if len(w) > 1 and w.lower() not in stopwords]
    return " ".join(words)


def calculate_similarity(title1, title2):
    """Berechnet die Ähnlichkeit zweier Produkttitel (0.0 bis 1.0) anhand von Token-Overlap und SequenceMatcher."""
    norm1 = normalize_title_for_comparison(title1)
    norm2 = normalize_title_for_comparison(title2)
    
    tokens1 = set(norm1.split())
    tokens2 = set(norm2.split())
    
    if not tokens1 or not tokens2:
        return 0.0

    # Jaccard Token-Ähnlichkeit
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    jaccard_score = len(intersection) / len(union) if union else 0.0

    # SequenceMatcher für Teilstrings (z. B. "PAW Patrol Dino Rettungs-LKW")
    seq_score = difflib.SequenceMatcher(None, norm1, norm2).ratio()

    # Gewichtete Kombination
    score = (jaccard_score * 0.6) + (seq_score * 0.4)
    return score


def compare_and_match(amazon_items, smyths_wishes, threshold=0.45):
    """
    Gleicht Amazon-Artikel mit bestehenden Smyths Toys Wünschen ab.
    Gibt ein Mapping mit Übereinstimmungen und neuen Artikeln zurück.
    """
    matched_pairs = []
    unmatched_amazon = []
    unmatched_smyths = list(smyths_wishes)

    for amz in amazon_items:
        best_match = None
        best_score = 0.0

        for smyths in smyths_wishes:
            score = calculate_similarity(amz["title"], smyths.get("title", ""))
            if score > best_score:
                best_score = score
                best_match = smyths

        if best_match and best_score >= threshold:
            matched_pairs.append({
                "score": round(best_score, 2),
                "amazon": amz,
                "smyths": best_match
            })
            if best_match in unmatched_smyths:
                unmatched_smyths.remove(best_match)
        else:
            unmatched_amazon.append(amz)

    # Nach Ähnlichkeit sortieren
    matched_pairs.sort(key=lambda x: x["score"], reverse=True)

    return {
        "matched": matched_pairs,
        "unmatched_amazon": unmatched_amazon,
        "unmatched_smyths": unmatched_smyths
    }


def load_smyths_wishes(source_path):
    """Lädt die bestehenden Smyths-Wünsche aus events.json oder smythstoys.json."""
    if not os.path.exists(source_path):
        return []
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        # Entweder Liste von Wünschen oder Liste von Events
        if data and "wishes" in data[0]:
            # Event-Liste: nimm das erste Event
            return data[0].get("wishes", [])
        return data
    elif isinstance(data, dict) and "wishes" in data:
        return data["wishes"]
    return []


def export_json(data, file_path):
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ JSON gespeichert: {file_path}")


def export_csv(wishes, file_path):
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    headers = ["Titel", "Shop-Link", "Preis", "Kategorie", "Priorität", "Bild-URL", "Notiz", "Beschreibung"]
    
    rows = []
    for w in wishes:
        price_formatted = f"{float(w.get('price', 0.0)):.2f}".replace(".", ",")
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
            
    print(f"✅ CSV gespeichert: {file_path}")


def main():
    parser = argparse.ArgumentParser(description="Amazon Wunschlisten Konverter & Smyths Toys Matcher")
    parser.add_argument("source", help="Amazon Wunschlisten-URL oder Pfad zu einer gespeicherten .html Datei")
    parser.add_argument("--smyths", default="data/events.json", help="Pfad zur bestehenden Smyths-Wunschliste oder events.json")
    parser.add_argument("--mode", choices=["merge", "new-only", "all"], default="merge", 
                        help="Modus: 'merge' (Duplikate abgleichen & kombinieren), 'new-only' (nur neue Amazon-Artikel), 'all' (alle Amazon-Artikel)")
    parser.add_argument("--json", dest="json_out", default="data/amazon_import.json", help="Ausgabepfad JSON")
    parser.add_argument("--csv", dest="csv_out", default="data/amazon_import.csv", help="Ausgabepfad CSV")
    parser.add_argument("--report", dest="report_out", default="data/matching_report.json", help="Ausgabepfad Matching-Report")

    args = parser.parse_args()

    # 1. HTML laden
    if os.path.isfile(args.source):
        print(f"📖 Lese lokale HTML-Datei: {args.source}")
        with open(args.source, "r", encoding="utf-8") as f:
            html = f.read()
    else:
        print(f"🌐 Lade Amazon Wunschliste von URL: {args.source}")
        html = fetch_html_from_url(args.source)

    # 2. Amazon Artikel parsen
    amazon_items = parse_amazon_html(html)
    print(f"\n📦 {len(amazon_items)} Artikel aus der Amazon-Wunschliste extrahiert.")

    if not amazon_items:
        print("⚠️ Keine Artikel gefunden. Bitte prüfe, ob die Wunschliste öffentlich ist oder speichere die HTML-Seite im Browser ab.")
        return

    # 3. Smyths Wünsche laden & matchen
    smyths_wishes = load_smyths_wishes(args.smyths)
    print(f"🧸 {len(smyths_wishes)} bestehende Wünsche aus {args.smyths} geladen.")

    mapping_result = compare_and_match(amazon_items, smyths_wishes)
    matched = mapping_result["matched"]
    unmatched_amazon = mapping_result["unmatched_amazon"]

    print("\n" + "=" * 70)
    print(f"📊 MATCHING-ANALYSE:")
    print(f"   - Gefundene Übereinstimmungen (Duplikate/Varianten): {len(matched)}")
    print(f"   - Neue Artikel (nur auf Amazon):                   {len(unmatched_amazon)}")
    print(f"   - Artikel nur bei Smyths Toys:                     {len(mapping_result['unmatched_smyths'])}")
    print("=" * 70)

    if matched:
        print("\n🔍 Übereinstimmungen im Detail:")
        for idx, m in enumerate(matched, 1):
            amz = m["amazon"]
            smy = m["smyths"]
            diff = amz["price"] - smy.get("price", 0.0) if amz["price"] and smy.get("price") else 0
            diff_str = f"({diff:+.2f} €)" if diff != 0 else "(gleicher Preis)"
            print(f"  {idx}. [Score {int(m['score']*100)}%] Amazon: \"{amz['title'][:40]}...\" ({amz['price']:.2f} €)")
            print(f"     Smyths: \"{smy.get('title', '')[:40]}...\" ({smy.get('price', 0.0):.2f} €) {diff_str}")

    # 4. Resultierende Wünsche zusammenstellen je nach Modus
    final_wishes = []

    if args.mode == "new-only":
        print(f"\n👉 Modus 'new-only': Exportiere nur {len(unmatched_amazon)} neue Artikel von Amazon.")
        for idx, a in enumerate(unmatched_amazon, 1):
            final_wishes.append({
                "id": f"amazon-{a['asin']}" if a["asin"] else f"amazon-wish-{idx}",
                "title": a["title"],
                "url": a["url"],
                "price": a["price"],
                "category": map_category(a["title"], a["url"]),
                "priority": "medium",
                "image": a["image"],
                "description": "",
                "shopName": "Amazon",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "note": f"ASIN: {a['asin']}" if a["asin"] else "",
                "reservePin": ""
            })

    elif args.mode == "all":
        print(f"\n👉 Modus 'all': Exportiere alle {len(amazon_items)} Amazon-Artikel.")
        for idx, a in enumerate(amazon_items, 1):
            final_wishes.append({
                "id": f"amazon-{a['asin']}" if a["asin"] else f"amazon-wish-{idx}",
                "title": a["title"],
                "url": a["url"],
                "price": a["price"],
                "category": map_category(a["title"], a["url"]),
                "priority": "medium",
                "image": a["image"],
                "description": "",
                "shopName": "Amazon",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "note": f"ASIN: {a['asin']}" if a["asin"] else "",
                "reservePin": ""
            })

    elif args.mode == "merge":
        print(f"\n👉 Modus 'merge': Aktualisiere bestehende Wünsche und ergänze neue Amazon-Artikel.")
        # Kopie der bestehenden Wünsche
        merged_wishes = [dict(w) for w in smyths_wishes]
        
        # Übereinstimmende Wünsche mit Amazon-Info anreichern (z. B. Notiz mit Alternativlink / Preisvergleich)
        for m in matched:
            amz = m["amazon"]
            smy = m["smyths"]
            target_wish = next((w for w in merged_wishes if w.get("id") == smy.get("id")), None)
            if target_wish:
                existing_note = target_wish.get("note", "")
                amz_info = f"Auch bei Amazon ({amz['price']:.2f} €): {amz['url']}" if amz["price"] else f"Auch bei Amazon: {amz['url']}"
                target_wish["note"] = f"{existing_note} | {amz_info}".strip(" | ")
                if not target_wish.get("image") and amz.get("image"):
                    target_wish["image"] = amz["image"]

        # Neue Amazon Wünsche anhängen
        for idx, a in enumerate(unmatched_amazon, 1):
            merged_wishes.append({
                "id": f"amazon-{a['asin']}" if a["asin"] else f"amazon-wish-{idx}",
                "title": a["title"],
                "url": a["url"],
                "price": a["price"],
                "category": map_category(a["title"], a["url"]),
                "priority": "medium",
                "image": a["image"],
                "description": "",
                "shopName": "Amazon",
                "status": "available",
                "reservedBy": "",
                "reservedAt": None,
                "note": f"ASIN: {a['asin']}" if a["asin"] else "",
                "reservePin": ""
            })
        final_wishes = merged_wishes

    # 5. Exportieren
    export_json(final_wishes, args.json_out)
    export_csv(final_wishes, args.csv_out)
    export_json(mapping_result, args.report_out)
    print("\n🎉 Fertig! Die Dateien wurden generiert und können jetzt importiert werden.")


if __name__ == "__main__":
    main()
