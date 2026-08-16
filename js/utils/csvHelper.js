/**
 * CSV Hilfsfunktionen: Intelligenter CSV-Parser & Vorlagen-Generator
 */

import { detectShop } from "./shopHelper.js";
import { generateId } from "./helpers.js";

/**
 * Erkennt das verwendete Trennzeichen (Semikolon, Komma oder Tab)
 */
function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;

  if (semicolons >= commas && semicolons >= tabs) return ";";
  if (tabs > commas && tabs > semicolons) return "\t";
  return ",";
}

/**
 * Zerlegt eine CSV-Zeile unter Berücksichtigung von Anführungszeichen
 */
function parseCsvLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Escaped quote überspringen
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Mappt Spaltennamen flexibel (deutsch & englisch)
 */
function mapHeaderIndex(headers) {
  const mapping = {
    title: -1,
    url: -1,
    price: -1,
    category: -1,
    priority: -1,
    image: -1,
    description: -1,
    note: -1
  };

  headers.forEach((h, index) => {
    const clean = h.toLowerCase().trim().replace(/['"]/g, "");
    if (["titel", "title", "name", "geschenk", "produkt", "artikel", "bezeichnung"].includes(clean)) {
      mapping.title = index;
    } else if (["link", "url", "shop", "shoplink", "shop-link", "webseite", "website"].includes(clean)) {
      mapping.url = index;
    } else if (["preis", "price", "kosten", "euro", "betrag"].includes(clean)) {
      mapping.price = index;
    } else if (["kategorie", "category", "bereich", "rubrik", "typ"].includes(clean)) {
      mapping.category = index;
    } else if (["priorität", "prioritaet", "priority", "wichtigkeit", "prio", "favorit"].includes(clean)) {
      mapping.priority = index;
    } else if (["bild", "bild-url", "image", "image-url", "foto", "fotourl", "thumbnail"].includes(clean)) {
      mapping.image = index;
    } else if (["beschreibung", "description", "info", "text"].includes(clean)) {
      mapping.description = index;
    } else if (["notiz", "note", "details", "anmerkung", "größe", "farbe"].includes(clean)) {
      mapping.note = index;
    }
  });

  // Fallbacks falls keine Header erkannt wurden: Standardspalten-Reihenfolge
  if (mapping.title === -1 && headers.length > 0) mapping.title = 0;
  if (mapping.url === -1 && headers.length > 1) mapping.url = 1;
  if (mapping.price === -1 && headers.length > 2) mapping.price = 2;
  if (mapping.category === -1 && headers.length > 3) mapping.category = 3;

  return mapping;
}

/**
 * Normalisiert Prioritätswerte
 */
function normalizePriority(val) {
  if (!val) return "medium";
  const s = String(val).toLowerCase().trim();
  if (s.includes("hoch") || s.includes("high") || s.includes("⭐") || s.includes("favorit") || s.includes("liebling") || s === "1") {
    return "high";
  }
  if (s.includes("niedrig") || s.includes("low") || s.includes("optional") || s === "3") {
    return "low";
  }
  return "medium";
}

/**
 * Normalisiert Preiswerte
 */
function normalizePrice(val) {
  if (val === undefined || val === null || val === "") return 0;
  const str = String(val).replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Parst CSV-Text in ein Array von Wunsch-Objekten
 */
export function parseWishesFromCsv(csvText) {
  if (!csvText || !csvText.trim()) {
    throw new Error("Die CSV-Datei ist leer.");
  }

  const lines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
  if (lines.length < 1) {
    throw new Error("Keine Zeilen in der CSV-Datei gefunden.");
  }

  const delimiter = detectDelimiter(csvText);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headerMap = mapHeaderIndex(rawHeaders);

  // Prüfen ob die erste Zeile wirklich Header ist oder bereits Daten
  const firstColValue = rawHeaders[headerMap.title] || "";
  const isHeader = ["titel", "title", "name", "geschenk", "produkt"].includes(firstColValue.toLowerCase().trim());
  const dataLines = isHeader ? lines.slice(1) : lines;

  const parsedWishes = [];

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseCsvLine(dataLines[i], delimiter);
    const title = (headerMap.title !== -1 && cols[headerMap.title]) ? cols[headerMap.title] : cols[0];

    if (!title || !title.trim()) continue; // Leere Zeile überspringen

    const url = (headerMap.url !== -1 && cols[headerMap.url]) ? cols[headerMap.url] : "";
    const rawPrice = (headerMap.price !== -1 && cols[headerMap.price]) ? cols[headerMap.price] : "";
    const category = (headerMap.category !== -1 && cols[headerMap.category]) ? cols[headerMap.category] : "Spielzeug";
    const rawPrio = (headerMap.priority !== -1 && cols[headerMap.priority]) ? cols[headerMap.priority] : "medium";
    const image = (headerMap.image !== -1 && cols[headerMap.image]) ? cols[headerMap.image] : "";
    const description = (headerMap.description !== -1 && cols[headerMap.description]) ? cols[headerMap.description] : "";
    const note = (headerMap.note !== -1 && cols[headerMap.note]) ? cols[headerMap.note] : "";

    const detected = detectShop(url);

    parsedWishes.push({
      id: generateId("csv"),
      title: title.trim(),
      url: url.trim(),
      price: normalizePrice(rawPrice),
      category: category.trim() || "Sonstiges",
      priority: normalizePriority(rawPrio),
      image: image.trim(),
      description: description.trim(),
      note: note.trim(),
      shopName: detected.name,
      status: "available",
      reservedBy: "",
      reservedAt: null,
      reserveNote: "",
      reservePin: ""
    });
  }

  if (parsedWishes.length === 0) {
    throw new Error("Es konnten keine gültigen Geschenke aus der CSV-Datei extrahiert werden.");
  }

  return parsedWishes;
}

/**
 * Lädt eine formatierte CSV-Musterdatei herunter
 */
export function downloadCsvTemplate() {
  const headers = ["Titel", "Shop-Link", "Preis", "Kategorie", "Priorität", "Bild-URL", "Notiz", "Beschreibung"];
  const sampleRows = [
    [
      "LEGO City Arktis-Forschungsstation",
      "https://www.smythstoys.com/de/de-de/spielzeug/lego/lego-city/lego-city-set-60378-arktis-expedition-rettungs-mobil/p/222384",
      "49,99",
      "Spielzeug",
      "Hoch",
      "https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=600",
      "Set 60378",
      "Großer Wunsch für spannende Bauabenteuer"
    ],
    [
      "Toniebox Hörfigur: Die kleine Hexe",
      "https://www.amazon.de/dp/B08HJTY94X",
      "16,99",
      "Spielzeug",
      "Hoch",
      "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600",
      "Farbe/Ausführung: Original",
      "Hörspiel zum Einschlafen"
    ],
    [
      "Kinderbuch: Der Löwe in dir",
      "https://www.thalia.de/shop/home/artikeldetails/A1037305988",
      "15,00",
      "Bücher",
      "Normal",
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600",
      "Hardcover",
      "Wunderschön illustriertes Bilderbuch"
    ]
  ];

  const csvLines = [
    headers.join(";"),
    ...sampleRows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(";"))
  ];

  const csvContent = "\uFEFF" + csvLines.join("\r\n"); // UTF-8 BOM für fehlerfreies Öffnen in Excel
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wunschliste_vorlage.csv";
  a.click();
  URL.revokeObjectURL(url);
}
