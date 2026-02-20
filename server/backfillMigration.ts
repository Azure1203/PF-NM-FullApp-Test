import { db } from "./db";
import { orderFiles } from "@shared/schema";
import { parse as parseSync } from 'csv-parse/sync';
import { countPartsFromCSV } from "./csvHelpers";
import { storage } from "./storage";
import { log } from "./index";
import { isNull, or, eq } from "drizzle-orm";

export async function runBackfillMigration() {
  try {
    const allFiles = await db.select().from(orderFiles).where(
      or(
        isNull(orderFiles.widestPartLength),
        eq(orderFiles.widestPartLength, 0)
      )
    );

    if (allFiles.length === 0) {
      log("Backfill migration: No files need updating", "migration");
      return;
    }

    log(`Backfill migration: Re-processing ${allFiles.length} order files...`, "migration");

    const allProducts = await storage.getProducts();
    const productsMap = new Map<string, { category: string; supplier: string | null }>();
    for (const p of allProducts) {
      productsMap.set(p.name.toLowerCase(), { category: p.category, supplier: p.supplier });
    }

    let updated = 0;
    let skipped = 0;

    for (const file of allFiles) {
      if (!file.rawContent) {
        skipped++;
        continue;
      }

      try {
        const records = parseSync(file.rawContent, { relax_column_count: true, skip_empty_lines: true });
        const counts = await countPartsFromCSV(records, productsMap);

        await storage.updateOrderFile(file.id, {
          coreParts: counts.coreParts,
          dovetails: counts.dovetails,
          assembledDrawers: counts.assembledDrawers,
          fivePieceDoors: counts.fivePiece,
          weightLbs: Math.round(counts.weightLbs),
          maxLength: Math.round(counts.maxLength),
          maxWidth: Math.round(counts.maxWidth),
          largestPartWidth: Math.round(counts.largestPartWidth),
          widestPartLength: Math.round(counts.widestPartLength),
          hasGlassParts: counts.hasGlassParts,
          glassInserts: counts.glassInserts,
          glassShelves: counts.glassShelves,
          hasMJDoors: counts.hasMJDoors,
          hasRichelieuDoors: counts.hasRichelieuDoors,
          hasDoubleThick: counts.hasDoubleThick,
          doubleThickCount: counts.doubleThickCount,
          hasShakerDoors: counts.hasShakerDoors,
          wallRailPieces: counts.wallRailPieces,
        });

        updated++;
      } catch (e) {
        log(`Backfill migration: Error processing file ${file.id}: ${e}`, "migration");
        skipped++;
      }
    }

    log(`Backfill migration complete: ${updated} files updated, ${skipped} skipped`, "migration");
  } catch (err) {
    log(`Backfill migration failed: ${err}`, "migration");
  }
}
