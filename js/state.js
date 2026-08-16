/**
 * Reaktives State-Management für die Wunschliste
 */

import { storage } from "./storage.js";

class StateStore {
  constructor() {
    this.wishes = [];
    this.settings = storage.loadSettings();
    this.filters = {
      search: "",
      status: "all", // 'all' | 'available' | 'reserved' | 'bought'
      category: "Alle",
      sortBy: "priority" // 'priority' | 'price-asc' | 'price-desc' | 'newest'
    };
    this.isAdmin = sessionStorage.getItem("wunschliste_admin_active") === "true";
    this.activeModal = null;
    this.selectedWish = null;
    this.listeners = new Set();
    this.isLoading = true;
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
      this.wishes = await storage.loadWishes();
      this.settings = storage.loadSettings();
    } catch (err) {
      console.error("Fehler beim Initialisieren der Wünsche:", err);
    } finally {
      this.isLoading = false;
      this.notify();
    }
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

  // --- Gefilterte & Sortierte Wünsche abrufen ---
  getFilteredWishes() {
    return this.wishes
      .filter(wish => {
        // Status Filter
        if (this.filters.status === "available" && wish.status !== "available") return false;
        if (this.filters.status === "reserved" && wish.status !== "reserved") return false;
        if (this.filters.status === "bought" && wish.status !== "bought") return false;

        // Kategorie Filter
        if (this.filters.category !== "Alle" && wish.category !== this.filters.category) return false;

        // Suchtext Filter (Titel, Beschreibung, Notiz, Shop)
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
          // Sekundär: Verfügbare zuerst
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

  // --- Statistiken ---
  getStats() {
    const total = this.wishes.length;
    const available = this.wishes.filter(w => w.status === "available").length;
    const reserved = this.wishes.filter(w => w.status === "reserved").length;
    const bought = this.wishes.filter(w => w.status === "bought").length;
    return { total, available, reserved, bought };
  }

  // --- Admin-Modus ---
  loginAdmin(pin) {
    if (pin === this.settings.adminPin) {
      this.isAdmin = true;
      sessionStorage.setItem("wunschliste_admin_active", "true");
      this.notify();
      return true;
    }
    return false;
  }

  logoutAdmin() {
    this.isAdmin = false;
    sessionStorage.removeItem("wunschliste_admin_active");
    this.notify();
  }

  // --- Modals Steuerung ---
  openModal(modalName, wish = null) {
    this.activeModal = modalName;
    this.selectedWish = wish;
    this.notify();
  }

  closeModal() {
    this.activeModal = null;
    this.selectedWish = null;
    this.notify();
  }

  // --- Wünsche manipulieren ---
  async reserveWish(wishId, userName, note = "", pin = "", asBought = false) {
    const target = this.wishes.find(w => w.id === wishId);
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
    this.wishes = await storage.updateWish(updated);
    this.notify();
    return true;
  }

  async cancelReservation(wishId, pinOrAdmin = "") {
    const target = this.wishes.find(w => w.id === wishId);
    if (!target) return false;

    // Erlaubt wenn Admin aktiv oder kein PIN gesetzt oder PIN stimmt überein
    const isAllowed =
      this.isAdmin ||
      !target.reservePin ||
      target.reservePin === pinOrAdmin ||
      pinOrAdmin === this.settings.adminPin;

    if (!isAllowed) {
      return false;
    }

    const updated = {
      ...target,
      status: "available",
      reservedBy: "",
      reservedAt: null,
      reserveNote: "",
      reservePin: ""
    };

    this.wishes = await storage.updateWish(updated);
    this.notify();
    return true;
  }

  async saveWish(wishData) {
    if (wishData.id) {
      this.wishes = await storage.updateWish(wishData);
    } else {
      this.wishes = await storage.addWish(wishData);
    }
    this.notify();
  }

  async deleteWish(wishId) {
    this.wishes = await storage.deleteWish(wishId);
    this.notify();
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    storage.saveSettings(this.settings);
    this.notify();
  }
}

export const state = new StateStore();
