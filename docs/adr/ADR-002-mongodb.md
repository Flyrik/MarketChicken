# ADR-002 — MongoDB pour le catalogue produits

**Statut** : Acceptée

## Contexte

On doit stocker un catalogue de produits. Chaque produit a des attributs différents selon sa catégorie (un poulet rôti a un poids, des nuggets ont un nombre de pièces et un type de panure, des brochettes ont une marinade). On a besoin de :
- Un schéma souple (chaque produit a des champs différents dans `attributes`)
- Une recherche texte sur le nom et la description
- Un CRUD simple (créer, lire, modifier, archiver, supprimer)

## Options

| Option | Points forts | Points faibles |
|---|---|---|
| **MongoDB** | Schéma souple (documents JSON), index texte natif, validation JSON Schema | Pas de clé étrangère, cohérence éventuelle |
| **PostgreSQL (JSONB)** | On a déjà Postgres, colonnes JSONB possibles | Requêtes JSONB plus complexes, mélange deux usages dans le même moteur |
| **Elasticsearch** | Recherche texte très puissante | Trop lourd pour un simple CRUD catalogue, pas une base primaire |

## Décision

MongoDB. Les produits n'ont pas tous les mêmes attributs — un schéma fixe avec des colonnes forcerait des champs vides ou une colonne JSONB dans Postgres (ce qui revient à faire du document store dans un moteur relationnel). MongoDB est conçu pour ça. Le lien avec Postgres passe par `product_id`, vérifié par le code.

## Conséquences

- Pas de clé étrangère entre MongoDB et PostgreSQL — c'est le code (les microservices) qui vérifie que le `product_id` existe
- Un seul service (`catalog`) accède à cette base — pas besoin d'isolation par rôle comme dans Postgres
- Index texte sur `name` et `description` + index classique sur `category` pour les recherches et le filtrage