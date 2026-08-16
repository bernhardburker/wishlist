import { state } from "../state.js";
import { storage } from "../storage.js";
import { escapeHtml, formatCurrency, triggerConfetti, DEFAULT_IMAGE_PLACEHOLDER } from "../utils/helpers.js";
import { getWishShops } from "../utils/shopHelper.js";
import { toast } from "./toast.js";

export function renderReserveModal(container, wish, preSelectBought = false) {
  if (!wish) return;

  const shops = getWishShops(wish);
  const savedName = preSelectBought
    ? (state.isAdmin ? (wish.reservedBy || storage.getSavedUserName()) : storage.getSavedUserName())
    : storage.getSavedUserName();

  let modalImage = (wish.image || "").trim() || DEFAULT_IMAGE_PLACEHOLDER;
  if (modalImage && modalImage.includes("image.smythstoys.com") && !modalImage.match(/\.(jpg|jpeg|png|webp)($|\?)/i)) {
    modalImage += ".jpg";
  }

  const modalTitle = preSelectBought ? "🎁 Als gekauft markieren" : "🎁 Geschenk reservieren";
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal-card modal-reserve" role="dialog" aria-labelledby="modal-reserve-title">
      <div class="modal-header">
        <h2 id="modal-reserve-title" class="modal-title">${modalTitle}</h2>
        <button class="modal-close-btn" aria-label="Schließen">&times;</button>
      </div>

      <div class="modal-body modal-body-scrollable">
        <div class="reserve-product-summary">
          <img
            src="${escapeHtml(modalImage)}"
            alt="${escapeHtml(wish.title)}"
            class="reserve-thumb"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div class="reserve-product-info">
            <h4 class="reserve-product-title">${escapeHtml(wish.title)}</h4>
            <span class="reserve-product-price">${formatCurrency(wish.price)}</span>
            ${shops.length > 0 ? `
              <div class="reserve-shops-links" style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.35rem;">
                ${shops.map(s => `
                  <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="badge badge-shop ${s.badgeClass}" style="text-decoration:none;" title="Bei ${escapeHtml(s.name)} ansehen">
                    <span>${s.icon} ${escapeHtml(s.name)}${s.price && shops.length > 1 ? ` (${formatCurrency(s.price)})` : ''} ↗</span>
                  </a>
                `).join("")}
              </div>
            ` : (wish.shopName ? `<span class="reserve-product-shop">Shop: ${escapeHtml(wish.shopName)}</span>` : "")}
          </div>
        </div>

        <form id="form-reserve" class="reserve-form">
          <div class="form-group">
            <label for="input-reserve-name" class="form-label required-label">Dein Name / Eure Namen:</label>
            <input
              type="text"
              id="input-reserve-name"
              class="form-input"
              placeholder="z. B. Tante Sarah & Onkel Markus"
              required
              value="${escapeHtml(savedName)}"
              autofocus
            />
            <span class="form-hint">Der Name ist vertraulich und nur für den Listen-Inhaber (Admin) sichtbar.</span>
          </div>

          <div class="form-group">
            <label class="form-label">Status festlegen:</label>
            <div class="radio-options-grid">
              <label class="radio-option-card ${preSelectBought ? '' : 'active'}">
                <input type="radio" name="reserveStatus" value="reserved" ${preSelectBought ? '' : 'checked'} />
                <div class="radio-option-content">
                  <span class="radio-title">🔒 Für mich reservieren</span>
                  <span class="radio-desc">Ich plane, dieses Geschenk zu besorgen.</span>
                </div>
              </label>

              <label class="radio-option-card ${preSelectBought ? 'active' : ''}">
                <input type="radio" name="reserveStatus" value="bought" ${preSelectBought ? 'checked' : ''} />
                <div class="radio-option-content">
                  <span class="radio-title">🎁 Bereits gekauft</span>
                  <span class="radio-desc">Liegt schon fertig bereit / bestellt.</span>
                </div>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="input-reserve-note" class="form-label">Optionale Notiz / Gruß:</label>
            <input
              type="text"
              id="input-reserve-note"
              class="form-input"
              placeholder="z. B. Bringe ich direkt zur Feier mit"
            />
          </div>

          <div class="form-group">
            <label for="input-reserve-pin" class="form-label">Storno-PIN (optional, 4–8 Ziffern):</label>
            <input
              type="password"
              inputmode="numeric"
              maxlength="8"
              id="input-reserve-pin"
              class="form-input"
              placeholder="z. B. 58219412"
            />
            <span class="form-hint">Falls du deine Reservierung später selbst wieder freigeben möchtest.</span>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost btn-cancel-modal">Abbrechen</button>
            <button type="submit" class="btn btn-primary">
              <span>${preSelectBought ? 'Als gekauft markieren 🎁' : 'Jetzt reservieren 🎁'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Fallback for image loading error
  const reserveThumb = modalOverlay.querySelector(".reserve-thumb");
  if (reserveThumb) {
    reserveThumb.addEventListener("error", () => {
      if (reserveThumb.src !== DEFAULT_IMAGE_PLACEHOLDER) {
        reserveThumb.src = DEFAULT_IMAGE_PLACEHOLDER;
      }
    });
  }

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

  // Radio button active styling
  const radioCards = modalOverlay.querySelectorAll(".radio-option-card");
  radioCards.forEach(card => {
    const radio = card.querySelector("input[type='radio']");
    radio.addEventListener("change", () => {
      radioCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");
    });
  });

  // Form Submit
  const form = modalOverlay.querySelector("#form-reserve");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = form.querySelector("#input-reserve-name");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    const statusRadio = form.querySelector("input[name='reserveStatus']:checked");
    const asBought = statusRadio ? statusRadio.value === "bought" : false;
    const note = form.querySelector("#input-reserve-note").value.trim();
    const pin = form.querySelector("#input-reserve-pin").value.trim();

    const success = await state.reserveWish(wish.id, name, note, pin, asBought);
    if (success) {
      triggerConfetti();
      const msg = asBought
        ? `Super, ${escapeHtml(name)}! "${escapeHtml(wish.title)}" ist als gekauft markiert. 🎁`
        : `Vielen Dank, ${escapeHtml(name)}! Du hast "${escapeHtml(wish.title)}" erfolgreich reserviert.`;
      toast.success(msg);
      state.closeModal();
    } else {
      const isUpgrade = wish.status === "reserved" && wish.reservePin;
      toast.error(isUpgrade
        ? "Falscher PIN! Nur die Person, die reserviert hat (oder der Admin), kann den Status ändern."
        : "Fehler beim Speichern der Reservierung."
      );
    }
  });

  container.appendChild(modalOverlay);
}
