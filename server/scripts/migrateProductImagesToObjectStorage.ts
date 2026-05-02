/**
 * One-shot backfill: copies base64 image bytes from DB (image_data columns)
 * into Object Storage under the product-images/ prefix, then NULLs image_data
 * on success so the prerequisite check for migrations/0008_drop_image_data.sql
 * is satisfied:
 *   SELECT count(*) FROM products WHERE image_data IS NOT NULL;        -- must be 0
 *   SELECT count(*) FROM allmoxy_products WHERE image_data IS NOT NULL; -- must be 0
 *
 * Idempotent: rows whose object already exists in storage are skipped (image_data
 * is still NULLed so re-runs are safe).
 *
 * Standalone: npx tsx server/scripts/migrateProductImagesToObjectStorage.ts
 * Also called automatically on startup from server/backfillMigration.ts.
 */

import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";

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

export async function migrateProductImagesToObjectStorage(): Promise<void> {
  const svc = new ObjectStorageService();
  let migrated = 0;
  let alreadyPresent = 0;
  let failed = 0;

  // --- allmoxy_products ---
  const allmoxyResult = await db.execute(sql`
    SELECT id, image_path, image_data
    FROM allmoxy_products
    WHERE image_data IS NOT NULL
  `);

  for (const row of allmoxyResult.rows as any[]) {
    const { id, image_path, image_data } = row;
    try {
      const buffer = Buffer.from(image_data as string, "base64");
      const ext = image_path
        ? path.extname(image_path as string).toLowerCase() ||
          detectExtension(buffer)
        : detectExtension(buffer);
      const objectPath =
        (image_path as string | null) ||
        `product-images/migrated/allmoxy-${id}${ext}`;

      const existing = await svc.downloadBuffer(objectPath);
      if (existing) {
        console.log(
          `[ImageMigrate] allmoxy-${id}: already present at ${objectPath}`
        );
        // Still NULL out image_data and ensure image_path is set
        await db.execute(
          sql`UPDATE allmoxy_products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
        );
        alreadyPresent++;
        continue;
      }

      await svc.uploadBuffer(buffer, objectPath, mimeFromExt(ext));
      // Update image_path and clear image_data in one statement
      await db.execute(
        sql`UPDATE allmoxy_products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
      );
      console.log(`[ImageMigrate] allmoxy-${id}: migrated → ${objectPath}`);
      migrated++;
    } catch (e: any) {
      console.error(`[ImageMigrate] allmoxy-${id}: FAILED — ${e.message}`);
      failed++;
    }
  }

  // --- products (hardware catalog) ---
  const hwResult = await db.execute(sql`
    SELECT id, image_path, image_data
    FROM products
    WHERE image_data IS NOT NULL
  `);

  for (const row of hwResult.rows as any[]) {
    const { id, image_path, image_data } = row;
    try {
      const buffer = Buffer.from(image_data as string, "base64");
      const ext = image_path
        ? path.extname(image_path as string).toLowerCase() ||
          detectExtension(buffer)
        : detectExtension(buffer);
      const objectPath =
        (image_path as string | null) ||
        `product-images/migrated/hardware-${id}${ext}`;

      const existing = await svc.downloadBuffer(objectPath);
      if (existing) {
        console.log(
          `[ImageMigrate] hardware-${id}: already present at ${objectPath}`
        );
        // Still NULL out image_data and ensure image_path is set
        await db.execute(
          sql`UPDATE products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
        );
        alreadyPresent++;
        continue;
      }

      await svc.uploadBuffer(buffer, objectPath, mimeFromExt(ext));
      // Update image_path and clear image_data in one statement
      await db.execute(
        sql`UPDATE products SET image_data = NULL, image_path = ${objectPath} WHERE id = ${id}`
      );
      console.log(`[ImageMigrate] hardware-${id}: migrated → ${objectPath}`);
      migrated++;
    } catch (e: any) {
      console.error(`[ImageMigrate] hardware-${id}: FAILED — ${e.message}`);
      failed++;
    }
  }

  console.log(
    `[ImageMigrate] Done. migrated=${migrated}, already-present=${alreadyPresent}, failed=${failed}`
  );
  if (failed > 0) {
    console.warn(
      `[ImageMigrate] WARNING: ${failed} rows failed. Re-run before applying migrations/0008_drop_image_data.sql.`
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
