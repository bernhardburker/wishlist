/**
 * Allgemeine Hilfsfunktionen für Formatierung, Sicherheit und UI-Effekte
 */

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === "" || isNaN(amount)) {
    return "Keine Preisangabe";
  }
  const num = typeof amount === "string" ? parseFloat(amount.replace(",", ".")) : amount;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(num);
}

export const DEFAULT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#f8fafc"/>
      <circle cx="200" cy="125" r="48" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="2"/>
      <text x="200" y="140" dominant-baseline="middle" text-anchor="middle" font-size="42">🎁</text>
      <text x="200" y="210" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600">Wunschfoto</text>
    </svg>`
  );

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateId(prefix = "wish") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Gerade eben";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `vor ${days} Tagen`;
  return date.toLocaleDateString("de-DE");
}

/**
 * Konfetti-Effekt beim erfolgreichen Reservieren
 */
export function triggerConfetti() {
  const canvas = document.createElement("canvas");
  canvas.id = "confetti-canvas";
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#E11D48", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#FDE047"];
  const pieces = [];
  const count = 75;

  for (let i = 0; i < count; i++) {
    pieces.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      w: Math.random() * 9 + 5,
      h: Math.random() * 5 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 16,
      gravity: 0.35,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1
    });
  }

  let animationFrame;
  function update() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;

    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.012;

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    });

    if (alive) {
      animationFrame = requestAnimationFrame(update);
    } else {
      cancelAnimationFrame(animationFrame);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  }

  update();
}
