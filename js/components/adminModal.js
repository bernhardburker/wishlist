/**
 * Admin-Modal zur Listenverwaltung (Wünsche anlegen/bearbeiten, Einstellungen, Backup)
 */

import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml, generateId } from "../utils/helpers.js";
import { detectShop } from "../utils/shopHelper.js";
import { toast } from "./toast.js";

export function renderAdminModal(container, modalType = "admin", editingWish = null) {
  const isAdmin = state.isAdmin;
  const isEditing = Boolean(editingWish);

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";

  const closeModal = () => {
    modalOverlay.classList.add("modal-leaving");
    setTimeout(() => {
      state.closeModal();
    }, 200);
  };

  // --- 1. PIN EINGABE (Falls noch nicht als Admin authentifiziert) ---
  if (!isAdmin && modalType !== "addWish" && modalType !== "editWish") {
    modalOverlay.innerHTML = `
      <div class="modal-card modal-admin-auth" role="dialog">
        <div class="modal-header">
          <h2 class="modal-title">🔐 Admin-Bereich entsperren</h2>
          <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-intro">
            Gib deinen Admin-PIN ein, um Wünsche hinzuzufügen, zu bearbeiten oder Einstellungen anzupassen.
          </p>
          <form id="form-admin-login">
            <div class="form-group">
              <label for="admin-pin-input" class="form-label required-label">Admin-PIN:</label>
              <input
                type="password"
                id="admin-pin-input"
                class="form-input"
                placeholder="Standard-PIN: 1234"
                required
                autofocus
              />
              <span class="form-hint">Hinweis: Der Standard-PIN ist <strong>1234</strong> (kann nach dem Login geändert werden).</span>
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
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const pin = loginForm.querySelector("#admin-pin-input").value.trim();
      if (state.loginAdmin(pin)) {
        toast.success("Admin-Modus erfolgreich aktiviert!");
        state.openModal("admin");
      } else {
        toast.error("Falscher PIN! Bitte versuche es erneut.");
      }
    });

    container.appendChild(modalOverlay);
    return;
  }

  // --- 2. ADMIN INTERFACE ---
  const activeTab = (modalType === "addWish" || modalType === "editWish") ? "wish" : "settings";
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
        <h2 class="modal-title">
          ${isEditing ? "✏️ Wunsch bearbeiten" : (modalType === "addWish" ? "+ Neuen Wunsch hinzufügen" : "⚙️ Wunschlisten-Verwaltung")}
        </h2>
        <button class="modal-close-btn">&times;</button>
      </div>

      <div class="modal-tabs">
        <button class="tab-btn ${activeTab === 'wish' ? 'active' : ''}" data-tab="tab-wish">
          ${isEditing ? "✏️ Wunsch bearbeiten" : "+ Wunsch anlegen"}
        </button>
        <button class="tab-btn ${activeTab === 'settings' ? 'active' : ''}" data-tab="tab-settings">
          ⚙️ Texte &amp; Einstellungen
        </button>
        <button class="tab-btn" data-tab="tab-backup">
          💾 Backup &amp; Daten
        </button>
      </div>

      <div class="modal-body modal-body-scrollable">
        <!-- TAB 1: WUNSCH FORMULAR -->
        <div id="tab-wish" class="tab-content ${activeTab === 'wish' ? 'active' : ''}">
          <form id="form-wish-editor">
            <input type="hidden" id="wish-id" value="${escapeHtml(wishData.id)}" />

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
                  <option value="high" ${wishData.priority === 'high' ? 'selected' : ''}>⭐ Lieblingswunsch (ganz oben)</option>
                  <option value="medium" ${wishData.priority === 'medium' || !wishData.priority ? 'selected' : ''}>Normaler Wunsch</option>
                  <option value="low" ${wishData.priority === 'low' ? 'selected' : ''}>Wäre auch nett (niedrig)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="wish-image" class="form-label">Bild-URL (Link zu einem Produktfoto):</label>
              <input
                type="url"
                id="wish-image"
                class="form-input"
                placeholder="https://... (Bildlink aus dem Shop kopieren)"
                value="${escapeHtml(wishData.image)}"
              />
              <span class="form-hint">Tipp: Im Shop Rechtsklick auf das Produktbild -> „Bildadresse kopieren“.</span>
            </div>

            <div class="form-group">
              <label for="wish-description" class="form-label">Beschreibung / Warum gewünscht:</label>
              <textarea
                id="wish-description"
                class="form-textarea"
                rows="2"
                placeholder="Kurze Erklärung zum Geschenk..."
              >${escapeHtml(wishData.description)}</textarea>
            </div>

            <div class="form-group">
              <label for="wish-note" class="form-label">Wichtige Details &amp; Notizen (z. B. Größe, Farbe, Modell):</label>
              <input
                type="text"
                id="wish-note"
                class="form-input"
                placeholder="z. B. Größe 116, Farbe Blau, Modell 2026"
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

        <!-- TAB 2: TEXTE & EINSTELLUNGEN -->
        <div id="tab-settings" class="tab-content ${activeTab === 'settings' ? 'active' : ''}">
          <form id="form-settings-editor">
            <div class="form-group">
              <label for="setting-title" class="form-label required-label">Überschrift der Wunschliste:</label>
              <input
                type="text"
                id="setting-title"
                class="form-input"
                value="${escapeHtml(settings.listTitle)}"
                required
              />
            </div>

            <div class="form-group">
              <label for="setting-subtitle" class="form-label">Begrüßungstext &amp; Beschreibung:</label>
              <textarea
                id="setting-subtitle"
                class="form-textarea"
                rows="3"
              >${escapeHtml(settings.listSubtitle)}</textarea>
            </div>

            <div class="form-group">
              <label for="setting-admin-pin" class="form-label">Admin-PIN ändern:</label>
              <input
                type="text"
                id="setting-admin-pin"
                class="form-input"
                value="${escapeHtml(settings.adminPin)}"
                required
              />
              <span class="form-hint">Mit diesem PIN kannst du diesen Verwaltungsbereich jederzeit öffnen.</span>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
              <button type="submit" class="btn btn-primary">
                <span>Einstellungen speichern</span>
              </button>
            </div>
          </form>
        </div>

        <!-- TAB 3: BACKUP & DATEN -->
        <div id="tab-backup" class="tab-content">
          <div class="backup-section">
            <h4>💾 Wunschliste sichern (Export)</h4>
            <p class="form-hint">Lade deine aktuellen Wünsche und Einstellungen als JSON-Datei auf deinen Computer herunter.</p>
            <button id="btn-export-backup" class="btn btn-secondary">
              <span>📥 Backup als JSON herunterladen</span>
            </button>

            <hr class="divider" />

            <h4>📂 Backup wiederherstellen (Import)</h4>
            <p class="form-hint">Stelle eine zuvor gesicherte Wunschliste aus einer JSON-Datei wieder her.</p>
            <input type="file" id="file-import-input" accept=".json" style="display: none;" />
            <button id="btn-trigger-import" class="btn btn-outline">
              <span>📤 JSON-Backup auswählen &amp; einspielen</span>
            </button>

            <hr class="divider" />

            <h4>⚠️ Auf Standard-Musterliste zurücksetzen</h4>
            <p class="form-hint">Setzt alle Einträge und Reservierungen auf die ursprünglichen Beispiel-Geschenke zurück.</p>
            <button id="btn-reset-defaults" class="btn btn-ghost btn-danger-text">
              <span>↺ Standard-Beispieldaten laden</span>
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

  // Shop auto-detect on URL change in form
  const urlInput = modalOverlay.querySelector("#wish-url");
  const shopHint = modalOverlay.querySelector("#shop-detected-hint");
  if (urlInput && shopHint) {
    urlInput.addEventListener("input", () => {
      const detected = detectShop(urlInput.value.trim());
      if (urlInput.value.trim()) {
        shopHint.innerHTML = `Erkannter Shop: <strong>${detected.icon} ${escapeHtml(detected.name)}</strong>`;
      } else {
        shopHint.textContent = "Füge einen Link von Amazon, Smyths Toys, etc. ein.";
      }
    });
  }

  // Submit Wunsch
  const wishForm = modalOverlay.querySelector("#form-wish-editor");
  if (wishForm) {
    wishForm.addEventListener("submit", async (e) => {
      e.preventDefault();
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

      await state.saveWish(payload);
      toast.success(isEditing ? `"${escapeHtml(title)}" aktualisiert!` : `"${escapeHtml(title)}" zur Wunschliste hinzugefügt!`);
      state.closeModal();
    });
  }

  // Submit Settings
  const settingsForm = modalOverlay.querySelector("#form-settings-editor");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const listTitle = settingsForm.querySelector("#setting-title").value.trim();
      const listSubtitle = settingsForm.querySelector("#setting-subtitle").value.trim();
      const adminPin = settingsForm.querySelector("#setting-admin-pin").value.trim();

      state.updateSettings({ listTitle, listSubtitle, adminPin });
      toast.success("Einstellungen wurden gespeichert!");
      state.closeModal();
    });
  }

  // Backup Export
  const btnExport = modalOverlay.querySelector("#btn-export-backup");
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      await storage.exportData();
      toast.success("Backup-Datei heruntergeladen!");
    });
  }

  // Backup Import
  const btnTriggerImport = modalOverlay.querySelector("#btn-trigger-import");
  const fileInput = modalOverlay.querySelector("#file-import-input");
  if (btnTriggerImport && fileInput) {
    btnTriggerImport.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = await storage.importData(event.target.result);
        if (result.success) {
          await state.init();
          toast.success(`${result.count} Wünsche erfolgreich importiert!`);
          state.closeModal();
        } else {
          toast.error(result.error);
        }
      };
      reader.readAsText(file);
    });
  }

  // Reset to Defaults
  const btnReset = modalOverlay.querySelector("#btn-reset-defaults");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (confirm("Möchtest du wirklich alle Wünsche auf die Beispiel-Liste zurücksetzen? Alle individuellen Einträge gehen dabei verloren.")) {
        storage.resetToDefaults();
        await state.init();
        toast.info("Wunschliste auf Standardwerte zurückgesetzt.");
        state.closeModal();
      }
    });
  }

  container.appendChild(modalOverlay);
}
