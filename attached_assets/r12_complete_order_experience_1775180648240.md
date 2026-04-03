# r12 — Fix Console Log Flooding + Order Browsing Experience + Inline Output Viewing

## Pre-Read (REQUIRED)

Read these files:
- `server/services/pricingEngine.ts` — lines 78-79 (the per-item logging that floods the console)
- `server/routes.ts` — upload handler (~line 2660), order items endpoint (~line 1399), all PDF/export endpoints (~lines 1429-2150)
- `client/src/pages/OrderDetails.tsx` — current order detail page

---

## Part 1 — Fix Console Log Flooding (CRITICAL)

The `[Upload Pipeline]` diagnostic logs are invisible because `evaluatePrice()` logs the formula text AND full JSON scope for every single item evaluation. A 200-item CSV generates thousands of log lines that flood the Replit console.

### In `server/services/pricingEngine.ts`:

**Remove** the two per-item `console.log` lines at ~line 78-79:
```ts
// DELETE these two lines:
console.log(`[PricingEngine] Evaluating formula: ${cleanFormula}`);
console.log(`[PricingEngine] Scope:`, JSON.stringify(scope, null, 2));
```

**Simplify** the error logging in the catch block to a single line:
```ts
catch (error: any) {
  const sku = orderItem?.sku || orderItem?.MANU_CODE || orderItem?.manuCode || "UNKNOWN";
  console.error(`[PricingEngine] FAILED SKU="${sku}": ${error.message}`);
  throw error;
}
```

### In `server/routes.ts` — upload handler (~line 2926):

Remove the per-item `[Pipeline] SKU:` log lines. The summary counters at line ~3040 already report match/no-match counts and the first 5 unmatched SKUs.

### Add pipeline complete summary (~line 3095, after the parsedFiles loop and before `res.json`):

```ts
console.log(`[Upload Pipeline] ═══ PIPELINE COMPLETE ═══`);
console.log(`[Upload Pipeline] Project: ${project.id} — ${projectName}`);
console.log(`[Upload Pipeline] Files processed: ${parsedFiles.length}`);
console.log(`[Upload Pipeline] Total order items: ${savedItems.length}`);
console.log(`[Upload Pipeline] Total price: $${totalProjectPrice.toFixed(2)}`);
```

---

## Part 2 — Order Details Page: Browsable Order Experience

The Order Details page at `/orders/:id` should be the main hub for viewing an order. Currently it has line items and download buttons. Transform it into a full browsable order view.

### 2a. Order Summary Header

At the top of the page, show:
- Project name, PO number, date, dealer
- **Order total** (sum of all item `totalPrice` values), formatted as currency
- Item count, matched count, error count
- Status badges for production statuses

### 2b. Line Items Table with Pricing Status

The items table (from `GET /api/orders/:id/items`) should show these columns:
- **SKU** — the MANU_CODE
- **Product** — the matched product name
- **Color/Material** — from `rawRowData.Material` or `rawRowData.Color`
- **Dimensions** — Width × Height × Depth (mm)
- **Qty**
- **Unit Price** — formatted as currency
- **Total** — formatted as currency
- **Status** — ✅ if priced, ❌ if `pricingError` is set (tooltip shows the error)

Group items by file (each file in the project gets its own section with a header showing the filename and file subtotal).

Show the **order grand total** below the table.

### 2c. Reprice Button

```tsx
const repriceMutation = useMutation({
  mutationFn: () => fetch(`/api/orders/${projectId}/reprice`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(r => r.json()),
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['order-items', projectId] });
    queryClient.invalidateQueries({ queryKey: ['order', projectId] });
    toast({ title: 'Order repriced', description: `Total: $${data.totalPrice?.toFixed(2) ?? '0'}` });
  },
});
```

Place this button in the header area next to the order total.

---

## Part 3 — Output Document Tabs (Browsable, Not Download-Only)

Below the line items table, add a **tabbed section** for viewing all output documents inline. Each tab shows the document content in the browser — PDFs in an embedded viewer, CSV exports as formatted tables, and text exports in a code block.

### Tab structure:

| Tab | Source Endpoint | View Type |
|-----|----------------|-----------|
| Invoice | `GET /api/orders/:id/pdf/invoice` | Embedded PDF (`<iframe>` or `<object>`) |
| Customer Packing Slip | `GET /api/orders/:id/pdf/customer-packing-slip` | Embedded PDF |
| Internal Packing Slip | `GET /api/orders/:id/pdf/internal-packing-slip` | Embedded PDF |
| Cabinet Vision (.ORD) | Assembled from `exportText` of ORD items | Code block (pre-formatted text) |
| Elias Export | `GET /api/orders/:id/export/elias` | Formatted table or code block |
| M&J Export | `GET /api/orders/:id/export/mj` | Formatted table or code block |
| ERP Export | `GET /api/orders/:id/export/erp` | Formatted table or code block |
| Cut-to-Size | `GET /api/orders/:id/pdf/cut-to-size` | Embedded PDF |
| Elias Dovetail PDF | `GET /api/orders/:id/pdf/elias` | Embedded PDF |
| M&J Shaker PDF | `GET /api/orders/:id/pdf/mj` | Embedded PDF |
| Hardware | Items where `exportType === 'HARDWARE'` | Filtered table from items data |
| Glass | Items where `exportType === 'GLASS'` | Filtered table from items data |

### Implementation approach:

**For PDF tabs:** Use an `<iframe>` or `<object>` tag pointing to the PDF endpoint URL. The PDFs already serve with `Content-Disposition: inline` so they render in the browser:

```tsx
<iframe 
  src={`/api/orders/${projectId}/pdf/invoice`}
  className="w-full h-[800px] border rounded"
  title="Invoice"
/>
```

**For CSV export tabs:** Fetch the endpoint, parse the CSV text into rows, and render as an HTML table. Or display in a `<pre>` code block:

```tsx
const { data: eliasExport } = useQuery({
  queryKey: ['elias-export', projectId],
  queryFn: () => fetch(`/api/orders/${projectId}/export/elias`).then(r => r.text()),
  enabled: activeTab === 'elias',
});

// Render as formatted table or pre block:
<pre className="bg-gray-50 p-4 rounded text-xs font-mono overflow-auto max-h-[600px]">
  {eliasExport}
</pre>
```

**For the ORD export:** Collect all items where `exportType === 'ORD'` and `exportText` is not null. Concatenate their `exportText` values with the ORD header template:

```tsx
const ordItems = items?.filter(i => i.exportType === 'ORD' && i.exportText) ?? [];
const ordText = ordItems.map(i => i.exportText).join('\n');

<pre className="bg-gray-50 p-4 rounded text-xs font-mono overflow-auto max-h-[600px]">
  {ordText || 'No ORD items in this order'}
</pre>
```

**For Hardware/Glass tabs:** Filter the items array by `exportType` and show in a table:

```tsx
const hardwareItems = items?.filter(i => i.exportType === 'HARDWARE') ?? [];
// Render as a table with SKU, Qty, Unit Price, Total columns
```

### Each tab should also have a Download button

In the top-right corner of each tab content area, show a download button that links to the appropriate endpoint:

```tsx
<a href={`/api/orders/${projectId}/pdf/invoice`} download className="...">
  Download PDF
</a>
```

For CSV exports:
```tsx
<a href={`/api/orders/${projectId}/export/elias`} download="Elias_Export.csv" className="...">
  Download CSV
</a>
```

### Only show tabs that have content

Check if each export type has items before showing its tab:
- Invoice tab: always show (it summarizes everything)
- Elias tab: only show if `items.some(i => i.exportType === 'ELIAS')`
- MJ tab: only show if `items.some(i => i.exportType === 'MJ')`
- ORD tab: only show if `items.some(i => i.exportType === 'ORD' && i.exportText)`
- CTS tab: only show if `items.some(i => i.exportType === 'CTS')`
- Hardware tab: only show if `items.some(i => i.exportType === 'HARDWARE')`
- Glass tab: only show if `items.some(i => i.exportType === 'GLASS')`
- Packing slips: always show

---

## Part 4 — Per-File Navigation

Each project can have multiple files. Add a **file selector** (tabs or dropdown) at the top of the items section that lets the user view items for a specific file or all files.

The items endpoint returns `fileId` on each item. Group items by fileId and show:
- "All Files" view (default) — shows everything
- Individual file tabs — shows items for just that file

Each file tab should show the file name and a subtotal.

The file-specific pages (`/files/:fileId/cts`, `/files/:fileId/checklist`, `/files/:fileId/hardware-checklist`) should be linked from within each file section.

---

## Part 5 — Upload Results: Navigate to Order

After upload completes, the results summary should include a prominent button to view the order:

```tsx
<Button onClick={() => navigate(`/orders/${result.id}`)}>
  View Order Details →
</Button>
```

Make sure `result.id` is the project ID from the upload response.

---

## Verification

After deploying:

1. **Console logs visible:** Upload a CSV. The Replit console should show clean `[Upload Pipeline]` diagnostic lines without being buried in per-item formula/scope dumps. You should see header detection, item counts, SKU match counts, pricing results, and batch insert confirmation.

2. **Order Details browsable:** Navigate to `/orders/{id}`. Should see:
   - Order summary header with total price
   - Line items table with pricing status (✅/❌)
   - Tabbed output section with Invoice, Packing Slips, ORD, Elias, MJ, etc.
   - Each tab shows the document inline (PDF viewer or formatted text)
   - Download button on each tab

3. **Reprice works:** Click "Reprice Order" on Order Details. Line items refresh with updated prices.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/services/pricingEngine.ts` | Remove 2 per-item console.log lines, simplify error logging |
| `server/routes.ts` | Remove per-item SKU log, add pipeline complete summary |
| `client/src/pages/OrderDetails.tsx` | Major rework: order summary header, pricing status column, reprice button, tabbed output documents with inline viewing, per-file grouping, download buttons |
| `client/src/pages/UploadOrder.tsx` | Add "View Order Details" navigation button in results |
