/**
 * Server-Status & Verbindungs-Modal für den Burkerserver
 */

import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml } from "../utils/helpers.js";
import { toast } from "./toast.js";

export function renderConfigModal(container) {
  const currentConfig = storage.getServerConfig();
  const currentOrigin = window.location.origin;

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal-card modal-config" role="dialog" aria-labelledby="modal-config-title">
      <div class="modal-header">
        <h2 id="modal-config-title" class="modal-title">🖥️ Burkerserver Speicher &amp; Status</h2>
        <button class="modal-close-btn" aria-label="Schließen">&times;</button>
      </div>

      <div class="modal-body modal-body-scrollable">
        <div class="server-info-card">
          <div class="server-info-header">
            <span class="server-badge-icon">🖧</span>
            <div>
              <h3 class="server-info-title">Eigener Server-Datenspeicher</h3>
              <p class="server-info-subtitle">Alle Wünsche und Reservierungen werden direkt auf deinem Burkerserver in <code>data/events.json</code> gespeichert.</p>
            </div>
          </div>
        </div>

        <form id="form-server-config" class="server-form">
          <div class="form-group">
            <label for="server-url" class="form-label">Server / Domain URL (optional):</label>
            <input
              type="text"
              id="server-url"
              class="form-input"
              placeholder="z. B. https://wunschliste.burker.at (leer lassen für automatische Erkennung)"
              value="${escapeHtml(currentConfig.serverUrl || "")}"
            />
            <p class="form-hint">
              Wenn du die Wunschliste direkt über deine Domain aufrufst, wird die Verbindung automatisch hergestellt.
            </p>
          </div>

          <!-- Live Verbindungstest -->
          <div id="server-test-result" class="test-result-box" style="display: none;"></div>

          <div class="sync-actions-box">
            <button type="button" id="btn-test-server" class="btn btn-secondary btn-sm">
              🔌 Verbindung testen
            </button>
            <button type="button" id="btn-reload-server" class="btn btn-outline btn-sm">
              🔄 Daten vom Server neu laden
            </button>
          </div>

          <div class="server-features-list">
            <h4>🛡️ Deine Vorteile auf dem Burkerserver:</h4>
            <ul>
              <li><strong>100% Privat:</strong> Keine Daten bei GitHub, Google oder Supabase.</li>
              <li><strong>Einfach für Gäste:</strong> Familie &amp; Freunde können ohne Logins oder Tokens sofort reservieren.</li>
              <li><strong>Atomare Speicherung:</strong> Verhindert Datenverlust bei gleichzeitigen Zugriffen.</li>
            </ul>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Schließen</button>
            <button type="submit" class="btn btn-primary">💾 Speichern</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.appendChild(modalOverlay);

  const close = () => {
    modalOverlay.remove();
    state.closeModal();
  };

  modalOverlay.querySelector(".modal-close-btn").addEventListener("click", close);
  modalOverlay.querySelector(".modal-cancel-btn").addEventListener("click", close);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) close();
  });

  const form = modalOverlay.querySelector("#form-server-config");
  const resultBox = modalOverlay.querySelector("#server-test-result");

  // Verbindungstest
  const btnTest = modalOverlay.querySelector("#btn-test-server");
  btnTest.addEventListener("click", async () => {
    const urlInput = form.querySelector("#server-url").value.trim();
    resultBox.style.display = "block";
    resultBox.className = "test-result-box info";
    resultBox.textContent = "⏳ Prüfe Verbindung zum Server...";

    const res = await storage.testServerConnection(urlInput);
    if (res.success) {
      resultBox.className = "test-result-box success";
      resultBox.innerHTML = `<strong>✔ Verbindung erfolgreich!</strong><br>${escapeHtml(res.message)}`;
    } else {
      resultBox.className = "test-result-box error";
      resultBox.innerHTML = `<strong>✖ Verbindung fehlgeschlagen:</strong><br>${escapeHtml(res.message)}`;
    }
  });

  // Reload
  const btnReload = modalOverlay.querySelector("#btn-reload-server");
  btnReload.addEventListener("click", async () => {
    btnReload.disabled = true;
    btnReload.textContent = "⏳ Lade...";
    const events = await storage.loadEvents();
    btnReload.disabled = false;
    btnReload.textContent = "🔄 Daten vom Server neu laden";

    if (events && events.length > 0) {
      state.setEvents(events);
      toast.success("Daten erfolgreich vom Server aktualisiert!");
      close();
    } else {
      toast.error("Konnte Daten nicht vom Server laden.");
    }
  });

  // Speichern
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const serverUrl = form.querySelector("#server-url").value.trim();
    storage.saveServerConfig({ serverUrl });
    toast.success("Server-Einstellungen gespeichert!");
    state.notify();
    close();
  });
}
