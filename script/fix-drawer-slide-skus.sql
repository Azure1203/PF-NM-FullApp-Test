-- Fix drawer slide SKU codes: Remove extra dash before the number
-- M-105-DS10-300H -> M-105-DS10300H
-- M-105-DS10-350H -> M-105-DS10350H
-- M-105-DS10-400H -> M-105-DS10400H
-- M-105-DS10-450H -> M-105-DS10450H
-- M-105-DS10-550H -> M-105-DS10550H

-- Update products table
UPDATE products 
SET code = REPLACE(code, 'M-105-DS10-', 'M-105-DS10') 
WHERE code IN ('M-105-DS10-300H', 'M-105-DS10-350H', 'M-105-DS10-400H', 'M-105-DS10-450H', 'M-105-DS10-550H');

-- Update hardware checklist items that reference these product codes
UPDATE hardware_checklist_items 
SET product_code = REPLACE(product_code, 'M-105-DS10-', 'M-105-DS10') 
WHERE product_code IN ('M-105-DS10-300H', 'M-105-DS10-350H', 'M-105-DS10-400H', 'M-105-DS10-450H', 'M-105-DS10-550H');

-- Verify the changes
SELECT code FROM products WHERE code LIKE 'M-105-DS10%';
SELECT DISTINCT product_code FROM hardware_checklist_items WHERE product_code LIKE 'M-105-DS10%';
