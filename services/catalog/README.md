# Service Catalogue

API GraphQL du catalogue produit. Ce service est le seul à accéder à MongoDB
pour lire ou modifier les produits.

## Lancement avec Docker Compose

À la racine du dépôt, créez un fichier `.env` à partir de `.env.example` et
remplacez les valeurs par des secrets locaux. `CATALOG_MONGO_PASSWORD` doit
contenir au moins 32 caractères hexadécimaux (`0-9`, `a-f`).

```powershell
docker compose up --build -d
docker compose ps
```

L'API GraphQL est disponible sur `http://localhost:4000/graphql` et son
contrôle de santé sur `http://localhost:4000/healthz`.

## Tests automatisés

Les tests unitaires vérifient le schéma GraphQL, les filtres, les mutations et
les validations avec une collection Mongo simulée. Depuis la racine du dépôt,
ils peuvent être lancés dans un conteneur Node sans installer Node.js sur
l'hôte :

```powershell
docker run --rm --mount "type=bind,source=$((Get-Location).Path)\services\catalog,target=/app" -w /app node:22-alpine sh -c "npm ci --no-audit --no-fund && npm test"
```

Les tests n'effacent ni ne modifient les données MongoDB.

## Exemple de lecture

```graphql
query {
  products(search: "poulet") {
    productId
    name
    category
    priceCents
    attributes
  }
}
```

## Exemple de création

```graphql
mutation {
  createProduct(input: {
    name: "Filets fermiers"
    category: "filets"
    priceCents: 1099
    tags: ["poulet", "fermier"]
    attributes: { pieces: 2, bio: true }
  }) {
    productId
    name
  }
}
```

## Modifier et retirer un produit

```graphql
mutation {
  updateProduct(productId: 1, input: { priceCents: 949 }) {
    productId
    priceCents
    indexedAt
  }
}
```

```graphql
mutation {
  archiveProduct(productId: 1) {
    productId
    status
  }
}
```

`deleteProduct(productId: Int!)` retire également le produit du catalogue actif
en le passant à `inactive` : la suppression est logique, sans effacer le
document. Cette politique protège l'historique des commandes, car le Catalogue
ne lit pas la base du service Commandes et ne peut pas savoir si un produit a
déjà été commandé. `archiveProduct` est l'opération explicite recommandée pour
cet usage.

Les identifiants sont attribués par le service. Les produits d'exemple reçoivent
une date `indexedAt` lors de l'initialisation MongoDB.
