/**
 * Haupt-Einstiegspunkt der Wunschliste Web-Applikation
 */

import { state } from "./state.js";
import { renderHeader } from "./components/header.js";
import { renderFilterBar } from "./components/filterBar.js";
import { renderGiftGrid } from "./components/giftGrid.js";
import { renderReserveModal } from "./components/reserveModal.js";
import { renderCancelModal } from "./components/cancelModal.js";
import { renderAdminModal } from "./components/adminModal.js";
import { renderConfigModal } from "./components/configModal.js";

let scrollLockPosition = 0;
let isScrollLocked = false;

function setScrollLock(lock) {
  if (lock === isScrollLocked) return;
  isScrollLocked = lock;

  if (lock) {
    scrollLockPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollLockPosition}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  } else {
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    window.scrollTo(0, scrollLockPosition);
  }
}

class App {
  constructor() {
    this.headerContainer = document.getElementById("header-root");
    this.filterContainer = document.getElementById("filter-root");
    this.gridContainer = document.getElementById("grid-root");
    this.modalContainer = document.getElementById("modal-root");
  }

  async init() {
    // State Store Initialisierung
    await state.init();

    // Reagiert auf alle Zustandsänderungen
    state.subscribe(() => this.render());

    // Erste Render-Ausführung
    this.render();
  }

  render() {
    // 1. Header rendern
    if (this.headerContainer) {
      renderHeader(this.headerContainer);
    }

    // 2. Filter- & Suchleiste rendern
    if (this.filterContainer) {
      renderFilterBar(this.filterContainer);
    }

    // 3. Geschenke-Raster rendern
    if (this.gridContainer) {
      renderGiftGrid(this.gridContainer);
    }

    // 4. Modals rendern
    if (this.modalContainer) {
      this.modalContainer.innerHTML = "";

      if (state.activeModal === "reserve" && state.selectedWish) {
        renderReserveModal(this.modalContainer, state.selectedWish, false);
      } else if (state.activeModal === "markBought" && state.selectedWish) {
        renderReserveModal(this.modalContainer, state.selectedWish, true);
      } else if (state.activeModal === "cancel" && state.selectedWish) {
        renderCancelModal(this.modalContainer, state.selectedWish);
      } else if (state.activeModal === "admin" || state.activeModal === "addWish") {
        renderAdminModal(this.modalContainer, state.activeModal, state.selectedWish);
      } else if (state.activeModal === "editWish" && state.selectedWish) {
        renderAdminModal(this.modalContainer, "editWish", state.selectedWish);
      } else if (state.activeModal === "config") {
        renderConfigModal(this.modalContainer);
      }
    }

    // Hintergrund-Scrollen auf Mobilgeräten & Desktop zuverlässig sperren
    setScrollLock(Boolean(state.activeModal));
  }
}

// Initialisiere die App nach dem Laden des DOMs
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
