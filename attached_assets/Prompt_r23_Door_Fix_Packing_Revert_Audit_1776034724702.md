# Prompt r23 — Fix Door Pricing Errors + Restore Old Packing UI + App Audit

Paste this entire prompt into Replit.

---

## Part 1: Fix LDRTFL90SHA / RDRTFL90SHA Pricing Errors

### Problem

`LDRTFL90SHA` and `RDRTFL90SHA` items show `$0.00` with a red "Error" badge after CSV import. These are TFL 90° 5-Piece Shaker doors (non-glass-door variants). They use the same pricing formula as all other door products.

### Diagnosis

Run these checks in the Replit shell or via API calls:

```bash
# 1. Check if these products exist in allmoxy_products
curl -s localhost:5000/api/admin/allmoxy-products | jq '.[] | select(.skuPrefix | test("LDRTFL90SHA|RDRTFL90SHA")) | {id, name, skuPrefix, pricingProxyId, exportProxyId, exportType}'

# 2. Check if they have grid bindings
# For each product ID found above:
curl -s localhost:5000/api/admin/allmoxy-products/PRODUCT_ID/grid-bindings

# 3. Check the actual pricing error stored on the order items
curl -s localhost:5000/api/orders/ORDER_ID/items | jq '.[] | select(.sku | test("LDRTFL90SHA|RDRTFL90SHA")) | {sku, unitPrice, totalPrice, pricingError}'
```

### Most Likely Causes (Fix Whichever Applies)

**Cause A — No pricing proxy assigned:**
If `pricingProxyId` is null for these products, they need the doors pricing formula assigned. Go to the Allmoxy Product Manager, find these products, and assign the correct pricing proxy (the same one used by `LDRTFL90SHAGD` / `RDRTFL90SHAGD`).

**Cause B — Missing grid bindings:**
These products need bindings to `doors` grid (lookupColumn: MANU_CODE) AND `color` grid (lookupColumn: Color/Material). Run the Diagnostic page → "Reset & Recreate Bindings" to auto-create them, then "Re-run Pricing" on the order.

**Cause C — SKU prefix collision:**
If the `allmoxy_products` table has `skuPrefix = 'LDRTFL90SHA'` as one product AND `skuPrefix = 'LDRTFL90SHAGD'` as another, the SKU prefix matching needs to try the longest match first. Check if the upload pipeline sorts products by `skuPrefix` length (descending) before matching. If not, a CSV item with SKU `LDRTFL90SHAGD` might match the shorter prefix `LDRTFL90SHA` first and get the wrong product's formula.

**Fix for Cause C** (if applicable): In the upload handler and reprice route, sort the products array by `skuPrefix` length descending before the matching loop:

```typescript
// Sort products so longer SKU prefixes are checked first
// This prevents "LDRTFL90SHA" from matching before "LDRTFL90SHAGD"
const sortedProducts = [...allProducts].sort((a, b) => 
  (b.skuPrefix?.length || 0) - (a.skuPrefix?.length || 0)
);
```

Apply this sort in all three pipeline locations: upload handler, reprice route, and Asana scheduler.

**Cause D — Product not in database at all:**
If `LDRTFL90SHA` has no matching product in `allmoxy_products`, create one with the correct SKU prefix, category, and formula assignments.

### After Fixing

Re-run pricing on the affected order to clear the errors.

---

## Part 2: Restore Old Packing & Shipping UI Design

### Problem

The r22 redesign changed the Packing & Shipping view to a new inline layout. The old standalone packing checklist, hardware checklist, and pallet management pages had a better design that should be restored.

### What to Do

Keep the new Documents view (the per-file tab layout with file sidebar for Invoice, Cabinet Vision, Elias, etc. — this is an improvement). But for the Packing & Shipping section, revert to linking to the original standalone pages instead of the inline components.

In `ShippingView.tsx` (or wherever the Packing & Shipping tabs are rendered):

**Replace the inline components** (`PackingChecklistInline`, `HardwareChecklistInline`, `CtsPartsInline`) with **links/buttons that navigate to the existing standalone pages**:

```tsx
// Instead of rendering inline, navigate to the existing pages
function ShippingView({ projectId, fileId, files }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Packing & Shipping</h3>
      
      {/* Show a card for each file with links to its standalone pages */}
      {files.map(file => (
        <div key={file.fileId} className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">{file.displayName}</h4>
          
          <div className="flex flex-wrap gap-2">
            <a href={`/files/${file.fileId}/checklist`}>
              <Button variant="outline" size="sm">
                📋 Packing Checklist
                {file.packingProgress && 
                  ` (${file.packingProgress.checked}/${file.packingProgress.total})`}
              </Button>
            </a>
            
            <a href={`/files/${file.fileId}/hardware-checklist`}>
              <Button variant="outline" size="sm">
                🔧 Hardware Checklist
                {file.hardwareProgress && 
                  ` (${file.hardwareProgress.packed}/${file.hardwareProgress.total})`}
              </Button>
            </a>
            
            <a href={`/files/${file.fileId}/cts`}>
              <Button variant="outline" size="sm">
                ✂️ Cut-to-Size
                {file.ctsProgress && 
                  ` (${file.ctsProgress.cut}/${file.ctsProgress.total})`}
              </Button>
            </a>
          </div>
        </div>
      ))}
      
      {/* Pallets section — keep the PalletManager component inline since it's project-level */}
      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-3">Pallets</h4>
        <PalletManager projectId={projectId} />
      </div>
    </div>
  );
}
```

This keeps the new Documents/Shipping section toggle but uses the battle-tested standalone pages for the actual packing workflow. The standalone pages (`/files/:fileId/checklist`, `/files/:fileId/hardware-checklist`, `/files/:fileId/cts`) already work correctly and have the UI design you prefer.

### Delete Unused Inline Components

If the following inline wrapper components were created in r22 and are no longer used, delete them:
- `PackingChecklistInline.tsx`
- `HardwareChecklistInline.tsx`
- `CtsPartsInline.tsx`

Keep `PalletManager.tsx` since the pallet UI is still rendered inline.

---

## Part 3: Hardware Download — CSV + XLSX Options

### Problem

The Hardware tab shows hardware items but has no download buttons. Need both a CSV download and an XLSX download.

### Backend: Add Two New Endpoints

#### 1. Hardware CSV Download

```typescript
app.get('/api/orders/:id/download/hardware-csv', isAuthenticated, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const fileId = req.query.fileId ? parseInt(req.query.fileId as string) : null;
    const items = fileId
      ? await storage.getOrderItemsByFile(fileId)
      : await storage.getOrderItemsByProject(projectId);
    const allProducts = await storage.getAllmoxyProducts();
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const hwItems = items.filter(i => i.exportType === 'HARDWARE');

    // Build CSV: SKU, Product Name, Qty, Unit Price, Total, Supply Type
    const header = 'SKU,Product Name,Quantity,Unit Price,Total Price,Supply Type';
    const rows = hwItems.map(i => {
      const productName = i.productId ? (productMap.get(i.productId)?.name ?? '') : '';
      const safeName = productName.includes(',') ? `"${productName}"` : productName;
      return `${i.sku ?? ''},${safeName},${i.quantity ?? 1},${(i.unitPrice ?? 0).toFixed(2)},${(i.totalPrice ?? 0).toFixed(2)},${i.supplyType ?? 'STOCK'}`;
    });
    const csv = [header, ...rows].join('\r\n');

    const filename = fileId ? `Hardware_File${fileId}.csv` : `Hardware_Order${projectId}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});
```

#### 2. Hardware XLSX Download

Install `exceljs` if not already available:
```bash
npm install exceljs
```

```typescript
app.get('/api/orders/:id/download/hardware-xlsx', isAuthenticated, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const projectId = Number(req.params.id);
    const fileId = req.query.fileId ? parseInt(req.query.fileId as string) : null;
    const items = fileId
      ? await storage.getOrderItemsByFile(fileId)
      : await storage.getOrderItemsByProject(projectId);
    const allProducts = await storage.getAllmoxyProducts();
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const hwItems = items.filter(i => i.exportType === 'HARDWARE');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hardware');

    // Header row with styling
    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 25 },
      { header: 'Product Name', key: 'productName', width: 40 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Unit Price', key: 'unitPrice', width: 12 },
      { header: 'Total Price', key: 'totalPrice', width: 12 },
      { header: 'Supply Type', key: 'supplyType', width: 15 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    headerRow.border = {
      bottom: { style: 'thin' },
    };

    // Add data rows
    for (const item of hwItems) {
      const productName = item.productId ? (productMap.get(item.productId)?.name ?? '') : '';
      sheet.addRow({
        sku: item.sku ?? '',
        productName,
        qty: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        totalPrice: item.totalPrice ?? 0,
        supplyType: item.supplyType ?? 'STOCK',
      });
    }

    // Format price columns as currency
    sheet.getColumn('unitPrice').numFmt = '$#,##0.00';
    sheet.getColumn('totalPrice').numFmt = '$#,##0.00';

    // Add totals row
    const totalRow = sheet.addRow({
      sku: '',
      productName: 'TOTAL',
      qty: hwItems.reduce((s, i) => s + (i.quantity ?? 1), 0),
      unitPrice: '',
      totalPrice: Math.round(hwItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0) * 100) / 100,
      supplyType: '',
    });
    totalRow.font = { bold: true };

    const filename = fileId ? `Hardware_File${fileId}.xlsx` : `Hardware_Order${projectId}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (e: any) {
    console.error('[Hardware XLSX]', e.message);
    res.status(500).json({ message: e.message });
  }
});
```

### Frontend: Add Download Buttons to Hardware Tab

In the Hardware tab component (inside `DocumentsView.tsx` or wherever the Hardware tab content renders), add two download buttons above the items table:

```tsx
// Hardware tab content
<div className="space-y-3">
  <div className="flex justify-end gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.location.href = `/api/orders/${projectId}/download/hardware-csv?fileId=${fileId}`}
    >
      Download CSV
    </Button>
    <Button
      size="sm"
      onClick={() => window.location.href = `/api/orders/${projectId}/download/hardware-xlsx?fileId=${fileId}`}
    >
      Download Excel
    </Button>
  </div>
  {/* ... existing hardware items table ... */}
</div>
```

---

## Part 4: Deep Audit — Current State vs Goals

### What's Working Well

1. **CSV Upload → Pricing Pipeline** — solid. Bulk queries, in-memory grid cache, O(1) lookups. Performance is good.
2. **Product/Grid/Formula Admin** — full CRUD, diagnostic page, auto-assign, formula tester. This is mature.
3. **New Documents View** — per-file tabs with file sidebar is a real improvement over the old 12-flat-tab layout.
4. **ORD Export** — r21 fixed the format (separate files, 8-field, ZIP). Correct.
5. **PDF Generation** — 6 Python/ReportLab scripts working for Invoice, Packing Slips, Elias, M&J, CTS.
6. **Integrations** — Asana, Outlook, Google Sheets all live and running on schedulers.

### What Still Needs Work

| Issue | Priority | Notes |
|---|---|---|
| **SKU prefix collision** (LDRTFL90SHA vs LDRTFL90SHAGD) | HIGH | Sort by prefix length descending in all 3 pipeline locations |
| **Some doors showing $0 / Error** | HIGH | Grid bindings or proxy assignment missing for non-GD door variants |
| **`overflow-hidden` re-added in r22-hotfix** | HIGH | Causes scroll truncation — remove from AppLayout and OrderDetails wrappers |
| **PDFs still generate for entire project, not per-file** | MEDIUM | The `?fileId` parameter was added to endpoints but need to verify the Python scripts receive and use `fileLabel` |
| **No pricing audit trail** | LOW | `formulaSnapshot` and `variableSnapshot` columns missing from `order_items` |
| **No product active/inactive toggle** | LOW | `active` column missing from `allmoxy_products` |
| **`proxy_variables` missing `description` column** | LOW | Admins can't annotate formulas |
| **ERP export not per-file yet** | MEDIUM | No `GET /api/orders/:id/data/erp?fileId=N` endpoint exists |

### What's NOT Needed (Don't Build)

- Auto-seed / auto-classify logic — the app ships as a manually-configured template, which is correct
- Complex multi-room ORD format — single file per room with ZIP download is the right approach
- Object storage for images — base64 in PostgreSQL works fine for the 2,363 products

---

## Verification

1. Check the LDRTFL90SHA/RDRTFL90SHA products in the Allmoxy Product Manager — do they have pricing proxies and grid bindings?
2. If not, run Diagnostic → Reset & Recreate Bindings → Re-run Pricing
3. If the SKU prefix collision is the cause, apply the sort fix and re-upload or re-price
4. Verify the Packing & Shipping section now links to the standalone pages
5. Verify scrolling works on all pages (no overflow-hidden truncation)
