import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import mongodb from "mongodb";
import { Pool } from "pg";
import QueryStream from "pg-query-stream";
import {
  createRunId,
  createSnapshotKey,
  INVENTORY_TABLES,
  serializeMongoRecord,
  serializePostgresRecord,
  uploadNdjson,
} from "./snapshot.js";

const { MongoClient } = mongodb;

function requiredEnv(name, fallbackName) {
  const value = process.env[name] ?? process.env[fallbackName];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numericEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createClients() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "market-data";
  const s3 = new S3Client({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9100",
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("OBJECT_STORAGE_ACCESS_KEY"),
      secretAccessKey: requiredEnv("OBJECT_STORAGE_SECRET_KEY"),
    },
  });

  const postgres = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: numericEnv("DB_PORT", 5432),
    database: process.env.DB_NAME ?? "market",
    user: process.env.DB_USER ?? "inventory_svc",
    password: requiredEnv("DB_PASSWORD", "INVENTORY_DB_PASSWORD"),
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  const mongoDatabase = process.env.MONGO_DATABASE ?? "market_catalog";
  const mongoUsername = encodeURIComponent(
    process.env.MONGO_USERNAME ?? "catalog_svc",
  );
  const mongoPassword = encodeURIComponent(
    requiredEnv("MONGO_PASSWORD", "CATALOG_MONGO_PASSWORD"),
  );
  const mongoHost = process.env.MONGO_HOST ?? "localhost";
  const mongoPort = numericEnv("MONGO_PORT", 27017);
  const mongo = new MongoClient(
    `mongodb://${mongoUsername}:${mongoPassword}@${mongoHost}:${mongoPort}/${encodeURIComponent(mongoDatabase)}?authSource=${encodeURIComponent(mongoDatabase)}`,
    { serverSelectionTimeoutMS: 10000 },
  );

  return { bucket, s3, postgres, mongo, mongoDatabase };
}

async function ensureBucketExists(s3, bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const statusCode = error.$metadata?.httpStatusCode;
    if (statusCode !== 404 && error.name !== "NotFound" && error.name !== "NoSuchBucket") {
      throw new Error(`Cannot access object-storage bucket "${bucket}"`, {
        cause: error,
      });
    }

    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function exportInventory({ s3, bucket, postgres, date, runId }) {
  const client = await postgres.connect();
  const exports = [];
  let transactionStarted = false;

  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;

    for (const table of INVENTORY_TABLES) {
      const orderBy = table.orderBy.map(quoteIdentifier).join(", ");
      const query = `SELECT * FROM ${quoteIdentifier("inventory")}.${quoteIdentifier(table.name)} ORDER BY ${orderBy}`;
      const records = client.query(new QueryStream(query));
      const key = createSnapshotKey({
        source: "postgres",
        namespace: "inventory",
        dataset: table.name,
        date,
        runId,
      });
      const recordCount = await uploadNdjson({
        s3,
        bucket,
        key,
        records,
        serialize: serializePostgresRecord,
      });

      exports.push({
        source: "postgres",
        database: process.env.DB_NAME ?? "market",
        schema: "inventory",
        dataset: table.name,
        key,
        recordCount,
      });
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return exports;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Inventory export failed and its read-only transaction could not be rolled back",
        );
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function exportCatalog({ s3, bucket, mongo, mongoDatabase, date, runId }) {
  const cursor = mongo
    .db(mongoDatabase)
    .collection("catalog")
    .find({})
    .sort({ _id: 1 });
  const key = createSnapshotKey({
    source: "mongodb",
    namespace: mongoDatabase,
    dataset: "catalog",
    date,
    runId,
  });

  try {
    const recordCount = await uploadNdjson({
      s3,
      bucket,
      key,
      records: cursor,
      serialize: serializeMongoRecord,
    });

    return {
      source: "mongodb",
      database: mongoDatabase,
      dataset: "catalog",
      key,
      recordCount,
    };
  } finally {
    await cursor.close();
  }
}

async function run() {
  const { bucket, s3, postgres, mongo, mongoDatabase } = createClients();
  const startedAt = new Date();
  const runId = createRunId(startedAt);
  const date = startedAt.toISOString().slice(0, 10);

  try {
    await ensureBucketExists(s3, bucket);
    await mongo.connect();

    const exports = await exportInventory({
      s3,
      bucket,
      postgres,
      date,
      runId,
    });
    exports.push(
      await exportCatalog({
        s3,
        bucket,
        mongo,
        mongoDatabase,
        date,
        runId,
      }),
    );

    const manifestKey = `raw/_manifests/${runId}.json`;
    const manifest = {
      runId,
      format: "NDJSON",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      exports,
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      }),
    );

    const totalRecords = exports.reduce(
      (total, dataset) => total + dataset.recordCount,
      0,
    );
    console.info(
      `Raw snapshot ${runId} completed: ${totalRecords} records in ${exports.length} datasets; manifest ${manifestKey}`,
    );
  } finally {
    await Promise.all([postgres.end(), mongo.close()]);
    s3.destroy();
  }
}

run().catch((error) => {
  console.error(`Raw snapshot failed: ${error.message}`);
  process.exitCode = 1;
});
