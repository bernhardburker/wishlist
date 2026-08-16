/**
 * Speicher-Verwaltung für Multi-Events & Backend-Synchronisation
 */

import { defaultEvents, defaultSettings } from "../data/default-wishes.js";

const STORAGE_KEYS = {
  EVENTS: "wunschliste_events_v2",
  SETTINGS: "wunschliste_settings_v2",
  CLOUD_CONFIG: "wunschliste_cloud_config_v2",
  SAVED_USER: "wunschliste_saved_username_v2"
};

export class StorageService {
  constructor() {
    this.cloudConfig = this.getCloudConfig();
  }

  getCloudConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLOUD_CONFIG);
      return saved ? JSON.parse(saved) : { enabled: false, url: "", anonKey: "" };
    } catch (e) {
      return { enabled: false, url: "", anonKey: "" };
    }
  }

  saveCloudConfig(config) {
    this.cloudConfig = config;
    localStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(config));
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
   * Lädt alle Veranstaltungen (mit Wünschen). Führt automatische Migration durch, falls alte V1-Daten existieren.
   */
  async loadEvents() {
    // 1. Cloud Prüfung falls aktiv
    if (this.cloudConfig.enabled && this.cloudConfig.url && this.cloudConfig.anonKey) {
      try {
        const res = await fetch(`${this.cloudConfig.url}/rest/v1/events?select=*`, {
          headers: {
            apikey: this.cloudConfig.anonKey,
            Authorization: `Bearer ${this.cloudConfig.anonKey}`
          }
        });
        if (res.ok) {
          const cloudEvents = await res.json();
          if (Array.isArray(cloudEvents) && cloudEvents.length > 0) {
            this.saveLocalEvents(cloudEvents);
            return cloudEvents;
          }
        }
      } catch (err) {
        console.warn("Cloud-Sync nicht erreichbar, nutze lokalen Speicher:", err);
      }
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

      // Migration von altem V1-Format (einzelne Wunschliste)
      const oldWishes = localStorage.getItem("wunschliste_wishes_v1");
      const oldSettings = localStorage.getItem("wunschliste_settings_v1");
      if (oldWishes) {
        const parsedWishes = JSON.parse(oldWishes);
        const parsedSettings = oldSettings ? JSON.parse(oldSettings) : {};
        const migratedEvents = [
          {
            id: "haupt-veranstaltung",
            slug: "haupt-veranstaltung",
            title: parsedSettings.listTitle || "Unsere Wunschliste 🎁",
            subtitle: parsedSettings.listSubtitle || "Hier sind alle Geschenkideen gesammelt.",
            date: parsedSettings.eventDate || "",
            icon: "🎁",
            isArchived: false,
            wishes: parsedWishes
          }
        ];
        this.saveLocalEvents(migratedEvents);
        return migratedEvents;
      }
    } catch (e) {
      console.error("Fehler beim Laden der Veranstaltungen:", e);
    }

    // Erstinitialisierung mit Standard-Events
    this.saveLocalEvents(defaultEvents);
    return defaultEvents;
  }

  saveLocalEvents(events) {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }

  /**
   * Speichert / aktualisiert eine Veranstaltung
   */
  async saveEvent(eventData) {
    const events = await this.loadEvents();
    const index = events.findIndex(e => e.id === eventData.id || e.slug === eventData.slug);

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
    events = events.filter(e => e.id !== eventId && e.slug !== eventId);
    this.saveLocalEvents(events);
    return events;
  }

  /**
   * Aktualisiert einen einzelnen Wunsch in einer Veranstaltung
   */
  async updateWish(eventId, updatedWish) {
    const events = await this.loadEvents();
    const event = events.find(e => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    const wishIndex = event.wishes.findIndex(w => w.id === updatedWish.id);
    if (wishIndex !== -1) {
      event.wishes[wishIndex] = { ...event.wishes[wishIndex], ...updatedWish, updatedAt: new Date().toISOString() };
    } else {
      event.wishes.unshift({ ...updatedWish, createdAt: new Date().toISOString() });
    }

    this.saveLocalEvents(events);
    return events;
  }

  /**
   * Fügt einen neuen Wunsch zu einer Veranstaltung hinzu
   */
  async addWish(eventId, newWish) {
    const events = await this.loadEvents();
    const event = events.find(e => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    const wishItem = {
      ...newWish,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    event.wishes.unshift(wishItem);
    this.saveLocalEvents(events);
    return events;
  }

  /**
   * Löscht einen Wunsch aus einer Veranstaltung
   */
  async deleteWish(eventId, wishId) {
    const events = await this.loadEvents();
    const event = events.find(e => e.id === eventId || e.slug === eventId);
    if (!event) return events;

    event.wishes = event.wishes.filter(w => w.id !== wishId);
    this.saveLocalEvents(events);
    return events;
  }

  /**
   * Wünsche importieren (Anhängen oder Ersetzen)
   */
  async importWishesToEvent(eventId, newWishes, mode = "append") {
    const events = await this.loadEvents();
    const event = events.find(e => e.id === eventId || e.slug === eventId);
    if (!event) throw new Error("Veranstaltung nicht gefunden.");

    if (mode === "replace") {
      event.wishes = newWishes;
    } else {
      event.wishes = [...event.wishes, ...newWishes];
    }

    this.saveLocalEvents(events);
    return events;
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
   * Exportiert alle Daten (alle Veranstaltungen) als JSON
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
    return { events: defaultEvents, settings: defaultSettings };
  }
}

export const storage = new StorageService();
