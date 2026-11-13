# Raw snapshot ingestion

This one-shot job copies the current MongoDB catalog and PostgreSQL inventory
tables into the private `market-data` RustFS bucket. It does not modify either
source database.

The snapshots are newline-delimited JSON (NDJSON). MongoDB documents use
Canonical Extended JSON so BSON types such as ObjectId, dates, and 32-bit
integers are retained. PostgreSQL exports only the `inventory` schema; auth,
orders, and payment data are intentionally excluded.

Each run writes new objects under:

- `raw/postgres/inventory/<table>/ingestion_date=<date>/run_id=<id>.ndjson`
- `raw/mongodb/market_catalog/catalog/ingestion_date=<date>/run_id=<id>.ndjson`
- `raw/_manifests/<id>.json`

The manifest is written last. If a source export fails, the job exits with an
error and does not publish a completed manifest. Previously written snapshots
are never overwritten or deleted.

## Requirements

- RustFS is available with the configured object-storage credentials. The job
  creates the `market-data` bucket if it does not exist.
- PostgreSQL has the `inventory` schema and the `inventory_svc` read privileges.
- MongoDB has the `catalog_svc` account with access to `market_catalog`.
- The local `.env` contains the database and RustFS credentials.

The existing Compose data volumes must be accessible with the credentials in
`.env`; this job does not reset or migrate database volumes.

## Run with Docker Compose

```powershell
docker compose --profile data run --rm raw-ingestion
```

From the host, install dependencies once and run:

```powershell
npm --prefix data/raw-ingestion ci
npm --prefix data/raw-ingestion run raw
```

The job connects to `localhost:5432`, `localhost:27017`, and the RustFS S3 API
at `localhost:9100` when run from the host. Compose overrides those endpoints
with its internal service addresses.
