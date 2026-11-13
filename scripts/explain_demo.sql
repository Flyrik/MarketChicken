-- Démo Volet 1 : effet de l'index orders_created_at_idx
-- Requête testée : "commandes du jour" (onglet Vue d'ensemble)
-- Tout est dans une transaction annulée à la fin : la base reste propre.

--- Commande pour tester :  
--- docker exec -i market-postgres psql -U market -d market < scripts/explain_demo.sql




BEGIN;

-- 1. On remplit la table : 100 000 commandes sur les 180 derniers jours
INSERT INTO orders.orders (customer_id, status, total_cents, created_at)
SELECT (random()*4 + 1)::int,
       'paid',
       (random()*50000)::int,
       now() - random() * interval '180 days'
FROM generate_series(1, 100000);
ANALYZE orders.orders;

-- 2. SANS index
DROP INDEX orders.orders_created_at_idx;
\echo '===== SANS INDEX ====='
EXPLAIN ANALYZE
SELECT * FROM orders.orders WHERE created_at >= current_date;

-- 3. AVEC index
CREATE INDEX orders_created_at_idx ON orders.orders (created_at);
ANALYZE orders.orders;
\echo '===== AVEC INDEX ====='
EXPLAIN ANALYZE
SELECT * FROM orders.orders WHERE created_at >= current_date;

ROLLBACK;


