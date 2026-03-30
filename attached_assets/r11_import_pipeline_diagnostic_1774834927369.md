# r11 — Import Pipeline Diagnostic Logging + Debug

## Pre-Read (REQUIRED)

Read these files before starting:
- `server/routes.ts` — the upload handler (~line 2550), the reprice route (~line 2140)
- `server/storage.ts` — `getAllmoxyProducts()`, `createOrderItemsBatch()`

---

## Problem

After uploading an Allmoxy order CSV, the Order Details page shows no products and no pricing. The diagnostic page shows bindings are correct (only glass warnings). The backend code logic appears sound, but something in the pipeline is silently failing. We need diagnostic logging to identify exactly where it breaks.

---

## Part 1 — Add Comprehensive Logging to Upload Pipeline

In the upload handler (`app.post(api.orders.upload.path, ...)`, ~line 2550), add logging at every critical step. This is the single most important change — without it we're debugging blind.

### After pre-loading products (~line 2622):

```ts
const activeProducts = allProducts.filter(
  (p): p is AllmoxyProduct => p.status === 'active' && !!p.skuPrefix
);

// ── DIAGNOSTIC LOGGING ──
console.log(`[Upload Pipeline] Total products in DB: ${allProducts.length}`);
console.log(`[Upload Pipeline] Active products with skuPrefix: ${activeProducts.length}`);
console.log(`[Upload Pipeline] Total grid bindings: ${allBindings.length}`);
console.log(`[Upload Pipeline] Total grids: ${allGrids.length}`);
console.log(`[Upload Pipeline] Total proxy variables: ${allProxyVars.length}`);
if (activeProducts.length === 0) {
  console.error(`[Upload Pipeline] ⚠ ZERO active products with skuPrefix — no SKUs will match!`);
}
// Sample: show first 5 active products for verification
console.log(`[Upload Pipeline] Sample active products:`, activeProducts.slice(0, 5).map(p => ({
  id: p.id, name: p.name, skuPrefix: p.skuPrefix, status: p.status,
  pricingProxyId: p.pricingProxyId, exportProxyId: p.exportProxyId
})));
```

### After header detection (~line 2751):

```ts
let headerRowIdx = -1;
for (let ri = 0; ri < pf.records.length; ri++) {
  if ((pf.records[ri][0] ?? '').toLowerCase().includes('manuf')) {
    headerRowIdx = ri;
    break;
  }
}

// ── DIAGNOSTIC LOGGING ──
console.log(`[Upload Pipeline] File: ${pf.filename}`);
console.log(`[Upload Pipeline] Total CSV rows (records): ${pf.records.length}`);
console.log(`[Upload Pipeline] Header row found at index: ${headerRowIdx}`);
if (headerRowIdx !== -1) {
  const headers = pf.records[headerRowIdx].map(h => (h ?? '').trim());
  console.log(`[Upload Pipeline] CSV column headers: ${JSON.stringify(headers)}`);
} else {
  console.error(`[Upload Pipeline] ⚠ NO HEADER ROW FOUND — scanning first 5 rows for debugging:`);
  for (let i = 0; i < Math.min(5, pf.records.length); i++) {
    console.log(`[Upload Pipeline]   Row ${i}: ${JSON.stringify(pf.records[i]?.slice(0, 5))}`);
  }
}
```

### After building itemObjects (~line 2762):

```ts
// ── DIAGNOSTIC LOGGING ──
console.log(`[Upload Pipeline] Parsed ${itemObjects.length} data rows from ${pf.filename}`);
if (itemObjects.length > 0) {
  console.log(`[Upload Pipeline] First item columns: ${JSON.stringify(Object.keys(itemObjects[0]))}`);
  console.log(`[Upload Pipeline] First item MANU_CODE: "${itemObjects[0].MANU_CODE || itemObjects[0].SKU || '(not found)'}"`);
  console.log(`[Upload Pipeline] First item Material/Color: "${itemObjects[0].Material || itemObjects[0].Color || itemObjects[0].Colour || '(not found)'}"`);
} else {
  console.error(`[Upload Pipeline] ⚠ ZERO data rows parsed — no order items will be created`);
}
```

### Inside the per-item loop, after SKU matching (~line 2780):

Add a counter to track matches:

```ts
let matchCount = 0;
let noMatchCount = 0;
let pricingSuccessCount = 0;
let pricingErrorCount = 0;

for (const item of itemObjects) {
  const sku = (item.MANU_CODE || item.SKU || item['Manuf Code'] || '').toString().trim();
  if (!sku) continue;

  const product = matchProductToSku(sku, activeProducts);
  if (product) {
    matchCount++;
  } else {
    noMatchCount++;
    if (noMatchCount <= 5) {
      console.log(`[Upload Pipeline] SKU NO MATCH: "${sku}" — no active product has a skuPrefix that matches`);
    }
  }
  
  // ... existing code ...
  
  // After pricing evaluation:
  if (pricingError) {
    pricingErrorCount++;
    if (pricingErrorCount <= 3) {
      console.log(`[Upload Pipeline] Pricing error for SKU "${sku}": ${pricingError}`);
    }
  } else if (unitPrice > 0) {
    pricingSuccessCount++;
  }
}

// After the loop, before batch insert:
console.log(`[Upload Pipeline] File ${pf.filename} results:`);
console.log(`[Upload Pipeline]   Items parsed: ${itemObjects.length}`);
console.log(`[Upload Pipeline]   SKU matches: ${matchCount}`);
console.log(`[Upload Pipeline]   SKU no-match: ${noMatchCount}`);
console.log(`[Upload Pipeline]   Pricing success: ${pricingSuccessCount}`);
console.log(`[Upload Pipeline]   Pricing errors: ${pricingErrorCount}`);
console.log(`[Upload Pipeline]   Items in batch: ${itemBatch.length}`);
```

### After batch insert (~line 2873):

```ts
await storage.createOrderItemsBatch(itemBatch);
console.log(`[Upload Pipeline] Batch inserted ${itemBatch.length} order items for file ${pf.filename}`);
```

---

## Part 2 — Add the Same Logging to the Reprice Route

The reprice route (~line 2140) has similar processing. Add the same diagnostic counters there so that when the user clicks "Reprice Order", you can see what happens.

---

## Part 3 — Add a Quick-Check Endpoint

Add `GET /api/admin/import-readiness` that returns a fast summary of whether the system is ready to process orders:

```ts
app.get('/api/admin/import-readiness', isAuthenticated, async (req, res) => {
  try {
    const allProducts = await storage.getAllmoxyProducts();
    const activeWithPrefix = allProducts.filter(p => p.status === 'active' && p.skuPrefix);
    const activeWithPricing = activeWithPrefix.filter(p => p.pricingProxyId != null);
    const allBindings = await storage.getAllProductGridBindings();
    const allProxyVars = await storage.getProxyVariables();
    const allGrids = await storage.getAttributeGrids();
    
    // Count grid rows to verify grids have data
    let totalGridRows = 0;
    for (const g of allGrids) {
      const rows = await storage.getAttributeGridRows(g.id);
      totalGridRows += rows.length;
    }

    const ready = activeWithPrefix.length > 0 && activeWithPricing.length > 0 && allBindings.length > 0;

    res.json({
      ready,
      products: {
        total: allProducts.length,
        active: allProducts.filter(p => p.status === 'active').length,
        activeWithSkuPrefix: activeWithPrefix.length,
        activeWithPricingFormula: activeWithPricing.length,
        activeWithExportFormula: activeWithPrefix.filter(p => p.exportProxyId != null).length,
        sampleSkuPrefixes: activeWithPrefix.slice(0, 10).map(p => p.skuPrefix),
      },
      grids: {
        count: allGrids.length,
        totalRows: totalGridRows,
        names: allGrids.map(g => g.name),
      },
      bindings: {
        total: allBindings.length,
        productsWithBindings: new Set(allBindings.map(b => b.productId)).size,
      },
      proxyVariables: {
        total: allProxyVars.length,
        pricing: allProxyVars.filter(v => v.type === 'pricing').length,
        export: allProxyVars.filter(v => v.type === 'export').length,
      },
      issues: [
        ...(activeWithPrefix.length === 0 ? ['No active products have skuPrefix set — SKU matching will fail for all rows'] : []),
        ...(activeWithPricing.length === 0 ? ['No products have pricing formulas assigned — all prices will be $0'] : []),
        ...(allBindings.length === 0 ? ['No grid bindings exist — grid lookups will fail'] : []),
        ...(allProxyVars.length === 0 ? ['No proxy variables/formulas exist — pricing and export will not work'] : []),
        ...(totalGridRows === 0 ? ['Grids exist but have no rows — grid lookups will return nothing'] : []),
      ],
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

---

## Part 4 — Show Readiness Check on Upload Page

In `UploadOrder.tsx`, before the upload form, fetch the readiness check:

```tsx
const { data: readiness } = useQuery({
  queryKey: ['import-readiness'],
  queryFn: () => fetch('/api/admin/import-readiness').then(r => r.json()),
});
```

If `readiness?.ready === false`, show a warning banner:

```tsx
{readiness && !readiness.ready && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
    <h3 className="font-semibold text-amber-800">⚠ System not ready for order import</h3>
    <ul className="mt-2 text-sm text-amber-700">
      {readiness.issues.map((issue: string, i: number) => (
        <li key={i}>• {issue}</li>
      ))}
    </ul>
    <p className="mt-2 text-sm text-amber-600">
      Products with SKU prefix: {readiness.products.activeWithSkuPrefix} · 
      With pricing formula: {readiness.products.activeWithPricingFormula} · 
      Grid bindings: {readiness.bindings.total}
    </p>
  </div>
)}
```

If `readiness?.ready === true`, show a green confirmation:

```tsx
{readiness?.ready && (
  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
    ✅ Ready: {readiness.products.activeWithPricingFormula} products with pricing · 
    {readiness.bindings.total} grid bindings · 
    {readiness.proxyVariables.total} formulas
  </div>
)}
```

---

## Part 5 — Show Import Results Summary

After a successful upload, the response includes `items` array. Show a summary on the upload results page:

```tsx
// After successful upload:
const totalItems = result.items.length;
const matchedItems = result.items.filter((i: any) => i.productMatched).length;
const errorItems = result.items.filter((i: any) => i.error).length;
const pricedItems = result.items.filter((i: any) => i.price > 0).length;
```

Display:
```
Upload Complete ✓
Project: {projectName}
{totalItems} line items processed
  ✅ {matchedItems} matched to products
  ❌ {totalItems - matchedItems} unmatched
  💰 {pricedItems} priced successfully  
  ⚠ {errorItems} pricing errors
Total: ${result.totalPrice.toFixed(2)}
```

---

## Part 6 — Multi-File Upload Fix (if not done yet)

Check `UploadOrder.tsx` for these specific things:

1. Does the `<input type="file">` have `multiple` attribute?
2. Does the state store `File[]` (array) or `File | null` (single)?
3. Does the FormData append loop use field name `'files'` (not `'file'`)?
4. Does the drag-and-drop handler process ALL dropped files?

If any of these are wrong, fix them per the instructions in the r10 prompt.

---

## Verification

After deploying, upload a test CSV and check the Replit console output. You should see something like:

```
[Upload Pipeline] Total products in DB: 2363
[Upload Pipeline] Active products with skuPrefix: 2363
[Upload Pipeline] Total grid bindings: 4500
[Upload Pipeline] File: order.csv
[Upload Pipeline] Total CSV rows (records): 250
[Upload Pipeline] Header row found at index: 8
[Upload Pipeline] CSV column headers: ["MANU_CODE","Material","Qty","Height","Width","Length","Thickness","Left","Right","Top","Bottom","NAME"]
[Upload Pipeline] Parsed 200 data rows from order.csv
[Upload Pipeline] First item MANU_CODE: "34SHFA"
[Upload Pipeline] First item Material/Color: "TFL1W"
[Upload Pipeline] File order.csv results:
[Upload Pipeline]   Items parsed: 200
[Upload Pipeline]   SKU matches: 195
[Upload Pipeline]   SKU no-match: 5
[Upload Pipeline]   Pricing success: 190
[Upload Pipeline]   Pricing errors: 5
[Upload Pipeline]   Items in batch: 200
[Upload Pipeline] Batch inserted 200 order items
```

If instead you see:
- `Active products with skuPrefix: 0` → Products don't have skuPrefix set
- `Header row found at index: -1` → The CSV format doesn't have a "manuf" header
- `ZERO data rows parsed` → Header was found but no data rows after it
- `SKU NO MATCH` for everything → Products' skuPrefix values don't match the CSV SKUs
- `Pricing error` for everything → Grid bindings still wrong or formula errors

This will immediately tell you what's broken.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` — upload handler | Add 6 diagnostic log blocks at critical pipeline steps |
| `server/routes.ts` — reprice route | Add same diagnostic counters |
| `server/routes.ts` — new endpoint | `GET /api/admin/import-readiness` |
| `client/src/pages/UploadOrder.tsx` | Readiness banner, import results summary, multi-file fix if needed |
