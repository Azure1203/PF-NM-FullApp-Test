-- Drop image_data columns from products and allmoxy_products.
--
-- PREREQUISITE: Run server/scripts/migrateProductImagesToObjectStorage.ts first
-- and confirm zero failed rows before applying this migration.
--
-- Verification queries (must both return 0 before running):
--   SELECT count(*) FROM products WHERE image_data IS NOT NULL;
--   SELECT count(*) FROM allmoxy_products WHERE image_data IS NOT NULL;
--
-- After applying, confirm columns are gone:
--   \d products
--   \d allmoxy_products

ALTER TABLE products DROP COLUMN IF EXISTS image_data;
ALTER TABLE allmoxy_products DROP COLUMN IF EXISTS image_data;
