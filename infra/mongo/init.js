const catalogDb = db.getSiblingDB("market_catalog");
const collectionName = "catalog";

const productSchema = {
  bsonType: "object",
  required: [
    "product_id",
    "name",
    "category",
    "price_cents",
    "status",
    "attributes"
  ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    product_id: {
      bsonType: "int",
      minimum: 1,
      description: "Product identifier shared with the other services"
    },
    name: {
      bsonType: "string",
      minLength: 1
    },
    category: {
      bsonType: "string",
      minLength: 1
    },
    price_cents: {
      bsonType: "int",
      minimum: 0
    },
    status: {
      enum: ["active", "inactive"]
    },
    tags: {
  bsonType: "array",
  items: { bsonType: "string" }
},
    description: {
      bsonType: "string"
    },
    attributes: {
      bsonType: "object"
    },
    indexed_at: {
      bsonType: "date"
    }
    
  }
};

if (!catalogDb.getCollectionNames().includes(collectionName)) {
  catalogDb.createCollection(collectionName, {
    validator: {
      $jsonSchema: productSchema
    },
    validationLevel: "strict",
    validationAction: "error"
  });
} else {
  catalogDb.runCommand({
    collMod: collectionName,
    validator: {
      $jsonSchema: productSchema
    },
    validationLevel: "strict",
    validationAction: "error"
  });
}

catalogDb[collectionName].createIndex(
  { product_id: 1 }, // Ordre croissant sur le champ product_id
  { unique: true, name: "uq_catalog_product_id" }
);

// On crée un index textuel sur les champs "name" et "description" pour permettre la recherche textuelle dans le catalogue.
catalogDb[collectionName].createIndex(
  { name: "text", description: "text" },
  { name: "idx_catalog_text" }
);

catalogDb[collectionName].createIndex(
  { category: 1 },
  { name: "idx_catalog_category" }
);

// On crée un catalogue de produits de poulet 
// Catalogue de composants PC
catalogDb.catalog.insertMany([
  {
    product_id: NumberInt(1),
    name: "AMD Ryzen 5 7600",
    category: "cpu",
    description: "Processeur 6 cœurs / 12 threads, idéal pour le gaming milieu de gamme.",
    tags: ["cpu", "amd", "am5", "gaming"],
    price_cents: NumberInt(19900),
    status: "active",
    attributes: { cores: 6, threads: 12, boost_ghz: 5.1, socket: "AM5" }
  },
  {
    product_id: NumberInt(2),
    name: "Intel Core i5-14600K",
    category: "cpu",
    description: "Processeur 14 cœurs débloqué pour l'overclocking.",
    tags: ["cpu", "intel", "lga1700", "overclocking"],
    price_cents: NumberInt(28900),
    status: "active",
    attributes: { cores: 14, threads: 20, boost_ghz: 5.3, socket: "LGA1700" }
  },
  {
    product_id: NumberInt(3),
    name: "NVIDIA GeForce RTX 4060 8 Go",
    category: "gpu",
    description: "Carte graphique pour jouer en 1080p avec ray tracing.",
    tags: ["gpu", "nvidia", "1080p", "ray tracing"],
    price_cents: NumberInt(29900),
    status: "active",
    attributes: { vram_gb: 8, memory_type: "GDDR6", tdp_w: 115 }
  },
  {
    product_id: NumberInt(4),
    name: "AMD Radeon RX 7800 XT 16 Go",
    category: "gpu",
    description: "Carte graphique pour jouer en 1440p.",
    tags: ["gpu", "amd", "1440p"],
    price_cents: NumberInt(52900),
    status: "active",
    attributes: { vram_gb: 16, memory_type: "GDDR6", tdp_w: 263 }
  },
  {
    product_id: NumberInt(5),
    name: "Corsair Vengeance DDR5 32 Go (2x16) 6000 MHz",
    category: "ram",
    description: "Kit de mémoire DDR5 32 Go pour plateformes récentes.",
    tags: ["ram", "ddr5", "corsair", "32go"],
    price_cents: NumberInt(10900),
    status: "active",
    attributes: { capacity_gb: 32, type: "DDR5", speed_mhz: 6000, modules: 2 }
  },
  {
    product_id: NumberInt(6),
    name: "Samsung 990 Pro 1 To NVMe",
    category: "stockage",
    description: "SSD NVMe PCIe 4.0 très rapide pour le système et les jeux.",
    tags: ["ssd", "nvme", "samsung", "1to"],
    price_cents: NumberInt(11900),
    status: "active",
    attributes: { capacity_gb: 1000, interface: "NVMe PCIe 4.0", read_mbps: 7450 }
  },
  {
    product_id: NumberInt(7),
    name: "MSI MAG B650 Tomahawk",
    category: "carte_mere",
    description: "Carte mère ATX pour processeurs AMD AM5.",
    tags: ["carte mère", "msi", "am5", "atx"],
    price_cents: NumberInt(18900),
    status: "active",
    attributes: { socket: "AM5", chipset: "B650", form_factor: "ATX", ram_type: "DDR5" }
  },
  {
    product_id: NumberInt(8),
    name: "Corsair RM750e",
    category: "alimentation",
    description: "Alimentation 750 W modulaire certifiée 80+ Gold.",
    tags: ["alimentation", "corsair", "750w", "modulaire"],
    price_cents: NumberInt(9900),
    status: "active",
    attributes: { power_w: 750, certification: "80+ Gold", modular: true }
  },
  {
    product_id: NumberInt(9),
    name: "Fractal Design North",
    category: "boitier",
    description: "Boîtier ATX avec façade en bois et panneau vitré.",
    tags: ["boîtier", "fractal", "atx"],
    price_cents: NumberInt(13900),
    status: "active",
    attributes: { form_factor: "ATX", color: "noir", glass_panel: true }
  },
  {
    product_id: NumberInt(10),
    name: "Noctua NH-D15",
    category: "refroidissement",
    description: "Ventirad double tour très silencieux.",
    tags: ["ventirad", "noctua", "silencieux"],
    price_cents: NumberInt(10900),
    status: "active",
    attributes: { type: "ventirad", height_mm: 165, fans: 2 }
  }
]);