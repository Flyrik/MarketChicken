# Service Stock (Inventory)

Le service Stock est propriétaire des entrepôts, des quantités et des
réservations. Il utilise uniquement le schéma PostgreSQL `inventory` avec le
rôle `inventory_svc`. Un `productId` est une référence vers Catalogue, pas une
clé étrangère inter-service.

## Démarrer

Depuis la racine du dépôt, vérifiez que `.env` contient
`INVENTORY_DB_PASSWORD` avec la même valeur que celle utilisée lors de
l'initialisation PostgreSQL.

Sur un nouveau volume, Compose exécute les scripts SQL d'initialisation dans
l'ordre avant de démarrer le service :

```powershell
docker compose up --build -d inventory
docker compose ps
```

Sur un volume PostgreSQL déjà initialisé, appliquez la migration avant de
démarrer Inventory :

```powershell
docker compose exec -T postgres psql -U market -d market -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/04-inventory-reservations.sql
docker compose up --build -d inventory
```

La migration suppose que le rôle `inventory_svc` existe déjà. Si les rôles
applicatifs n'ont jamais été créés sur cette base existante, exécutez le script
`02-roles.sh` une seule fois avant la migration, avec les secrets présents dans
`.env`.

Le service REST écoute sur `http://localhost:4001`. Son endpoint de santé est
`GET /healthz`. Le contrat versionné est dans [openapi.yaml](./openapi.yaml).

Ne supprimez pas le volume PostgreSQL pour appliquer la migration : cela
effacerait les données locales.

La migration ajoute deux entrepôts de démonstration et le stock des produits
1 à 10 si ces données ne sont pas déjà présentes.

## Routes

| Méthode et route | Usage |
|---|---|
| `GET /v1/warehouses` | Lister les entrepôts |
| `POST /v1/warehouses` | Créer un entrepôt (`name`, `capacityUnits`) |
| `GET /v1/stock?productId=1&warehouseId=1` | Lire le stock, filtrable par produit et/ou entrepôt |
| `PUT /v1/stock` | Définir la quantité disponible (`productId`, `warehouseId`, `quantity`) |
| `POST /v1/reservations` | Réserver plusieurs lignes atomiquement |
| `GET /v1/reservations/{id}` | Lire une réservation |
| `POST /v1/reservations/{id}/release` | Libérer une réservation et rendre le stock |
| `POST /v1/reservations/{id}/confirm` | Confirmer une réservation après paiement réussi |

### Créer une réservation

Chaque réservation requiert un en-tête `Idempotency-Key`. Renvoyer exactement
la même demande avec la même clé retourne la réservation existante sans
décrémenter le stock une seconde fois. Réutiliser la clé pour un contenu
différent renvoie `409 IDEMPOTENCY_KEY_REUSED`.

```powershell
$body = @{
  orderId = 42
  items = @(
    @{ productId = 1; warehouseId = 1; quantity = 2 }
  )
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:4001/v1/reservations `
  -Method Post `
  -Headers @{ 'Idempotency-Key' = 'order-42-reservation-1' } `
  -ContentType 'application/json' `
  -Body $body
```

Une quantité absente ou insuffisante renvoie `409 INSUFFICIENT_STOCK`. La
réservation et les décréments sont dans une transaction PostgreSQL : si une
ligne échoue, aucune ligne ne reste réservée. Les quantités doivent être
positives et une seule ligne par couple produit/entrepôt est acceptée.

Cette API est actuellement destinée au réseau local de développement et n'a
pas encore d'authentification applicative ; les contrôles JWT/RBAC seront
ajoutés avec la Gateway.

## Tests

Les tests automatisés couvrent le contrat HTTP, la validation des entrées,
l'idempotency-key et les erreurs. Après le démarrage du service, lancez depuis
la racine :

```sh
docker compose exec inventory npm test
```
