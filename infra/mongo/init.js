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
    attributes: {
      bsonType: "object"
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
  { product_id: 1 },
  { unique: true, name: "uq_catalog_product_id" }
);
