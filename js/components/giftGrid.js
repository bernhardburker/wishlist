/**
 * Geschenke-Raster (Grid) Komponente
 */

import { state } from "../state.js";
import { createGiftCardElement } from "./giftCard.js";

export function renderGiftGrid(container) {
  if (state.isLoading) {
    container.innerHTML = `
      <div class="grid-loading">
        <div class="loading-spinner"></div>
        <p>Lade Wunschliste...</p>
      </div>
    `;
    return;
  }

  const wishes = state.getFilteredWishes();

  if (wishes.length === 0) {
    const isFiltered =
      state.filters.search !== "" ||
      state.filters.status !== "all" ||
      state.filters.category !== "Alle";

    if (isFiltered) {
      container.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🔍</div>
          <h3>Keine passenden Wünsche gefunden</h3>
          <p>Für deine aktuellen Filterkriterien gibt es gerade keine Einträge.</p>
          <button id="btn-empty-reset" class="btn btn-primary btn-sm">
            <span>Alle Wünsche anzeigen</span>
          </button>
        </div>
      `;
      const btnReset = container.querySelector("#btn-empty-reset");
      if (btnReset) {
        btnReset.addEventListener("click", () => {
          state.resetFilters();
        });
      }
    } else {
      container.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🎁</div>
          <h3>Die Wunschliste ist noch leer</h3>
          <p>Trage die ersten Wünsche ein, um sie mit Freunden und Familie zu teilen!</p>
          <button id="btn-empty-add" class="btn btn-primary">
            <span>+ Ersten Wunsch anlegen</span>
          </button>
        </div>
      `;
      const btnAdd = container.querySelector("#btn-empty-add");
      if (btnAdd) {
        btnAdd.addEventListener("click", () => {
          if (state.isAdmin) {
            state.openModal("addWish");
          } else {
            state.openModal("admin");
          }
        });
      }
    }
    return;
  }

  // Erstelle das Raster
  const gridWrapper = document.createElement("div");
  gridWrapper.className = "gift-grid";

  wishes.forEach(wish => {
    const cardEl = createGiftCardElement(wish);
    gridWrapper.appendChild(cardEl);
  });

  container.innerHTML = "";
  container.appendChild(gridWrapper);
}
