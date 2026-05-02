/**
 * One-shot backfill: copies base64 image bytes from DB (image_data columns)
 * into Object Storage under the product-images/ prefix, then NULLs image_data
 * on success so the prerequisite check for migrations/0008_drop_image_data.sql
 * is satisfied:
 *   SELECT count(*) FROM products WHERE image_data IS NOT NULL;        -- must be 0
 *   SELECT count(*) FROM allmoxy_products WHERE image_data IS NOT NULL; -- must be 0
 *
 * Behaviour:
 *  - Exits immediately if image_data columns no longer exist (safe after DROP COLUMN).
 *  - Processes rows in chunks of 50 to avoid loading all base64 into memory at once.
 *  - Idempotent: rows whose object already exists in storage are skipped but
 *    image_data is still NULLed so re-runs converge to zero remaining rows.
 *
 * Standalone: npx tsx server/scripts/migrateProductImagesToObjectStorage.ts
 * Also called automatically on startup from server/backfillMigration.ts.
 */

import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";

const CHUNK_SIZE = 50;

function detectExtension(buffer: Buffer): string {
  if (buffer.length >= 12) {
    if (
      buffer.slice(0, 4).toString("ascii") === "RIFF" &&
      buffer.slice(8, 12).toString("ascii") === "WEBP"
    )
      return ".webp";
  }
  if (buffer.length >= 4) {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    )
      return ".png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      return ".jpg";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)
      return ".gif";
  }
  if (buffer.length >= 5) {
    const head5 = buffer.slice(0, 5).toString("ascii");
    if (head5 === "<?xml" || head5 === "<svg ") return ".svg";
  }
  return ".jpg";
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "image/jpeg";
}

/** Returns false if image_data has already been dropped from the DB. */
async function imageDataColumnsExist(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT count(*) AS cnt
    FROM information_schema.columns
    WHERE table_name IN ('products', 'allmoxy_products')
      AND column_name = 'image_data'
  `);
  return Number((result.rows[0] as any).cnt) > 0;
}

/**
 * Processes one table's rows in CHUNK_SIZE batches.
 * Because successfully migrated rows get image_data = NULL, each iteration
 * of the outer loop naturally works through the shrinking set without offset math.
 */
async function migrateTable(
  tableName: "allmoxy_products" | "products",
  labelPrefix: string,
  svc: ObjectStorageService,
  counters: { migrated: number; alreadyPresent: number; failed: number }
): Promise<void> {
  while (true) {
    // Always query the first CHUNK_SIZE rows with image_data still set
    const result =
      tableName === "allmoxy_products"
        ? await db.execute(sql`
            SELECT id, image_path, image_data
            FROM allmoxy_products
            WHERE image_data IS NOT NULL
            ORDER BY id
            LIMIT ${CHUNK_SIZE}
          `)
        : await db.execute(sql`
            SELECT id, image_path, image_data
            FROM products
            WHERE image_data IS NOT NULL
            ORDER BY id
            LIMIT ${CHUNK_SIZE}
          `);

    if (result.rows.length === 0) break;

    for (const row of result.rows as any[]) {
      const { id, image_path, image_data } = row;
      try {
        const buffer = Buffer.from(image_data as string, "base64");
        const ext = image_path
          ? path.extname(image_path as string).toLowerCase() ||
            detectExtension(buffer)
          : detectExtension(buffer);
        const objectPath =
          (image_path as string | null) ||
          `product-images/migrated/${labelPrefix}-${id}${ext}`;

        const existing = await svc.downloadBuffer(objectPath);
        if (existing) {
          console.log(
            `[ImageMigrate] ${labelPrefix}-${id}: already present at ${objectPath}`
          );
          await db.execute(
            tableName === "allmoxy_products"
              ? sql`UPDATE allmoxy_products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
              : sql`UPDATE products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
          );
          counters.alreadyPresent++;
          continue;
        }

        await svc.uploadBuffer(buffer, objectPath, mimeFromExt(ext));
        await db.execute(
          tableName === "allmoxy_products"
            ? sql`UPDATE allmoxy_products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
            : sql`UPDATE products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
        );
        console.log(
          `[ImageMigrate] ${labelPrefix}-${id}: migrated → ${objectPath}`
        );
        counters.migrated++;
      } catch (e: any) {
        console.error(
          `[ImageMigrate] ${labelPrefix}-${id}: FAILED — ${e.message}`
        );
        counters.failed++;
      }
    }

    // If all rows in this chunk failed (none NULLed), they'll appear again forever.
    // Break to avoid infinite loop — the final summary will show non-zero failures.
    if (result.rows.length > 0 && counters.failed > 0) {
      const remaining = await db.execute(
        tableName === "allmoxy_products"
          ? sql`SELECT count(*) AS cnt FROM allmoxy_products WHERE image_data IS NOT NULL`
          : sql`SELECT count(*) AS cnt FROM products WHERE image_data IS NOT NULL`
      );
      const stillRemaining = Number((remaining.rows[0] as any).cnt);
      if (stillRemaining >= result.rows.length) {
        // No progress — all remaining rows are failing; stop to avoid infinite loop
        console.warn(
          `[ImageMigrate] ${labelPrefix}: stopping chunk loop — ${stillRemaining} rows still have image_data but every row in this chunk failed`
        );
        break;
      }
    }
  }
}

export async function migrateProductImagesToObjectStorage(): Promise<void> {
  // Guard: exit cleanly if image_data columns were already dropped
  const columnsExist = await imageDataColumnsExist();
  if (!columnsExist) {
    console.log(
      "[ImageMigrate] image_data columns already dropped — nothing to migrate"
    );
    return;
  }

  const svc = new ObjectStorageService();
  const counters = { migrated: 0, alreadyPresent: 0, failed: 0 };

  await migrateTable("allmoxy_products", "allmoxy", svc, counters);
  await migrateTable("products", "hardware", svc, counters);

  console.log(
    `[ImageMigrate] Done. migrated=${counters.migrated}, already-present=${counters.alreadyPresent}, failed=${counters.failed}`
  );
  if (counters.failed > 0) {
    console.warn(
      `[ImageMigrate] WARNING: ${counters.failed} rows failed. Re-run before applying migrations/0008_drop_image_data.sql.`
    );
  }
}

// Standalone entry point (ESM): npx tsx server/scripts/migrateProductImagesToObjectStorage.ts
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  migrateProductImagesToObjectStorage()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
