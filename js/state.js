/**
 * Reaktives State-Management mit Multi-Event & Deep-Linking Unterstützung
 */

import { storage } from "./storage.js";
import { generateId } from "./utils/helpers.js";

class StateStore {
  constructor() {
    this.events = [];
    this.activeEventId = "";
    this.settings = storage.loadSettings();
    this.filters = {
      search: "",
      status: "all",
      category: "Alle",
      sortBy: "priority"
    };
    this.isAdmin = sessionStorage.getItem("wunschliste_admin_active") === "true";
    this.activeModal = null;
    this.selectedWish = null;
    this.modalExtraData = null;
    this.listeners = new Set();
    this.isLoading = true;

    // Listen auf Hash-Änderungen in der URL (Deep-Linking z. B. #weihnachten-2026)
    window.addEventListener("hashchange", () => {
      this.handleUrlHash();
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error("Fehler im State-Listener:", err);
      }
    }
  }

  async init() {
    this.isLoading = true;
    this.notify();
    try {
      this.events = await storage.loadEvents();
      this.settings = storage.loadSettings();
      this.handleUrlHash();
    } catch (err) {
      console.error("Fehler beim Initialisieren des States:", err);
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  /**
   * Liest Event aus Hash (#event-id) oder Query Param (?event=...)
   */
  handleUrlHash() {
    const rawHash = window.location.hash.replace(/^#/, "").trim();
    const urlParams = new URLSearchParams(window.location.search);
    const targetSlug = rawHash || urlParams.get("event");

    if (targetSlug && this.events.length > 0) {
      const match = this.events.find(e => e.slug === targetSlug || e.id === targetSlug);
      if (match) {
        this.activeEventId = match.id;
        this.notify();
        return;
      }
    }

    // Fallback auf das erste nicht archivierte Event oder erstes Event
    if (this.events.length > 0 && !this.activeEventId) {
      const firstActive = this.events.find(e => !e.isArchived) || this.events[0];
      this.activeEventId = firstActive.id;
    }
    this.notify();
  }

  /**
   * Aktuelle Veranstaltung wechseln & URL Hash aktualisieren
   */
  setActiveEvent(eventId) {
    const event = this.events.find(e => e.id === eventId || e.slug === eventId);
    if (event) {
      this.activeEventId = event.id;
      // Aktualisiere URL ohne Neuladen
      if (history.replaceState) {
        history.replaceState(null, null, `#${event.slug || event.id}`);
      } else {
        window.location.hash = event.slug || event.id;
      }
      this.resetFilters();
      this.notify();
    }
  }

  getActiveEvent() {
    return this.events.find(e => e.id === this.activeEventId) || this.events[0] || null;
  }

  getWishes() {
    const active = this.getActiveEvent();
    return active ? (active.wishes || []) : [];
  }

  // --- Filter & Sortierung ---
  setSearch(query) {
    this.filters.search = query.trim();
    this.notify();
  }

  setStatusFilter(status) {
    this.filters.status = status;
    this.notify();
  }

  setCategoryFilter(category) {
    this.filters.category = category;
    this.notify();
  }

  setSortBy(sortBy) {
    this.filters.sortBy = sortBy;
    this.notify();
  }

  resetFilters() {
    this.filters = {
      search: "",
      status: "all",
      category: "Alle",
      sortBy: "priority"
    };
    this.notify();
  }

  getFilteredWishes() {
    const wishes = this.getWishes();
    return wishes
      .filter(wish => {
        if (this.filters.status === "available" && wish.status !== "available") return false;
        if (this.filters.status === "reserved" && wish.status !== "reserved") return false;
        if (this.filters.status === "bought" && wish.status !== "bought") return false;

        if (this.filters.category !== "Alle" && wish.category !== this.filters.category) return false;

        if (this.filters.search) {
          const q = this.filters.search.toLowerCase();
          const matchTitle = (wish.title || "").toLowerCase().includes(q);
          const matchDesc = (wish.description || "").toLowerCase().includes(q);
          const matchNote = (wish.note || "").toLowerCase().includes(q);
          const matchShop = (wish.shopName || "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchNote && !matchShop) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (this.filters.sortBy === "priority") {
          const priorityScore = { high: 3, medium: 2, low: 1 };
          const pA = priorityScore[a.priority] || 2;
          const pB = priorityScore[b.priority] || 2;
          if (pB !== pA) return pB - pA;
          if (a.status === "available" && b.status !== "available") return -1;
          if (b.status === "available" && a.status !== "available") return 1;
          return 0;
        }
        if (this.filters.sortBy === "price-asc") {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        }
        if (this.filters.sortBy === "price-desc") {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        }
        if (this.filters.sortBy === "newest") {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
        return 0;
      });
  }

  getStats() {
    const wishes = this.getWishes();
    const total = wishes.length;
    const available = wishes.filter(w => w.status === "available").length;
    const reserved = wishes.filter(w => w.status === "reserved").length;
    const bought = wishes.filter(w => w.status === "bought").length;
    const highPriority = wishes.filter(w => w.priority === "high").length;
    const taken = reserved + bought;
    const percentReserved = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { total, available, reserved, bought, highPriority, percentReserved };
  }

  // --- Admin-Modus ---
  async loginAdmin(pin) {
    const isValid = await storage.verifyAdminPin(pin);
    if (isValid) {
      this.isAdmin = true;
      sessionStorage.setItem("wunschliste_admin_active", "true");
      storage.setAdminPin(pin);
      this.notify();
      return true;
    }
    return false;
  }

  logoutAdmin() {
    this.isAdmin = false;
    sessionStorage.removeItem("wunschliste_admin_active");
    sessionStorage.removeItem("wunschliste_admin_pin");
    this.notify();
  }

  // --- Modals Steuerung ---
  openModal(modalName, wish = null, extraData = null) {
    this.activeModal = modalName;
    this.selectedWish = wish;
    this.modalExtraData = extraData;
    this.notify();
  }

  closeModal() {
    this.activeModal = null;
    this.selectedWish = null;
    this.modalExtraData = null;
    this.notify();
  }

  // --- Veranstaltungen manipulieren ---
  async saveEvent(eventData) {
    if (!this.isAdmin) {
      throw new Error("Veranstaltungen verwalten ist nur im Admin-Bereich erlaubt.");
    }
    const slug = eventData.slug || eventData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = {
      id: eventData.id || generateId("event"),
      slug: slug || "event",
      title: eventData.title.trim(),
      subtitle: eventData.subtitle ? eventData.subtitle.trim() : "",
      date: eventData.date || "",
      icon: eventData.icon || "🎁",
      isArchived: Boolean(eventData.isArchived)
    };

    this.events = await storage.saveEvent(payload);
    if (!this.activeEventId || eventData.id === this.activeEventId) {
      this.activeEventId = payload.id;
    }
    this.notify();
    return payload;
  }

  async deleteEvent(eventId) {
    if (!this.isAdmin) {
      throw new Error("Veranstaltungen löschen ist nur im Admin-Bereich erlaubt.");
    }
    this.events = await storage.deleteEvent(eventId);
    if (this.activeEventId === eventId) {
      const nextActive = this.events.find(e => !e.isArchived) || this.events[0];
      if (nextActive) {
        this.setActiveEvent(nextActive.id);
      } else {
        this.activeEventId = "";
        this.notify();
      }
    } else {
      this.notify();
    }
    return this.events;
  }

  // --- Wünsche manipulieren ---
  async reserveWish(wishId, userName, note = "", pin = "", asBought = false) {
    const active = this.getActiveEvent();
    if (!active) return false;

    const target = (active.wishes || []).find(w => w.id === wishId);
    if (!target) return false;

    const updated = {
      ...target,
      status: asBought ? "bought" : "reserved",
      reservedBy: userName.trim(),
      reservedAt: new Date().toISOString(),
      reserveNote: note.trim(),
      reservePin: pin.trim()
    };

    storage.setSavedUserName(userName);
    this.events = await storage.updateWish(active.id, updated);
    this.notify();
    return true;
  }

  async cancelReservation(wishId, pinOrAdmin = "") {
    const active = this.getActiveEvent();
    if (!active) return false;

    const target = (active.wishes || []).find(w => w.id === wishId);
    if (!target) return false;

    const isAllowed =
      this.isAdmin ||
      !target.reservePin ||
      target.reservePin === pinOrAdmin ||
      pinOrAdmin === this.settings.adminPin;

    if (!isAllowed) return false;

    const updated = {
      ...target,
      status: "available",
      reservedBy: "",
      reservedAt: null,
      reserveNote: "",
      reservePin: ""
    };

    this.events = await storage.updateWish(active.id, updated);
    this.notify();
    return true;
  }

  async saveWish(wishData, targetEventId = null) {
    if (!this.isAdmin) {
      console.warn("Wünsche anlegen oder bearbeiten ist nur im Admin-Bereich erlaubt.");
      return;
    }
    const eventId = targetEventId || this.activeEventId;
    if (wishData.id) {
      this.events = await storage.updateWish(eventId, wishData);
    } else {
      this.events = await storage.addWish(eventId, wishData);
    }
    this.notify();
  }

  async deleteWish(wishId, targetEventId = null) {
    if (!this.isAdmin) {
      console.warn("Wünsche löschen ist nur im Admin-Bereich erlaubt.");
      return;
    }
    const eventId = targetEventId || this.activeEventId;
    this.events = await storage.deleteWish(eventId, wishId);
    this.notify();
  }

  async importWishes(wishes, mode = "append", targetEventId = null) {
    if (!this.isAdmin) {
      console.warn("Wünsche importieren ist nur im Admin-Bereich erlaubt.");
      return;
    }
    const eventId = targetEventId || this.activeEventId;
    this.events = await storage.importWishesToEvent(eventId, wishes, mode);
    this.notify();
  }

  async changeAdminPin(oldPin, newPin) {
    const res = await storage.changeAdminPin(oldPin, newPin);
    this.settings = storage.loadSettings();
    this.notify();
    return res;
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await storage.saveSettings(this.settings);
    this.notify();
  }
}

export const state = new StateStore();
