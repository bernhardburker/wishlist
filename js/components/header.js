/**
 * Header-Komponente mit Multi-Event-Umschalter, Direktlink-Kopierer und Schnellstatistik
 */

import { state } from "../state.js";
import { escapeHtml } from "../utils/helpers.js";
import { storage } from "../storage.js";
import { toast } from "./toast.js";

function formatDateBadge(dateStr) {
  if (!dateStr) return "";
  try {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    const formatted = eventDate.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    let relative = "";
    if (diffDays === 0) relative = "Heute! 🎉";
    else if (diffDays === 1) relative = "Morgen! 🎈";
    else if (diffDays > 1) relative = `in ${diffDays} Tagen`;
    else relative = "Bereits stattgefunden";

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
  const cloudConfig = storage.getCloudConfig();
  const isCloudActive = cloudConfig.enabled && cloudConfig.url;

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

          <button id="btn-cloud-status" class="action-pill-btn ${isCloudActive ? 'cloud-online' : 'cloud-local'}" title="${isCloudActive ? 'Echtzeit Cloud-Sync aktiv' : 'Lokaler Demo-Modus (Klicke für Cloud-Setup)'}">
            <span class="status-dot"></span>
            <span class="btn-text">${isCloudActive ? 'Cloud Synchron' : 'Lokal / Offline'}</span>
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

      <div class="hero-section">
        ${formatDateBadge(activeEvent.date)}
        <h1 class="hero-title">${escapeHtml(activeEvent.title || "Unsere Wunschliste")}</h1>
        <p class="hero-subtitle">${escapeHtml(activeEvent.subtitle || "Hier sind alle Geschenkideen gesammelt.")}</p>

        <div class="stats-overview">
          <div class="stat-card">
            <span class="stat-value">${stats.total}</span>
            <span class="stat-label">Wünsche gesamt</span>
          </div>
          <div class="stat-card stat-available">
            <span class="stat-value">${stats.available}</span>
            <span class="stat-label">Noch verfügbar</span>
          </div>
          <div class="stat-card stat-reserved">
            <span class="stat-value">${stats.reserved + stats.bought}</span>
            <span class="stat-label">Bereits vergeben</span>
          </div>
        </div>
      </div>
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
        toast.success("Direktlink für diese Veranstaltung in die Zwischenablage kopiert! 📋");
      }).catch(() => {
        prompt("Kopiere diesen Link für deine Gäste:", currentUrl);
      });
    });
  }

  // Other buttons
  const btnCloud = container.querySelector("#btn-cloud-status");
  if (btnCloud) {
    btnCloud.addEventListener("click", () => state.openModal("config"));
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
