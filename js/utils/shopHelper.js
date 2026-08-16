/**
 * Hilfsfunktionen zur Erkennung bekannter Online-Shops & Logos aus URLs
 */

const KNOWN_SHOPS = [
  {
    pattern: /amazon\.(de|com|co\.uk|at|fr|it|es)/i,
    name: "Amazon",
    badgeClass: "shop-amazon",
    color: "#FF9900",
    icon: "📦"
  },
  {
    pattern: /smythstoys\.com/i,
    name: "Smyths Toys",
    badgeClass: "shop-smyths",
    color: "#E2001A",
    icon: "🧸"
  },
  {
    pattern: /thalia\.(de|at|ch)/i,
    name: "Thalia",
    badgeClass: "shop-thalia",
    color: "#990033",
    icon: "📚"
  },
  {
    pattern: /otto\.de/i,
    name: "OTTO",
    badgeClass: "shop-otto",
    color: "#E30613",
    icon: "🛍️"
  },
  {
    pattern: /galaxus\.(de|at|ch)|digitec\.ch/i,
    name: "Galaxus",
    badgeClass: "shop-galaxus",
    color: "#1E2A38",
    icon: "🐢"
  },
  {
    pattern: /mediamarkt\.(de|at|ch)/i,
    name: "MediaMarkt",
    badgeClass: "shop-mediamarkt",
    color: "#DF0000",
    icon: "⚡"
  },
  {
    pattern: /saturn\.de/i,
    name: "Saturn",
    badgeClass: "shop-saturn",
    color: "#005599",
    icon: "🪐"
  },
  {
    pattern: /ikea\.(de|com|at|ch)/i,
    name: "IKEA",
    badgeClass: "shop-ikea",
    color: "#0058A3",
    icon: "🛋️"
  },
  {
    pattern: /lego\.com/i,
    name: "LEGO",
    badgeClass: "shop-lego",
    color: "#D01012",
    icon: "🧱"
  },
  {
    pattern: /etsy\.com/i,
    name: "Etsy",
    badgeClass: "shop-etsy",
    color: "#F1641E",
    icon: "🎨"
  },
  {
    pattern: /zalando\.(de|at|ch)/i,
    name: "Zalando",
    badgeClass: "shop-zalando",
    color: "#FF6900",
    icon: "👟"
  },
  {
    pattern: /babyone\.(de|at)/i,
    name: "BabyOne",
    badgeClass: "shop-babyone",
    color: "#009FE3",
    icon: "👶"
  },
  {
    pattern: /kaufland\.de/i,
    name: "Kaufland",
    badgeClass: "shop-kaufland",
    color: "#D6001C",
    icon: "🛒"
  }
];

export function detectShop(url) {
  if (!url) {
    return {
      name: "Online-Shop",
      badgeClass: "shop-generic",
      color: "#64748B",
      icon: "🔗"
    };
  }

  try {
    const parsed = new URL(url);
    for (const shop of KNOWN_SHOPS) {
      if (shop.pattern.test(parsed.hostname)) {
        return shop;
      }
    }
    // Fallback: hostname säubern
    const hostname = parsed.hostname.replace(/^www\./, "");
    const cleanName = hostname.split(".")[0];
    const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

    return {
      name: capitalized || "Online-Shop",
      badgeClass: "shop-generic",
      color: "#64748B",
      icon: "🌐"
    };
  } catch (e) {
    return {
      name: "Online-Shop",
      badgeClass: "shop-generic",
      color: "#64748B",
      icon: "🔗"
    };
  }
}

/**
 * Ermittelt alle verfügbaren Shops für einen Wunsch (Haupt-Shop + Alternativ-Shops)
 */
export function getWishShops(wish) {
  if (!wish) return [];
  const list = [];
  const seenUrls = new Set();

  const addShop = (name, url, price) => {
    if (!url) return;
    const cleanUrl = url.trim();
    const urlKey = cleanUrl.split("?")[0].toLowerCase();
    if (seenUrls.has(urlKey)) return;
    seenUrls.add(urlKey);

    const detected = detectShop(cleanUrl);
    list.push({
      name: name || detected.name,
      url: cleanUrl,
      price: typeof price === "number" && price > 0 ? price : (typeof wish.price === "number" ? wish.price : 0),
      icon: detected.icon,
      badgeClass: detected.badgeClass,
      color: detected.color
    });
  };

  // 1. Aus explizitem 'shops' Array
  if (Array.isArray(wish.shops) && wish.shops.length > 0) {
    for (const s of wish.shops) {
      if (s && s.url) {
        addShop(s.name, s.url, s.price);
      }
    }
  }

  // 2. Haupt-URL
  if (wish.url) {
    addShop(wish.shopName, wish.url, wish.price);
  }

  // 3. Alternative URL (falls vorhanden)
  if (wish.alternativeUrl) {
    addShop(wish.alternativeShopName, wish.alternativeUrl, wish.alternativePrice);
  }

  // 4. Aus Notiz extrahieren falls Links dort vermerkt sind
  if (wish.note) {
    const noteMatches = wish.note.match(/https?:\/\/[^\s|]+/g);
    if (noteMatches) {
      for (const extractedUrl of noteMatches) {
        let extractedPrice = null;
        const priceMatch = wish.note.match(/(\d+[.,]\d{2})\s*€/);
        if (priceMatch) {
          extractedPrice = parseFloat(priceMatch[1].replace(",", "."));
        }
        addShop(null, extractedUrl, extractedPrice);
      }
    }
  }

  return list;
}

