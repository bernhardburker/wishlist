/**
 * Admin-Modal zur Verwaltung von Wünschen, Multi-Events, CSV/JSON-Import & Einstellungen
 */

import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml, generateId, formatCurrency } from "../utils/helpers.js";
import { detectShop } from "../utils/shopHelper.js";
import { parseWishesFromCsv, downloadCsvTemplate } from "../utils/csvHelper.js";
import { toast } from "./toast.js";

export function renderAdminModal(container, modalType = "admin", editingWish = null) {
  const isAdmin = state.isAdmin;
  const isEditing = Boolean(editingWish);
  const events = state.events || [];
  const activeEvent = state.getActiveEvent();

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";

  const closeModal = () => {
    modalOverlay.classList.add("modal-leaving");
    setTimeout(() => {
      state.closeModal();
    }, 200);
  };

  // --- 1. PIN EINGABE (Falls noch nicht eingeloggt) ---
  if (!isAdmin) {
    modalOverlay.innerHTML = `
      <div class="modal-card modal-admin-auth" role="dialog">
        <div class="modal-header">
          <h2 class="modal-title">🔐 Admin-Bereich entsperren</h2>
          <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-intro">
            Gib deinen Admin-PIN ein, um Veranstaltungen und Wünsche zu verwalten oder neue Wünsche anzulegen.
          </p>
          <form id="form-admin-login">
            <div class="form-group">
              <label for="admin-pin-input" class="form-label required-label">Admin-PIN:</label>
              <input
                type="password"
                id="admin-pin-input"
                class="form-input"
                placeholder="4-stellige Admin-PIN eingeben"
                required
                autofocus
              />
              <span class="form-hint">Zugriff nur für berechtigte Listen-Verwalter.</span>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
              <button type="submit" class="btn btn-primary">
                <span>Entsperren 🔓</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    modalOverlay.querySelector(".modal-close-btn").addEventListener("click", closeModal);
    modalOverlay.querySelector(".btn-cancel-modal").addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    const loginForm = modalOverlay.querySelector("#form-admin-login");
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pinInput = loginForm.querySelector("#admin-pin-input");
      const pin = pinInput.value.trim();
      const submitBtn = loginForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Prüfe...";

      const success = await state.loginAdmin(pin);
      submitBtn.disabled = false;
      submitBtn.textContent = "Entsperren 🔓";

      if (success) {
        toast.success("Admin-Modus erfolgreich aktiviert!");
        state.openModal(modalType, editingWish);
      } else {
        toast.error("Falscher PIN! Bitte versuche es erneut.");
        pinInput.value = "";
        pinInput.focus();
      }
    });

    container.appendChild(modalOverlay);
    return;
  }

  // --- 2. ADMIN INTERFACE ---
  let activeTab = "events";
  if (modalType === "addWish" || modalType === "editWish") activeTab = "wish";

  const settings = state.settings;
  const wishData = editingWish || {
    id: "",
    title: "",
    url: "",
    price: "",
    category: "Spielzeug",
    priority: "medium",
    image: "",
    description: "",
    note: "",
    shopName: ""
  };

  modalOverlay.innerHTML = `
    <div class="modal-card modal-admin-dashboard" role="dialog">
      <div class="modal-header">
        <h2 class="modal-title">⚙️ Wunschlisten-Verwaltung</h2>
        <button class="modal-close-btn">&times;</button>
      </div>

      <div class="modal-tabs">
        <button class="tab-btn ${activeTab === 'events' ? 'active' : ''}" data-tab="tab-events">
          📅 Veranstaltungen (${events.length})
        </button>
        <button class="tab-btn ${activeTab === 'wish' ? 'active' : ''}" data-tab="tab-wish">
          ${isEditing ? "✏️ Wunsch bearbeiten" : "+ Wunsch anlegen"}
        </button>
        <button class="tab-btn ${activeTab === 'import' ? 'active' : ''}" data-tab="tab-import">
          📥 Datei-Import (CSV/JSON)
        </button>
        <button class="tab-btn ${activeTab === 'settings' ? 'active' : ''}" data-tab="tab-settings">
          💾 Backup &amp; PIN
        </button>
      </div>

      <div class="modal-body modal-body-scrollable">

        <!-- TAB 1: VERANSTALTUNGEN -->
        <div id="tab-events" class="tab-content ${activeTab === 'events' ? 'active' : ''}">
          <div class="tab-section-header">
            <div>
              <h3>Veranstaltungen &amp; Anlässe</h3>
              <p class="form-hint">Erstelle eigene Wunschlisten für Geburtstage, Weihnachten, Hochzeiten etc.</p>
            </div>
            <button id="btn-show-add-event" class="btn btn-primary btn-sm">
              <span>+ Neue Veranstaltung</span>
            </button>
          </div>

          <!-- Formular: Neues / Bearbeitetes Event (zunächst versteckt) -->
          <div id="event-editor-card" class="event-editor-card" style="display: none;">
            <h4 id="event-editor-title">Neue Veranstaltung anlegen</h4>
            <form id="form-event-editor">
              <input type="hidden" id="event-edit-id" value="" />
              <div class="form-row-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label for="event-title-input" class="form-label required-label">Name der Veranstaltung:</label>
                  <input type="text" id="event-title-input" class="form-input" placeholder="z. B. Emilias 4. Geburtstag" required />
                </div>
                <div class="form-group">
                  <label for="event-icon-input" class="form-label">Symbol / Icon:</label>
                  <input type="text" id="event-icon-input" class="form-input" placeholder="🎂, 🎄, 💍, 🍼" value="🎁" />
                </div>
              </div>

              <div class="form-row-grid">
                <div class="form-group" style="grid-column: span 2;">
                  <label for="event-date-input" class="form-label">Datum der Feier (optional):</label>
                  <input type="date" id="event-date-input" class="form-input" />
                </div>
                <div class="form-group">
                  <label for="event-slug-input" class="form-label">URL-Kürzel (Link):</label>
                  <input type="text" id="event-slug-input" class="form-input" placeholder="geburtstag-2026" />
                </div>
              </div>

              <div class="form-group">
                <label for="event-subtitle-input" class="form-label">Begrüßungstext für die Gäste:</label>
                <textarea id="event-subtitle-input" class="form-textarea" rows="2" placeholder="Herzlich willkommen! Hier findet ihr alle Geschenkideen..."></textarea>
              </div>

              <div class="modal-actions" style="margin-top: 0.5rem;">
                <button type="button" id="btn-cancel-event-edit" class="btn btn-ghost btn-sm">Abbrechen</button>
                <button type="submit" class="btn btn-primary btn-sm">Speichern</button>
              </div>
            </form>
            <hr class="divider" />
          </div>

          <!-- Liste der existierenden Events -->
          <div class="events-list">
            ${events.map(ev => `
              <div class="event-list-item ${ev.id === state.activeEventId ? 'is-current' : ''}">
                <div class="event-item-icon">${escapeHtml(ev.icon || "🎁")}</div>
                <div class="event-item-info">
                  <div class="event-item-title-row">
                    <strong>${escapeHtml(ev.title)}</strong>
                    ${ev.id === state.activeEventId ? '<span class="badge badge-active-event">Aktiv</span>' : ''}
                  </div>
                  <span class="event-item-meta">
                    ${(ev.wishes || []).length} Wünsche &bull; ${ev.date ? `🗓️ ${ev.date}` : "Kein Datum"} &bull; Link: <code>#${escapeHtml(ev.slug || ev.id)}</code>
                  </span>
                </div>
                <div class="event-item-actions">
                  ${ev.id !== state.activeEventId ? `
                    <button class="btn btn-sm btn-outline btn-switch-event" data-id="${ev.id}" title="Als aktuelle Ansicht öffnen">
                      Öffnen ↗
                    </button>
                  ` : ''}
                  <button class="btn btn-sm btn-ghost btn-edit-event" data-id="${ev.id}" title="Bearbeiten">
                    ✏️
                  </button>
                  ${events.length > 1 ? `
                    <button class="btn btn-sm btn-ghost btn-delete-event" data-id="${ev.id}" title="Löschen">
                      🗑️
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- TAB 2: WUNSCH ANLEGEN / BEARBEITEN -->
        <div id="tab-wish" class="tab-content ${activeTab === 'wish' ? 'active' : ''}">
          <form id="form-wish-editor">
            <input type="hidden" id="wish-id" value="${escapeHtml(wishData.id)}" />

            <div class="form-group">
              <label for="wish-target-event" class="form-label required-label">Zu welcher Veranstaltung hinzufügen?</label>
              <select id="wish-target-event" class="form-select">
                ${events.map(ev => `
                  <option value="${escapeHtml(ev.id)}" ${ev.id === state.activeEventId ? "selected" : ""}>
                    ${escapeHtml(ev.icon || "🎁")} ${escapeHtml(ev.title)}
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="form-group">
              <label for="wish-title" class="form-label required-label">Name des Geschenks / Titel:</label>
              <input
                type="text"
                id="wish-title"
                class="form-input"
                placeholder="z. B. LEGO City Arktis-Expedition oder Toniebox Figur"
                required
                value="${escapeHtml(wishData.title)}"
              />
            </div>

            <div class="form-group">
              <label for="wish-url" class="form-label">Shop-Link / URL:</label>
              <input
                type="url"
                id="wish-url"
                class="form-input"
                placeholder="https://www.smythstoys.com/... oder https://amazon.de/..."
                value="${escapeHtml(wishData.url)}"
              />
              <span id="shop-detected-hint" class="form-hint">
                Füge einen Link von Amazon, Smyths Toys, Thalia etc. ein – der Shop wird automatisch erkannt.
              </span>
            </div>

            <div class="form-row-grid">
              <div class="form-group">
                <label for="wish-price" class="form-label">Preis (in €):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  id="wish-price"
                  class="form-input"
                  placeholder="z. B. 29.99"
                  value="${wishData.price || ''}"
                />
              </div>

              <div class="form-group">
                <label for="wish-category" class="form-label">Kategorie:</label>
                <select id="wish-category" class="form-select">
                  ${(settings.categories || []).filter(c => c !== "Alle").map(cat => `
                    <option value="${escapeHtml(cat)}" ${wishData.category === cat ? "selected" : ""}>
                      ${escapeHtml(cat)}
                    </option>
                  `).join("")}
                </select>
              </div>

              <div class="form-group">
                <label for="wish-priority" class="form-label">Priorität:</label>
                <select id="wish-priority" class="form-select">
                  <option value="high" ${wishData.priority === 'high' ? 'selected' : ''}>⭐ Lieblingswunsch (oben)</option>
                  <option value="medium" ${wishData.priority === 'medium' || !wishData.priority ? 'selected' : ''}>Normaler Wunsch</option>
                  <option value="low" ${wishData.priority === 'low' ? 'selected' : ''}>Wäre auch nett (niedrig)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="wish-image" class="form-label">Bild-URL (Produktfoto):</label>
              <input
                type="url"
                id="wish-image"
                class="form-input"
                placeholder="https://... (Bildadresse aus dem Shop)"
                value="${escapeHtml(wishData.image)}"
              />
            </div>

            <div class="form-group">
              <label for="wish-description" class="form-label">Beschreibung:</label>
              <textarea
                id="wish-description"
                class="form-textarea"
                rows="2"
                placeholder="Kurze Erklärung zum Geschenk..."
              >${escapeHtml(wishData.description)}</textarea>
            </div>

            <div class="form-group">
              <label for="wish-note" class="form-label">Details / Notizen (Größe, Farbe, Modell):</label>
              <input
                type="text"
                id="wish-note"
                class="form-input"
                placeholder="z. B. Größe 116, Farbe Blau"
                value="${escapeHtml(wishData.note)}"
              />
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
              <button type="submit" class="btn btn-primary">
                <span>${isEditing ? "Änderungen speichern" : "+ Wunsch hinzufügen"}</span>
              </button>
            </div>
          </form>
        </div>

        <!-- TAB 3: DATEI-IMPORT (CSV / JSON) -->
        <div id="tab-import" class="tab-content ${activeTab === 'import' ? 'active' : ''}">
          <div class="import-section">
            <div class="import-header-card">
              <div>
                <h4>📥 Geschenke per Datei importieren</h4>
                <p class="form-hint">
                  Lade eine <strong>CSV-Datei</strong> (z. B. aus Excel oder Google Sheets) oder eine JSON-Datei hoch, um viele Geschenke auf einmal hinzuzufügen.
                </p>
              </div>
              <button id="btn-download-csv-template" class="btn btn-outline btn-sm" type="button">
                <span>📄 CSV-Mustervorlage laden</span>
              </button>
            </div>

            <div class="form-group">
              <label for="import-target-event" class="form-label required-label">Ziel-Veranstaltung:</label>
              <select id="import-target-event" class="form-select">
                ${events.map(ev => `
                  <option value="${escapeHtml(ev.id)}" ${ev.id === state.activeEventId ? "selected" : ""}>
                    ${escapeHtml(ev.icon || "🎁")} ${escapeHtml(ev.title)} (${(ev.wishes || []).length} Wünsche)
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="file-dropzone" id="file-dropzone">
              <input type="file" id="file-import-wishes" accept=".csv, .json, text/csv, application/json" style="display:none;" />
              <div class="dropzone-content">
                <span class="dropzone-icon">📁</span>
                <p><strong>CSV- oder JSON-Datei hierher ziehen</strong> oder klicken zum Auswählen</p>
                <span class="form-hint">Unterstützt Semikolon (;) und Komma (,) getrennte Tabellen</span>
              </div>
            </div>

            <!-- Import Vorschau -->
            <div id="import-preview-box" class="import-preview-box" style="display:none;">
              <h4 id="import-preview-title">Vorschau der erkannten Geschenke</h4>
              <div class="table-responsive">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Titel</th>
                      <th>Shop</th>
                      <th>Preis</th>
                      <th>Kategorie</th>
                      <th>Priorität</th>
                    </tr>
                  </thead>
                  <tbody id="import-preview-tbody"></tbody>
                </table>
              </div>

              <div class="import-mode-selection">
                <label class="radio-label">
                  <input type="radio" name="importMode" value="append" checked />
                  <span>An bestehende Wünsche <strong>anhängen</strong></span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="importMode" value="replace" />
                  <span>Bestehende Wünsche dieser Veranstaltung <strong>ersetzen</strong></span>
                </label>
              </div>

              <div class="modal-actions" style="margin-top: 1rem;">
                <button type="button" id="btn-cancel-import-preview" class="btn btn-ghost">Verwerfen</button>
                <button type="button" id="btn-execute-import" class="btn btn-primary">
                  <span>Geschenke jetzt importieren 🚀</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 4: BACKUP & EINSTELLUNGEN -->
        <div id="tab-settings" class="tab-content">
          <div class="backup-section">
            <h4>🔑 Admin-Sicherheit</h4>
            <form id="form-admin-pin-settings" style="margin-bottom: 1.5rem;">
              <div class="form-group">
                <label for="setting-admin-pin" class="form-label">Admin-PIN ändern:</label>
                <div class="input-with-action">
                  <input
                    type="password"
                    id="setting-admin-pin"
                    class="form-input"
                    placeholder="Neue 4-stellige PIN"
                    value="${escapeHtml(settings.adminPin || '')}"
                    required
                  />
                  <button type="button" id="btn-toggle-setting-pin" class="btn-input-action" title="PIN anzeigen/verbergen">
                    👁️
                  </button>
                </div>
                <span class="form-hint">Mit dieser PIN entsperrst du den Verwaltungsbereich.</span>
              </div>
              <button type="submit" class="btn btn-sm btn-secondary">PIN speichern</button>
            </form>

            <hr class="divider" />

            <h4>💾 Komplettes Backup aller Veranstaltungen (Export)</h4>
            <p class="form-hint">Sichere alle Veranstaltungen und Wünsche in einer einzigen JSON-Datei.</p>
            <button id="btn-export-backup" class="btn btn-secondary">
              <span>📥 Backup als JSON herunterladen</span>
            </button>

            <hr class="divider" />

            <h4>📂 Backup wiederherstellen (Import)</h4>
            <p class="form-hint">Stelle ein vollständiges Backup aller Veranstaltungen wieder her.</p>
            <input type="file" id="file-import-backup" accept=".json" style="display: none;" />
            <button id="btn-trigger-import-backup" class="btn btn-outline">
              <span>📤 JSON-Backup wiederherstellen</span>
            </button>

            <hr class="divider" />

            <h4>⚠️ Auf Standard-Musterliste zurücksetzen</h4>
            <button id="btn-reset-defaults" class="btn btn-ghost btn-danger-text">
              <span>↺ Auf Standard-Veranstaltungen zurücksetzen</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Close logic
  modalOverlay.querySelector(".modal-close-btn").addEventListener("click", closeModal);
  modalOverlay.querySelectorAll(".btn-cancel-modal").forEach(btn => btn.addEventListener("click", closeModal));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Tab switching logic
  const tabBtns = modalOverlay.querySelectorAll(".tab-btn");
  const tabContents = modalOverlay.querySelectorAll(".tab-content");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = modalOverlay.querySelector(`#${targetId}`);
      if (target) target.classList.add("active");
    });
  });

  // ==========================================
  // EVENT MANAGEMENT HANDLERS
  // ==========================================
  const eventEditorCard = modalOverlay.querySelector("#event-editor-card");
  const btnShowAddEvent = modalOverlay.querySelector("#btn-show-add-event");
  const btnCancelEventEdit = modalOverlay.querySelector("#btn-cancel-event-edit");
  const formEventEditor = modalOverlay.querySelector("#form-event-editor");

  if (btnShowAddEvent && eventEditorCard) {
    btnShowAddEvent.addEventListener("click", () => {
      modalOverlay.querySelector("#event-editor-title").textContent = "Neue Veranstaltung anlegen";
      modalOverlay.querySelector("#event-edit-id").value = "";
      modalOverlay.querySelector("#event-title-input").value = "";
      modalOverlay.querySelector("#event-icon-input").value = "🎁";
      modalOverlay.querySelector("#event-date-input").value = "";
      modalOverlay.querySelector("#event-slug-input").value = "";
      modalOverlay.querySelector("#event-subtitle-input").value = "";
      eventEditorCard.style.display = "block";
      modalOverlay.querySelector("#event-title-input").focus();
    });
  }

  if (btnCancelEventEdit && eventEditorCard) {
    btnCancelEventEdit.addEventListener("click", () => {
      eventEditorCard.style.display = "none";
    });
  }

  if (formEventEditor) {
    formEventEditor.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = modalOverlay.querySelector("#event-edit-id").value;
      const title = modalOverlay.querySelector("#event-title-input").value.trim();
      const icon = modalOverlay.querySelector("#event-icon-input").value.trim() || "🎁";
      const date = modalOverlay.querySelector("#event-date-input").value;
      const slug = modalOverlay.querySelector("#event-slug-input").value.trim();
      const subtitle = modalOverlay.querySelector("#event-subtitle-input").value.trim();

      const submitBtn = formEventEditor.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Speichere...";

      try {
        const saved = await state.saveEvent({ id, title, icon, date, slug, subtitle });
        toast.success(`Veranstaltung "${escapeHtml(title)}" gespeichert!`);
        if (saved && saved.id) {
          state.setActiveEvent(saved.id);
        }
        eventEditorCard.style.display = "none";
      } catch (err) {
        toast.error(`Fehler beim Speichern der Veranstaltung: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.textContent = "Speichern";
      }
    });
  }

  // Event List Actions
  modalOverlay.querySelectorAll(".btn-switch-event").forEach(btn => {
    btn.addEventListener("click", () => {
      state.setActiveEvent(btn.getAttribute("data-id"));
      toast.info("Zur ausgewählten Veranstaltung gewechselt.");
      state.closeModal();
    });
  });

  modalOverlay.querySelectorAll(".btn-edit-event").forEach(btn => {
    btn.addEventListener("click", () => {
      const evId = btn.getAttribute("data-id");
      const ev = (state.events || []).find(e => e.id === evId);
      if (ev) {
        modalOverlay.querySelector("#event-editor-title").textContent = `Veranstaltung bearbeiten: ${ev.title}`;
        modalOverlay.querySelector("#event-edit-id").value = ev.id;
        modalOverlay.querySelector("#event-title-input").value = ev.title;
        modalOverlay.querySelector("#event-icon-input").value = ev.icon || "🎁";
        modalOverlay.querySelector("#event-date-input").value = ev.date || "";
        modalOverlay.querySelector("#event-slug-input").value = ev.slug || "";
        modalOverlay.querySelector("#event-subtitle-input").value = ev.subtitle || "";
        eventEditorCard.style.display = "block";
      }
    });
  });

  modalOverlay.querySelectorAll(".btn-delete-event").forEach(btn => {
    btn.addEventListener("click", async () => {
      const evId = btn.getAttribute("data-id");
      const ev = (state.events || []).find(e => e.id === evId);
      const title = ev ? ev.title : "diese Veranstaltung";
      if (confirm(`Möchtest du die Veranstaltung "${title}" wirklich löschen? Alle zugehörigen Wünsche werden dauerhaft gelöscht.`)) {
        try {
          await state.deleteEvent(evId);
          toast.info(`Veranstaltung "${escapeHtml(title)}" wurde gelöscht.`);
        } catch (err) {
          toast.error(err.message || "Fehler beim Löschen");
          if (err.message && err.message.includes("Admin-PIN")) {
            state.logoutAdmin();
            state.openModal("admin");
          }
        }
      }
    });
  });

  // ==========================================
  // WISH FORM HANDLERS
  // ==========================================
  const urlInput = modalOverlay.querySelector("#wish-url");
  const shopHint = modalOverlay.querySelector("#shop-detected-hint");
  if (urlInput && shopHint) {
    urlInput.addEventListener("input", () => {
      const detected = detectShop(urlInput.value.trim());
      if (urlInput.value.trim()) {
        shopHint.innerHTML = `Erkannter Shop: <strong>${detected.icon} ${escapeHtml(detected.name)}</strong>`;
      } else {
        shopHint.textContent = "Füge einen Link von Amazon, Smyths Toys etc. ein.";
      }
    });
  }

  const wishForm = modalOverlay.querySelector("#form-wish-editor");
  if (wishForm) {
    wishForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const targetEventId = modalOverlay.querySelector("#wish-target-event").value;
      const id = wishForm.querySelector("#wish-id").value || generateId("wish");
      const title = wishForm.querySelector("#wish-title").value.trim();
      const url = wishForm.querySelector("#wish-url").value.trim();
      const price = parseFloat(wishForm.querySelector("#wish-price").value) || 0;
      const category = wishForm.querySelector("#wish-category").value;
      const priority = wishForm.querySelector("#wish-priority").value;
      const image = wishForm.querySelector("#wish-image").value.trim();
      const description = wishForm.querySelector("#wish-description").value.trim();
      const note = wishForm.querySelector("#wish-note").value.trim();
      const detected = detectShop(url);

      const payload = {
        id,
        title,
        url,
        price,
        category,
        priority,
        image,
        description,
        note,
        shopName: detected.name,
        status: wishData.status || "available",
        reservedBy: wishData.reservedBy || "",
        reservedAt: wishData.reservedAt || null,
        reservePin: wishData.reservePin || ""
      };

      await state.saveWish(payload, targetEventId);
      toast.success(isEditing ? `"${escapeHtml(title)}" aktualisiert!` : `"${escapeHtml(title)}" hinzugefügt!`);
      state.closeModal();
    });
  }

  // ==========================================
  // FILE IMPORT HANDLERS (CSV & JSON)
  // ==========================================
  let parsedImportWishes = [];
  const btnDownloadTemplate = modalOverlay.querySelector("#btn-download-csv-template");
  const fileDropzone = modalOverlay.querySelector("#file-dropzone");
  const fileInputWishes = modalOverlay.querySelector("#file-import-wishes");
  const importPreviewBox = modalOverlay.querySelector("#import-preview-box");
  const importPreviewTbody = modalOverlay.querySelector("#import-preview-tbody");
  const btnExecuteImport = modalOverlay.querySelector("#btn-execute-import");
  const btnCancelPreview = modalOverlay.querySelector("#btn-cancel-import-preview");

  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener("click", () => {
      downloadCsvTemplate();
      toast.success("CSV-Mustervorlage heruntergeladen! 📄");
    });
  }

  if (fileDropzone && fileInputWishes) {
    fileDropzone.addEventListener("click", () => fileInputWishes.click());

    fileDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      fileDropzone.classList.add("dragover");
    });

    fileDropzone.addEventListener("dragleave", () => {
      fileDropzone.classList.remove("dragover");
    });

    fileDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      fileDropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        processImportFile(e.dataTransfer.files[0]);
      }
    });

    fileInputWishes.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        processImportFile(e.target.files[0]);
      }
    });
  }

  function processImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(content);
          parsedImportWishes = Array.isArray(parsed) ? parsed : (parsed.wishes || []);
        } else {
          // CSV Datei
          parsedImportWishes = parseWishesFromCsv(content);
        }

        renderImportPreview(parsedImportWishes, file.name);
      } catch (err) {
        toast.error("Fehler beim Lesen der Datei: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function renderImportPreview(wishes, filename) {
    if (!wishes || wishes.length === 0) {
      toast.error("Keine Wünsche in der Datei gefunden.");
      return;
    }

    modalOverlay.querySelector("#import-preview-title").textContent = `Vorschau: ${wishes.length} Geschenke aus "${filename}"`;
    importPreviewTbody.innerHTML = wishes.slice(0, 10).map((w, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(w.title)}</strong></td>
        <td>${w.shopName ? escapeHtml(w.shopName) : '—'}</td>
        <td>${formatCurrency(w.price)}</td>
        <td>${escapeHtml(w.category || 'Allgemein')}</td>
        <td>${w.priority === 'high' ? '⭐ Hoch' : (w.priority === 'low' ? 'Niedrig' : 'Normal')}</td>
      </tr>
    `).join("") + (wishes.length > 10 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">... und ${wishes.length - 10} weitere Wünsche</td></tr>` : "");

    importPreviewBox.style.display = "block";
  }

  if (btnCancelPreview) {
    btnCancelPreview.addEventListener("click", () => {
      parsedImportWishes = [];
      importPreviewBox.style.display = "none";
      if (fileInputWishes) fileInputWishes.value = "";
    });
  }

  if (btnExecuteImport) {
    btnExecuteImport.addEventListener("click", async () => {
      if (parsedImportWishes.length === 0) return;
      const targetEventId = modalOverlay.querySelector("#import-target-event").value;
      const modeRadio = modalOverlay.querySelector("input[name='importMode']:checked");
      const mode = modeRadio ? modeRadio.value : "append";

      await state.importWishes(parsedImportWishes, mode, targetEventId);
      toast.success(`${parsedImportWishes.length} Geschenke erfolgreich importiert! 🎉`);
      state.setActiveEvent(targetEventId);
      state.closeModal();
    });
  }

  // ==========================================
  // BACKUP & PIN SETTINGS
  // ==========================================
  const formPin = modalOverlay.querySelector("#form-admin-pin-settings");
  const togglePinBtn = modalOverlay.querySelector("#btn-toggle-setting-pin");
  const pinSettingInput = modalOverlay.querySelector("#setting-admin-pin");

  if (togglePinBtn && pinSettingInput) {
    togglePinBtn.addEventListener("click", () => {
      if (pinSettingInput.type === "password") {
        pinSettingInput.type = "text";
        togglePinBtn.textContent = "🙈";
      } else {
        pinSettingInput.type = "password";
        togglePinBtn.textContent = "👁️";
      }
    });
  }

  if (formPin && pinSettingInput) {
    formPin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = pinSettingInput.value.trim();
      if (pin) {
        await state.updateSettings({ adminPin: pin });
        toast.success("Admin-PIN erfolgreich geändert und gespeichert!");
      }
    });
  }

  const btnExport = modalOverlay.querySelector("#btn-export-backup");
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      await storage.exportAllData();
      toast.success("Backup aller Veranstaltungen heruntergeladen!");
    });
  }

  const btnTriggerBackup = modalOverlay.querySelector("#btn-trigger-import-backup");
  const fileBackupInput = modalOverlay.querySelector("#file-import-backup");
  if (btnTriggerBackup && fileBackupInput) {
    btnTriggerBackup.addEventListener("click", () => fileBackupInput.click());
    fileBackupInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = await storage.importAllData(event.target.result);
        if (result.success) {
          await state.init();
          toast.success(`${result.count} Veranstaltungen erfolgreich wiederhergestellt!`);
          state.closeModal();
        } else {
          toast.error(result.error);
        }
      };
      reader.readAsText(file);
    });
  }

  const btnReset = modalOverlay.querySelector("#btn-reset-defaults");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (confirm("Möchtest du wirklich alles auf die Standard-Veranstaltungen zurücksetzen?")) {
        storage.resetToDefaults();
        await state.init();
        toast.info("Auf Standard-Veranstaltungen zurückgesetzt.");
        state.closeModal();
      }
    });
  }

  container.appendChild(modalOverlay);
}
