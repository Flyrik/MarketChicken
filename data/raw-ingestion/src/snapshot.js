import { EJSON } from "bson";
import { Readable } from "node:stream";
import { Upload } from "@aws-sdk/lib-storage";

export const INVENTORY_TABLES = [
  { name: "warehouses", orderBy: ["id"] },
  { name: "stock", orderBy: ["product_id", "warehouse_id"] },
  { name: "reservations", orderBy: ["id"] },
  {
    name: "reservation_items",
    orderBy: ["reservation_id", "product_id", "warehouse_id"],
  },
];

export function createRunId(date) {
  return date.toISOString().replace(/[-:.]/g, "");
}

export function createSnapshotKey({
  source,
  namespace,
  dataset,
  date,
  runId,
}) {
  return `raw/${source}/${namespace}/${dataset}/ingestion_date=${date}/run_id=${runId}.ndjson`;
}

export function serializeMongoRecord(record) {
  return EJSON.stringify(record, { relaxed: false });
}

export function serializePostgresRecord(record) {
  return JSON.stringify(record);
}

export async function uploadNdjson({
  s3,
  bucket,
  key,
  records,
  serialize,
}) {
  let recordCount = 0;
  async function* lines() {
    for await (const record of records) {
      recordCount += 1;
      yield `${serialize(record)}\n`;
    }
  }

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: Readable.from(lines()),
      ContentType: "application/x-ndjson",
    },
  });

  await upload.done();
  return recordCount;
}
