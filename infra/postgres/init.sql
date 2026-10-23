CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS orders.customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS orders.orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_customer_fk
        FOREIGN KEY (customer_id) REFERENCES orders.customers (id)
);

CREATE TABLE IF NOT EXISTS orders.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    CONSTRAINT order_items_order_fk
        FOREIGN KEY (order_id) REFERENCES orders.orders (id)
);

CREATE TABLE IF NOT EXISTS inventory.warehouses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    capacity_units INTEGER NOT NULL CHECK (capacity_units >= 0)
);

CREATE TABLE IF NOT EXISTS inventory.stock (
    product_id INTEGER PRIMARY KEY,
    warehouse_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    CONSTRAINT stock_warehouse_fk
        FOREIGN KEY (warehouse_id) REFERENCES inventory.warehouses (id)
);

CREATE TABLE IF NOT EXISTS payments.payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS auth.user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT user_roles_user_fk
        FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT user_roles_role_fk
        FOREIGN KEY (role_id) REFERENCES auth.roles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS orders_customer_id_idx
    ON orders.orders (customer_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
    ON orders.order_items (order_id);
CREATE INDEX IF NOT EXISTS stock_warehouse_id_idx
    ON inventory.stock (warehouse_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx
    ON auth.user_roles (role_id);
