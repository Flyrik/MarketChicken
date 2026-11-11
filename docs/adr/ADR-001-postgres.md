# ADR-001 — PostgreSQL pour les commandes, le stock, les paiements et l'auth

**Statut** : Acceptée

## Contexte

On doit stocker des commandes, du stock et des paiements. Ces données ont des relations fortes entre elles (un paiement appartient à une commande, un stock appartient à un entrepôt). On a besoin de :
- Transactions ACID (ne pas vendre un produit qui n'est plus en stock)
- Intégrité référentielle (clés étrangères)
- Cohérence immédiate (le stock doit être exact à tout moment)

## Options

| Option | Points forts | Points faibles |
|---|---|---|
| **PostgreSQL** | ACID, clés étrangères, schémas séparés par service, rôles SQL pour l'isolation | Moins flexible pour des données sans structure fixe |
| **MongoDB** | Schéma souple, bon pour les documents variés | Pas de clé étrangère native, cohérence éventuelle par défaut |
| **Cassandra** | Très performant en écriture, scalable | Cohérence éventuelle, pas de transactions multi-tables |

## Décision

PostgreSQL. Les données transactionnelles (commandes, paiements) doivent être **toujours exactes** — on ne peut pas vendre un produit épuisé ni perdre un paiement. C'est le théorème CAP : on choisit la cohérence (CP) plutôt que la disponibilité (AP).

## Conséquences

- Un schéma PostgreSQL par service (`orders`, `inventory`, `payments`, `auth`) avec isolation par rôle SQL
- Pas de scalabilité horizontale native — pour grandir, on renforce le serveur (scale-up) avant d'envisager du sharding
- Le lien avec MongoDB (catalogue) passe par `product_id` vérifié par le code, pas par une clé étrangère