
const password = process.env.CATALOG_MONGO_PASSWORD;



if (typeof password !== "string" || !/^[A-Fa-f0-9]{32,}$/.test(password)) {
  throw new Error(
    "CATALOG_MONGO_PASSWORD must contain at least 32 hexadecimal characters"
  );
}

db.getSiblingDB("market_catalog").createUser({
  user: "catalog_svc",
  pwd: password,
  roles: [{ role: "readWrite", db: "market_catalog" }]
});
