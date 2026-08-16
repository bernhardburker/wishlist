/**
 * Cloud-Sync Konfigurations-Modal (Supabase)
 */

import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml } from "../utils/helpers.js";
import { toast } from "./toast.js";

export function renderConfigModal(container) {
  const currentConfig = storage.getCloudConfig();

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal-card modal-config" role="dialog" aria-labelledby="modal-config-title">
      <div class="modal-header">
        <h2 id="modal-config-title" class="modal-title">☁️ Live Cloud-Synchronisation</h2>
        <button class="modal-close-btn" aria-label="Schließen">&times;</button>
      </div>

      <div class="modal-body modal-body-scrollable">
        <div class="cloud-explainer">
          <p>
            Standardmäßig speichert die Wunschliste alle Daten direkt in deinem Browser (<strong>Offline/Lokal</strong>).
          </p>
          <p>
            Damit <strong>Freunde &amp; Familie</strong> auf ihren eigenen Handys oder Computern in Echtzeit sehen, welche Geschenke noch frei oder reserviert sind, kannst du hier ein kostenloses <strong>Supabase</strong> Backend verbinden.
          </p>
        </div>

        <form id="form-cloud-config" class="cloud-form">
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" id="cloud-enabled" ${currentConfig.enabled ? 'checked' : ''} />
              <span class="toggle-text"><strong>Cloud-Synchronisation aktivieren</strong></span>
            </label>
          </div>

          <div class="form-group">
            <label for="cloud-url" class="form-label">Supabase Project URL:</label>
            <input
              type="url"
              id="cloud-url"
              class="form-input"
              placeholder="https://xyzabcdefg.supabase.co"
              value="${escapeHtml(currentConfig.url || '')}"
            />
          </div>

          <div class="form-group">
            <label for="cloud-key" class="form-label">Supabase Anon Public Key:</label>
            <input
              type="password"
              id="cloud-key"
              class="form-input"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value="${escapeHtml(currentConfig.anonKey || '')}"
            />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
            <button type="submit" class="btn btn-primary">
              <span>Speichern &amp; Verbinden</span>
            </button>
          </div>
        </form>

        <details class="setup-instructions-details">
          <summary>📋 Kurzanleitung: Supabase in 2 Minuten einrichten (Kostenlos)</summary>
          <div class="details-content">
            <ol>
              <li>Kostenlos registrieren auf <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> und ein neues Projekt erstellen.</li>
              <li>Im Menü auf <strong>SQL Editor</strong> klicken, auf <strong>New query</strong> gehen und folgenden Code ausführen:</li>
            </ol>
            <div class="sql-snippet-box">
              <pre><code>create table wishes (
  id text primary key,
  title text not null,
  url text,
  price numeric,
  category text,
  priority text,
  image text,
  description text,
  note text,
  "shopName" text,
  status text default 'available',
  "reservedBy" text,
  "reservedAt" timestamp with time zone,
  "reserveNote" text,
  "reservePin" text,
  "createdAt" timestamp with time zone default now(),
  "updatedAt" timestamp with time zone default now()
);

alter table wishes enable row level security;
create policy "Public Access" on wishes for all using (true) with check (true);</code></pre>
              <button type="button" id="btn-copy-sql" class="btn btn-sm btn-outline">SQL kopieren 📋</button>
            </div>
            <p>3. Unter <strong>Project Settings -> API</strong> die <em>Project URL</em> und den <em>anon public key</em> kopieren und oben eintragen.</p>
          </div>
        </details>
      </div>
    </div>
  `;

  // Close logic
  const closeModal = () => {
    modalOverlay.classList.add("modal-leaving");
    setTimeout(() => {
      state.closeModal();
    }, 200);
  };

  modalOverlay.querySelector(".modal-close-btn").addEventListener("click", closeModal);
  modalOverlay.querySelector(".btn-cancel-modal").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // SQL Copy Button
  const btnCopySql = modalOverlay.querySelector("#btn-copy-sql");
  if (btnCopySql) {
    btnCopySql.addEventListener("click", () => {
      const sqlCode = modalOverlay.querySelector(".sql-snippet-box code").textContent;
      navigator.clipboard.writeText(sqlCode).then(() => {
        btnCopySql.textContent = "Kopiert! ✅";
        setTimeout(() => {
          btnCopySql.textContent = "SQL kopieren 📋";
        }, 2000);
      });
    });
  }

  // Form Submit
  const form = modalOverlay.querySelector("#form-cloud-config");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enabled = form.querySelector("#cloud-enabled").checked;
    const url = form.querySelector("#cloud-url").value.trim();
    const anonKey = form.querySelector("#cloud-key").value.trim();

    storage.saveCloudConfig({ enabled, url, anonKey });
    await state.init();
    toast.success(enabled ? "Cloud-Synchronisation eingerichtet!" : "Lokaler Modus aktiv.");
    state.closeModal();
  });

  container.appendChild(modalOverlay);
}
