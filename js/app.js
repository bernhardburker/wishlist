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

    // Hintergrund-Scrollen sperren, wenn ein Modal aktiv ist
    const hasModal = Boolean(state.activeModal);
    document.documentElement.classList.toggle("modal-open", hasModal);
    document.body.classList.toggle("modal-open", hasModal);
  }
}

// Initialisiere die App nach dem Laden des DOMs
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
