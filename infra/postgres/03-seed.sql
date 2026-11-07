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
(1,  1, 120),
(2,  1,  80),
(3,  1,  95),
(4,  1, 200),
(5,  1,  60),
(6,  2, 110),
(7,  2,  75),
(8,  2,  40),
(9,  2, 150),
(10, 2,  30);

-- COMMANDES 
INSERT INTO orders.orders (customer_id, status, total_cents) VALUES
(1, 'paid',      1398),   -- poulet rôti (899) + nuggets (549)
(1, 'paid',       699),   -- escalopes
(2, 'pending',   1498),   -- 2x cuisses (749 x 2)
(3, 'paid',       849),   -- brochettes
(3, 'shipped',   1598),   -- filets fermier (999) + cordons bleus (599)
(4, 'cancelled',  499),   -- nuggets (annulée)
(5, 'paid',      1499);   -- poulet fermier bio

--  LIGNES DE COMMANDE 
INSERT INTO orders.order_items (order_id, product_id, quantity, unit_price_cents) VALUES
(1, 1, 1, 899),    -- commande 1 : 1 poulet rôti
(1, 4, 1, 499),    -- commande 1 : 1 nuggets       → total 1398... 
(2, 5, 1, 699),    -- commande 2 : 1 escalopes
(3, 6, 2, 749),    -- commande 3 : 2x cuisses
(4, 7, 1, 849),    -- commande 4 : 1 brochettes
(5, 8, 1, 999),    -- commande 5 : 1 filets fermier
(5, 9, 1, 599),    -- commande 5 : 1 cordons bleus
(6, 4, 1, 499),    -- commande 6 : 1 nuggets (annulée)
(7, 10, 1, 1499);  -- commande 7 : 1 poulet fermier bio

-- PAIEMENTS 
INSERT INTO payments.payments (order_id, amount_cents, status) VALUES
(1, 1398, 'completed'),
(2,  699, 'completed'),
(3, 1498, 'pending'),
(4,  849, 'completed'),
(5, 1598, 'completed'),
(6,  499, 'refunded'),
(7, 1499, 'completed');

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