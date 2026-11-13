#!/bin/bash

# set -e : si une commande échoue, le script s'arrête immédiatement
set -e




# Crée 4 comptes de connexion Postgres (un par microservice : orders, inventory,
# payments, auth), chacun avec le droit de lire/écrire uniquement dans son propre
# schéma — un service ne peut pas toucher aux tables d'un autre.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE orders_svc LOGIN PASSWORD '$ORDERS_DB_PASSWORD';
    GRANT USAGE ON SCHEMA orders TO orders_svc;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA orders TO orders_svc;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA orders TO orders_svc;

    CREATE ROLE inventory_svc LOGIN PASSWORD '$INVENTORY_DB_PASSWORD';
    GRANT USAGE ON SCHEMA inventory TO inventory_svc;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO inventory_svc;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO inventory_svc;
    ALTER DEFAULT PRIVILEGES FOR ROLE market IN SCHEMA inventory
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_svc;
    ALTER DEFAULT PRIVILEGES FOR ROLE market IN SCHEMA inventory
        GRANT USAGE, SELECT ON SEQUENCES TO inventory_svc;

    CREATE ROLE payments_svc LOGIN PASSWORD '$PAYMENTS_DB_PASSWORD';
    GRANT USAGE ON SCHEMA payments TO payments_svc;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payments TO payments_svc;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA payments TO payments_svc;

    CREATE ROLE auth_svc LOGIN PASSWORD '$AUTH_DB_PASSWORD';
    GRANT USAGE ON SCHEMA auth TO auth_svc;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO auth_svc;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO auth_svc;
EOSQL



# Mettre "End of Line Sequence" sur -> LF" pour que docker lancer bien le script. Sinon, il y a une erreur de syntaxe sur la ligne 1 (#!/bin/bash)  et le script ne s'exécute pas.