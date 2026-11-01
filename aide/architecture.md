# Architecture MarketChicken

## Vue d'ensemble

Le frontend ne parle jamais directement à une base de données. Chaque requête traverse les couches suivantes :

```
Frontend (React, 5 onglets)
      ↓  HTTP (REST / GraphQL) + JWT
API Gateway  (vérifie le JWT : 401 si absent/invalide)
      ↓  route vers le bon microservice
Microservices (un par domaine métier)
      ↓  vérifie le rôle RBAC du JWT : 403 si insuffisant
      ↓  se connecte à SA base avec SON rôle dédié
Bases de données (PostgreSQL schémas + MongoDB)
```

## Les microservices et leurs données

| Microservice | Stocke dans | Rôle DB dédié | Appelle |
|---|---|---|---|
| `orders` | PostgreSQL schéma `orders` | `orders_svc` | catalog, stock, payment |
| `inventory` (stock) | PostgreSQL schéma `inventory` | `inventory_svc` | aucun |
| `payments` | PostgreSQL schéma `payments` | `payments_svc` | aucun |
| `catalog` | MongoDB `market_catalog` | (à définir si besoin) | aucun |
| `auth` | PostgreSQL schéma `auth` | `auth_svc` | aucun |

Règle stricte : **un service ne lit jamais directement les tables d'un autre service**. S'il a besoin d'une donnée qui appartient à un autre domaine (ex: `orders` a besoin du prix d'un produit géré par `catalog`), il appelle l'API de ce service, jamais sa base.

## Les 3 couches de "rôle" — à ne pas confondre

Le mot "rôle" désigne 3 mécanismes différents dans ce projet, à des niveaux différents :

| Couche | Protège quoi | Qui vérifie | Exemple |
|---|---|---|---|
| Rôle **PostgreSQL** | Les tables en base | Postgres lui-même | `orders_svc` ne peut pas lire le schéma `payments` |
| Rôle **RBAC** (dans le JWT) | Les endpoints API | Chaque microservice + la gateway | `analyst` ne peut pas faire `POST /v1/orders` → 403 |
| Rôle côté **frontend** | L'affichage (UX) | Le composant React | Cache le bouton "créer un produit" si l'utilisateur n'est pas `catalog_manager` |

La couche frontend est un confort d'UX, **pas une sécurité** : la vraie vérification doit toujours avoir lieu côté API (couche RBAC), car un utilisateur peut toujours appeler l'API directement en contournant l'interface.

## Pourquoi un rôle PostgreSQL par service

Avant ce découpage, tous les services se connectaient avec un seul compte admin (`market`) ayant accès à tout. Problèmes que ça poserait :
- Une faille dans un seul service (ex: `catalog`) donnerait accès à **toutes** les données (paiements inclus).
- Aucune preuve réelle d'isolation entre microservices — seulement une séparation "de façade" dans le code.

Avec un rôle dédié par service (`orders_svc`, `inventory_svc`, `payments_svc`, `auth_svc`), chacun n'a de droits (`USAGE` + `SELECT/INSERT/UPDATE/DELETE` + accès aux séquences) **que sur son propre schéma**. Voir `infra/postgres/02-roles.sh` pour l'implémentation.

MongoDB n'a pas ce même découpage car une seule base Mongo est utilisée par un seul service (`catalog`) — il n'y a personne d'autre à isoler.

## Flux d'une requête type : `GET /v1/orders`

1. Le frontend envoie `GET /v1/orders` avec `Authorization: Bearer <JWT>`.
2. L'API Gateway vérifie la signature et l'expiration du JWT. Invalide/absent → `401`.
3. La requête est routée vers le microservice `orders`.
4. Le service `orders` lit le rôle dans le JWT et vérifie qu'il a le droit de lire les commandes. Rôle insuffisant → `403`.
5. Le service `orders` interroge PostgreSQL avec le compte `orders_svc` (accès au schéma `orders` uniquement).
6. Réponse JSON renvoyée au frontend.

## Couches encore à construire (voir roadmap)

- **Gateway** (`gateway/`) : actuellement vide, à construire en Phase 2.
- **Microservices** (`services/`) : actuellement vide, à construire en Phase 2.
- **Streaming** (`streaming/`, Kafka + Spark Structured Streaming) : Phase 3.
- **Data Lake** (MinIO + Spark + Delta/Iceberg) : Phase 4.
- **Observabilité** (Prometheus/Grafana/OpenTelemetry) : Phase 6.
