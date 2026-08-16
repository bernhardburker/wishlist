/**
 * Speicher-Verwaltung für Multi-Events & Burkerserver Backend-API
 * Speichert alle Wünsche & Reservierungen direkt auf deinem eigenen Server (data/events.json).
 */

import { defaultEvents, defaultSettings } from "../data/default-wishes.js";

const STORAGE_KEYS = {
  EVENTS: "wunschliste_events_v2",
  SETTINGS: "wunschliste_settings_v2",
  SERVER_CONFIG: "wunschliste_server_config_v2",
  SAVED_USER: "wunschliste_saved_username_v2"
};

export class StorageService {
  constructor() {
    this.serverConfig = this.getServerConfig();
  }

  /**
   * Lädt die Server-Konfiguration
   */
  getServerConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SERVER_CONFIG);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Fehler beim Lesen der Server-Konfiguration:", e);
    }

    // Standardmäßig: Wenn die Seite auf einem eigenen Server / Port läuft, nutze relative API
    const isLocalOrSelfHosted = window.location.hostname !== "localhost" && !window.location.hostname.endsWith("github.io");
    return {
      enabled: isLocalOrSelfHosted,
      serverUrl: isLocalOrSelfHosted ? window.location.origin : "",
      adminPin: "1234"
    };
  }

  /**
   * Speichert die Server-Konfiguration
   */
  saveServerConfig(config) {
    this.serverConfig = {
      ...this.getServerConfig(),
      ...config
    };
    localStorage.setItem(STORAGE_KEYS.SERVER_CONFIG, JSON.stringify(this.serverConfig));
  }

  getApiBaseUrl() {
    const config = this.getServerConfig();
    if (config.serverUrl) {
      return config.serverUrl.replace(/\/+$/, "");
    }
    return "";
  }

  getSavedUserName() {
    return localStorage.getItem(STORAGE_KEYS.SAVED_USER) || "";
  }

  setSavedUserName(name) {
    if (name) {
      localStorage.setItem(STORAGE_KEYS.SAVED_USER, name.trim());
    }
  }

  /**
   * Testet die Server-Verbindung
   */
  async testServerConnection(urlToTest = null) {
    const baseUrl = (urlToTest !== null ? urlToTest : this.getApiBaseUrl()).replace(/\/+$/, "");
    const testUrl = baseUrl ? `${baseUrl}/api/health` : `/api/health`;

    try {
      const res = await fetch(`${testUrl}?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        return { success: true, message: `Server erreichbar! (Status: ${data.status || 'OK'})` };
      }
      return { success: false, message: `Server antwortet mit HTTP ${res.status}` };
    } catch (err) {
      return { success: false, message: `Verbindungsfehler: ${err.message}` };
    }
  }

  /**
   * Lädt alle Veranstaltungen.
   * 1. Versucht /api/events vom Server
   * 2. Fallback auf localStorage
   * 3. Fallback auf statische data/events.json
   */
  async loadEvents() {
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/events` : `/api/events`;

    try {
      const res = await fetch(`${apiUrl}?_t=${Date.now()}`);
      if (res.ok) {
        const events = await res.json();
        if (Array.isArray(events) && events.length > 0) {
          this.saveLocalEvents(events);
          return events;
        }
      }
    } catch (e) {
      // Server nicht erreichbar oder lokaler Standalone-Modus
    }

    // 2. Lokaler Speicher
    try {
      const localData = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Fehler beim Laden des lokalen Speichers:", e);
    }

    // 3. Statische data/events.json
    try {
      const staticRes = await fetch(`./data/events.json?_t=${Date.now()}`);
      if (staticRes.ok) {
        const staticEvents = await staticRes.json();
        if (Array.isArray(staticEvents) && staticEvents.length > 0) {
          this.saveLocalEvents(staticEvents);
          return staticEvents;
        }
      }
    } catch (e) {}

    // 4. Default Events
    this.saveLocalEvents(defaultEvents);
    return defaultEvents;
  }

  saveLocalEvents(events) {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }

  /**
   * Gast-Reservierung oder Stornierung an die Server-API senden
   */
  async reserveWishOnServer(eventId, wishId, action = "reserve", name = "", note = "", pin = "") {
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/reserve` : `/api/reserve`;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, wishId, action, name, note, pin })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          this.saveLocalEvents(data.events);
          return { success: true, events: data.events, wish: data.wish };
        }
        return { success: true, wish: data.wish };
      } else {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || `HTTP ${res.status}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Speichert / aktualisiert eine Veranstaltung
   */
  async saveEvent(eventData) {
    const events = await this.loadEvents();
    const index = events.findIndex((e) => e.id === eventData.id || e.slug === eventData.slug);

    if (index !== -1) {
      events[index] = { ...events[index], ...eventData, updatedAt: new Date().toISOString() };
    } else {
      events.push({
        ...eventData,
        wishes: eventData.wishes || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    this.saveLocalEvents(events);
    this.syncEventsToServer(events);
    return events;
  }

  /**
   * Löscht eine Veranstaltung
   */
  async deleteEvent(eventId) {
    let events = await this.loadEvents();
    if (events.length <= 1) {
      throw new Error("Die letzte verbleibende Veranstaltung kann nicht gelöscht werden.");
    }
    events = events.filter((e) => e.id !== eventId && e.slug !== eventId);
    this.saveLocalEvents(events);
    this.syncEventsToServer(events);
    return events;
  }

  /**
   * Aktualisiert einen einzelnen Wunsch
   */
  async updateWish(eventId, updatedWish) {
    // Wenn es eine einfache Reservierung/Stornierung ist, versuche zuerst die Server-Reservierungs-API
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/reserve` : `/api/reserve`;

    if (updatedWish.status === "reserved" && updatedWish.reservedBy) {
      const serverRes = await this.reserveWishOnServer(
        eventId,
        updatedWish.id,
        "reserve",
        updatedWish.reservedBy,
        updatedWish.note || "",
        updatedWish.reservePin || ""
      );
      if (serverRes.success && serverRes.events) {
        return serverRes.events;
      }
    }

    const events = await this.loadEvents();
    const event = events.find((e) => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    const wishIndex = event.wishes.findIndex((w) => w.id === updatedWish.id);
    if (wishIndex !== -1) {
      event.wishes[wishIndex] = { ...event.wishes[wishIndex], ...updatedWish, updatedAt: new Date().toISOString() };
    } else {
      event.wishes.unshift({ ...updatedWish, createdAt: new Date().toISOString() });
    }

    this.saveLocalEvents(events);
    this.syncWishToServer(eventId, updatedWish);
    return events;
  }

  /**
   * Fügt einen neuen Wunsch zu einer Veranstaltung hinzu
   */
  async addWish(eventId, newWish) {
    const events = await this.loadEvents();
    const event = events.find((e) => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    const wishItem = {
      ...newWish,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    event.wishes.unshift(wishItem);

    this.saveLocalEvents(events);
    this.syncWishToServer(eventId, wishItem);
    return events;
  }

  /**
   * Löscht einen Wunsch aus einer Veranstaltung
   */
  async deleteWish(eventId, wishId) {
    const events = await this.loadEvents();
    const event = events.find((e) => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    event.wishes = event.wishes.filter((w) => w.id !== wishId);
    this.saveLocalEvents(events);
    this.deleteWishOnServer(eventId, wishId);
    return events;
  }

  /**
   * Wünsche importieren (Anhängen oder Ersetzen)
   */
  async importWishesToEvent(eventId, newWishes, mode = "append") {
    const events = await this.loadEvents();
    const event = events.find((e) => e.id === eventId || e.slug === eventId);
    if (!event) throw new Error("Veranstaltung nicht gefunden.");

    if (mode === "replace") {
      event.wishes = newWishes;
    } else {
      event.wishes = [...event.wishes, ...newWishes];
    }

    this.saveLocalEvents(events);
    this.syncEventsToServer(events);
    return events;
  }

  /**
   * Hintergrund-Sync Methoden an den Server
   */
  async syncEventsToServer(events) {
    const baseUrl = this.getApiBaseUrl();
    const settings = this.loadSettings();
    const apiUrl = baseUrl ? `${baseUrl}/api/events` : `/api/events`;

    try {
      await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": settings.adminPin || "1234"
        },
        body: JSON.stringify(events)
      });
    } catch (e) {
      console.warn("Konnte Events nicht zum Server übertragen:", e);
    }
  }

  async syncWishToServer(eventId, wish) {
    const baseUrl = this.getApiBaseUrl();
    const settings = this.loadSettings();
    const apiUrl = baseUrl ? `${baseUrl}/api/wishes` : `/api/wishes`;

    try {
      await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": settings.adminPin || "1234"
        },
        body: JSON.stringify({ eventId, wish })
      });
    } catch (e) {
      console.warn("Konnte Wunsch nicht zum Server übertragen:", e);
    }
  }

  async deleteWishOnServer(eventId, wishId) {
    const baseUrl = this.getApiBaseUrl();
    const settings = this.loadSettings();
    const apiUrl = baseUrl ? `${baseUrl}/api/wishes` : `/api/wishes`;

    try {
      await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": settings.adminPin || "1234"
        },
        body: JSON.stringify({ eventId, wishId })
      });
    } catch (e) {
      console.warn("Konnte Wunsch auf Server nicht löschen:", e);
    }
  }

  /**
   * Globale Einstellungen laden & speichern
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Fehler beim Laden der Einstellungen:", e);
    }
    return defaultSettings;
  }

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  /**
   * Exportiert alle Daten als JSON
   */
  async exportAllData() {
    const events = await this.loadEvents();
    const settings = this.loadSettings();
    const exportObject = {
      version: 2,
      exportedAt: new Date().toISOString(),
      settings,
      events
    };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wunschliste-alle-veranstaltungen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Importiert vollständiges Backup
   */
  async importAllData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data && Array.isArray(data.events)) {
        this.saveLocalEvents(data.events);
        if (data.settings) {
          this.saveSettings(data.settings);
        }
        await this.syncEventsToServer(data.events);
        return { success: true, count: data.events.length };
      }
      return { success: false, error: "Ungültiges Dateiformat (Keine Veranstaltungen gefunden)." };
    } catch (e) {
      return { success: false, error: "Fehler beim Parsen der JSON-Datei: " + e.message };
    }
  }

  /**
   * Setzt alles auf die Standard-Events zurück
   */
  resetToDefaults() {
    this.saveLocalEvents(defaultEvents);
    this.saveSettings(defaultSettings);
    this.syncEventsToServer(defaultEvents);
    return { events: defaultEvents, settings: defaultSettings };
  }
}

export const storage = new StorageService();
