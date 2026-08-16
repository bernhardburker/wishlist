/**
 * Header-Komponente mit Event-Umschalter, Burkerserver-Status, Sharing & Statistiken
 */

import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml } from "../utils/helpers.js";
import { toast } from "./toast.js";

function renderDateBadge(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    const options = { year: "numeric", month: "long", day: "numeric" };
    const formatted = d.toLocaleDateString("de-DE", options);

    // Berechne verbleibende Tage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let relative = "";
    if (diffDays === 0) relative = "Heute!";
    else if (diffDays === 1) relative = "Morgen";
    else if (diffDays > 1) relative = `noch ${diffDays} Tage`;
    else if (diffDays < 0) relative = `vor ${Math.abs(diffDays)} Tagen`;

    return `<div class="event-date-badge" title="Datum der Feier: ${formatted}">
      <span class="date-icon">🗓️</span>
      <span class="date-text">${formatted} (${relative})</span>
    </div>`;
  } catch (e) {
    return "";
  }
}

export function renderHeader(container) {
  const stats = state.getStats();
  const activeEvent = state.getActiveEvent() || {
    title: "Unsere Wunschliste 🎁",
    subtitle: "Herzlich willkommen!",
    icon: "🎁"
  };
  const events = state.events || [];

  container.innerHTML = `
    <header class="app-header">
      <div class="header-top-bar">
        <div class="brand-badge">
          <span class="brand-icon">${escapeHtml(activeEvent.icon || "🎁")}</span>
          <span class="brand-name">Wunschliste</span>
        </div>

        <div class="header-actions">
          <!-- Event Umschalter (falls mehrere Events existieren) -->
          ${events.length > 1 ? `
            <div class="event-switcher-wrapper">
              <label for="event-select-dropdown" class="sr-only">Veranstaltung:</label>
              <select id="event-select-dropdown" class="event-select-dropdown">
                ${events.map(ev => `
                  <option value="${escapeHtml(ev.id)}" ${ev.id === state.activeEventId ? "selected" : ""}>
                    ${escapeHtml(ev.icon || "🎁")} ${escapeHtml(ev.title)} (${(ev.wishes || []).length})
                  </option>
                `).join("")}
              </select>
            </div>
          ` : ""}

          <!-- Link für Gäste kopieren -->
          <button id="btn-share-link" class="action-pill-btn btn-share-link" title="Diesen Link an Gäste / Verwandte senden">
            <span>📋 Link teilen</span>
          </button>

          <button id="btn-server-status" class="action-pill-btn server-online" title="Verbunden mit Burkerserver (Klicke für Status)">
            <span class="status-dot"></span>
            <span class="btn-text">🖥️ Burkerserver</span>
          </button>

          ${state.isAdmin ? `
            <button id="btn-add-wish-header" class="btn btn-primary btn-sm">
              <span>+ Wunsch anlegen</span>
            </button>
            <button id="btn-admin-settings" class="btn btn-secondary btn-sm" title="Veranstaltungen, Import & Einstellungen">
              <span>⚙️ Verwaltung</span>
            </button>
            <button id="btn-admin-logout" class="btn btn-ghost btn-sm" title="Admin-Modus beenden">
              <span>🔒 Abmelden</span>
            </button>
          ` : `
            <button id="btn-open-admin" class="btn btn-ghost btn-sm" title="Admin-Bereich öffnen (PIN)">
              <span>🔐 Verwalten</span>
            </button>
          `}
        </div>
      </div>

      <div class="header-hero">
        <div class="hero-icon-large">${escapeHtml(activeEvent.icon || "🎁")}</div>
        <h1 class="header-title">${escapeHtml(activeEvent.title)}</h1>
        ${activeEvent.subtitle ? `<p class="header-subtitle">${escapeHtml(activeEvent.subtitle)}</p>` : ""}
        ${renderDateBadge(activeEvent.date)}
      </div>

      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-value">${stats.total}</span>
          <span class="stat-label">Gesamtwünsche</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-card">
          <span class="stat-value stat-available">${stats.available}</span>
          <span class="stat-label">Noch frei</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-card">
          <span class="stat-value stat-reserved">${stats.reserved}</span>
          <span class="stat-label">Bereits reserviert</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-card">
          <span class="stat-value">${stats.highPriority}</span>
          <span class="stat-label">Besonders wichtig</span>
        </div>
      </div>

      ${stats.total > 0 ? `
        <div class="progress-container" title="${stats.percentReserved}% der Geschenke reserviert">
          <div class="progress-bar" style="width: ${stats.percentReserved}%;"></div>
        </div>
      ` : ""}
    </header>
  `;

  // Event Switcher Listener
  const eventSelect = container.querySelector("#event-select-dropdown");
  if (eventSelect) {
    eventSelect.addEventListener("change", (e) => {
      state.setActiveEvent(e.target.value);
    });
  }

  // Share Link Button
  const shareBtn = container.querySelector("#btn-share-link");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const active = state.getActiveEvent();
      const currentUrl = window.location.origin + window.location.pathname + (active ? `#${active.slug || active.id}` : "");
      navigator.clipboard.writeText(currentUrl).then(() => {
        toast.success("Direktlink für Gäste in die Zwischenablage kopiert! 📋");
      }).catch(() => {
        prompt("Kopiere diesen Link für deine Gäste:", currentUrl);
      });
    });
  }

  // Server Status Modal Button & Connectivity Check
  const btnServer = container.querySelector("#btn-server-status");
  if (btnServer) {
    btnServer.addEventListener("click", () => state.openModal("config"));
    storage.testServerConnection().then(res => {
      if (!res.success) {
        btnServer.classList.remove("server-online");
        btnServer.classList.add("server-offline");
        btnServer.title = `Burkerserver getrennt: ${res.message}`;
      } else {
        btnServer.classList.remove("server-offline");
        btnServer.classList.add("server-online");
        btnServer.title = `Burkerserver verbunden (${storage.getApiBaseUrl() || "Lokal"})`;
      }
    });
  }

  const btnOpenAdmin = container.querySelector("#btn-open-admin");
  if (btnOpenAdmin) {
    btnOpenAdmin.addEventListener("click", () => state.openModal("admin"));
  }

  const btnAddWish = container.querySelector("#btn-add-wish-header");
  if (btnAddWish) {
    btnAddWish.addEventListener("click", () => state.openModal("addWish"));
  }

  const btnAdminSettings = container.querySelector("#btn-admin-settings");
  if (btnAdminSettings) {
    btnAdminSettings.addEventListener("click", () => state.openModal("admin"));
  }

  const btnAdminLogout = container.querySelector("#btn-admin-logout");
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", () => state.logoutAdmin());
  }
}
