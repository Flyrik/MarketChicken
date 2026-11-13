-- On va remplir notre base de données avec des données initiales pour les tests.






-- CLIENTS 
INSERT INTO orders.customers (name, email) VALUES
('Jean Dupont',    'jean.dupont@example.com'),
('Marie Martin',   'marie.martin@example.com'),
('Lucas Bernard',  'lucas.bernard@example.com'),
('Sophie Petit',   'sophie.petit@example.com'),
('Thomas Moreau',  'thomas.moreau@example.com');

--  ENTREPÔTS 
INSERT INTO inventory.warehouses (name, capacity_units) VALUES
('Entrepôt Paris',  5000),
('Entrepôt Lyon',   3000);

-- STOCK (product_id = ceux du catalogue Mongo, warehouse_id = 1 ou 2) 



INSERT INTO inventory.stock (product_id, warehouse_id, quantity) VALUES
(1,  1,  50),   -- Ryzen 5 7600
(2,  1,  40),   -- Core i5-14600K
(3,  1,  30),   -- RTX 4060
(4,  1,  15),   -- RX 7800 XT
(5,  1, 120),   -- RAM DDR5 32 Go
(6,  2, 100),   -- SSD 990 Pro
(7,  2,  35),   -- Carte mère B650
(8,  2,  60),   -- Alimentation RM750e
(9,  2,  25),   -- Boîtier North
(10, 2,  45);   -- Ventirad NH-D15

-- COMMANDES 
INSERT INTO orders.orders (customer_id, status, total_cents) VALUES
(1, 'paid',      30800),   -- Ryzen 5 (19900) + RAM (10900)
(1, 'paid',      11900),   -- SSD
(2, 'pending',   21800),   -- 2x RAM (10900 x 2)
(3, 'paid',       9900),   -- Alimentation
(3, 'shipped',   48800),   -- RTX 4060 (29900) + carte mère (18900)
(4, 'cancelled', 11900),   -- SSD (annulée)
(5, 'paid',      52900);   -- RX 7800 XT


--  LIGNES DE COMMANDE 

INSERT INTO orders.order_items (order_id, product_id, quantity, unit_price_cents) VALUES
(1, 1, 1, 19900),   -- commande 1 : Ryzen 5 7600
(1, 5, 1, 10900),   -- commande 1 : RAM DDR5
(2, 6, 1, 11900),   -- commande 2 : SSD
(3, 5, 2, 10900),   -- commande 3 : 2x RAM DDR5
(4, 8, 1,  9900),   -- commande 4 : Alimentation
(5, 3, 1, 29900),   -- commande 5 : RTX 4060
(5, 7, 1, 18900),   -- commande 5 : Carte mère B650
(6, 6, 1, 11900),   -- commande 6 : SSD (annulée)
(7, 4, 1, 52900);   -- commande 7 : RX 7800 XT

-- PAIEMENTS 

INSERT INTO payments.payments (order_id, amount_cents, status) VALUES
(1, 30800, 'completed'),
(2, 11900, 'completed'),
(3, 21800, 'pending'),
(4,  9900, 'completed'),
(5, 48800, 'completed'),
(6, 11900, 'refunded'),
(7, 52900, 'completed');


-- RÔLES RBAC 
INSERT INTO auth.roles (name, description) VALUES
('admin',            'Accès total'),
('catalog_manager',  'Gestion du catalogue produits'),
('analyst',          'Consultation des données et rapports'),
('logistics',        'Gestion des entrepôts et du stock'),
('service_account',  'Compte technique pour les microservices');

--  UTILISATEURS DE TEST 
INSERT INTO auth.users (email, password_hash) VALUES
('admin@marketchicken.com',     '$2b$10$placeholder_admin_hash'),
('catalogue@marketchicken.com', '$2b$10$placeholder_catalog_hash'),
('analyste@marketchicken.com',  '$2b$10$placeholder_analyst_hash'),
('logistique@marketchicken.com','$2b$10$placeholder_logistics_hash');

--  ATTRIBUTION DES RÔLES 
INSERT INTO auth.user_roles (user_id, role_id) VALUES
(1, 1),   -- admin@       → admin
(2, 2),   -- catalogue@   → catalog_manager
(3, 3),   -- analyste@    → analyst
(4, 4);   -- logistique@  → logistics