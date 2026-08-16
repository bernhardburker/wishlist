/**
 * Einzelne Geschenkkarte (GiftCard) Komponente
 */

import { state } from "../state.js";
import { formatCurrency, escapeHtml, timeAgo, DEFAULT_IMAGE_PLACEHOLDER } from "../utils/helpers.js";
import { detectShop } from "../utils/shopHelper.js";

export function createGiftCardElement(wish) {
  const shopInfo = detectShop(wish.url);
  const isAvailable = wish.status === "available";
  const isReserved = wish.status === "reserved";
  const isBought = wish.status === "bought";

  const card = document.createElement("article");
  card.className = `gift-card status-${wish.status} ${wish.priority === 'high' ? 'is-priority-high' : ''}`;
  card.id = `gift-card-${wish.id}`;

  let imageUrl = (wish.image || "").trim() || DEFAULT_IMAGE_PLACEHOLDER;
  if (imageUrl && imageUrl.includes("image.smythstoys.com") && !imageUrl.match(/\.(jpg|jpeg|png|webp)($|\?)/i)) {
    imageUrl += ".jpg";
  }

  card.innerHTML = `
    <div class="card-media-wrapper">
      <img
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(wish.title)}"
        class="card-img"
        loading="lazy"
        referrerpolicy="no-referrer"
      />

      <div class="card-badges-overlay">
        ${wish.priority === "high" ? `
          <span class="badge badge-priority" title="Großer Lieblingswunsch">⭐ Lieblingswunsch</span>
        ` : ""}

        <span class="badge badge-shop ${shopInfo.badgeClass}" title="Erhältlich bei ${escapeHtml(wish.shopName || shopInfo.name)}">
          <span class="shop-icon">${shopInfo.icon}</span>
          <span class="shop-name">${escapeHtml(wish.shopName || shopInfo.name)}</span>
        </span>
      </div>

      ${isReserved ? `
        <div class="card-ribbon ribbon-reserved">
          <span>🔒 Reserviert</span>
        </div>
      ` : ""}

      ${isBought ? `
        <div class="card-ribbon ribbon-bought">
          <span>🎁 Gekauft</span>
        </div>
      ` : ""}
    </div>

    <div class="card-content">
      <div class="card-header">
        <span class="card-category">${escapeHtml(wish.category || "Allgemein")}</span>
        <span class="card-price">${formatCurrency(wish.price)}</span>
      </div>

      <h3 class="card-title">
        ${wish.url ? `
          <a href="${escapeHtml(wish.url)}" target="_blank" rel="noopener noreferrer" class="card-title-link" title="Im Shop ansehen: ${escapeHtml(wish.title)}">
            ${escapeHtml(wish.title)}
          </a>
        ` : `
          <span>${escapeHtml(wish.title)}</span>
        `}
      </h3>

      ${wish.description ? `
        <p class="card-description">${escapeHtml(wish.description)}</p>
      ` : ""}

      ${wish.note ? `
        <div class="card-note-box">
          <span class="note-icon">💡</span>
          <span class="note-text">${escapeHtml(wish.note)}</span>
        </div>
      ` : ""}

      <!-- Status & Reservierungs-Info -->
      <div class="card-status-box">
        ${isAvailable ? `
          <div class="status-indicator status-available">
            <span class="status-icon">✨</span>
            <span class="status-label">Noch frei</span>
          </div>
        ` : ""}

        ${isReserved ? `
          <div class="status-indicator status-reserved">
            <span class="status-icon">🔒</span>
            <div class="status-details">
              <span class="status-label">Reserviert von <strong>${escapeHtml(wish.reservedBy || "Jemandem")}</strong></span>
              ${wish.reservedAt ? `<span class="status-time">${timeAgo(wish.reservedAt)}</span>` : ""}
            </div>
          </div>
        ` : ""}

        ${isBought ? `
          <div class="status-indicator status-bought">
            <span class="status-icon">🎁</span>
            <div class="status-details">
              <span class="status-label">Bereits besorgt von <strong>${escapeHtml(wish.reservedBy || "Jemandem")}</strong></span>
              ${wish.reservedAt ? `<span class="status-time">${timeAgo(wish.reservedAt)}</span>` : ""}
            </div>
          </div>
        ` : ""}
      </div>

      <!-- Action Buttons -->
      <div class="card-actions">
        ${isAvailable ? `
          <button class="btn btn-primary btn-reserve" data-id="${wish.id}">
            <span>🎁 Ich schenke das</span>
          </button>
        ` : isBought ? `
          <button class="btn btn-secondary btn-cancel-reserve" data-id="${wish.id}">
            <span>↩ Reservierung aufheben</span>
          </button>
        ` : `
          <button class="btn btn-primary btn-mark-bought" data-id="${wish.id}">
            <span>🎁 Als gekauft markieren</span>
          </button>
          <button class="btn btn-secondary btn-cancel-reserve" data-id="${wish.id}">
            <span>↩ Aufheben</span>
          </button>
        `}

        ${wish.url ? `
          <a
            href="${escapeHtml(wish.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-outline btn-shop"
            title="Direkt zum Shop weiterleiten"
          >
            <span>Shop ↗</span>
          </a>
        ` : ""}
      </div>

      <!-- Admin Toolbar (nur sichtbar wenn Admin aktiv) -->
      ${state.isAdmin ? `
        <div class="card-admin-bar">
          <button class="btn-admin-action btn-edit-wish" data-id="${wish.id}" title="Bearbeiten">
            ✏️ Bearbeiten
          </button>
          ${!isAvailable ? `
            <button class="btn-admin-action btn-reset-wish" data-id="${wish.id}" title="Reservierung zurücksetzen">
              🔄 Freigeben
            </button>
          ` : ""}
          <button class="btn-admin-action btn-delete-wish" data-id="${wish.id}" title="Löschen">
            🗑️ Löschen
          </button>
        </div>
      ` : ""}
    </div>
  `;

  // Attach Event Listeners
  const cardImg = card.querySelector(".card-img");
  if (cardImg) {
    cardImg.addEventListener("error", () => {
      if (cardImg.src !== DEFAULT_IMAGE_PLACEHOLDER) {
        cardImg.src = DEFAULT_IMAGE_PLACEHOLDER;
      }
    });
  }

  const btnReserve = card.querySelector(".btn-reserve");
  if (btnReserve) {
    btnReserve.addEventListener("click", () => {
      state.openModal("reserve", wish);
    });
  }

  const btnCancel = card.querySelector(".btn-cancel-reserve");
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      state.openModal("cancel", wish);
    });
  }

  const btnMarkBought = card.querySelector(".btn-mark-bought");
  if (btnMarkBought) {
    btnMarkBought.addEventListener("click", () => {
      state.openModal("markBought", wish);
    });
  }

  const btnEdit = card.querySelector(".btn-edit-wish");
  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      state.openModal("editWish", wish);
    });
  }

  const btnReset = card.querySelector(".btn-reset-wish");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (confirm(`Möchtest du die Reservierung für "${wish.title}" wirklich aufheben?`)) {
        await state.cancelReservation(wish.id, state.settings.adminPin);
      }
    });
  }

  const btnDelete = card.querySelector(".btn-delete-wish");
  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      if (confirm(`Möchtest du den Wunsch "${wish.title}" wirklich löschen?`)) {
        await state.deleteWish(wish.id);
      }
    });
  }

  return card;
}
