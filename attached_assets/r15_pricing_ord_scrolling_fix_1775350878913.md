# r15 — Fix Pricing (Grid Binding MANU_CODE) + Fix ORD File + Fix Scrolling

## Pre-Read (REQUIRED)

Read: `server/routes.ts` (upload handler ~line 3120, reprice route ~line 2415, ORD data endpoint ~line 1586, default header template ~line 77)

---

## CRITICAL FIX 1 — Grid Binding MANU_CODE Lookup (Root Cause of $0.00 Pricing)

**Problem:** 50 items now appear but ALL show "Undefined symbol drawer_boxes" / "drawer_fronts" / "corner_shelves" with $0.00 pricing. The grid binding resolution at ~line 3128 tries `item['MANU_CODE']` to look up the product in its attribute grid, but the CSV column is `Manuf code`. So the lookup returns empty, the grid data never enters scope, and the formula fails.

**The fix is simple:** For bindings where `lookupColumn` contains "manu" (case-insensitive), use the **already-extracted `sku` variable** instead of re-reading from the CSV. The `sku` was already correctly extracted 10 lines earlier.

### Fix in upload handler (~line 3121):

Replace the grid binding resolution block:
```ts
          const contextScope: any = {};
          if (product) {
            const bindings = productBindingsMap.get(product.id) ?? [];
            for (const binding of bindings) {
              const grid = gridMap.get(binding.gridId);
              if (!grid) continue;
              const col = binding.lookupColumn;
              const lookupValue = (
                item[col] ||
                item[col.toLowerCase()] ||
                item[col.toUpperCase()] ||
                ((col.toLowerCase() === 'color' || col.toLowerCase() === 'material' || col.toLowerCase() === 'colour')
                  ? (item['Material'] || item['Color'] || item['Colour'] || item['material'] || item['color'] || '')
                  : '')
              ).toString().trim();
              if (!lookupValue) continue;
```

With:
```ts
          const contextScope: any = {};
          if (product) {
            const bindings = productBindingsMap.get(product.id) ?? [];
            for (const binding of bindings) {
              const grid = gridMap.get(binding.gridId);
              if (!grid) continue;
              const col = binding.lookupColumn;
              const isManuCol = col.toLowerCase().includes('manu');
              
              let lookupValue: string;
              if (isManuCol) {
                // For MANU_CODE bindings, use the already-extracted SKU
                // (CSV column may be "Manuf code" not "MANU_CODE")
                lookupValue = sku;
              } else {
                // For other bindings (Color, Material, etc.), read from CSV
                lookupValue = (
                  item[col] ||
                  item[col.toLowerCase()] ||
                  item[col.toUpperCase()] ||
                  ((col.toLowerCase() === 'color' || col.toLowerCase() === 'material' || col.toLowerCase() === 'colour')
                    ? (item['Material'] || item['Color'] || item['Colour'] || item['material'] || item['color'] || item['COLOR'] || '')
                    : '')
                ).toString().trim();
              }
              
              if (!lookupValue) continue;
```

### Apply the SAME fix in the reprice route (~line 2415)

Find the identical grid binding resolution block in the reprice handler and apply the same change. The reprice route also has a `sku` variable extracted earlier in its loop.

---

## CRITICAL FIX 2 — ORD File: Missing [Header] Block + Wrong Content

The generated .ORD file has THREE problems:

### Problem A: Missing [Header] block

The ORD download endpoint at `GET /api/orders/:id/data/ord` (line 1586) assembles the ORD text from items' `exportText` but does NOT include the `[Header]` block. Without `[Header]` and `Unit=1`, Cabinet Vision doesn't know the dimensions are in millimeters and displays wrong values.

Replace the ORD data endpoint:

```ts
  app.get('/api/orders/:id/data/ord', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      
      const items = await storage.getOrderItemsByProject(projectId);
      const ordItems = items.filter(i => i.exportType === 'ORD' && i.exportText);
      
      // Build the header
      const headerSetting = await storage.getSetting('ord_header_template');
      const headerTemplate = headerSetting?.value ?? DEFAULT_ORD_HEADER_TEMPLATE;
      
      // Use project name for design name and PO
      const files = await storage.getProjectFiles(projectId);
      const designName = files[0]?.poNumber || project.name || `Order ${projectId}`;
      const poNumber = files[0]?.poNumber || project.orderId || '';
      const header = generateOrdHeader(headerTemplate, { designName, poNumber });
      
      // Assemble: header + all ORD item blocks (no HARDWARE items)
      const assembledOrdText = header + '\n' + ordItems.map(i => i.exportText).join('\n');
      
      res.json({
        items: ordItems.map(i => ({
          sku: i.sku, qty: i.quantity, height: i.height, width: i.width, depth: i.depth,
          unitPrice: i.unitPrice, totalPrice: i.totalPrice,
          exportText: i.exportText, pricingError: i.pricingError,
        })),
        assembledOrdText,
        total: Math.round(ordItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0) * 100) / 100,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
```

### Problem B: Add dedicated ORD download endpoint

Add a new endpoint that serves the assembled .ORD file for download:

```ts
  app.get('/api/orders/:id/download/ord', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      
      const items = await storage.getOrderItemsByProject(projectId);
      const ordItems = items.filter(i => i.exportType === 'ORD' && i.exportText);
      
      if (ordItems.length === 0) {
        return res.status(404).json({ message: 'No ORD items in this order' });
      }
      
      const headerSetting = await storage.getSetting('ord_header_template');
      const headerTemplate = headerSetting?.value ?? DEFAULT_ORD_HEADER_TEMPLATE;
      const files = await storage.getProjectFiles(projectId);
      const designName = files[0]?.poNumber || project.name || `Order ${projectId}`;
      const poNumber = files[0]?.poNumber || project.orderId || '';
      const header = generateOrdHeader(headerTemplate, { designName, poNumber });
      
      const ordText = header + '\n' + ordItems.map(i => i.exportText).join('\n');
      
      const filename = (project.name || `Order_${projectId}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.ord"`);
      res.send(ordText);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
```

### Problem C: Update the default ORD header template

The default template at line 77 is missing required fields. Replace with:

```ts
const DEFAULT_ORD_HEADER_TEMPLATE = `[Header]
Version=4
Unit=1
Name="{{design_name}}"
Description="{{design_name}}"
PurchaseOrder="{{po_number}}"
Comment=""
Customer="Perfect Fit Closets"
Address1="100-111 5 Avenue Southwest"`;
```

Key changes:
- `Name` and `Description` values are now quoted (Cabinet Vision requires quotes)
- `PurchaseOrder` value is quoted
- `Customer` and `Address1` are filled in with Perfect Fit's actual info

### Problem D: HARDWARE items should NOT be in the ORD file

The current ORD file contains lines like `2,34MDRWB1,,,,HARDWARE,...`. These are hardware-type export blocks mixed into the ORD output. The ORD data endpoint should filter by `exportType === 'ORD'`, not just `exportText != null`. This is already fixed in the replacement code above.

Also check the upload handler's `combinedOrdText` assembly (~line 3231) — it currently appends ALL exportText including hardware. Change to only append ORD-type items:

```ts
// In the per-item loop, change:
if (exportText) fileOrdText += exportText + "\n";

// To:
if (exportText && (product?.exportType === 'ORD')) fileOrdText += exportText + "\n";
```

---

## FIX 3 — Page Scrolling

The Order Details page can't scroll to show all items. Find the container that prevents scrolling.

In `client/src/pages/OrderDetails.tsx` (or the tab components), ensure the main content area allows scrolling:

```tsx
// The page wrapper should NOT have overflow-hidden
// The table container should have overflow-auto
<div className="overflow-auto">
  <table className="w-full text-sm">
    {/* items */}
  </table>
</div>
```

Check the root layout component for `overflow-hidden` on the main content area — this is the most common cause. The fix is usually changing `overflow-hidden` to `overflow-auto` on the `<main>` element.

---

## Verification

After deploying:

1. **Click "Re-run Pricing"** on an existing order → items should now show non-zero prices (grid aliases resolved via the SKU)
2. **Click "Download .ORD"** → the file should start with `[Header]\nVersion=4\nUnit=1\n...` and NOT contain HARDWARE lines
3. **Open the .ORD in Cabinet Vision** → dimensions should be correct (mm values, not inflated)
4. **Scroll the items list** → should be able to see all 50 items

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` — upload handler (~line 3121) | Use `sku` for MANU_CODE grid bindings |
| `server/routes.ts` — reprice route | Same MANU_CODE binding fix |
| `server/routes.ts` — `/data/ord` endpoint (~line 1586) | Add header, filter by exportType ORD |
| `server/routes.ts` — new `/download/ord` endpoint | Dedicated ORD file download |
| `server/routes.ts` — default header template (~line 77) | Add quotes, Customer, Address |
| `server/routes.ts` — upload handler (~line 3231) | Only append ORD-type items to fileOrdText |
| `client/src/pages/OrderDetails.tsx` | Fix scrolling overflow |
