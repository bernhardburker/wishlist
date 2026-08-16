/**
 * Toast-Benachrichtigungssystem
 */

class ToastService {
  constructor() {
    this.container = null;
  }

  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  }

  show(message, type = "info", duration = 3500) {
    this.ensureContainer();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icons = {
      success: "🎉",
      info: "ℹ️",
      error: "⚠️",
      warning: "🔔"
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || "✨"}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Schließen">&times;</button>
    `;

    const closeBtn = toast.querySelector(".toast-close");
    const removeToast = () => {
      toast.classList.add("toast-leaving");
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    };

    closeBtn.addEventListener("click", removeToast);
    this.container.appendChild(toast);

    // Animierter Eintritt
    requestAnimationFrame(() => {
      toast.classList.add("toast-visible");
    });

    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  }

  success(msg, duration) {
    this.show(msg, "success", duration);
  }

  error(msg, duration) {
    this.show(msg, "error", duration);
  }

  info(msg, duration) {
    this.show(msg, "info", duration);
  }
}

export const toast = new ToastService();
