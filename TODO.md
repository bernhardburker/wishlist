# 📋 Projekt-TODO & Roadmap (Priorisiert)

Übersicht aller anstehenden Optimierungen, Test-Erweiterungen und Sicherheitsmaßnahmen für die Wunschliste Web-App.

---

## 🔴 Priorität 1: Hoch (Sicherheit, Test-Architektur & kritische Pfade)

### 1.1 Playwright Tests modularisieren & nach Kategorien ausführbar machen
- [x] **CLI-Kategorie-Filter implementieren** (`scripts/test_e2e_playwright.py`)
  - `--category user` (oder `guest`): Navigation, Suche, Filter, Geschenkkarten, Reservierung, Storno, Gekauft-Markierung
  - `--category admin`: Login, Dashboard, Event-Erstellung & -Wechsel, Wunsch-Editor, Multi-Shop-Links, Einstellungen
  - `--category import`: CSV-Template-Download, CSV/JSON-Upload, Parsing, Import-Ausführung
  - `--category security`: PIN-Validierung, Datenschutz-/Sanitization-Prüfung (keine Gast-Leaks), CSP- & Rate-Limit-Prüfung
  - `--category routing`: URL-Routing (`?event=<slug>`), Slug-Fallback, Backup-Restore
  - `--all` (Standard): Führt die gesamte Suite aus
- [x] **CLI-Optionen für Entwickler**: `--headed` (Browser sichtbar) und `--slowmo <ms>` ergänzen
- [x] **CI-Workflow anpassen** (`.github/workflows/ci.yml`): Playwright-Testsuite mit `--all` integriert

### 1.2 Sicherheits-Härtung (Backend & API)
- [x] **PIN-Brute-Force-Schutz & Rate-Limiting** (`server.py`)
  - IP-basiertes In-Memory Rate-Limiting für `/api/admin/verify`, `/api/admin/change-pin` und `/api/reserve` (Storno-PIN)
  - Max. 5 Fehlversuche pro Minute, danach temporäre Sperre mit HTTP 429
- [x] **HTTP-Sicherheits-Header & CSP** (`server.py`)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` (CSP) für kontrolliertes Laden von Scripts, Fonts und Bildern
- [x] **Concurrency-Lock für Schreiboperationen** (`server.py`)
  - `threading.Lock()` für atomare Schreibvorgänge (`atomic_write_json`) zur Vermeidung von Race Conditions bei simultanen Reservierungen

### 1.3 Fehlende Testpfade in Playwright schließen
- [x] **URL-Routing & Deep-Links**: Direktaufruf per Query-Parameter `?event=<slug>` und Fallback bei ungültigen Slugs
- [x] **Backup-Restore-Test**: Testen des Hochladens/Wiederherstellens einer `events.json` im Admin-Settings-Tab
- [x] **Formular-Validierungen**: Fehlerbehandlung bei leerem Namen oder ungültigen Eingaben

---

## 🟡 Priorität 2: Mittel (Erweiterte Features & Stabilität)

### 2.1 Event-Lebenszyklus & Admin-Komfort
- [ ] **Event-Archivierung & Löschen**: Vollständige Test- und UI-Abdeckung für Archivieren (`isArchived`), Reaktivieren und Löschen von Events
- [ ] **Admin-Aktivitätslog**: Kompakte Historie im Admin-Dashboard („Wer hat wann welches Geschenk reserviert/gekauft?“)
- [ ] **Token-basierte Admin-Session**: Temporäre Session-Tokens statt dauerhafter Übertragung des Klartext-PINs im Header

### 2.2 Druckansicht (Print-Style)
- [ ] **CSS Print Stylesheet** (`css/responsive.css` oder `css/index.css`)
  - `@media print` Optimierung: Ausblenden von Buttons/Filtern/Pills, kompakte zweispaltige Geschenkliste mit QR-Code/Link

### 2.3 Mobile- und Responsive-Tests
- [ ] **Playwright Mobile-Viewport-Test**: Automatisierte Tests mit Smartphone-Auflösung (375x667px) für Scrolling in Modals, Sticky Header und Touch-Targets

---

## 🟢 Priorität 3: Niedrig (Feinschliff, Komfort & Offline)

### 3.1 1-Klick Amazon-Wunschlisten-Import im Admin
- [ ] **Direkter Text-/URL-Import**: Einbettung des bestehenden Amazon-Konverters direkt in den Admin-Tab *Import* (ohne manuelles Python-Scripting)

### 3.2 Offline- & PWA-Fähigkeit
- [ ] **Service Worker & Manifest**: Caching von statischen Assets, Fonts und der aktuellen Wunschliste für unterbrechungsfreie Nutzung bei schlechtem Empfang im Geschäft

### 3.3 Bild-Fallback & Performance
- [ ] **Robustes Bild-Fallback**: Automatische Umschaltung auf lokales SVG/Placeholder bei fehlerhaften externen Bild-URLs ohne störende Browser-Log-Fehler
- [ ] **Lazy Loading**: `loading="lazy"` für alle Geschenkkarten-Bilder zur Schonung des Datenvolumens

---

*Erstellt am: 16. August 2026*
