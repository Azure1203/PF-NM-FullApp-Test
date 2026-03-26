# r8 — Formula Tester Fix + Pipeline Grid Resolution + Import Performance

## Context

Read `BUILD_STATE.md`, `CHANGELOG.md`, `shared/schema.ts`, `server/routes.ts`, `server/storage.ts`, and `server/services/pricingEngine.ts` before starting.

The Formula Tester at `/admin/formula-tester` is broken: when testing product `15DIVF`, the scope only contains `{ width, height, length, depth, quantity }` — no grid aliases (`divider_panels`, `color`, etc.) appear. The error is "Undefined symbol divider_panels". The same grid resolution failure affects order CSV imports — pricing comes back as `$0.00` or errors, and output pages are empty.

There are **four root causes** that must be fixed together.

---

## Bug 1 — Formula Tester: No way to select a material/color for testing

### Root Cause

Most pricing formulas reference two grid aliases:
- A **product-specific grid** (e.g. `divider_panels`, `shelves`, `parts`) — looked up by `MANU_CODE` (the product's SKU prefix)
- The **color grid** (`color`) — looked up by a value like `TFL1W`, `HGFU`, etc.

The formula tester currently resolves MANU_CODE bindings automatically using the product's `skuPrefix`. Non-MANU bindings (like `color`) render a free-text input where the user must type the exact lookup value (e.g. `TFL1W`). But the user has no idea what values are valid — they'd have to go look at the grid data in another page.

### Fix

Replace the free-text input for non-MANU grid lookup overrides with a **dropdown/combobox populated from the bound grid's actual rows**. The dropdown should show the `lookupKey` values (which are the NAME/MANU_CODE values from the grid CSV).

**Backend change — new endpoint:**

Add `GET /api/admin/attribute-grids/:id/row-keys` that returns an array of distinct `lookupKey` values for a grid:

```ts
app.get('/api/admin/attribute-grids/:id/row-keys', isAuthenticated, async (req, res) => {
  const gridId = parseInt(req.params.id);
  const rows = await storage.getAttributeGridRows(gridId);
  // Return unique lookupKey values, sorted alphabetically
  const keys = [...new Set(rows.map(r => r.lookupKey))].filter(k => k.trim()).sort();
  res.json(keys);
});
```

**Frontend change — `FormulaTester.tsx`:**

For each non-MANU binding in the "Grid Lookup Overrides" section:

1. Fetch the row keys for the bound grid using the new endpoint (use `useQuery` keyed by `gridId`, disabled until the grid ID is available)
2. Replace the `<Input>` with a searchable `<Select>` / combobox (shadcn `Select` with `SelectTrigger`, `SelectContent`, `SelectItem`) showing all available lookup keys
3. Show a placeholder like "Select color…" or "Select value…"
4. Pre-populate with the first available value if the user hasn't selected one yet (optional — but at minimum show the options)
5. When the user selects a value, store it in `lookupInputs[binding.alias]` as before

The auto-resolved MANU_CODE bindings should continue showing the read-only pill with the SKU prefix — no change needed there.

**Also for Ad-hoc Grid Lookups:** The "Lookup Value" input in ad-hoc rows should similarly be replaced with a dropdown once a grid is selected, populated from that grid's row keys.

---

## Bug 2 — Formula Tester: Grid aliases not appearing in scope even when lookup should succeed

### Root Cause

The formula tester endpoint (line ~731 in `routes.ts`) resolves grid bindings by:

```ts
const lookupValue = String(
  (req.body.inputs || {})[binding.lookupColumn] ||
  (req.body.gridLookups || {})[binding.alias] ||
  (req.body.gridLookups || {})[binding.lookupColumn] ||
  autoValue
);
```

For MANU_CODE bindings, `autoValue` = `product.skuPrefix` (e.g. `"15DIVF"`). The lookup then calls `getAttributeGridRowByKey(gridId, "15DIVF", grid.keyColumn)`.

**The issue:** The grid's `keyColumn` was auto-detected during CSV import. For the Divider Panels grid, the CSV has a `MANU_CODE` column, so `keyColumn` should be `MANU_CODE`. The lookup function searches:
1. `lookupKey` exact match
2. `lookupKey` case-insensitive
3. `rowData[keyColumn]` match
4. Any `rowData` value match

When the grid CSV was imported, `lookupKey` was set to `record[keyColumn]` — so if `keyColumn` = `MANU_CODE`, then `lookupKey` for row "15DIVF" would be `"15DIVF"`. This should match.

**However**, if the grid was imported when `keyColumn` was detected as `NAME` (because the CSV headers were `EXISTING OPTION ID, NAME, DEFAULT, ...` and `NAME` comes before `MANU_CODE` in priority), then `lookupKey` would be set to the `NAME` column value (e.g. `"1.5 Divider - Full (TFL)"`) instead of the MANU_CODE `"15DIVF"`. The lookup by key `"15DIVF"` would then fail on steps 1-2, succeed on step 3 only if `keyColumn` is set correctly, and fall back to step 4 (search all values).

**The real fix**: Ensure the formula tester endpoint uses the **grid row cache pattern** (same as the import pipeline) instead of calling `storage.getAttributeGridRowByKey()` per binding. This eliminates potential DB lookup issues and makes behavior consistent across all three code paths.

### Fix

In the formula tester endpoint (`/api/admin/formula-test`):

1. Pre-load all grid rows for relevant grids into a `Map<gridId, rows[]>` cache (same pattern as the reprice route)
2. Use the same `findGridRowInCache` closure for lookups
3. Lowercase the `binding.alias` when adding to `contextScope` (matching the import pipeline)

Replace the grid resolution loop (lines ~731-761) with:

```ts
// Pre-load grid rows for all grids used by this product's bindings
const relevantGridIds = new Set(bindings.map(b => b.gridId));
const gridRowsCache = new Map<number, AttributeGridRow[]>();
await Promise.all(
  [...relevantGridIds].map(async (gid) => {
    const rows = await storage.getAttributeGridRows(gid);
    gridRowsCache.set(gid, rows);
  })
);

const findGridRowInCache = (
  gridId: number, lookupValue: string, rowDataColumn?: string
): AttributeGridRow | undefined => {
  const rows = gridRowsCache.get(gridId) ?? [];
  const trimmed = lookupValue.trim();
  const exact = rows.find(r => r.lookupKey === trimmed);
  if (exact) return exact;
  const ci = rows.find(r => r.lookupKey.trim().toLowerCase() === trimmed.toLowerCase());
  if (ci) return ci;
  if (rowDataColumn) {
    const byCol = rows.find(r => {
      const rd = r.rowData as Record<string, any>;
      const val = rd[rowDataColumn] ?? rd[rowDataColumn.toLowerCase()] ?? rd[rowDataColumn.toUpperCase()];
      return String(val ?? '').trim().toLowerCase() === trimmed.toLowerCase();
    });
    if (byCol) return byCol;
  }
  return rows.find(r => {
    const rd = r.rowData as Record<string, any>;
    return Object.values(rd).some(v => String(v ?? '').trim().toLowerCase() === trimmed.toLowerCase());
  });
};

for (const binding of bindings) {
  const grid = gridMap.get(binding.gridId);
  if (!grid) continue;
  const isManuCodeBinding = binding.lookupColumn.toLowerCase().includes('manu');
  const autoValue = isManuCodeBinding
    ? (product.skuPrefix || product.name || '')
    : '';  // Don't auto-fill non-MANU bindings with product name — it never matches
  const lookupValue = String(
    (req.body.gridLookups || {})[binding.alias] ||
    (req.body.gridLookups || {})[binding.lookupColumn] ||
    (req.body.inputs || {})[binding.lookupColumn] ||
    autoValue
  ).trim();

  if (!lookupValue) {
    gridLookupResults.push({
      alias: binding.alias,
      gridName: grid.name,
      lookupColumn: binding.lookupColumn,
      lookupValue: '',
      matched: false,
      rowData: null,
    });
    continue;
  }

  const row = findGridRowInCache(binding.gridId, lookupValue, grid.keyColumn);
  if (row) {
    const rawData = row.rowData as Record<string, any>;
    contextScope[binding.alias.toLowerCase()] = Object.fromEntries(
      Object.entries(rawData).map(([k, v]) => [k.toLowerCase(), v])
    );
  }
  gridLookupResults.push({
    alias: binding.alias,
    gridName: grid.name,
    lookupColumn: binding.lookupColumn,
    lookupValue,
    matched: !!row,
    rowData: row ? row.rowData : null,
  });
}
```

**Key changes from current code:**
- Uses `findGridRowInCache` instead of `storage.getAttributeGridRowByKey` — consistent with import pipeline
- Lowercases `binding.alias` when writing to `contextScope` — matches import pipeline behavior
- For non-MANU bindings, `autoValue` is empty string instead of `product.name` — product name never matches a color code; setting it to empty makes the field clearly "not filled in" so the user knows they need to select a color
- Checks `gridLookups[binding.alias]` FIRST (before `inputs[binding.lookupColumn]`) — this is the value from the dropdown the user selected

Also apply the same pattern for ad-hoc lookups (use `findGridRowInCache` instead of `storage.getAttributeGridRowByKey`).

---

## Bug 3 — Order Import Pipeline: Color grid lookup fails because CSV column name doesn't match binding.lookupColumn

### Root Cause

During CSV import, the pipeline resolves grid bindings with:
```ts
const lookupValue = (item[binding.lookupColumn] || '').toString().trim();
```

For the `color` binding, `binding.lookupColumn` must exactly match the CSV column header name. Allmoxy order CSVs use column names like `Material`, `Color`, or `Colour` for the color/material value. If the binding's `lookupColumn` is set to `COLOR` but the CSV header says `Material`, the lookup returns empty string and the color grid is never resolved.

### Fix — Part A: Show the actual CSV column names in the binding UI

When creating or editing a product grid binding, the `lookupColumn` field currently accepts free text. The user has to guess what the CSV column is called.

Add a helper to the **Allmoxy Product Manager** binding editor and the **Attribute Grid Manager** Bindings tab that shows a list of known CSV column names. These can be derived from:
1. The attribute grid's own `columns` array (these are the grid CSV column names like `MANU_CODE`, `NAME`, `BASE_PRICE`, etc.)
2. A static list of common Allmoxy order CSV column names: `MANU_CODE`, `Material`, `Color`, `Qty`, `Height`, `Width`, `Length`, `Thickness`, `Left`, `Right`, `Top`, `Bottom`, `NAME`

In both UIs, change the `lookupColumn` input from free text to a **combobox** (editable dropdown) that suggests these values. The user can still type a custom value, but the suggestions make it obvious what the valid options are.

### Fix — Part B: Fallback column name matching in the import pipeline

In all three pipeline locations (upload handler ~line 2462, reprice route ~line 1873, Asana scheduler), add fallback column name resolution:

```ts
// In the grid binding resolution loop, replace:
const lookupValue = (item[binding.lookupColumn] || '').toString().trim();

// With:
const col = binding.lookupColumn;
const lookupValue = (
  item[col] ||
  item[col.toLowerCase()] ||
  item[col.toUpperCase()] ||
  // Common Allmoxy CSV column name aliases for color/material:
  (col.toLowerCase() === 'color' || col.toLowerCase() === 'material' || col.toLowerCase() === 'colour'
    ? (item['Material'] || item['Color'] || item['Colour'] || item['material'] || item['color'] || '')
    : '')
).toString().trim();
```

This ensures that if the binding says `lookupColumn: "Color"` but the CSV has `Material`, or vice versa, the lookup still resolves correctly.

---

## Bug 4 — Order Import: Sequential INSERT performance

### Root Cause

Each order item is inserted with `await storage.createOrderItem(...)` inside a `for` loop (lines ~2519 and ~1918). With hundreds of items per file, this is hundreds of sequential DB round-trips.

### Fix

Add a `createOrderItemsBatch` method to `storage.ts` that inserts multiple order items in a single Drizzle `.insert().values([...])` call:

```ts
// In IStorage interface:
createOrderItemsBatch(items: InsertOrderItem[]): Promise<OrderItem[]>;

// In DatabaseStorage:
async createOrderItemsBatch(items: InsertOrderItem[]): Promise<OrderItem[]> {
  if (items.length === 0) return [];
  // Drizzle supports batch insert
  const result = await db.insert(orderItems).values(items).returning();
  return result;
}
```

In all three pipeline locations (upload handler, reprice route, Asana scheduler):

1. Collect all order items into an array during the loop instead of inserting each one
2. After the loop, call `createOrderItemsBatch(batch)` once
3. Sum `totalProjectPrice` from the batch array

Example refactor pattern:

```ts
const itemBatch: InsertOrderItem[] = [];

for (const item of itemObjects) {
  // ... existing SKU matching, grid resolution, pricing evaluation ...

  itemBatch.push({
    projectId: project.id,
    fileId: orderFile.id,
    productId: product?.id ?? null,
    sku,
    description: item.NAME || item['Part Name'] || item.Description || '',
    width: pricingItem.width || null,
    height: pricingItem.height || null,
    depth: pricingItem.length || null,
    quantity: qty,
    unitPrice,
    totalPrice,
    exportText,
    pricingError,
    rawRowData: item,
    exportType: product?.exportType || null,
    supplyType: product?.supplyType || null,
  });

  totalProjectPrice += totalPrice;
  if (exportText) fileOrdText += exportText + "\n";
}

// Single batch insert
await storage.createOrderItemsBatch(itemBatch);
```

---

## Bug 5 — Formula Tester: Full scope display shows grid values as string instead of number

### Root Cause

When grid row data is stored in JSONB and the CSV values are numeric strings (e.g. `"5.35"` for `sq_ft_price`), the formula scope ends up with `divider_panels.sq_ft_price = "5.35"` (string) instead of `5.35` (number). mathjs handles this in some cases but not all — particularly in comparisons like `divider_panels.pricing_id == 1` where `"1" == 1` might behave unexpectedly.

### Fix

In ALL locations where grid row data is added to the scope (formula tester, upload handler, reprice route, Asana scheduler), coerce numeric string values to numbers:

```ts
// Replace this pattern:
contextScope[binding.alias.toLowerCase()] = Object.fromEntries(
  Object.entries(rawData).map(([k, v]) => [k.toLowerCase(), v])
);

// With this:
contextScope[binding.alias.toLowerCase()] = Object.fromEntries(
  Object.entries(rawData).map(([k, v]) => {
    const lower = k.toLowerCase();
    // Coerce numeric strings to numbers for mathjs
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
      return [lower, Number(v)];
    }
    return [lower, v];
  })
);
```

This must be applied in all four places where `contextScope[alias]` is built:
1. Formula tester endpoint (both real bindings and ad-hoc lookups)
2. Upload handler
3. Reprice route
4. Asana scheduler

**Extract this as a shared helper to avoid duplication:**

In `server/services/pricingEngine.ts`, add:

```ts
/**
 * Converts a grid row's rowData into a scope-friendly object:
 * - All keys lowercased
 * - Numeric strings coerced to numbers
 */
export function gridRowToScope(rowData: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(rowData).map(([k, v]) => {
      const lower = k.toLowerCase();
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
        return [lower, Number(v)];
      }
      return [lower, v];
    })
  );
}
```

Then in all four locations, replace the inline `Object.fromEntries(...)` with:

```ts
import { gridRowToScope } from './services/pricingEngine';
// ...
contextScope[binding.alias.toLowerCase()] = gridRowToScope(rawData);
```

---

## Summary of all files to modify

| File | Changes |
|------|---------|
| `server/services/pricingEngine.ts` | Add `gridRowToScope()` helper function |
| `server/routes.ts` — formula-test endpoint | Use `findGridRowInCache`, lowercase aliases, use `gridRowToScope`, empty `autoValue` for non-MANU bindings |
| `server/routes.ts` — upload handler | Use `gridRowToScope`, fallback column name matching, batch insert |
| `server/routes.ts` — reprice route | Use `gridRowToScope`, fallback column name matching, batch insert |
| `server/routes.ts` — Asana scheduler | Use `gridRowToScope`, fallback column name matching, batch insert |
| `server/routes.ts` — new endpoint | `GET /api/admin/attribute-grids/:id/row-keys` |
| `server/storage.ts` | Add `createOrderItemsBatch()` to interface and implementation |
| `client/src/pages/admin/FormulaTester.tsx` | Replace free-text inputs with dropdown/combobox for grid lookup overrides; fetch row keys per grid |

---

## Verification Steps

After implementing, verify each fix:

1. **Formula Tester dropdown**: Go to `/admin/formula-tester`, select product `15DIVF`. Under "Grid Lookup Overrides", the `color` binding should show a dropdown with values like `TFL1W`, `TFL2F`, `HGFU`, etc. The `divider_panels` binding should auto-resolve using the SKU prefix and show as a read-only pill.

2. **Formula Tester pricing**: Select `TFL1W` from the color dropdown, enter width=300, height=600, length=19, quantity=1. Click "Run Pricing Test". The scope should show both `divider_panels: { base_price: 0, sq_ft_price: 5, margin: 0, pricing_id: 1, ... }` and `color: { level_percent_upcharge: 0, sqft_price: 24.64, ... }`. No "Undefined symbol" error. A numeric price should appear.

3. **Grid values are numbers**: In the Full Formula Scope display, grid values should show as numbers (`5` not `"5"`, `0` not `"0"`, `24.64` not `"24.64"`).

4. **Order import pricing**: Upload a test CSV. Order items should have non-zero `unitPrice` and `totalPrice` values. The Order Details page should show priced line items.

5. **Import performance**: A 200-line CSV should import in under 5 seconds (batch insert eliminates per-item DB round-trips).

6. **Export pages**: After a successful import with pricing, the Invoice PDF, ORD export, and other output downloads should contain data (not empty).

---

## Important Notes

- Do NOT change `pricingEngine.ts`'s `evaluatePrice` function signature or behavior — it works correctly. The issue is that callers weren't providing the grid data in the scope.
- Do NOT remove the ad-hoc grid lookup feature — it's a useful escape hatch for testing. Just also replace its free-text Lookup Value input with a dropdown.
- The `findGridRowInCache` function should be identical across all four locations. Consider extracting it to a shared module (e.g. `server/services/gridResolver.ts`) to avoid duplication, but this is optional — inline is fine if it's easier.
- The numeric coercion in `gridRowToScope` should NOT coerce values that look like codes (e.g. `"300 Classic White 5x9 19"` should stay as a string). The `!isNaN(Number(v))` check handles this correctly — `Number("300 Classic White")` is `NaN`, so it stays a string.
