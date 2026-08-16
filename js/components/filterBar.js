/**
 * Filter- und Suchleiste
 */

import { state } from "../state.js";
import { escapeHtml } from "../utils/helpers.js";

export function renderFilterBar(container) {
  const stats = state.getStats();
  const filters = state.filters;
  const categories = state.settings.categories || ["Alle"];

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.category !== "Alle" ||
    filters.sortBy !== "priority";

  container.innerHTML = `
    <div class="filter-bar-wrapper">
      <div class="filter-main-row">
        <!-- Suchfeld -->
        <div class="search-input-box">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            id="filter-search-input"
            class="search-input"
            placeholder="Geschenke, Wünsche oder Shops durchsuchen..."
            value="${escapeHtml(filters.search)}"
          />
          ${filters.search ? `
            <button id="btn-clear-search" class="clear-search-btn" title="Suche löschen">&times;</button>
          ` : ""}
        </div>

        <!-- Status Filter Pills -->
        <div class="status-pills-group" role="tablist">
          <button
            class="status-pill ${filters.status === 'all' ? 'active' : ''}"
            data-status="all"
          >
            <span>Alle</span>
            <span class="pill-badge">${stats.total}</span>
          </button>

          <button
            class="status-pill ${filters.status === 'available' ? 'active' : ''}"
            data-status="available"
          >
            <span>✨ Noch frei</span>
            <span class="pill-badge pill-badge-green">${stats.available}</span>
          </button>

          <button
            class="status-pill ${filters.status === 'reserved' ? 'active' : ''}"
            data-status="reserved"
          >
            <span>🔒 Reserviert</span>
            <span class="pill-badge pill-badge-amber">${stats.reserved}</span>
          </button>

          ${stats.bought > 0 ? `
            <button
              class="status-pill ${filters.status === 'bought' ? 'active' : ''}"
              data-status="bought"
            >
              <span>🎁 Gekauft</span>
              <span class="pill-badge">${stats.bought}</span>
            </button>
          ` : ""}
        </div>
      </div>

      <div class="filter-secondary-row">
        <div class="selects-group">
          <!-- Kategorie -->
          <div class="select-wrapper">
            <label for="category-select" class="select-label">Kategorie:</label>
            <select id="category-select" class="custom-select">
              ${categories.map(cat => `
                <option value="${escapeHtml(cat)}" ${filters.category === cat ? "selected" : ""}>
                  ${escapeHtml(cat)}
                </option>
              `).join("")}
            </select>
          </div>

          <!-- Sortierung -->
          <div class="select-wrapper">
            <label for="sort-select" class="select-label">Sortieren:</label>
            <select id="sort-select" class="custom-select">
              <option value="priority" ${filters.sortBy === "priority" ? "selected" : ""}>⭐ Lieblingswünsche zuerst</option>
              <option value="price-asc" ${filters.sortBy === "price-asc" ? "selected" : ""}>💶 Preis: Günstigste zuerst</option>
              <option value="price-desc" ${filters.sortBy === "price-desc" ? "selected" : ""}>💎 Preis: Teuerste zuerst</option>
              <option value="newest" ${filters.sortBy === "newest" ? "selected" : ""}>🕒 Neueste zuerst</option>
            </select>
          </div>
        </div>

        ${hasActiveFilters ? `
          <button id="btn-reset-filters" class="btn-reset-filters">
            <span>↺ Filter zurücksetzen</span>
          </button>
        ` : ""}
      </div>
    </div>
  `;

  // Event Handlers
  const searchInput = container.querySelector("#filter-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.setSearch(e.target.value);
    });
  }

  const clearSearchBtn = container.querySelector("#btn-clear-search");
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      state.setSearch("");
    });
  }

  container.querySelectorAll(".status-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      state.setStatusFilter(pill.getAttribute("data-status"));
    });
  });

  const categorySelect = container.querySelector("#category-select");
  if (categorySelect) {
    categorySelect.addEventListener("change", (e) => {
      state.setCategoryFilter(e.target.value);
    });
  }

  const sortSelect = container.querySelector("#sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.setSortBy(e.target.value);
    });
  }

  const resetBtn = container.querySelector("#btn-reset-filters");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.resetFilters();
    });
  }
}
