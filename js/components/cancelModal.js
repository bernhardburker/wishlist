/**
 * Storno-Modal zum Aufheben einer Reservierung
 */

import { state } from "../state.js";
import { escapeHtml } from "../utils/helpers.js";
import { toast } from "./toast.js";

export function renderCancelModal(container, wish) {
  if (!wish) return;

  const hasPin = Boolean((wish.reservePin && String(wish.reservePin).trim()) || wish.hasReservePin);
  const isAdmin = state.isAdmin;

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal-card modal-cancel" role="dialog" aria-labelledby="modal-cancel-title">
      <div class="modal-header">
        <h2 id="modal-cancel-title" class="modal-title">↩ Reservierung aufheben</h2>
        <button class="modal-close-btn" aria-label="Schließen">&times;</button>
      </div>

      <div class="modal-body modal-body-scrollable">
        <p class="modal-intro">
          Möchtest du die Reservierung für <strong>${escapeHtml(wish.title)}</strong> aufheben?
        </p>

        <div class="reserved-info-box">
          ${isAdmin && wish.reservedBy ? `<span>Reserviert von: <strong>${escapeHtml(wish.reservedBy)}</strong></span>` : `<span>Status: <strong>${wish.status === 'bought' ? 'Bereits besorgt' : 'Reserviert'}</strong></span>`}
          ${isAdmin && wish.reserveNote ? `<p class="reserved-note-quote">„${escapeHtml(wish.reserveNote)}“</p>` : ""}
        </div>

        <form id="form-cancel" class="cancel-form">
          ${hasPin && !isAdmin ? `
            <div class="form-group">
              <label for="input-cancel-pin" class="form-label required-label">Storno-PIN eingeben:</label>
              <input
                type="password"
                inputmode="numeric"
                maxlength="8"
                id="input-cancel-pin"
                class="form-input"
                placeholder="4–8 stelliger PIN"
                required
                autofocus
              />
              <span class="form-hint">Gib den PIN ein, den du beim Reservieren gewählt hast (oder frage den Listen-Inhaber).</span>
            </div>
          ` : `
            <p class="form-hint">Das Geschenk wird danach wieder als frei und verfügbar für alle angezeigt.</p>
          `}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
            <button type="submit" class="btn btn-danger">
              <span>Reservierung freigeben</span>
            </button>
          </div>
        </form>
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
  modalOverlay.addEventListener("touchmove", (e) => {
    if (e.target === modalOverlay) {
      e.preventDefault();
    }
  }, { passive: false });

  const form = modalOverlay.querySelector("#form-cancel");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pinInput = form.querySelector("#input-cancel-pin");
    const pin = pinInput ? pinInput.value.trim() : "";
    const submitBtn = form.querySelector("button[type='submit']");

    if (submitBtn) submitBtn.disabled = true;

    try {
      const success = await state.cancelReservation(wish.id, pin);
      if (success) {
        toast.info(`Die Reservierung für "${escapeHtml(wish.title)}" wurde aufgehoben.`);
        state.closeModal();
      } else {
        toast.error("Falscher PIN! Die Reservierung konnte nicht aufgehoben werden.");
        if (pinInput) {
          pinInput.value = "";
          pinInput.focus();
        }
      }
    } catch (err) {
      console.error("Fehler beim Stornieren:", err);
      toast.error("Fehler beim Aufheben der Reservierung.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  container.appendChild(modalOverlay);
}
