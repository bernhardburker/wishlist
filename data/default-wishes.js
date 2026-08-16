/**
 * Standard-Wünsche zur Initialisierung, falls noch keine eigenen Daten vorliegen.
 * Diese können im Admin-Modus frei bearbeitet, gelöscht oder erweitert werden.
 */
export const defaultWishes = [
  {
    id: "wish-1",
    title: "LEGO City Arktis-Forschungsstation",
    url: "https://www.smythstoys.com/de/de-de/spielzeug/lego/lego-city/lego-city-set-60378-arktis-expedition-rettungs-mobil/p/222384",
    price: 49.99,
    category: "Spielzeug",
    priority: "high", // 'high' = Lieblingswunsch, 'medium' = Normal, 'low' = Wäre nett
    image: "https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=600&auto=format&fit=crop&q=80",
    description: "Großer Wunsch für spannende Bauabenteuer. Gibt es bei Smyths Toys oder direkt bei Lego.",
    shopName: "Smyths Toys",
    status: "available", // 'available' | 'reserved' | 'bought'
    reservedBy: "",
    reservedAt: null,
    note: "Set 60378",
    reservePin: ""
  },
  {
    id: "wish-2",
    title: "Toniebox Hörfigur: Die kleine Hexe",
    url: "https://www.amazon.de/dp/B08HJTY94X",
    price: 16.99,
    category: "Spielzeug",
    priority: "high",
    image: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&auto=format&fit=crop&q=80",
    description: "Hörspiel-Tonie für die Toniebox zum Einschlafen und Entspannen.",
    shopName: "Amazon",
    status: "available",
    reservedBy: "",
    reservedAt: null,
    note: "Farbe/Ausführung: Otfried Preußler Originalton",
    reservePin: ""
  },
  {
    id: "wish-3",
    title: "Kinderbuch: Der Löwe in dir",
    url: "https://www.thalia.de/shop/home/artikeldetails/A1037305988",
    price: 15.00,
    category: "Bücher",
    priority: "medium",
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80",
    description: "Ein wunderschön illustriertes Bilderbuch von Rachel Bright & Jim Field.",
    shopName: "Thalia",
    status: "available",
    reservedBy: "",
    reservedAt: null,
    note: "Hardcover Ausgabe",
    reservePin: ""
  },
  {
    id: "wish-4",
    title: "Kinder-Gartenwerkzeug-Set aus Metall",
    url: "https://www.amazon.de/dp/B07Y8M7KL1",
    price: 24.50,
    category: "Garten & Outdoor",
    priority: "medium",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&auto=format&fit=crop&q=80",
    description: "Echtes Werkzeug für Kinder mit kleiner Schaufel, Rechen und Tragetasche.",
    shopName: "Amazon",
    status: "available",
    reservedBy: "",
    reservedAt: null,
    note: "Stabile Holzausführung",
    reservePin: ""
  },
  {
    id: "wish-5",
    title: "Kuschelige Fleece-Jacke mit Kapuze",
    url: "https://www.otto.de/p/kinder-fleecejacke-warm-gefuettert-S0K12345",
    price: 29.95,
    category: "Kleidung",
    priority: "low",
    image: "https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=600&auto=format&fit=crop&q=80",
    description: "Für die kältere Jahreszeit.",
    shopName: "Otto",
    status: "available",
    reservedBy: "",
    reservedAt: null,
    note: "Größe 116 / 122 in Dunkelblau oder Waldgrün",
    reservePin: ""
  },
  {
    id: "wish-6",
    title: "Gutschein für den Zoo / Tierpark",
    url: "https://www.zoo-berlin.de/de/tickets/gutscheine",
    price: 35.00,
    category: "Erlebnisse & Gutscheine",
    priority: "high",
    image: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=600&auto=format&fit=crop&q=80",
    description: "Gemeinsame Zeit und Ausflüge sind das schönste Geschenk!",
    shopName: "Zoo / Erlebnisse",
    status: "available",
    reservedBy: "",
    reservedAt: null,
    note: "Tageskarte für einen schönen Familienausflug",
    reservePin: ""
  }
];

export const defaultSettings = {
  listTitle: "Unsere Wunschliste 🎁",
  listSubtitle: "Herzlich willkommen! Hier findet ihr alle Geschenkideen. Wählt einfach etwas Schönes aus und reserviert es mit eurem Namen, damit es keine doppelten Geschenke gibt.",
  eventDate: "", // z. B. "2026-12-24"
  adminPin: "1234",
  categories: [
    "Alle",
    "Spielzeug",
    "Bücher",
    "Kleidung",
    "Garten & Outdoor",
    "Elektronik",
    "Erlebnisse & Gutscheine",
    "Wohnen & Deko",
    "Sonstiges"
  ]
};
