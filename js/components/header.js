/**
 * Header-Komponente mit Titel, Anlass-Text, Schnellstatistik und Admin-Navigation
 */

import { state } from "../state.js";
import { escapeHtml } from "../utils/helpers.js";
import { storage } from "../storage.js";

export function renderHeader(container) {
  const stats = state.getStats();
  const settings = state.settings;
  const cloudConfig = storage.getCloudConfig();

  const isCloudActive = cloudConfig.enabled && cloudConfig.url;

  container.innerHTML = `
    <header class="app-header">
      <div class="header-top-bar">
        <div class="brand-badge">
          <span class="brand-icon">🎁</span>
          <span class="brand-name">Wunschliste</span>
        </div>

        <div class="header-actions">
          <button id="btn-cloud-status" class="action-pill-btn ${isCloudActive ? 'cloud-online' : 'cloud-local'}" title="${isCloudActive ? 'Echtzeit Cloud-Sync aktiv' : 'Lokaler Demo-Modus (Klicke für Cloud-Setup)'}">
            <span class="status-dot"></span>
            <span class="btn-text">${isCloudActive ? 'Cloud Synchron' : 'Lokal / Offline'}</span>
          </button>

          ${state.isAdmin ? `
            <button id="btn-add-wish-header" class="btn btn-primary btn-sm">
              <span>+ Wunsch anlegen</span>
            </button>
            <button id="btn-admin-settings" class="btn btn-secondary btn-sm" title="Einstellungen & Daten">
              <span>⚙️ Einstellungen</span>
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
        <h1 class="hero-title">${escapeHtml(settings.listTitle || "Unsere Wunschliste")}</h1>
        <p class="hero-subtitle">${escapeHtml(settings.listSubtitle || "Hier sind alle Geschenkideen gesammelt.")}</p>

        <div class="stats-overview">
          <div class="stat-card">
            <span class="stat-value">${stats.total}</span>
            <span class="stat-label">Geschenke gesamt</span>
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

  // Event Listeners
  const btnCloud = container.querySelector("#btn-cloud-status");
  if (btnCloud) {
    btnCloud.addEventListener("click", () => {
      state.openModal("config");
    });
  }

  const btnOpenAdmin = container.querySelector("#btn-open-admin");
  if (btnOpenAdmin) {
    btnOpenAdmin.addEventListener("click", () => {
      state.openModal("admin");
    });
  }

  const btnAddWish = container.querySelector("#btn-add-wish-header");
  if (btnAddWish) {
    btnAddWish.addEventListener("click", () => {
      state.openModal("addWish");
    });
  }

  const btnAdminSettings = container.querySelector("#btn-admin-settings");
  if (btnAdminSettings) {
    btnAdminSettings.addEventListener("click", () => {
      state.openModal("admin");
    });
  }

  const btnAdminLogout = container.querySelector("#btn-admin-logout");
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", () => {
      state.logoutAdmin();
    });
  }
}
