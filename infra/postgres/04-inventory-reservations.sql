-- Upgrade existing development databases to the inventory reservation model.
DO $$
DECLARE
    primary_key_name TEXT;
    primary_key_columns TEXT[];
BEGIN
    SELECT constraint_row.conname, array_agg(attribute_row.attname ORDER BY key_column.ordinality)
    INTO primary_key_name, primary_key_columns
    FROM pg_constraint AS constraint_row
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        ON TRUE
    JOIN pg_attribute AS attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = key_column.attnum
    WHERE constraint_row.conrelid = 'inventory.stock'::regclass
      AND constraint_row.contype = 'p'
    GROUP BY constraint_row.conname;

    IF primary_key_columns IS DISTINCT FROM ARRAY['product_id', 'warehouse_id']::TEXT[] THEN
        EXECUTE format('ALTER TABLE inventory.stock DROP CONSTRAINT %I', primary_key_name);
        ALTER TABLE inventory.stock
            ADD CONSTRAINT stock_pkey PRIMARY KEY (product_id, warehouse_id);
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS inventory.reservations (
    id UUID PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    request_hash TEXT NOT NULL,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory.reservation_items (
    reservation_id UUID NOT NULL,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (reservation_id, product_id, warehouse_id),
    CONSTRAINT reservation_items_reservation_fk
        FOREIGN KEY (reservation_id) REFERENCES inventory.reservations (id),
    CONSTRAINT reservation_items_stock_fk
        FOREIGN KEY (product_id, warehouse_id)
        REFERENCES inventory.stock (product_id, warehouse_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_name_uq
    ON inventory.warehouses (name);
CREATE INDEX IF NOT EXISTS reservations_order_id_idx
    ON inventory.reservations (order_id);

INSERT INTO inventory.warehouses (name, capacity_units)
VALUES ('Entrepôt Paris', 5000), ('Entrepôt Lyon', 3000)
ON CONFLICT (name) DO NOTHING;

INSERT INTO inventory.stock (product_id, warehouse_id, quantity)
SELECT seed.product_id, warehouse.id, seed.quantity
FROM (VALUES
    (1, 'Entrepôt Paris', 120),
    (2, 'Entrepôt Paris', 80),
    (3, 'Entrepôt Paris', 95),
    (4, 'Entrepôt Paris', 200),
    (5, 'Entrepôt Paris', 60),
    (6, 'Entrepôt Lyon', 110),
    (7, 'Entrepôt Lyon', 75),
    (8, 'Entrepôt Lyon', 40),
    (9, 'Entrepôt Lyon', 150),
    (10, 'Entrepôt Lyon', 30)
) AS seed(product_id, warehouse_name, quantity)
JOIN inventory.warehouses AS warehouse ON warehouse.name = seed.warehouse_name
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

GRANT USAGE ON SCHEMA inventory TO inventory_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO inventory_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO inventory_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE market IN SCHEMA inventory
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE market IN SCHEMA inventory
    GRANT USAGE, SELECT ON SEQUENCES TO inventory_svc;
