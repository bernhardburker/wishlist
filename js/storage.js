/**
 * Speicher-Verwaltung & Backend-Synchronisation
 * Unterstützt:
 * 1. LocalStorage (funktioniert sofort lokal / offline / ohne Registrierung)
 * 2. Supabase REST API (kostenlose Cloud-Synchronisation in Echtzeit für mehrere Geräte)
 * 3. JSON Backup Import & Export
 */

import { defaultWishes, defaultSettings } from "../data/default-wishes.js";

const STORAGE_KEYS = {
  WISHES: "wunschliste_wishes_v1",
  SETTINGS: "wunschliste_settings_v1",
  CLOUD_CONFIG: "wunschliste_cloud_config_v1",
  SAVED_USER: "wunschliste_saved_username_v1"
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
   * Lädt alle Wünsche (aus der Cloud falls konfiguriert, sonst aus LocalStorage)
   */
  async loadWishes() {
    if (this.cloudConfig.enabled && this.cloudConfig.url && this.cloudConfig.anonKey) {
      try {
        const res = await fetch(`${this.cloudConfig.url}/rest/v1/wishes?select=*&order=createdAt.desc`, {
          headers: {
            apikey: this.cloudConfig.anonKey,
            Authorization: `Bearer ${this.cloudConfig.anonKey}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            // Speichere lokalen Cache
            localStorage.setItem(STORAGE_KEYS.WISHES, JSON.stringify(data));
            return data;
          }
        }
      } catch (err) {
        console.warn("Cloud-Sync nicht erreichbar, nutze lokalen Speicher:", err);
      }
    }

    // Fallback auf LocalStorage
    try {
      const localData = localStorage.getItem(STORAGE_KEYS.WISHES);
      if (localData) {
        return JSON.parse(localData);
      }
    } catch (e) {
      console.error("Fehler beim Lesen des LocalStorage:", e);
    }

    // Erstinitialisierung mit Beispieldaten
    this.saveLocalWishes(defaultWishes);
    return defaultWishes;
  }

  saveLocalWishes(wishes) {
    localStorage.setItem(STORAGE_KEYS.WISHES, JSON.stringify(wishes));
  }

  /**
   * Speichert / aktualisiert einen einzelnen Wunsch (z. B. Reservierung)
   */
  async updateWish(updatedWish) {
    // 1. Lokalen Zustand sofort aktualisieren
    const wishes = await this.loadWishes();
    const index = wishes.findIndex(w => w.id === updatedWish.id);
    if (index !== -1) {
      wishes[index] = { ...wishes[index], ...updatedWish, updatedAt: new Date().toISOString() };
    } else {
      wishes.unshift({ ...updatedWish, createdAt: new Date().toISOString() });
    }
    this.saveLocalWishes(wishes);

    // 2. Cloud aktualisieren falls aktiv
    if (this.cloudConfig.enabled && this.cloudConfig.url && this.cloudConfig.anonKey) {
      try {
        await fetch(`${this.cloudConfig.url}/rest/v1/wishes?id=eq.${updatedWish.id}`, {
          method: "PATCH",
          headers: {
            apikey: this.cloudConfig.anonKey,
            Authorization: `Bearer ${this.cloudConfig.anonKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify(updatedWish)
        });
      } catch (err) {
        console.error("Fehler beim Cloud-Update:", err);
      }
    }

    return wishes;
  }

  /**
   * Fügt einen neuen Wunsch hinzu
   */
  async addWish(newWish) {
    const wishes = await this.loadWishes();
    const wishItem = {
      ...newWish,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    wishes.unshift(wishItem);
    this.saveLocalWishes(wishes);

    if (this.cloudConfig.enabled && this.cloudConfig.url && this.cloudConfig.anonKey) {
      try {
        await fetch(`${this.cloudConfig.url}/rest/v1/wishes`, {
          method: "POST",
          headers: {
            apikey: this.cloudConfig.anonKey,
            Authorization: `Bearer ${this.cloudConfig.anonKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify(wishItem)
        });
      } catch (err) {
        console.error("Fehler beim Hinzufügen in die Cloud:", err);
      }
    }

    return wishes;
  }

  /**
   * Löscht einen Wunsch
   */
  async deleteWish(wishId) {
    let wishes = await this.loadWishes();
    wishes = wishes.filter(w => w.id !== wishId);
    this.saveLocalWishes(wishes);

    if (this.cloudConfig.enabled && this.cloudConfig.url && this.cloudConfig.anonKey) {
      try {
        await fetch(`${this.cloudConfig.url}/rest/v1/wishes?id=eq.${wishId}`, {
          method: "DELETE",
          headers: {
            apikey: this.cloudConfig.anonKey,
            Authorization: `Bearer ${this.cloudConfig.anonKey}`
          }
        });
      } catch (err) {
        console.error("Fehler beim Löschen in der Cloud:", err);
      }
    }

    return wishes;
  }

  /**
   * Einstellungen laden
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
  async exportData() {
    const wishes = await this.loadWishes();
    const settings = this.loadSettings();
    const exportObject = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      wishes
    };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wunschliste-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Importiert JSON-Daten
   */
  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data && Array.isArray(data.wishes)) {
        this.saveLocalWishes(data.wishes);
        if (data.settings) {
          this.saveSettings(data.settings);
        }
        return { success: true, count: data.wishes.length };
      }
      return { success: false, error: "Ungültiges Dateiformat (Keine Wünsche gefunden)." };
    } catch (e) {
      return { success: false, error: "Fehler beim Parsen der JSON-Datei: " + e.message };
    }
  }

  /**
   * Auf Standardwerte zurücksetzen
   */
  resetToDefaults() {
    this.saveLocalWishes(defaultWishes);
    this.saveSettings(defaultSettings);
    return { wishes: defaultWishes, settings: defaultSettings };
  }
}

export const storage = new StorageService();
