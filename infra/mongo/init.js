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

catalogDb.catalog.insertMany([
  {
    product_id: NumberInt(1),
    name: "Poulet rôti entier",
    category: "rotisserie",
    description: "Poulet rôti entier, prêt à manger, idéal pour les repas en famille.",
    tags: ["poulet", "rôti", "entier", "repas familial"],
    price_cents: NumberInt(899),
    status: "active",
    attributes: { weight_g: 1200, bio: false }
  },
  {
    product_id: NumberInt(2),
    name: "Pilons de poulet x6",
    category: "pieces",
    description: "Lot de 6 pilons de poulet, parfaits pour les barbecues et les repas rapides. ( Il aime trop Tristan #MP)",
    tags: ["poulet", "pilons", "barbecue", "repas rapide"],
    price_cents: NumberInt(549),
    status: "active",
    attributes: { pieces: 6, bio: false }
  },
  {
    product_id: NumberInt(3),
    name: "Ailes grillées x8",
    category: "pieces",
    description: "Lot de 8 ailes de poulet grillées, délicieusement assaisonnées pour un goût savoureux.",
    tags: ["poulet", "ailes", "grillées", "assaisonnées"],
    price_cents: NumberInt(649),
    status: "active",
    attributes: { pieces: 8, marinade: "barbecue" }
  },
  {
    product_id: NumberInt(4),
    name: "Nuggets poulet x20",
    category: "transforme",
    description: "Lot de 20 nuggets de poulet croustillants, parfaits pour les enfants et les apéritifs.",
    tags: ["poulet", "nuggets", "croustillants", "apéritif"],
    price_cents: NumberInt(499),
    status: "active",
    attributes: { pieces: 20, panure: "croustillante" }
  },
  {
    product_id: NumberInt(5),
    name: "Escalopes de poulet x2",
    category: "filets",
    description: "Lot de 2 escalopes de poulet tendres, idéales pour des repas rapides et sains.",
    tags: ["poulet", "escalopes", "tendres", "repas rapide"],
    price_cents: NumberInt(699),
    status: "active",
    attributes: { pieces: 2, weight_g: 300 }
  },
  {
    product_id: NumberInt(6),
    name: "Cuisses de poulet x4",
    category: "pieces",
    description: "Lot de 4 cuisses de poulet, parfaites pour les plats mijotés et les repas en famille.",
    tags: ["poulet", "cuisses", "mijoté", "repas familial"],
    price_cents: NumberInt(749),
    status: "active",
    attributes: { pieces: 4, bio: true }
  },
  {
    product_id: NumberInt(7),
    name: "Brochettes de poulet x6",
    category: "transforme",
    description: "Lot de 6 brochettes de poulet marinées, idéales pour les barbecues et les repas conviviaux.",
    tags: ["poulet", "brochettes", "marinées", "barbecue"],
    price_cents: NumberInt(849),
    status: "active",
    attributes: { pieces: 6, marinade: "curry" }
  },
  {
    product_id: NumberInt(8),
    name: "Filets de poulet fermier x2",
    category: "filets",
    description: "Lot de 2 filets de poulet fermier bio, élevés en plein air pour une qualité supérieure.",
    tags: ["poulet", "filets", "fermier", "bio"],
    price_cents: NumberInt(999),
    status: "active",
    attributes: { pieces: 2, weight_g: 400, bio: true }
  },
  {
    product_id: NumberInt(9),
    name: "Cordons bleus poulet x4",
    category: "transforme",
    description: "Lot de 4 cordons bleus de poulet, parfaits pour les repas en famille.",
    tags: ["poulet", "cordons bleus", "repas familial"],
    price_cents: NumberInt(599),
    status: "active",
    attributes: { pieces: 4, fourrage: "fromage" }
  },
  {
    product_id: NumberInt(10),
    name: "Poulet entier fermier bio",
    category: "rotisserie",
    description: "Poulet entier fermier bio, élevé en plein air, pour une saveur authentique et naturelle.",
    tags: ["poulet", "entier", "fermier", "bio"],
    price_cents: NumberInt(1499),
    status: "active",
    attributes: { weight_g: 1500, bio: true, label: "Label Rouge" }
  }
]);

