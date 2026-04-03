# r13 — Redesign Order Viewing Experience + Fix Multi-File Upload + Fix Pricing Pipeline Visibility

## Pre-Read (REQUIRED)

Read these files:
- `server/routes.ts` — all endpoints under `/api/orders/:id/*` and `/api/files/:fileId/*`
- `server/services/pricingEngine.ts` — verify per-item logging is removed
- `client/src/pages/OrderDetails.tsx` — current order detail page (to be redesigned)
- `client/src/pages/UploadOrder.tsx` — upload page
- `client/src/App.tsx` — route definitions

---

## Design Overview — The New Order Viewing Experience

The current Order Details page tries to cram everything onto one page with download buttons. This is wrong. The new design uses a **tabbed page layout** where the order page has a persistent sidebar or top navigation with sections the user clicks through — similar to Allmoxy's order file tabs.

### URL Structure

All order pages live under `/orders/:id` with tab-based navigation (NOT separate routes — we want to keep the order context and avoid full page reloads):

```
/orders/:id                → Order page with tab navigation
  Tab: Overview            → Order summary, file list, status, color breakdown
  Tab: All Items           → Full line items table with pricing, grouped by product
  Tab: Invoice             → Invoice view (HTML table matching the PDF layout)
  Tab: Customer Packing Slip → Packing slip view
  Tab: Internal Packing Slip → Internal slip view
  Tab: Cabinet Vision (.ORD) → ORD export text view
  Tab: Elias Dovetail      → Elias items table + export view
  Tab: M&J Doors           → M&J items table + export view
  Tab: ERP Import          → ERP export table view
  Tab: Cut-to-Size         → CTS parts table
  Tab: Hardware             → Hardware items table
  Tab: Glass               → Glass items table
```

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Orders    Order: Anderson PO25-391065         │
│  Status: PENDING     Total: $4,523.67    [Reprice]       │
├──────────────────────────────────────────────────────────┤
│ Overview│All Items│Invoice│Packing│ORD│Elias│MJ│ERP│CTS│HW│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  (Active tab content renders here)                       │
│                                                          │
│                                                          │
│                                          [Download PDF]  │
└──────────────────────────────────────────────────────────┘
```

---

## Part 1 — Backend: Add JSON Data Endpoints for Inline Viewing

Currently, exports like Invoice, Elias, MJ only serve as raw PDF/CSV files. The frontend needs **JSON data** to render HTML pages. Add these new endpoints:

### 1a. Invoice data (JSON)

Add `GET /api/orders/:id/data/invoice` that returns the same grouped section data the PDF generator uses, but as JSON instead of generating a PDF:

```ts
app.get('/api/orders/:id/data/invoice', isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const items = await storage.getOrderItemsByProject(projectId);
    const allProducts = await storage.getAllmoxyProducts();
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // Same grouping logic as the PDF invoice endpoint
    const groupedMap = new Map<string, typeof items>();
    const groupOrder: string[] = [];
    for (const item of items) {
      const key = item.productId != null ? `p:${item.productId}` : `s:${item.sku ?? item.description ?? 'unknown'}`;
      if (!groupedMap.has(key)) { groupedMap.set(key, []); groupOrder.push(key); }
      groupedMap.get(key)!.push(item);
    }

    let sectionIndex = 0;
    const sections = groupOrder.map(key => {
      const groupItems = groupedMap.get(key)!;
      const firstItem = groupItems[0];
      const product = firstItem.productId != null ? productMap.get(firstItem.productId) : null;
      const exportType = firstItem.exportType ?? null;
      const raw0 = (firstItem.rawRowData ?? {}) as Record<string, any>;
      const color = raw0['Material'] ?? raw0['Color'] ?? raw0['Colour'] ?? raw0['color'] ?? null;

      const invoiceItems = groupItems.map((item, idx) => {
        const raw = (item.rawRowData ?? {}) as Record<string, any>;
        return {
          id: `${sectionIndex + 1} ${String(idx + 1).padStart(2, '0')}`,
          qty: item.quantity ?? 1,
          height: item.height, width: item.width,
          length: item.depth, thickness: item.depth,
          edgeLeft: (raw['Left'] === '1' || raw['Left'] === 1) ? 'E' : 'N',
          edgeRight: (raw['Right'] === '1' || raw['Right'] === 1) ? 'E' : 'N',
          edgeTop: (raw['Top'] === '1' || raw['Top'] === 1) ? 'E' : 'N',
          edgeBottom: (raw['Bottom'] === '1' || raw['Bottom'] === 1) ? 'E' : 'N',
          type: product?.name ?? item.description ?? '',
          supplyType: item.supplyType ?? 'STOCK',
          unitPrice: item.unitPrice ?? 0,
          totalPrice: item.totalPrice ?? 0,
          pricingError: item.pricingError,
        };
      });

      sectionIndex++;
      return {
        sku: firstItem.sku ?? product?.skuPrefix ?? `Item ${sectionIndex}`,
        color,
        exportType,
        categoryLabel: product?.description ?? exportType ?? '',
        productDescription: product?.name ?? firstItem.description ?? '',
        items: invoiceItems,
        totalItems: groupItems.reduce((s, i) => s + (i.quantity ?? 1), 0),
        subtotal: Math.round(groupItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0) * 100) / 100,
      };
    });

    const grandTotal = sections.reduce((s, sec) => s + sec.subtotal, 0);
    res.json({
      orderName: project.name,
      dealer: project.dealer,
      orderId: projectId,
      sections,
      grandTotal: Math.round(grandTotal * 100) / 100,
      itemCount: items.length,
      errorCount: items.filter(i => i.pricingError).length,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

### 1b. Elias data (JSON)

Add `GET /api/orders/:id/data/elias` that returns Elias items as structured JSON:

```ts
app.get('/api/orders/:id/data/elias', isAuthenticated, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const items = await storage.getOrderItemsByProject(projectId);
  const eliasItems = items.filter(i => i.exportType === 'ELIAS');
  res.json({
    items: eliasItems.map(i => ({
      sku: i.sku, qty: i.quantity, height: i.height, width: i.width, depth: i.depth,
      unitPrice: i.unitPrice, totalPrice: i.totalPrice,
      exportText: i.exportText, pricingError: i.pricingError,
      supplyType: i.supplyType,
    })),
    total: eliasItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
  });
});
```

### 1c. Similarly for MJ, Hardware, Glass, CTS

Add `GET /api/orders/:id/data/mj`, `GET /api/orders/:id/data/hardware`, `GET /api/orders/:id/data/glass`. Same pattern — filter items by exportType, return as JSON with relevant fields.

### 1d. ORD data (JSON)

```ts
app.get('/api/orders/:id/data/ord', isAuthenticated, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const items = await storage.getOrderItemsByProject(projectId);
  const ordItems = items.filter(i => i.exportType === 'ORD');
  const ordText = ordItems.filter(i => i.exportText).map(i => i.exportText).join('\n');
  res.json({
    items: ordItems.map(i => ({
      sku: i.sku, qty: i.quantity, height: i.height, width: i.width, depth: i.depth,
      unitPrice: i.unitPrice, totalPrice: i.totalPrice,
      exportText: i.exportText, pricingError: i.pricingError,
    })),
    assembledOrdText: ordText,
    total: ordItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
  });
});
```

---

## Part 2 — Frontend: Redesign Order Details Page

### 2a. Page structure

Replace the current `OrderDetails.tsx` with a tabbed layout. Use shadcn `Tabs` component:

```tsx
export default function OrderDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  
  // Core data queries
  const { data: project } = useQuery({ queryKey: ['order', projectId], queryFn: ... });
  const { data: orderFiles } = useQuery({ queryKey: ['order-files', projectId], queryFn: ... });
  const { data: orderItems } = useQuery({ queryKey: ['order-items', projectId], queryFn: ... });
  
  // Computed: which tabs have content
  const hasElias = orderItems?.some(i => i.exportType === 'ELIAS');
  const hasMJ = orderItems?.some(i => i.exportType === 'MJ');
  const hasORD = orderItems?.some(i => i.exportType === 'ORD');
  const hasCTS = orderItems?.some(i => i.exportType === 'CTS');
  const hasHardware = orderItems?.some(i => i.exportType === 'HARDWARE');
  const hasGlass = orderItems?.some(i => i.exportType === 'GLASS');
  
  return (
    <div>
      {/* Order Header */}
      <OrderHeader project={project} items={orderItems} onReprice={...} />
      
      {/* Tab Navigation */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">All Items</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="customer-slip">Customer Slip</TabsTrigger>
          <TabsTrigger value="internal-slip">Internal Slip</TabsTrigger>
          {hasORD && <TabsTrigger value="ord">Cabinet Vision</TabsTrigger>}
          {hasElias && <TabsTrigger value="elias">Elias</TabsTrigger>}
          {hasMJ && <TabsTrigger value="mj">M&J Doors</TabsTrigger>}
          <TabsTrigger value="erp">ERP Import</TabsTrigger>
          {hasCTS && <TabsTrigger value="cts">Cut-to-Size</TabsTrigger>}
          {hasHardware && <TabsTrigger value="hardware">Hardware</TabsTrigger>}
          {hasGlass && <TabsTrigger value="glass">Glass</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="overview"><OverviewTab ... /></TabsContent>
        <TabsContent value="items"><AllItemsTab ... /></TabsContent>
        <TabsContent value="invoice"><InvoiceTab ... /></TabsContent>
        {/* etc. */}
      </Tabs>
    </div>
  );
}
```

### 2b. Order Header Component

Persistent at the top of every tab:
- Back to Orders link
- Project name, PO number, dealer
- Order total (computed from items)
- Item count, error count
- Reprice button
- File count

### 2c. Overview Tab

Shows:
- **Order info card**: name, dealer, date, shipping address, phone
- **File list**: each file with filename, item count, subtotal, links to per-file pages (CTS, packing checklist, hardware checklist)
- **Color breakdown**: material counts (fetch from `GET /api/projects/:id/color-breakdown`)
- **Production status badges**: from project data
- **Quick stats**: total parts, dovetails, 5-piece doors, glass, etc.

### 2d. All Items Tab

Full line items table from `GET /api/orders/:id/items`:
- Columns: SKU, Product, Color, Qty, W×H×D, Unit Price, Total, Status (✅/❌)
- Grouped by file (if multiple files)
- File subtotals and grand total
- Click ❌ to see pricing error
- Sortable columns

### 2e. Invoice Tab

Fetch from new `GET /api/orders/:id/data/invoice`. Render as an HTML table matching the PDF layout:
- Grouped by product (each product = a section with header showing SKU, color, product image)
- Per-section: table with ID, Qty, Height, Width, Thickness, Edges, Type, Price, Total
- Section subtotals
- Grand total at bottom
- **Download PDF button** in the top-right → links to `GET /api/orders/:id/pdf/invoice`

### 2f. Customer Packing Slip Tab / Internal Packing Slip Tab

Same approach: fetch item data, render as HTML tables matching the PDF layout. Download button links to the PDF endpoint.

For the packing slips, the data can come from the same items endpoint — group by product, show quantities and dimensions without prices.

### 2g. Cabinet Vision (.ORD) Tab

Fetch from new `GET /api/orders/:id/data/ord`:
- Show a formatted view of the ORD items: table with SKU, Qty, Dimensions, Edges, Color
- Below the table, show the assembled ORD text in a code block
- **Download .ORD button** → construct a download link that serves `combinedOrdText` as a text file

### 2h. Elias Tab

Fetch from new `GET /api/orders/:id/data/elias`:
- Table: SKU, Qty, Height, Width, Length, Supply Type, Unit Price, Total
- Below: raw export text in a code block
- **Download CSV button** → links to `GET /api/orders/:id/export/elias`
- **Download PDF button** → links to `GET /api/orders/:id/pdf/elias`

### 2i. M&J Doors Tab

Same pattern as Elias. Table + raw export + download buttons.

### 2j. ERP Import Tab

Fetch from new `GET /api/orders/:id/data/erp` (or just use items data to build the view):
- Table showing all items formatted for ERP import
- Download CSV button

### 2k. Cut-to-Size Tab

Fetch from `GET /api/orders/:id/export/cts` (already returns JSON):
- Table: SKU, Qty, Cut Length, Supply Type, Rack Location
- Summary: total length, rods needed
- **Download PDF button** → links to `GET /api/orders/:id/pdf/cut-to-size`
- Link to the per-file CTS page (`/files/:fileId/cts`) for the cut-off checklist

### 2l. Hardware Tab

Filter items from the main items query where `exportType === 'HARDWARE'`:
- Table: SKU, Product, Qty, Supply Type (Stock/Buyout), Unit Price, Total
- Link to per-file hardware checklist (`/files/:fileId/hardware-checklist`)

### 2m. Glass Tab

Filter items where `exportType === 'GLASS'`:
- Table: SKU, Qty, Height, Width, Thickness, Unit Price, Total

---

## Part 3 — Fix Multi-File Upload

In `UploadOrder.tsx`, verify and fix:

1. `<input type="file" multiple accept=".csv">` — MUST have `multiple`
2. State: `const [files, setFiles] = useState<File[]>([])`
3. FormData: `formData.append('files', file)` in a loop — field name MUST be `'files'` (plural)
4. Drag handler accepts all dropped files
5. File list shows all selected files with remove buttons
6. After upload: show results summary + "View Order →" button navigating to `/orders/{projectId}`

---

## Part 4 — Reprice Functionality

Add `useMutation` for `POST /api/orders/:id/reprice` in the Order Header:

```tsx
const repriceMutation = useMutation({
  mutationFn: () => fetch(`/api/orders/${projectId}/reprice`, { method: 'POST' }).then(r => r.json()),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['order-items', projectId] });
    queryClient.invalidateQueries({ queryKey: ['order', projectId] });
    queryClient.invalidateQueries({ queryKey: ['invoice-data', projectId] });
    toast({ title: 'Order repriced successfully' });
  },
});
```

---

## Implementation Notes

- Each tab content component should be its own React component for code organization (e.g. `InvoiceTab.tsx`, `EliasTab.tsx`, `AllItemsTab.tsx`)
- Use TanStack Query for all data fetching — each tab fetches its data lazily (only when the tab becomes active using the `enabled` option)
- Download buttons should use `<a href="..." download>` for file downloads
- The tab navigation should be scrollable horizontally on mobile (use `overflow-x-auto` on the TabsList)
- Currency formatting: use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Keep the existing per-file pages (`/files/:fileId/cts`, `/files/:fileId/checklist`, `/files/:fileId/hardware-checklist`) — link to them from the Overview tab's file list

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `server/routes.ts` | Add 6 new JSON data endpoints: `/data/invoice`, `/data/elias`, `/data/mj`, `/data/hardware`, `/data/glass`, `/data/ord` |
| `client/src/pages/OrderDetails.tsx` | Complete redesign with tabbed layout |
| `client/src/pages/order-tabs/OverviewTab.tsx` | New: order info, files, color breakdown, stats |
| `client/src/pages/order-tabs/AllItemsTab.tsx` | New: full items table with pricing status |
| `client/src/pages/order-tabs/InvoiceTab.tsx` | New: HTML invoice view + download button |
| `client/src/pages/order-tabs/PackingSlipTab.tsx` | New: customer + internal packing slip views |
| `client/src/pages/order-tabs/OrdTab.tsx` | New: ORD items table + assembled text + download |
| `client/src/pages/order-tabs/EliasTab.tsx` | New: Elias items table + export + downloads |
| `client/src/pages/order-tabs/MJTab.tsx` | New: M&J items table + export + downloads |
| `client/src/pages/order-tabs/ErpTab.tsx` | New: ERP import table + download |
| `client/src/pages/order-tabs/CtsTab.tsx` | New: CTS parts table + download |
| `client/src/pages/order-tabs/HardwareTab.tsx` | New: Hardware items table |
| `client/src/pages/order-tabs/GlassTab.tsx` | New: Glass items table |
| `client/src/pages/UploadOrder.tsx` | Fix multi-file + add "View Order" navigation |
