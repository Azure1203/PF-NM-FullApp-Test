# r14 — CRITICAL FIX: CSV Column Name Mismatch (Root Cause of Zero Order Items)

## The Problem — Found It

The Allmoxy order CSV has these column headers (row 14):
```
Manuf code,Color,Quantity,Height,Width(R),Length(L),Thickness,Left,Right,Top,Bottom
```

The pipeline code expects different column names and NONE of them match:

| CSV Column | Code Expects | Match? |
|---|---|---|
| `Manuf code` | `MANU_CODE` or `SKU` or `Manuf Code` | ❌ No — case mismatch (`code` vs `Code`) |
| `Color` | `Material` (binding lookupColumn) | ❌ No — different word entirely |
| `Quantity` | `Qty` or `quantity` or `QUANTITY` | ❌ No — different word |
| `Width(R)` | `Width` or `width` | ❌ No — has `(R)` suffix |
| `Length(L)` | `Length` or `length` | ❌ No — has `(L)` suffix |
| `Height` | `Height` or `height` | ✅ Yes — this one works |
| `Thickness` | (uses depth/length) | N/A |
| `Left` | `Left` | ✅ Yes |
| `Right` | `Right` | ✅ Yes |
| `Top` | `Top` | ✅ Yes |
| `Bottom` | `Bottom` | ✅ Yes |

**Result:** The SKU extraction `item.MANU_CODE || item.SKU || item['Manuf Code']` returns `undefined` for every row because the CSV column is `Manuf code` (lowercase 'c'). The `if (!sku) continue` skips every single row. Zero order items are created. This is why ALL projects have zero items.

---

## Fix 1 — SKU Extraction (3 locations)

In `server/routes.ts`, find ALL places where the SKU is extracted. There are 3 locations:

### Location 1: Upload handler (~line 3073)
### Location 2: Reprice route (~line 2415)  
### Location 3: Any Asana scheduler location

Search for `item.MANU_CODE` in routes.ts. At each location, replace:

```ts
const sku: string = (
  item.MANU_CODE || item.SKU || item['Manuf Code'] || ''
).toString().trim();
```

With:

```ts
const sku: string = (
  item.MANU_CODE || item['Manuf code'] || item['Manuf Code'] || item['manuf code'] ||
  item.SKU || item.sku || item['MANU CODE'] || ''
).toString().trim();
```

This handles all possible casings: `MANU_CODE`, `Manuf code`, `Manuf Code`, `manuf code`, `SKU`, `sku`.

---

## Fix 2 — Dimension Extraction (3 locations)

Search for `item.Width` in routes.ts. At each location where `pricingItem` is built, replace:

```ts
const pricingItem = {
  ...item,
  width:    Number(item.Width    || item.width    || 0),
  height:   Number(item.Height   || item.height   || 0),
  length:   Number(item.Length   || item.length   || 0),
  depth:    Number(item.Length   || item.length   || 0),
  quantity: Number(item.Qty      || item.quantity || item.QUANTITY || 1),
};
```

With:

```ts
const pricingItem = {
  ...item,
  width:    Number(item['Width(R)'] || item.Width    || item.width    || item['WIDTH'] || 0),
  height:   Number(item.Height      || item.height   || item['HEIGHT'] || 0),
  length:   Number(item['Length(L)']|| item.Length   || item.length   || item['LENGTH'] || 0),
  depth:    Number(item['Length(L)']|| item.Length   || item.length   || item['LENGTH'] || item.Thickness || item.thickness || 0),
  quantity: Number(item.Quantity    || item.Qty      || item.quantity || item.QUANTITY || 1),
};
```

This handles:
- `Width(R)` (actual CSV column name) and `Width` (fallback)
- `Length(L)` (actual CSV column name) and `Length` (fallback)
- `Quantity` (actual CSV column name) and `Qty` (fallback)

---

## Fix 3 — Color/Material Lookup in Grid Binding Resolution (3 locations)

The color grid binding has `lookupColumn: 'Material'` but the CSV column is `Color`. The fallback code already handles this — search for `col.toLowerCase() === 'color' || col.toLowerCase() === 'material'` — but the primary lookup `item[col]` tries `item['Material']` first which is undefined.

The existing fallback should work:
```ts
(col.toLowerCase() === 'color' || col.toLowerCase() === 'material' || col.toLowerCase() === 'colour')
  ? (item['Material'] || item['Color'] || item['Colour'] || item['material'] || item['color'] || '')
```

But verify this fallback exists in ALL 3 pipeline locations (upload handler, reprice route, Asana scheduler).

**Also:** The color binding `lookupColumn` in the database should ideally be updated from `'Material'` to `'Color'` to match the actual CSV. Add this to the auto-create-bindings logic:

In the auto-create-bindings endpoint, change:
```ts
const lookupColumn = colorAliases.has(alias) ? 'Material' : 'MANU_CODE';
```
To:
```ts
const lookupColumn = colorAliases.has(alias) ? 'Color' : 'MANU_CODE';
```

Then run auto-create-bindings with `{ dryRun: false, reset: true }` to recreate all bindings with the correct `lookupColumn`.

---

## Fix 4 — SKU Extraction in Description Field

The description field also needs the Allmoxy column name. Replace:

```ts
description: item.NAME || item['Part Name'] || item.Description || '',
```

With:

```ts
description: item.NAME || item['Part Name'] || item.Description || item['Manuf code'] || item.MANU_CODE || '',
```

(In the Allmoxy CSV, there's no separate NAME column — the SKU code IS the identifier.)

---

## Fix 5 — Multi-File Upload (Frontend)

In `client/src/pages/UploadOrder.tsx`, search for `formData.append` and verify:

1. The field name is `'files'` (PLURAL) not `'file'` (singular):
```ts
// Must be 'files' — the backend uses upload.array('files')
formData.append('files', file);
```

2. The `<input>` or file upload component has `multiple` enabled

3. ALL selected files are appended in a loop, not just the first one

---

## Fix 6 — Add Test Endpoint (for verification)

Add to `server/routes.ts` after the items endpoint:

```ts
  // Temporary test endpoint — remove after verification
  app.get('/api/test/order-check/:id', async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const files = await storage.getProjectFiles(projectId);
      res.json({
        projectId,
        fileCount: files.length,
        filenames: files.map(f => f.originalFilename),
        itemCount: items.length,
        sampleItems: items.slice(0, 3).map(i => ({
          sku: i.sku, unitPrice: i.unitPrice, totalPrice: i.totalPrice, 
          pricingError: i.pricingError, exportType: i.exportType,
        })),
        totalPrice: items.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
        pricingErrors: items.filter(i => i.pricingError).length,
      });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });
```

---

## Verification Steps

1. Deploy the fixes
2. Upload the `H_Holtermann__Her_Holtermann_V2_.csv` file
3. Check the Replit console — you should now see:
   ```
   [Upload Pipeline] Header row found at index: 13
   [Upload Pipeline] CSV column headers: ["Manuf code","Color","Quantity","Height","Width(R)","Length(L)","Thickness","Left","Right","Top","Bottom"]
   [Upload Pipeline] Parsed 51 data rows
   [Upload Pipeline] First item MANU_CODE: "34MDRWB1"
   [Upload Pipeline] SKU matches: ~45
   [Upload Pipeline] Batch inserted ~51 order items
   ```
4. Visit `/api/test/order-check/PROJECT_ID` — should show items with prices
5. View the order at `/orders/PROJECT_ID` — items should appear in the All Items tab

---

## Why This Was So Hard to Find

The column name mismatch is invisible unless you look at the actual CSV file. The code was tested against assumed column names (`MANU_CODE`, `Width`, `Length`, `Qty`) which match the Allmoxy GRID CSV format — but the Allmoxy ORDER CSV uses completely different column names (`Manuf code`, `Width(R)`, `Length(L)`, `Quantity`). The grid CSVs and order CSVs have different conventions, and no one had compared them until now.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` — upload handler | Fix SKU extraction, dimension extraction, description field |
| `server/routes.ts` — reprice route | Same fixes for SKU and dimensions |
| `server/routes.ts` — auto-create-bindings | Change color lookupColumn from 'Material' to 'Color' |
| `server/routes.ts` — add test endpoint | `/api/test/order-check/:id` |
| `client/src/pages/UploadOrder.tsx` | Verify FormData field name is 'files' plural |
