# Prompt r22 — Full Order Page Redesign + App Navigation Overhaul

Paste this entire prompt into Replit.

---

## The Problem

The app currently crams three completely different workflows into one Order Details page:

1. **Order Management** — viewing imported items, pricing, output documents (Invoice, Packing Slips, Elias, M&J, ORD, ERP, Hardware, Glass exports)
2. **Packing & Shipping** — pallets, hardware checklists, packing slip checklists, CTS cut lists, buyout tracking
3. **Project Admin** — notes, status changes, Asana sync, project settings

These are different people, different times of day, different tasks. A shop manager checking export documents doesn't need pallet assignment UI in their face. A warehouse worker checking off hardware items doesn't need the Invoice PDF tab.

Additionally, all output documents currently combine all CSV files into one document. Each CSV file is a separate closet/room and needs its own independent set of documents.

---

## New App Structure

### Global Sidebar Navigation (AppLayout.tsx)

Replace the current sidebar with a cleaner organized structure:

```
╔══════════════════════╗
║  PERFECT FIT CLOSETS ║
║                      ║
║  ORDERS              ║
║  📋 All Orders       ║  → /orders
║  📤 Upload Order     ║  → /upload
║                      ║
║  ADMIN               ║
║  📦 Products         ║  → /admin/allmoxy-products
║  📊 Attribute Grids  ║  → /admin/attribute-grids
║  🔢 Proxy Variables  ║  → /admin/proxy-variables
║  🧪 Formula Tester   ║  → /admin/formula-tester
║  🏥 Diagnostics      ║  → /admin/diagnostic
║  ⚙️ Settings         ║  → /admin/settings (consolidated)
║                      ║
║  HELP                ║
║  📖 How It Works     ║  → /how-it-works
╚══════════════════════╝
```

Changes from current sidebar:
- Remove individual settings pages from nav (Output Settings, ORD Settings, Users → consolidate into one `/admin/settings` page with tabs)
- Remove Hardware Products / Import pages from sidebar (these are rarely used — link from within Settings or the Product Manager)
- Remove the Order Processing Dashboard (`/`) — the `/orders` list page IS the dashboard. Redirect `/` to `/orders`.

### The Orders List Page (`/orders`)

Keep as-is but add the status columns and filters that are currently on the Order Processing Dashboard. This becomes the single entry point for all orders.

### The Order Detail Page (`/orders/:id`)

This is the big redesign. The page now has its own **local sub-navigation** with two sections:

```
/orders/:id/documents   — Output Documents (per-file)
/orders/:id/shipping    — Packing & Shipping (per-file)
```

The URL pattern uses nested routes handled by Wouter or a tab-based approach within the page.

---

## Order Detail Page Architecture

### Top: Project Header Bar (Always Visible)

A sticky compact bar at the top with:

```
┌─────────────────────────────────────────────────────────────────┐
│  Anderson PO25-391065                          Status: ● Active │
│  Dealer: Netley Millwork  •  Job #1753  •  5 files  •  $10,617 │
│  Ship: Apr 15, 2026                  [Re-price] [Edit Project]  │
├─────────────────────────────────────────────────────────────────┤
│  [📄 Documents]          [📦 Packing & Shipping]                │
└─────────────────────────────────────────────────────────────────┘
```

The two main section buttons ("Documents" and "Packing & Shipping") switch the entire content area below.

### Section A: Documents View

This is where all the pricing, output documents, and export files live. Two-panel layout:

#### Left Panel: File List

A vertical sidebar listing each CSV file. Each entry shows:
- **Display name** — extracted from PO number parentheses or filename (e.g., "Guest Closets V5" from "Anderson PO25-391065 (GUEST CLOSETS V5)")
- **Item count** — "50 items"
- **Subtotal** — "$1,715.44"
- **Status dot** — green (all priced), amber (has errors), red (no items)

When project has only 1 file, skip the file list and go directly to the tabs.

#### Right Panel: Selected File's Output Tabs

```
[Items] [Invoice] [Customer Slip] [Internal Slip] [Cabinet Vision] [Elias] [M&J] [ERP] [Hardware] [Glass]
```

Tabs are conditionally shown based on what export types exist in the selected file. "Items" and the three document tabs (Invoice, Customer Slip, Internal Slip) always show.

**Items tab**: Full line-item table for this file. SKU, Product, Description, W×H×L, Qty, Unit Price, Total, Status. No fixed-height container — the page scrolls. Footer shows file item count and subtotal.

**Invoice tab**: PDF iframe via `GET /api/orders/:id/pdf/invoice?fileId=N`. Download button. Open-in-new-tab button.

**Customer Slip / Internal Slip tabs**: Same pattern — PDF iframes with `?fileId=N`.

**Cabinet Vision tab**: Preview of ORD items for this file. Download button produces a single `.ord` file for this file only via `GET /api/orders/:id/download/ord?fileId=N`.

**Elias / M&J / ERP / Hardware / Glass tabs**: Data tables and/or PDF iframes, all filtered to `?fileId=N`.

### Section B: Packing & Shipping View

This is where the warehouse/production workflow lives. Same two-panel layout:

#### Left Panel: Same File List

Same file sidebar as Documents view — shared component. Selected file stays in sync between both views so switching between Documents and Shipping maintains context.

#### Right Panel: Shipping Tabs for Selected File

```
[Packing Checklist] [Hardware Checklist] [Cut-to-Size] [Pallets]
```

**Packing Checklist tab**: Embed the existing `/files/:fileId/checklist` page content inline instead of navigating away. This is the check-off UI for packing slip items. If the existing component can't be easily embedded, render it in an iframe or refactor it to accept a `fileId` prop.

**Hardware Checklist tab**: Same — embed `/files/:fileId/hardware-checklist` content inline. Shows the hardware items with check-off, buyout tracking, timestamps.

**Cut-to-Size tab**: Embed `/files/:fileId/cts` content inline. CTS parts list with cut status tracking.

**Pallets tab**: Pallet management for the entire project (this one is project-level, not per-file). Shows pallet list, file-to-pallet assignments, hardware packaging status. Move the existing pallet management UI here from the old Overview tab.

---

## Visual Layout — Documents View (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT HEADER BAR                                              │
│  Anderson PO25-391065    Netley Millwork    $10,617    [Re-price]│
│  [📄 Documents ●]     [📦 Packing & Shipping]                   │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                    │
│  FILES       │  Guest Closets V5                                  │
│              │                                                    │
│ ┌──────────┐ │  [Items] [Invoice] [Cust Slip] [Int Slip] [CV]   │
│ │ Guest    │◀│  ┌──────────────────────────────────────────────┐ │
│ │ Closets  │ │  │                                              │ │
│ │ 50 items │ │  │  Line-item table / PDF viewer /              │ │
│ │ $1,715   │ │  │  export data for selected file+tab           │ │
│ │  ● OK    │ │  │                                              │ │
│ └──────────┘ │  │  (page scrolls — no inner scroll box)        │ │
│ ┌──────────┐ │  │                                              │ │
│ │ Master   │ │  │                                              │ │
│ │ Bedroom  │ │  │                                              │ │
│ │ 38 items │ │  │                                              │ │
│ │ $2,104   │ │  └──────────────────────────────────────────────┘ │
│ └──────────┘ │                                                    │
│ ┌──────────┐ │                                                    │
│ │ Kids Rm  │ │                                                    │
│ │ 22 items │ │                                                    │
│ │ $1,350   │ │                                                    │
│ └──────────┘ │                                                    │
│              │                                                    │
└──────────────┴──────────────────────────────────────────────────┘
```

## Visual Layout — Packing & Shipping View (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT HEADER BAR                                              │
│  Anderson PO25-391065    Netley Millwork    $10,617    [Re-price]│
│  [📄 Documents]     [📦 Packing & Shipping ●]                   │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                    │
│  FILES       │  Guest Closets V5                                  │
│              │                                                    │
│ ┌──────────┐ │  [Packing ✓] [Hardware 3/12] [CTS 0/4] [Pallets]│
│ │ Guest    │◀│  ┌──────────────────────────────────────────────┐ │
│ │ Closets  │ │  │                                              │ │
│ │ ✓ packed │ │  │  Checklist UI / CTS parts / Pallet mgmt     │ │
│ │          │ │  │                                              │ │
│ └──────────┘ │  │                                              │ │
│ ┌──────────┐ │  │                                              │ │
│ │ Master   │ │  │                                              │ │
│ │ Bedroom  │ │  │                                              │ │
│ │ ◐ 5/12   │ │  │                                              │ │
│ └──────────┘ │  └──────────────────────────────────────────────┘ │
│              │                                                    │
└──────────────┴──────────────────────────────────────────────────┘
```

Notice the file sidebar shows **different status info** depending on which section is active:
- In Documents view: item count, subtotal, pricing status
- In Packing view: packing progress (checked/total), hardware progress

---

## Backend Changes

### 1. Add `?fileId=N` to All Output Endpoints

Apply this filter pattern to all 11 data/PDF endpoints:

```typescript
const fileId = req.query.fileId ? parseInt(req.query.fileId as string) : null;
const items = fileId
  ? await storage.getOrderItemsByFile(fileId)
  : await storage.getOrderItemsByProject(projectId);
```

Endpoints to update:
1. `GET /api/orders/:id/data/invoice`
2. `GET /api/orders/:id/data/elias`
3. `GET /api/orders/:id/data/mj`
4. `GET /api/orders/:id/data/hardware`
5. `GET /api/orders/:id/data/glass`
6. `GET /api/orders/:id/pdf/invoice`
7. `GET /api/orders/:id/pdf/customer-packing-slip`
8. `GET /api/orders/:id/pdf/internal-packing-slip`
9. `GET /api/orders/:id/pdf/elias`
10. `GET /api/orders/:id/pdf/mj`
11. `GET /api/orders/:id/pdf/cut-to-size`
12. `GET /api/orders/:id/items` (add this if it doesn't support fileId yet)

### 2. Add `?fileId=N` to ORD Download

```typescript
// GET /api/orders/:id/download/ord
// If ?fileId=N → return single .ord for that file
// If no fileId → return ZIP of all files (r21 behavior)
```

### 3. New Endpoint: File Summary

```typescript
GET /api/orders/:id/file-summary
```

Returns per-file metadata for the file sidebar:

```json
{
  "files": [
    {
      "fileId": 42,
      "displayName": "Guest Closets V5",
      "filename": "Guest Closets V5.csv",
      "poNumber": "Anderson PO25-391065 (GUEST CLOSETS V5)",
      "itemCount": 50,
      "subtotal": 1715.44,
      "pricingErrors": 0,
      "exportTypes": ["ORD", "HARDWARE", "CTS"],
      "hasElias": false, "hasMJ": true, "hasHardware": true,
      "hasGlass": false, "hasCTS": true, "hasORD": true
    }
  ],
  "projectTotal": 10617.49,
  "totalItems": 210,
  "totalFiles": 5
}
```

Implementation:
```typescript
app.get('/api/orders/:id/file-summary', isAuthenticated, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const orderFilesList = await storage.getProjectFiles(projectId);
    const allItems = await storage.getOrderItemsByProject(projectId);

    const files = orderFilesList.map(file => {
      const fileItems = allItems.filter(i => i.fileId === file.id);
      const exportTypes = [...new Set(fileItems.map(i => i.exportType).filter(Boolean))];
      const subtotal = Math.round(fileItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0) * 100) / 100;

      // Extract display name: text inside parentheses of PO, or filename without .csv
      let displayName = '';
      if (file.poNumber) {
        const match = file.poNumber.match(/\(([^)]+)\)/);
        displayName = match ? match[1] : file.poNumber;
      }
      if (!displayName) {
        displayName = (file.originalFilename || file.filename || `File ${file.id}`).replace(/\.csv$/i, '');
      }

      return {
        fileId: file.id, displayName,
        filename: file.originalFilename || file.filename,
        poNumber: file.poNumber,
        itemCount: fileItems.length,
        subtotal,
        pricingErrors: fileItems.filter(i => i.pricingError).length,
        exportTypes,
        hasElias: exportTypes.includes('ELIAS'),
        hasMJ: exportTypes.includes('MJ'),
        hasHardware: exportTypes.includes('HARDWARE'),
        hasGlass: exportTypes.includes('GLASS'),
        hasCTS: exportTypes.includes('CTS'),
        hasORD: exportTypes.includes('ORD'),
      };
    });

    res.json({
      files,
      projectTotal: Math.round(allItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0) * 100) / 100,
      totalItems: allItems.length,
      totalFiles: files.length,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});
```

### 4. New Endpoint: File Shipping Status

For the Packing & Shipping sidebar to show progress:

```typescript
GET /api/orders/:id/shipping-summary
```

Returns per-file packing/hardware/CTS progress:

```json
{
  "files": [
    {
      "fileId": 42,
      "displayName": "Guest Closets V5",
      "packingProgress": { "total": 50, "checked": 50, "percentage": 100 },
      "hardwareProgress": { "total": 12, "packed": 3, "buyoutItems": 2, "buyoutArrived": 1 },
      "ctsProgress": { "total": 4, "cut": 0, "allCut": false }
    }
  ],
  "palletCount": 3
}
```

Implementation uses existing storage methods: `getPackingSlipProgress(fileId)`, `getHardwareChecklistProgress(fileId)`, `getCtsPartsCutStatus(fileId)`.

### 5. Update PDF Endpoints for File Label

When `fileId` is provided, include a `fileLabel` in the PDF data so the Python scripts can show it as a subtitle:

```typescript
let fileLabel = '';
if (fileId) {
  const orderFile = await storage.getOrderFile(fileId);
  if (orderFile) {
    const match = orderFile.poNumber?.match(/\(([^)]+)\)/);
    fileLabel = match ? match[1] : (orderFile.originalFilename || '').replace(/\.csv$/i, '');
  }
}
// Add to PDF payload: fileLabel: fileLabel || null
```

Python scripts display this as a subtitle when present (e.g., "INVOICE — Guest Closets V5").

---

## Frontend Implementation

### Files to Delete

Remove everything in `client/src/pages/order-tabs/`:
- OverviewTab.tsx, AllItemsTab.tsx, InvoiceTab.tsx, CustomerSlipTab.tsx, InternalSlipTab.tsx
- CabinetVisionTab.tsx, EliasTab.tsx, MJDoorsTab.tsx, ERPTab.tsx, CTSTab.tsx
- HardwareTab.tsx, GlassTab.tsx

### New Components to Create

#### `client/src/pages/OrderDetails.tsx` — Full Rewrite

Top-level page component. Manages state:
- `activeSection`: `'documents'` | `'shipping'`
- `selectedFileId`: `number | null`
- Auto-selects first file on load

Fetches project, file-summary, shipping-summary.

Renders: ProjectHeaderBar → Section Toggle → (FileSidebar + ContentArea)

#### `client/src/components/order/ProjectHeaderBar.tsx`

Compact sticky bar. Project name, dealer, job #, total, status badges, Re-price button, Edit button.

#### `client/src/components/order/FileSidebar.tsx`

Shared between Documents and Shipping views. Receives `files` array, `selectedFileId`, `onSelect` callback, and `mode` (`'documents'` | `'shipping'`).

In documents mode: shows item count, subtotal, pricing status per file.
In shipping mode: shows packing progress, hardware progress, CTS status per file.

Width: ~220px. Scrollable if many files. Active file highlighted.

When only 1 file exists, this component is not rendered.

#### `client/src/components/order/DocumentsView.tsx`

The Documents content area. Receives `projectId`, `fileId`, `fileSummary` for the selected file.

Renders a `<Tabs>` component with conditional tabs based on `fileSummary.hasXxx` flags:

```tsx
<Tabs defaultValue="items">
  <TabsList className="flex-wrap">
    <TabsTrigger value="items">Items ({fileSummary.itemCount})</TabsTrigger>
    <TabsTrigger value="invoice">Invoice</TabsTrigger>
    <TabsTrigger value="customer-slip">Customer Slip</TabsTrigger>
    <TabsTrigger value="internal-slip">Internal Slip</TabsTrigger>
    {fileSummary.hasORD && <TabsTrigger value="ord">Cabinet Vision</TabsTrigger>}
    {fileSummary.hasElias && <TabsTrigger value="elias">Elias</TabsTrigger>}
    {fileSummary.hasMJ && <TabsTrigger value="mj">M&J Doors</TabsTrigger>}
    <TabsTrigger value="erp">ERP</TabsTrigger>
    {fileSummary.hasHardware && <TabsTrigger value="hardware">Hardware</TabsTrigger>}
    {fileSummary.hasGlass && <TabsTrigger value="glass">Glass</TabsTrigger>}
  </TabsList>

  <TabsContent value="items"><FileItemsTable projectId={projectId} fileId={fileId} /></TabsContent>
  <TabsContent value="invoice"><PdfViewer url={`/api/orders/${projectId}/pdf/invoice?fileId=${fileId}`} label="Invoice" /></TabsContent>
  {/* ... etc */}
</Tabs>
```

**CRITICAL**: No `TabsContent` should have `overflow-hidden` or fixed height. No `ScrollArea`. Tables grow to natural height, page scrolls.

#### `client/src/components/order/ShippingView.tsx`

The Packing & Shipping content area. Receives `projectId`, `fileId`, `shippingData`.

Tabs:
```tsx
<Tabs defaultValue="packing">
  <TabsList>
    <TabsTrigger value="packing">
      Packing Checklist {shippingData?.packingProgress && `(${shippingData.packingProgress.checked}/${shippingData.packingProgress.total})`}
    </TabsTrigger>
    <TabsTrigger value="hardware">
      Hardware {shippingData?.hardwareProgress && `(${shippingData.hardwareProgress.packed}/${shippingData.hardwareProgress.total})`}
    </TabsTrigger>
    <TabsTrigger value="cts">
      Cut-to-Size {shippingData?.ctsProgress && `(${shippingData.ctsProgress.cut}/${shippingData.ctsProgress.total})`}
    </TabsTrigger>
    <TabsTrigger value="pallets">Pallets</TabsTrigger>
  </TabsList>
  
  <TabsContent value="packing"><PackingChecklistInline fileId={fileId} /></TabsContent>
  <TabsContent value="hardware"><HardwareChecklistInline fileId={fileId} /></TabsContent>
  <TabsContent value="cts"><CtsPartsInline fileId={fileId} /></TabsContent>
  <TabsContent value="pallets"><PalletManager projectId={projectId} /></TabsContent>
</Tabs>
```

The `PackingChecklistInline`, `HardwareChecklistInline`, and `CtsPartsInline` components replicate the existing standalone page content but as inline components that accept `fileId` as a prop. If refactoring the existing pages is complex, use iframes to `/files/${fileId}/checklist` etc. as a first pass.

#### `client/src/components/order/FileItemsTable.tsx`

Fetches and displays items for one file:
```tsx
const { data: items } = useQuery({
  queryKey: ['order-items', projectId, fileId],
  queryFn: () => fetch(`/api/orders/${projectId}/items?fileId=${fileId}`).then(r => r.json()),
});
```

Table columns: SKU, Product, Description, W×H×L, Qty, Unit Price, Total, Status.

**No ScrollArea. No max-height. No overflow-hidden.** The table renders at full natural height. The page scrolls.

#### `client/src/components/order/PdfViewer.tsx`

Reusable PDF display with download:
```tsx
function PdfViewer({ url, label }: { url: string; label: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
          Open in New Tab
        </Button>
        <Button size="sm" onClick={() => { window.location.href = url; }}>
          Download {label}
        </Button>
      </div>
      <iframe src={url} className="w-full border rounded-lg" style={{ height: '80vh' }} />
    </div>
  );
}
```

### Update AppLayout.tsx Sidebar

Simplify the sidebar navigation:

```tsx
const navItems = [
  { section: 'ORDERS', items: [
    { name: 'All Orders', href: '/orders', icon: ClipboardList },
    { name: 'Upload Order', href: '/upload', icon: Upload },
  ]},
  { section: 'ADMIN', items: [
    { name: 'Products', href: '/admin/allmoxy-products', icon: Package },
    { name: 'Attribute Grids', href: '/admin/attribute-grids', icon: Grid3X3 },
    { name: 'Proxy Variables', href: '/admin/proxy-variables', icon: Variable },
    { name: 'Formula Tester', href: '/admin/formula-tester', icon: FlaskConical },
    { name: 'Diagnostics', href: '/admin/diagnostic', icon: Stethoscope },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ]},
];
```

### Update Routes in App.tsx

```tsx
// Redirect / to /orders
<Route path="/" component={() => { useEffect(() => navigate('/orders'), []); return null; }} />

// Remove the old Order Processing Dashboard route if it exists as a separate component
```

---

## What Stays the Same

- All backend pricing/upload logic — unchanged
- All admin pages (Products, Grids, Variables, Formula Tester, Diagnostics) — unchanged
- Dashboard/order list at `/orders` — keep, add the status info from the old processing dashboard
- CTS/Checklist/Hardware-checklist existing standalone pages — keep as fallback, but the new inline components replace them for the primary flow
- All Python PDF generation scripts — unchanged (just receive `fileLabel` as new optional field)

## What Gets Deleted

- The old 12-tab OrderDetails.tsx
- All 12 files in `client/src/pages/order-tabs/`
- The Order Processing Dashboard page (if separate from `/orders`) — merge its useful parts into `/orders`

## What Gets Created

- `ProjectHeaderBar.tsx` — compact project header
- `FileSidebar.tsx` — shared file list (documents + shipping modes)
- `DocumentsView.tsx` — per-file document tabs
- `ShippingView.tsx` — per-file packing/shipping tabs
- `FileItemsTable.tsx` — per-file items table
- `PdfViewer.tsx` — reusable PDF iframe component
- `PackingChecklistInline.tsx` — inline packing checklist (or iframe wrapper)
- `HardwareChecklistInline.tsx` — inline hardware checklist (or iframe wrapper)
- `CtsPartsInline.tsx` — inline CTS parts (or iframe wrapper)
- `PalletManager.tsx` — extracted from old Overview tab
- Rewritten `OrderDetails.tsx` — orchestrates everything

## What Gets Modified

- 12 backend endpoints — add `?fileId=N` filtering
- 2 new endpoints — `file-summary` + `shipping-summary`
- PDF endpoints — accept and display `fileLabel`
- AppLayout.tsx — simplified sidebar
- App.tsx — route changes

---

## Verification Checklist

1. Navigate to `/orders` — see all orders listed
2. Click an order → lands on `/orders/:id` Documents view
3. Project header shows name, dealer, totals, status
4. File sidebar shows all CSV files with item counts and prices
5. Click a file → Items tab shows ONLY that file's items, ALL rows visible (page scrolls)
6. Click Invoice tab → PDF shows only that file's items, header includes file name
7. Click a different file → all tabs refresh for the new file
8. Switch to "Packing & Shipping" → same file sidebar but shows packing progress
9. Packing Checklist tab shows the check-off UI for the selected file
10. Hardware Checklist tab shows hardware items with buyout tracking
11. Pallets tab shows project-level pallet management
12. For single-file projects, no file sidebar — tabs render directly
13. Conditional tabs (Elias, M&J, etc.) only show when the file has those item types
14. No scroll truncation anywhere — tables grow to natural height, page scrolls
15. Sidebar navigation is clean and organized
