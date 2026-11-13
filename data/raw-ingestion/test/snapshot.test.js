import assert from "node:assert/strict";
import test from "node:test";
import { EJSON, Int32, ObjectId } from "bson";
import {
  createRunId,
  createSnapshotKey,
  serializeMongoRecord,
  serializePostgresRecord,
} from "../src/snapshot.js";

test("creates run IDs that are safe to use in object keys", () => {
  assert.equal(
    createRunId(new Date("2026-11-13T14:15:30.123Z")),
    "20261113T141530123Z",
  );
});

test("places each source snapshot under its own dated raw prefix", () => {
  assert.equal(
    createSnapshotKey({
      source: "postgres",
      namespace: "inventory",
      dataset: "stock",
      date: "2026-11-13",
      runId: "20261113T141530123Z",
    }),
    "raw/postgres/inventory/stock/ingestion_date=2026-11-13/run_id=20261113T141530123Z.ndjson",
  );
});

test("serializes MongoDB BSON types as canonical Extended JSON", () => {
  const record = {
    _id: new ObjectId("64a000000000000000000001"),
    product_id: new Int32(7),
    indexed_at: new Date("2026-11-13T12:00:00.000Z"),
  };

  assert.deepEqual(
    EJSON.parse(serializeMongoRecord(record), { relaxed: false }),
    record,
  );
});

test("serializes PostgreSQL rows without dropping string-valued big integers", () => {
  const row = { id: 12, amount: "9007199254740993" };

  assert.deepEqual(JSON.parse(serializePostgresRecord(row)), row);
});
