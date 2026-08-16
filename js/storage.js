/**
 * Speicher-Verwaltung für Multi-Events & Burkerserver Backend-API
 * Speichert alle Wünsche & Reservierungen direkt auf deinem eigenen Server (data/events.json).
 */

import { defaultEvents, defaultSettings } from "../data/default-wishes.js";

const STORAGE_KEYS = {
  EVENTS: "wunschliste_events_v2",
  SETTINGS: "wunschliste_settings_v2",
  SERVER_CONFIG: "wunschliste_server_config_v2",
  SAVED_USER: "wunschliste_saved_username_v2",
  ADMIN_PIN: "wunschliste_admin_pin"
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

    const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");
    return {
      enabled: isHttp,
      serverUrl: isHttp ? window.location.origin : ""
    };
  }

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

  getAdminPin() {
    const fromSession = sessionStorage.getItem(STORAGE_KEYS.ADMIN_PIN);
    if (fromSession && fromSession.trim()) return fromSession.trim();

    const fromLocal = localStorage.getItem(STORAGE_KEYS.ADMIN_PIN);
    if (fromLocal && fromLocal.trim()) return fromLocal.trim();

    const settings = this.loadSettings();
    if (settings && settings.adminPin && settings.adminPin.trim()) {
      return settings.adminPin.trim();
    }
    return "1234";
  }

  setAdminPin(pin) {
    if (pin) {
      const clean = pin.trim();
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_PIN, clean);
      localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, clean);
      const settings = this.loadSettings();
      settings.adminPin = clean;
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    }
  }

  /**
   * Verifiziert den Admin-PIN gegen den Server
   */
  async verifyAdminPin(pin) {
    const cleanPin = (pin || "").trim();
    if (!cleanPin) return false;

    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/admin/verify` : `/api/admin/verify`;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleanPin })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.valid === "boolean") {
          if (data.valid) {
            this.setAdminPin(cleanPin);
          }
          return data.valid;
        }
      }
    } catch (e) {
      console.warn("Server-PIN-Prüfung nicht erreichbar, nutze lokale Prüfung:", e);
    }

    // Fallback auf lokale Settings
    const settings = this.loadSettings();
    const valid = cleanPin === (settings.adminPin || "1234").trim();
    if (valid) {
      this.setAdminPin(cleanPin);
    }
    return valid;
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
        return { success: true, message: `Server erreichbar! (Status: ${data.status || "OK"})` };
      }
      return { success: false, message: `Server antwortet mit HTTP ${res.status}` };
    } catch (err) {
      return { success: false, message: `Verbindungsfehler: ${err.message}` };
    }
  }

  /**
   * Lädt alle Veranstaltungen
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
      // Server nicht erreichbar
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

    const synced = await this.syncEventsToServer(events);
    return synced || events;
  }

  /**
   * Löscht eine Veranstaltung
   */
  async deleteEvent(eventId) {
    let events = await this.loadEvents();
    if (events.length <= 1) {
      throw new Error("Die letzte verbleibende Veranstaltung kann nicht gelöscht werden. Bitte lege zuerst eine neue Veranstaltung an.");
    }
    const filtered = events.filter((e) => e.id !== eventId && e.slug !== eventId);
    const synced = await this.syncEventsToServer(filtered);
    return synced || filtered;
  }

  /**
   * Aktualisiert einen einzelnen Wunsch
   */
  async updateWish(eventId, updatedWish) {
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
    await this.syncWishToServer(eventId, updatedWish);
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
    await this.syncWishToServer(eventId, wishItem);
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
    await this.deleteWishOnServer(eventId, wishId);
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

    const synced = await this.syncEventsToServer(events);
    return synced || events;
  }

  /**
   * Hintergrund-Sync Methoden an den Server
   */
  async syncEventsToServer(events) {
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/events` : `/api/events`;
    const adminPin = this.getAdminPin();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify(events)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP ${res.status}`;
        if (res.status === 401) {
          throw new Error("Admin-PIN nicht autorisiert. Bitte melde dich mit deiner PIN an.");
        }
        throw new Error(`Server-Fehler (${res.status}): ${errMsg}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.events) {
        this.saveLocalEvents(data.events);
        return data.events;
      }
    } catch (e) {
      console.warn("Server-Sync Fehler:", e);
      throw e;
    }

    this.saveLocalEvents(events);
    return events;
  }

  async syncWishToServer(eventId, wish) {
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/wishes` : `/api/wishes`;
    const adminPin = this.getAdminPin();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify({ eventId, wish })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          throw new Error("Admin-PIN nicht autorisiert.");
        }
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn("Konnte Wunsch nicht zum Server übertragen:", e);
      throw e;
    }
  }

  async deleteWishOnServer(eventId, wishId) {
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/wishes` : `/api/wishes`;
    const adminPin = this.getAdminPin();

    try {
      const res = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify({ eventId, wishId })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          throw new Error("Admin-PIN nicht autorisiert.");
        }
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn("Konnte Wunsch auf Server nicht löschen:", e);
      throw e;
    }
  }

  /**
   * Globale Einstellungen laden & speichern
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed, adminPin: parsed.adminPin || defaultSettings.adminPin || "1234" };
      }
    } catch (e) {
      console.error("Fehler beim Laden der Einstellungen:", e);
    }
    return defaultSettings;
  }

  /**
   * Ändert den Admin-PIN sicher auf dem Server und lokal
   */
  async changeAdminPin(oldPin, newPin) {
    const cleanOld = (oldPin || this.getAdminPin()).trim();
    const cleanNew = (newPin || "").trim();

    if (!cleanNew || cleanNew.length < 4) {
      throw new Error("Die neue PIN muss mindestens 4 Zeichen lang sein.");
    }

    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/admin/change-pin` : `/api/admin/change-pin`;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": cleanOld
        },
        body: JSON.stringify({ oldPin: cleanOld, newPin: cleanNew })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Erst nach erfolgreicher Server-Bestätigung lokal übernehmen!
      this.setAdminPin(cleanNew);
      return { success: true };
    } catch (e) {
      if (e.message && (e.message.includes("Failed to fetch") || e.message.includes("NetworkError"))) {
        // Offline-Fallback
        this.setAdminPin(cleanNew);
        return { success: true, offline: true };
      }
      throw e;
    }
  }

  async saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    const baseUrl = this.getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/api/settings` : `/api/settings`;
    const adminPin = this.getAdminPin();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn("Konnte Settings nicht zum Server synchronisieren:", errData.error || res.statusText);
      }
    } catch (e) {
      console.warn("Konnte Settings nicht zum Server synchronisieren:", e);
    }
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
      settings: { ...settings, adminPin: undefined },
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
          await this.saveSettings(data.settings);
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
  async resetToDefaults() {
    this.saveLocalEvents(defaultEvents);
    await this.saveSettings(defaultSettings);
    await this.syncEventsToServer(defaultEvents);
    return { events: defaultEvents, settings: defaultSettings };
  }
}

export const storage = new StorageService();
