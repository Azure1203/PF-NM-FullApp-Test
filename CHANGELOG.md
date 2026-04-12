# CHANGELOG — Perfect Fit Closets / Netley Millwork Order Management System
> Replit full-stack app · React + Express + PostgreSQL
> Last updated: 2026-04-12 (r22-hotfix-2 · deployed to production)

---

## r22-hotfix-2 — 2026-04-12 — Fix "T.find is not a function" Crash on Order Details · **DEPLOYED**

### Root Cause

`/api/orders/:id/file-summary` and `/api/orders/:id/shipping-summary` both return `{ files: [...], ... }` — an object with a `files` property — but `OrderDetails.tsx` used `useQuery<FileSummaryItem[]>` with the default queryFn (which passes the raw response through), then called `.find()` / `.reduce()` / `.length` directly on the response. In production minified code, `object.find` is `undefined`, so calling it gives `T.find is not a function`.

The same problem affected `shippingSummary`.

### Fix 1 — Custom `queryFn` in OrderDetails.tsx (`useQuery` for fileSummary + shippingSummary)

Both queries now have explicit `queryFn` implementations that fetch the endpoint and extract `.files` from the response, with an `Array.isArray` guard as a fallback:

```ts
queryFn: async () => {
  const res = await fetch(`/api/orders/${id}/file-summary`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.files ?? []);
},
```

### Fix 2 — `safeFileSummary` constant + remaining array operation guards

A `const safeFileSummary = Array.isArray(fileSummary) ? fileSummary : []` is computed immediately after the query. All subsequent array operations (`.find()`, `.reduce()`, `.length`, `[0]?.fileId`) use `safeFileSummary` instead of the raw `fileSummary`. The `useEffect` and `FileSidebar files=` prop are also updated. `shippingSummary` has a matching `Array.isArray` guard before being passed to `FileSidebar`.

### Fix 3 — `pallet.fileIds ?? []` guard in PalletManager.tsx

`pallet.fileIds` can be `null` when a pallet has no file assignments (the DB `array_agg` returns null for empty sets). Two call sites fixed:

```ts
// openEdit: was setting state to null
setPalletFileIds(pallet.fileIds ?? []);

// render: was calling null.includes()
const assignedFiles = projectFiles.filter(f => (pallet.fileIds ?? []).includes(f.id));
```

### Fix 4 — Remove `overflow-hidden` from layout wrappers

`overflow-hidden` was re-added to two wrappers in r22-hotfix, matching the root cause of the old scroll-truncation bugs (r15/r16/r19). Removed from:
- `AppLayout.tsx` order-detail content wrapper: `flex-1 min-h-0 overflow-hidden flex flex-col` → `flex-1 flex flex-col min-h-0`
- `OrderDetails.tsx` root div: `flex flex-col flex-1 min-h-0 overflow-hidden` → `flex flex-col flex-1 min-h-0`

The body `<div className="flex flex-1 min-h-0 overflow-hidden">` is intentionally kept — it scopes the two-column layout (file sidebar + content) so each column can scroll independently.

---

## r22-hotfix — 2026-04-12 — Production Blank Page Fix on /orders/:id

### Problem
After deploying r22, navigating to any `/orders/:id` URL in production showed a completely blank page. Dev mode worked correctly. The API returned 200 OK for all order endpoints. No browser-visible error — React was silently crashing with no error boundary to catch or display it.

### Fix 1 — ErrorBoundary (`client/src/components/ErrorBoundary.tsx`, `client/src/App.tsx`)

Created `ErrorBoundary.tsx` as a React class component using `getDerivedStateFromError` + `componentDidCatch`. When a render crash occurs it now shows:
- A readable error message with the exception text
- A "Reload page" button
- Prevents the completely blank white screen

Wrapped the entire `<Switch>` block in `App.tsx` with `<ErrorBoundary>`. The closing `</ErrorBoundary>` tag was accidentally omitted in the r22 commit — this fix restores it.

### Fix 2 — Flex layout hardening (`client/src/components/AppLayout.tsx`, `client/src/pages/OrderDetails.tsx`)

The order-detail content wrapper in `AppLayout` was `flex-1 min-h-0 overflow-hidden` — a flex item but **not** a flex container. `OrderDetails` used `h-full` on its root div to fill the wrapper. In production builds, `height: 100%` on a block element inside a flex item (without an explicit `height` on the flex item itself) can silently compute to 0, collapsing the entire page.

**`AppLayout.tsx`** — added `flex flex-col` to the order-detail content wrapper:
```
flex-1 min-h-0 overflow-hidden  →  flex-1 min-h-0 overflow-hidden flex flex-col
```

**`OrderDetails.tsx`** — replaced `h-full` with `flex-1` on the root div, since the parent is now a proper flex container:
```
flex flex-col h-full min-h-0  →  flex flex-col flex-1 min-h-0 overflow-hidden
```

This ensures the full-height layout works correctly in both dev and production builds across all browsers.

---

## r22 — 2026-04-12 — Full Order Page Redesign + App Navigation Overhaul

### T001 — Backend: fileId filtering + new summary endpoints

- `?fileId=N` query parameter added to all 12 data/PDF/ORD endpoints: `data/invoice`, `data/elias`, `data/mj`, `data/hardware`, `data/glass`, `data/ord`, `pdf/invoice`, `pdf/customer-packing-slip`, `pdf/internal-packing-slip`, `pdf/elias`, `pdf/mj`, `pdf/cut-to-size`, `download/ord`.
- `GET /api/orders/:id/file-summary` — returns per-file array: `fileId`, `fileName`, `itemCount`, `totalPrice`, `pricingErrors`, `exportTypes[]`, `hasCTS`, `hasMJ`, `hasElias`, `hasHardware`, `hasGlass`, `hasORD`.
- `GET /api/orders/:id/shipping-summary` — returns per-file array: `fileId`, `fileName`, packing checklist counts, hardware checklist counts, CTS counts, pallet count.

### T002 — Frontend: New `order-detail/` component directory (9 components)

- **`FileSidebar.tsx`** — file list left panel; `mode` prop switches Documents/Shipping view; each file card shows pricing total, error count, and packing progress badge. Hidden for single-file projects.
- **`DocumentsView.tsx`** — per-file tab bar: Items · Invoice · Customer Slip · Internal Slip · Cabinet Vision · Elias · M&J · Hardware · Glass. Tabs hidden when not applicable for the file's export types.
- **`ShippingView.tsx`** — per-file tab bar: Packing Checklist · Hardware Checklist · CTS Parts · Pallets.
- **`FileItemsTable.tsx`** — fetches `GET /api/orders/:id/items?fileId=N`; no scroll cap; pricing/error badges per row.
- **`PdfViewer.tsx`** — reusable PDF `<iframe>` + Download button; accepts `url` and `filename` props.
- **`PackingChecklistInline.tsx`** — inline packing checklist for a single `fileId`.
- **`HardwareChecklistInline.tsx`** — inline hardware checklist for a single `fileId`.
- **`CtsPartsInline.tsx`** — inline CTS parts list for a single `fileId`.
- **`PalletManager.tsx`** — pallet CRUD + 12-tile packaging metrics (assembled, fivePiece, glassInserts, glassShelves, mjDoors, richelieuDoors, doubleThick, cts, wallRail, weight, maxLength, maxWidth, recommendedPallet); extracted from old `OrderDetails.tsx`. Uses custom `queryFn` to avoid broken default URL construction.

### T003 — Frontend: OrderDetails.tsx rewrite (3165 → ~340 lines)

- **`ProjectHeaderBar`** — sticky top bar: project name, status badge, dealer, file count, total price, Actions dropdown (Project Details dialog · Production Status dialog · Asana sync · Delete project).
- **Two-section toggle** — Documents / Packing & Shipping; state drives `FileSidebar` mode and which view component renders.
- **Two-panel layout** — `FileSidebar` (left, 240 px, multi-file only) + content area (right, fills remaining width).
- Single-file projects: FileSidebar hidden; content renders at full width with the only file pre-selected.
- `ProjectDetailsDialog` and `ProductionStatusDialog` extracted into the Actions dropdown menu.
- Old `client/src/pages/order-tabs/` directory deleted — 10 components removed.

### T004 — Sidebar + Navigation

- `AppLayout.tsx` sidebar reduced to 7 items; "Order Processing" entry removed.
- `/` route now uses `<Redirect to="/orders" />` via wouter.
- `OrderDetails` (`/orders/:id`) bypasses AppLayout top header; content wrapper uses `overflow-hidden h-full` flex layout to enable internal scrolling.
- `AdminSettings.tsx` created at `client/src/pages/admin/AdminSettings.tsx` — 3-tab page: **ORD Export** (header template textarea + `{{design_name}}` / `{{po_number}}` hints) · **Output Settings** (per-document image/pricing toggles) · **Users** (allowed-users whitelist).
- Routes `/admin/output-settings`, `/admin/users`, and `/how-it-works` removed from `App.tsx`.
- `/admin/settings` route now renders `AdminSettings`.

---

## Merged Tasks — 2026-04-12 — Task-Agent Batch (#1, #2, #3, #6, #8, #9, #10–#13, #16–#17, #23–#24, #26)

The following features were implemented by isolated task agents and merged into main:

### Task #1 — ORD Header Template & Settings Infrastructure

- Added `app_settings` table to `shared/schema.ts` (key, value, description, updatedAt). 27th DB table.
- Added `getSetting`, `setSetting`, `getAllSettings` to `IStorage` / `DatabaseStorage` in `server/storage.ts`. `setSetting` upserts on key conflict.
- Startup code in `registerRoutes` seeds a default `[Header]` template on first boot (`ord_header_template` key).
- `GET /api/admin/settings`, `GET /api/admin/settings/:key`, `PUT /api/admin/settings/:key` endpoints.
- `generateOrdHeader(template, { designName, poNumber })` exported from `server/services/ordExporter.ts`.
- ORD Settings page (`/admin/settings`) — textarea pre-filled from DB, Save button, placeholder badge hints (`{{design_name}}`, `{{po_number}}`).

### Task #2 — Port Production Workflow Features

- Upload handler passes `productsMap` to `countPartsFromCSV` so M&J/Richelieu door detection works correctly.
- Reprice endpoint (`POST /api/orders/:id/reprice`) now calls `generateHardwareChecklistForFile` + `generatePackingSlipChecklistForFile` for each file after pricing completes.
- New `GET /api/orders/:id/files` endpoint.
- New `POST /api/orders/:id/regenerate-checklists` endpoint — iterates all files, calls both generators, returns `{ success, totalHardwareItems, totalPackingItems, errors }`.
- "Regenerate Checklists" button added to Order Details header with spinner + toast.

### Task #3 — Surface Backend Features via Sidebar Navigation

- "All Orders" (`/orders`) and "Users" (`/admin/users`) added to sidebar under DAILY OPERATIONS and SYSTEM ADMINISTRATION respectively.
- `getPageTitle()` in `AppLayout.tsx` updated for both new routes.
- Email Sync card (AgentMail + Outlook fetch buttons) removed from `OrderProcessingDashboard` — those controls remain on the `/orders` page.

### Task #6 — Bulk Grid Upload + Multi-Select Delete

- `POST /api/admin/upload-dynamic-grids-bulk` — accepts `upload.array()` of CSV files; derives grid name from filename (strips `.csv`); upserts each grid + replaces rows; returns per-file `{ name, rowCount }` array.
- `DELETE /api/admin/attribute-grids/bulk` — accepts `{ ids: number[] }`; deletes each grid and its rows.
- Grid Manager left panel redesigned: multi-file dropzone (name input removed), file queue list with derived names, "Upload All" button with per-file result badges, checkbox-based selection mode, "Delete X grids" confirmation dialog.

### Task #8 — Export Type Field for Products & Order Items

- `export_type` text column added to `allmoxy_products` and `order_items` (schema + `db:push`).
- Product Manager edit form — "Export Type" dropdown after Export Proxy Variable selector.
- Product list shows colored export-type badge per row (ORD=blue, HARDWARE=gray, ELIAS=green, MJ=purple, CTS=orange, GLASS=cyan).
- `POST /api/admin/products/auto-classify-export-types` — applies 7-rule priority classification (CTS→ELIAS→MJ→GLASS→HARDWARE→ORD→NONE) to all active products; returns `{ total, classified }`.
- Upload handler propagates matched product's `exportType` to each `order_item`.

### Task #9 — Bulk Formula Seed & Auto-Assign

- `POST /api/admin/seed-formulas` — upserts all ~55 pricing and export proxy variables from the hardcoded spec; returns `{ created, updated, total }`.
- `POST /api/admin/products/auto-assign-formulas` — matches every active product's SKU prefix to the correct `pricingProxyId` + `exportProxyId`, deletes stale bindings, and creates correct grid bindings via fuzzy/case-insensitive partial name matching. Accepts `overwrite: boolean`; returns `{ formulasAssigned, bindingsCreated, skipped, errors }`.

### Task #10 — Bulk Product Image Uploader (initial)

Initial `/admin/product-images` page — drag-and-drop image files, upload to object storage, match by filename against both product tables (prefix/partial), preview table with confidence badges, manual selector for unmatched rows, "Save X Assignments" confirm step.

### Task #11 — Internal Packing Slip PDF

- `server/scripts/generate_internal_packing_slip.py` — internal production document; columns include Rack Location (resolved from CTS/HARDWARE product grid bindings); "INTERNAL — DO NOT SEND" header; no pricing.
- `GET /api/orders/:id/pdf/internal-packing-slip` endpoint (behind `isAuthenticated`).
- "Internal Packing Slip" PDF iframe tab on Order Details.

### Task #12 — Cut-to-Size PDF

- `server/scripts/generate_cut_to_size.py` — "DO NOT SEND WITH JOB" header; Length Summary table (unique cut lengths × qty); Item Detail table (ID, Qty, Length mm, Buyout or Stock?, Rack Location); Item Totals (total mm, total in, total rods at 2438.4 mm/rod); page footer.
- `GET /api/orders/:id/pdf/cut-to-size` endpoint; returns 404 when no CTS items.
- "Cut-to-Size PDF" button on Order Details visible only when `hasCTS` is true.

### Task #13 — M&J Shaker Door PDF

- `server/scripts/generate_mj_pdf.py` — "NETLEY 5 PIECE SHAKER JOB LIST" PDF; Letter-size pages with 0.5" margins; per-section drawer front / door / glass layouts; Supplier/Premoule label; X checkmarks; glass section adds "Buyout or Stock?" column and Notes block; no pricing; page N of total footer.
- `GET /api/orders/:id/pdf/mj` endpoint; returns 404 when no MJ/GLASS items.
- "M&J Shaker PDF (N)" button on Order Details visible when `hasMJ || hasGlass`.

### Task #16 — Bulk Image Uploader Redesign (Parallel Upload + Auto-Save)

Rewrote bulk upload backend and frontend:
- Backend: builds in-memory product name/skuPrefix/code map first; matches by exact filename-without-extension (case-insensitive); uploads matched files to GCS in parallel batches of 10; writes `image_path` to product row in same step. No separate confirm endpoint used.
- Frontend: single "Upload & Save" button; loading spinner; results screen with "Saved (N)" green rows and "Unmatched (N)" red rows. Removed checkbox table, confirm button, manual selector, fuzzy matching.

### Task #17 — Per-Product Image Upload in Product Editor

- Image thumbnail in Allmoxy product editor right panel is clickable — opens file picker (jpg/jpeg/png/webp).
- Selecting a file calls `POST /api/admin/allmoxy-products/:id/image` immediately; new image renders in place with spinner during upload.
- "×" button clears image (`DELETE /api/admin/allmoxy-products/:id/image`).
- TanStack Query cache invalidated after both operations — list thumbnail updates live.

### Tasks #19–#22 — GCS Upload Fix Iterations (Superseded)

Multiple failed attempts to fix GCS object storage: signed URL approach (task #19), sidecar credential token (task #20), client-side batching (task #21), GCS client library direct write (task #22). All failed — GCS environment is broken in this Repl. Solution was task #23.

### Task #23 — Store Product Images in Database (Final Solution)

- `image_data` text column added to `allmoxy_products` — stores base64-encoded image bytes.
- Both single-product upload route and bulk upload route now write base64 to `image_data`; GCS calls removed entirely.
- `GET /api/product-images/by-id/:id` (Allmoxy) and `GET /api/product-images/hardware/by-id/:id` (hardware) — read `image_data` from DB, detect content-type from `image_path` extension, send bytes with `Cache-Control: public, max-age=86400`.
- Frontend updated to use ID-based URLs throughout. `image_path` retained as filename reference.

### Task #24 — Fix CSV Import Crash on Duplicate Product Names

After building `productsToInsert` from CSV rows, a `Map<string, product>` keyed on `name` deduplicates the array before the DB upsert (last occurrence wins). Fixes "ON CONFLICT DO UPDATE command cannot affect a row a second time" crash when an import CSV has repeated product names.

### Task #26 — Fix Product List — Stop Sending Image Data in List Queries

`getAllmoxyProducts()` and `getProducts()` in `server/storage.ts` now use explicit Drizzle column selection to exclude `imageData`. Fixes multi-hundred-MB API responses that caused page timeouts after all 2,363 product images were stored in the DB. Single-product detail routes still return the full record.

---

## r21 — 2026-04-05 — ORD Format Overhaul: Separate File Per Room + Standard 8-Field Format

### Problem
The r16/r19 ORD generator produced a single combined `.ord` file using the 18-field Extended Format with a `[Walls]` section and room numbers in field 14. This was architecturally wrong: Cabinet Vision's ORD format has no concept of multiple rooms in one file; `[Walls]` is for physical wall geometry (X/Y coordinates), not logical room grouping; and the 8 reference Allmoxy templates all use the 8-field Standard Format.

### Fix 1 — Separate .ORD per CSV file (`server/routes.ts` — `GET /api/orders/:id/download/ord`)

Rewrote the download endpoint from scratch:

- **One `.ord` file per CSV file** (one per room/closet). Each file has its own `[Header]` block populated from the header template using that file's `poNumber` / filename as `{{design_name}}`.
- **Single file → single `.ord`** returned directly (no ZIP).
- **Multiple files → ZIP** (`${projectName}_ORD_Files.zip`) containing one `.ord` per CSV, built with the `archiver` npm package.
- **NO `[Walls]` section** — removed entirely.
- **Standard 8-field cabinet line**: `1,"SKU",W,H,D,"hinge","type",QTY` — no trailing positional fields.
- **Entry number always `1`** for every cabinet line (matches Allmoxy reference behavior).
- **Consistent `\r\n` line endings** throughout via `lines.join('\r\n')`.

Installed: `archiver`, `@types/archiver`.

### Fix 2 — `/data/ord` response (`server/routes.ts`)

Added `downloadFormat: 'zip' | 'ord'` field to the JSON response. Value is `'zip'` when the project has more than one ORD-bearing CSV file, `'ord'` when only one.

### Fix 3 — Cabinet Vision Tab UI (`client/src/pages/order-tabs/OrdTab.tsx`)

- Added `downloadFormat` field to `OrdData` interface.
- Download button dynamically shows:
  - `FileArchive` icon + **"Download ORD Files (.ZIP)"** when `downloadFormat === 'zip'`
  - `Download` icon + **"Download .ORD"** when `downloadFormat === 'ord'`

---

## r19 — 2026-04-05 — Scrolling Fix + ORD Download Endpoint + Output Settings Page + PDF Page Breaks

### Fix 1 — Page Scrolling (`client/src/components/AppLayout.tsx`)

Removed `overflow-hidden` from both the outer layout wrapper and the `<main>` element. Both were blocking the inner `overflow-y-auto` scroll container from functioning correctly. The Order Details page now scrolls through all items (was showing "57 items" but unable to scroll to see them).

- Line 67: `flex h-screen bg-background overflow-hidden` → `flex h-screen bg-background`
- Line 133: `flex-1 flex flex-col min-w-0 bg-background overflow-hidden` → `flex-1 flex flex-col min-w-0 bg-background`

### Fix 2 — ORD Download Button (`client/src/pages/OrderDetails.tsx`, `client/src/pages/order-tabs/AllItemsTab.tsx`)

The "Download .ORD" button was using a client-side assembly routine: it fetched the header template setting, re-grouped items by file, concatenated their `exportText` strings, and built an old-format single-room file. This bypassed the multi-room backend endpoint entirely.

**Removed** from `OrderDetails.tsx`:
- `headerTemplateSetting` useQuery hook
- `downloadOrd()` function (template fetch, groupByFile loop, Blob assembly, anchor click)

**Replaced** with a direct route call — `onDownloadOrd` prop now does:
```ts
() => { window.location.href = `/api/orders/${id}/download/ord`; }
```

The backend endpoint at `GET /api/orders/:id/download/ord` (r16) handles the full multi-room format: `[Header]` with quoted values, `[Walls]`, 18-field cabinet lines with room numbers, HARDWARE items excluded.

### Fix 3 — Output Page Settings (`/admin/output-settings`)

New admin page for controlling per-document-type display toggles.

**Backend** (`server/routes.ts`):
- `GET /api/admin/output-settings` — returns a merged settings object with defaults for 10 document types (invoice, customerSlip, internalSlip, elias, mj, hardware, glass, ord, cts, erp). Each page has relevant keys: `showProductImages` and/or `showPricing`.
- `PUT /api/admin/output-settings` — updates a single setting by `output.<page>.<key>` key; validates key prefix; uses existing `storage.setSetting()`.

**Frontend** (`client/src/pages/admin/OutputSettings.tsx` — new file):
- Cards per document type, switch toggles per setting, TanStack Query for data + mutation, toast on save.
- Skips settings that don't apply to a given page (e.g. `showPricing` only shown for invoice and customerSlip).

**Routing** (`client/src/App.tsx`, `client/src/components/AppLayout.tsx`):
- Route `/admin/output-settings` added to router.
- Sidebar link "Output Settings" added to SYSTEM ADMINISTRATION group (uses `SlidersHorizontal` icon).

### Fix 4 — PDF Page Break Formatting (all Python scripts)

Applied `KeepTogether` wrapping for small sections (≤ 6 items) across all 5 PDF generators. When a section has few items, it is now guaranteed to stay on a single page rather than breaking awkwardly across a page boundary.

**Scripts updated:**
- `server/scripts/generate_invoice.py`
- `server/scripts/generate_customer_packing_slip.py`
- `server/scripts/generate_internal_packing_slip.py`
- `server/scripts/generate_elias_pdf.py`
- `server/scripts/generate_mj_pdf.py`

**Added `KeepTogether` import** to elias, mj, and cut_to_size scripts (invoice, customer slip, internal slip already had it).

**Pattern applied** to all section loops:
```python
flowables = build_section_flowables(section, styles)
if len(section.get('items', [])) <= 6:
    story.append(KeepTogether(flowables))
else:
    story.extend(flowables)
```

All data tables already had `repeatRows=1` from prior work.

---

## r18 — 2026-04-05 — Fix Grid Name Map: Old Grids Shadowing Current Grids

### Root Cause

If an old grid named `Shelves` (no date suffix) exists alongside the current `Shelves 02202026`, both produce the normalized key `'shelves'` when added to the `gridNameMap`. Since `Map.set()` overwrites, whichever grid was iterated **last** won. If the old, empty grid happened to be last, `findGridForAlias('shelves')` returned that empty grid — so all shelves bindings were created against a grid with zero rows, and pricing always failed.

### Fix 1 — Sort grids before building gridNameMap (`server/routes.ts` ~line 1096)

Grids are now sorted before population so that **grids with date suffixes are always written last**, overwriting any older grid that produces the same normalized key:

```ts
const sortedGrids = [...allGrids].sort((a, b) => {
  const aHasDate = /[\s_]\d{8}$/.test(a.name);
  const bHasDate = /[\s_]\d{8}$/.test(b.name);
  if (aHasDate && !bHasDate) return 1;   // dated grids written last → they win
  if (!aHasDate && bHasDate) return -1;
  return a.name.localeCompare(b.name);
});
```

For example, if both `Shelves` and `Shelves 02202026` are in the database, `Shelves 02202026` (dated) is now guaranteed to overwrite `Shelves` (undated) for the key `'shelves'` — regardless of DB insertion order.

### Fix 2 — New diagnostic endpoint: `GET /api/admin/duplicate-grids` (`server/routes.ts`)

Added a new endpoint that groups all attribute grids by their base name (stripping the date suffix) and returns any groups with more than one member — along with the row count of each, so you can identify which are empty/stale and should be deleted.

Example response:
```json
{
  "totalGrids": 12,
  "duplicates": [
    {
      "baseName": "shelves",
      "grids": [
        { "id": 3, "name": "Shelves", "rowCount": 0 },
        { "id": 9, "name": "Shelves 02202026", "rowCount": 47 }
      ]
    }
  ]
}
```

### How to Activate

1. Visit `/api/admin/duplicate-grids` in your browser to see which grids are duplicated and which have 0 rows (the stale ones)
2. Delete the old empty grids via **Admin → Attribute Grids**
3. Go to **Admin → Pricing Diagnostic** → **"Reset & Recreate Bindings"**
4. Go to the order → **"Re-run Pricing"**

---

## r17 — 2026-04-05 — Fix findGridForAlias: Exact Match Priority

### Root Cause

`findGridForAlias('shelves')` was using `normKey.includes(normPattern)` as the only matching strategy. This caused `shelves` to match **Corner Shelves** or **Outside Corner Shelves** (whichever appeared first in the map) instead of the plain **Shelves** grid, because all three contain the substring "shelves". Result: the `shelves` alias ended up pointing to the wrong grid, so no correct shelves bindings were created, and all shelves-dependent products failed pricing.

### Fix (`server/routes.ts` — `findGridForAlias`, line ~1152)

Replaced the single-pass `includes()` lookup with a three-pass priority system:

**Pass 1 — Exact match** (e.g. `shelves` matches `Shelves` exactly after normalization):
```ts
if (normKey === normPattern) return grid;
```

**Pass 2 — Starts-with** (handles date suffixes like `Shelves_02202026`):
```ts
if (normKey.startsWith(normPattern + '_') || normKey.startsWith(normPattern + ' ')) return grid;
```

**Pass 3 — Contains** (broad fallback for partial matches, same as before):
```ts
if (normKey.includes(normPattern)) return grid;
```

All three passes still normalize both sides with `.replace(/\s+/g, '_').toLowerCase()`.

### How to Activate

1. Go to `/admin/diagnostic` → **"Reset & Recreate Bindings"** — this deletes and recreates all auto-created bindings using the fixed `findGridForAlias` logic. The `shelves` alias will now resolve to the correct grid.
2. Verify in `/admin/attribute-grids` → Shelves grid → Bindings tab — products with `shelves` in their formula should now appear.
3. Go to the order → **"Re-run Pricing"** — shelves pricing errors should be resolved.

---

## r16 — 2026-04-05 — Multi-Room ORD Format, Shelves Diagnostic Logging, Scrolling Hardening

### Fix 1 — Multi-Room Cabinet Vision ORD File (`server/routes.ts` — `/download/ord`)

Complete rewrite of `GET /api/orders/:id/download/ord` to produce the extended multi-room `.ord` format that Cabinet Vision requires when a project has multiple rooms.

**Structure of the new format:**
- One `[Header]` block for the entire file (project name + PO) — **not** one per item
- An empty `[Walls]` section immediately after — required by Cabinet Vision to enable the 18-field extended cabinet format
- Each item gets its own `[Catalog]` / `[Parameters]` / `[Cabinets]` block
- Cabinet entries use the **18-field extended format** (vs. old 8-field):
  ```
  ENTRY_NUM,"SKU",WIDTH,HEIGHT,DEPTH,"HINGE","ENDTYPE",QTY,"",,0.0,0.0,0.0,ROOM_NUM,0,"","","S"
  ```
  where field 14 (`ROOM_NUM`) maps each item to its room in Cabinet Vision
- `[Parameters]` now uses `Note=` (not `Attribute=`) for the banding line — required in the extended format
- Entry numbers are sequential across all rooms (global counter, not per-room)

**Room assignment:** Each CSV file uploaded = one room. File 1 → Room 1, File 2 → Room 2, etc. The project name (e.g. "H Holtermann") is used as the `.ord` `Name`, not the individual CSV filenames.

### Fix 2 — `/data/ord` Endpoint Returns Room-Grouped Structure (`server/routes.ts`)

`GET /api/orders/:id/data/ord` now returns:
```json
{
  "projectName": "H Holtermann",
  "rooms": [
    { "roomNumber": 1, "fileName": "Her Closet V2.csv", "roomName": "Her Closet V2", "itemCount": 45, "items": [...] }
  ],
  "totalItems": 87,
  "total": 4821.50
}
```
instead of the flat `items[]` + `assembledOrdText` format.

### Fix 3 — OrdTab UI Updated for Room Grouping (`client/src/pages/order-tabs/OrdTab.tsx`)

- Now renders one labelled section per room ("Room 1", "Room 2", …) each with a separate items table
- Download button calls `GET /api/orders/:id/download/ord` directly (server-side file download) instead of building a client-side blob from assembled text
- Shows "Multi-Room" badge when project has 2+ CSV files
- Summary line shows room count, total items, and total price
- Removed the assembled `.ORD` raw text preview block (superseded by the server-side download)

### Fix 4 — Missing-Alias Diagnostic Logging (upload handler, `server/routes.ts`)

Added diagnostic logging for the first 3 matched items per upload. After contextScope is built, checks which formula aliases are referenced in the pricing formula but missing from the resolved scope, and logs:
```
[Upload Pipeline] MISSING aliases for "34SHFF": shelves. Has 2 bindings: color(grid=5), manu_code(grid=3)
```
This surfaces shelves/grid binding misses immediately in the server logs without waiting for pricing errors.

### Fix 5 — Scrolling Hardening (`client/src/index.css`)

Added `min-height: 100vh; overflow-y: auto` to `html, body, #root` as a baseline layer on top of the r15 AppLayout fix.

---

## r15 — 2026-04-05 — Page Scrolling Fix, ORD Header Fix, MANU_CODE Grid Binding Fix, /download/ord Endpoint

### Fix 1 — Page Scrolling (`client/src/components/AppLayout.tsx`)

The content wrapper inside the scrollable area had `h-full`, which capped the inner div to exactly the viewport height. This meant the `overflow-y-auto` scroll container had nothing to scroll through — the child was always the same size as the parent. Changed to `min-h-full` and moved `p-8` into the inner div so padding is part of the scrollable content rather than a fixed frame offset. All pages with long content (Order Details with many items, Admin pages, etc.) now scroll correctly.

```tsx
// Before
<div className="flex-1 overflow-y-auto p-8 relative">
  <div className="max-w-7xl mx-auto h-full">{children}</div>
</div>

// After
<div className="flex-1 overflow-y-auto relative">
  <div className="max-w-7xl mx-auto min-h-full p-8">{children}</div>
</div>
```

### Fix 2 — ORD Header Template Default (`server/routes.ts`)

Updated `DEFAULT_ORD_HEADER_TEMPLATE` to include quoted values and filled-in `Customer` and `Address1` fields matching the Cabinet Vision `.ORD` spec (Perfect Fit Closets):

```
[Header]
Version=4
Unit=1
Name="{{design_name}}"
Description="{{design_name}}"
PurchaseOrder="{{po_number}}"
Comment=""
Customer="Perfect Fit Closets"
Address1="100-111 5 Avenue Southwest"
```

### Fix 3 — `/data/ord` Endpoint Now Includes Header and Filters Correctly (`server/routes.ts`)

`GET /api/orders/:id/data/ord` previously returned all items with any `exportText` regardless of `exportType`. It now:
- Filters to `exportType === 'ORD'` items only
- Prepends the generated ORD header (from `app_settings` or default) to `assembledOrdText`

The download button in the Cabinet Vision tab now produces a fully-formed `.ord` file with the correct `[Header]` block at the top.

### Fix 4 — New `/download/ord` Endpoint (`server/routes.ts`)

Added `GET /api/orders/:id/download/ord` — returns the assembled `.ord` file as a direct file download (`Content-Disposition: attachment; filename="<name>.ord"`). Useful for server-to-server integrations and as a stable URL for future automation.

### Fix 5 — MANU_CODE Grid Binding Lookup (both pipeline locations)

When a grid binding's `lookupColumn` contains `"manu"` (e.g. `MANU_CODE`), the pipeline was looking for `item['MANU_CODE']` in the CSV row — a key that doesn't exist (actual CSV column is `Manuf code`, already consumed to extract the SKU). The pipeline now correctly uses the already-extracted `sku` string for those bindings. Applied to both the upload handler and the reprice route in `server/routes.ts`.

Also added `item['COLOR']` (uppercase) as an additional fallback in the color column resolution chain.

---

## r14 — 2026-04-03 — CRITICAL FIX: CSV Column Name Mismatch (Zero Order Items)

### Root Cause

The Allmoxy order CSV uses column names that never matched what the pipeline code expected. The `if (!sku) continue` guard was silently skipping every single row, producing zero order items on every upload.

| CSV Column (actual) | Code expected | Outcome |
|---|---|---|
| `Manuf code` | `MANU_CODE`, `Manuf Code` | ❌ case mismatch — all rows skipped |
| `Width(R)` | `Width` | ❌ suffix — always 0 |
| `Length(L)` | `Length` | ❌ suffix — always 0 |
| `Quantity` | `Qty` | ❌ different word — always 1 |

### Fix 1 — SKU Extraction (all 3 pipeline locations)

`server/routes.ts` (reprice + upload handler), `server/asanaImportScheduler.ts`:

```ts
// Before
item.MANU_CODE || item.SKU || item['Manuf Code'] || ''

// After
item.MANU_CODE || item['Manuf code'] || item['Manuf Code'] || item['manuf code'] ||
item['MANUF CODE'] || item.SKU || item.sku || item['MANU CODE'] || ''
```

### Fix 2 — Dimension Extraction (all 3 pipeline locations)

```ts
// Before
width:    Number(item.Width    || item.width    || 0),
length:   Number(item.Length   || item.length   || 0),
quantity: Number(item.Qty      || item.quantity || item.QUANTITY || 1),

// After
width:    Number(item['Width(R)']  || item.Width    || item.width    || item['WIDTH']  || 0),
length:   Number(item['Length(L)'] || item.Length   || item.length   || item['LENGTH'] || 0),
depth:    Number(item['Length(L)'] || item.Length   || item.length   || item['LENGTH'] || item.Thickness || item.thickness || 0),
quantity: Number(item.Quantity     || item.Qty      || item.quantity || item.QUANTITY  || 1),
```

### Fix 3 — Color Binding `lookupColumn` (`server/routes.ts` auto-create-bindings)

Changed `lookupColumn` for color aliases from `'Material'` → `'Color'` to match the actual CSV column name. The per-pipeline fallback (`Material || Color || Colour`) was already correct; this ensures newly auto-created bindings use the right primary column.

### Fix 4 — Description Field (2 locations in `server/routes.ts`)

Added `item['Manuf code'] || item.MANU_CODE` as final fallback when no NAME / Part Name / Description column is present.

### Fix 5 — Upload Pipeline Debug Log

Updated the "First item SKU" log to also check `item['Manuf code']` so it surfaces the actual value rather than `(not found)`.

### Added: Diagnostic endpoint

`GET /api/test/order-check/:id` — returns `{ projectId, fileCount, filenames, itemCount, sampleItems, totalPrice, pricingErrors }` for quick post-upload verification without opening the UI.

---

## r13 — 2026-04-03 — Order Details Tabbed Redesign

### Part 1 — Backend: 6 JSON data endpoints (`server/routes.ts`)

Added after `GET /api/orders/:id/items`:

| Route | Returns |
|---|---|
| `GET /api/orders/:id/data/invoice` | Sections array with item rows + `pricingError` flag; grouped by section header |
| `GET /api/orders/:id/data/elias` | All ELIAS items as JSON |
| `GET /api/orders/:id/data/mj` | All MJ items as JSON |
| `GET /api/orders/:id/data/hardware` | All HARDWARE items as JSON |
| `GET /api/orders/:id/data/glass` | All GLASS items as JSON |
| `GET /api/orders/:id/data/ord` | ORD items as JSON + assembled plain-text ORD block |

### Part 2 — 10 tab components (`client/src/pages/order-tabs/`)

All new files, each self-contained with its own `useQuery` / data rendering:

| File | Tab | Data source |
|---|---|---|
| `AllItemsTab.tsx` | All Items | Props from parent (existing `orderItems`) |
| `InvoiceTab.tsx` | Invoice | `/data/invoice` JSON + `/pdf/invoice` iframe |
| `PackingSlipTab.tsx` | Customer / Internal Slip | `/data/invoice` JSON + `/pdf/*-packing-slip` iframes |
| `OrdTab.tsx` | Cabinet Vision | `/data/ord` JSON — renders assembled `.ORD` in `<pre>` + download |
| `EliasTab.tsx` | Elias | `/export/elias` text + `/pdf/elias` iframe |
| `MJTab.tsx` | M&J Doors | `/export/mj` text + `/pdf/mj` iframe |
| `ErpTab.tsx` | ERP Import | `/export/erp` text + download |
| `CtsTab.tsx` | Cut-to-Size | `/export/cts` JSON + `/pdf/cut-to-size` iframe |
| `HardwareTab.tsx` | Hardware | In-memory filter of `orderItems` props |
| `GlassTab.tsx` | Glass | In-memory filter of `orderItems` props |

### Part 3 — OrderDetails.tsx redesigned with top-level tabs

- Removed `pricingOpen`, `outputDocsOpen`, `activeOutputTab` state variables
- Removed `fileFilter` / `filteredItems` computed value (now handled inside `AllItemsTab`)
- Removed lazily-fetched `eliasExportText`, `mjExportText`, `erpExportText` queries
- Added `activeTab` state (default `"overview"`)
- Removed entire "Pricing & Export" collapsible (~320 lines) and "Output Documents" collapsible (~240 lines)
- Added persistent `<Tabs>` bar immediately after `<PageHeader>` with 12 triggers:

  `Overview · All Items · Invoice · Customer Slip · Internal Slip · Cabinet Vision · Elias · M&J Doors · ERP Import · Cut-to-Size · Hardware · Glass`

  Conditional tabs (Cabinet Vision, Elias, M&J, CTS, Hardware, Glass) render only when `has*` flag is true.

- All existing management sections (Project Notes, Project Details, Order Status, Material Summary, Pallets, CSV Files, Sync Status) live inside `<TabsContent value="overview">`.

### Part 4 — UploadOrder navigation verified (T004)

- Confirmed "View Order Details" button uses `setLocation(\`/orders/${uploadResult.id}\`)` — correct from r12; no change needed.

---

## r12 — 2026-04-03 — Console Log Cleanup + Order Details Browsable Experience

### Part 1 — Console log flood fixed (`server/services/pricingEngine.ts`, `server/routes.ts`)

**Root cause:** `evaluatePrice()` called two `console.log` lines on every item: the full formula text and the entire JSON scope object. A 200-item CSV produced 400+ log lines just from the pricing engine, making `[Upload Pipeline]` checkpoints invisible.

**Fixes:**
- Removed `console.log([PricingEngine] Evaluating formula: ...)` and `console.log([PricingEngine] Scope: ...)` — both called per item
- Simplified catch block to one line: `[PricingEngine] FAILED SKU="X": error.message`
- Removed per-item `[Pipeline] SKU: ${sku} → matched product: ...` log from the upload handler inner loop
- Added 5-line **pipeline complete summary** after `savedItems` is fetched and before `res.json`:
  ```
  [Upload Pipeline] ═══ PIPELINE COMPLETE ═══
  [Upload Pipeline] Project: {id} — {name}
  [Upload Pipeline] Files processed: N
  [Upload Pipeline] Total order items: N
  [Upload Pipeline] Total price: $X.XX
  ```

### Part 2 — Per-file filter on items table (`client/src/pages/OrderDetails.tsx`)

- Added `fileFilter: 'all' | number` state
- Added `filteredItems` computed value (filters `orderItems` by `fileId`)
- When project has more than one file: shows pill-shaped filter buttons above the items table (one "All Files" + one per file, showing item count in each)
- File labels use `originalFilename` stripped of extension
- Summary row below table now shows:
  - "File Subtotal" when filtered (with the full order total shown parenthetically)
  - "Grand Total" when viewing all files
  - Error/unmatched counts reflect the filtered view

### Part 3 — Output Documents tabbed section (`client/src/pages/OrderDetails.tsx`)

New "Output Documents" collapsible card added after the Pricing & Export card. Contains tabs for every output format; only tabs with content are shown.

| Tab | Source | View type | Condition |
|-----|--------|-----------|-----------|
| Invoice | `/pdf/invoice` | PDF `<iframe>` (800px) | Always |
| Customer Packing Slip | `/pdf/customer-packing-slip` | PDF `<iframe>` | Always |
| Internal Packing Slip | `/pdf/internal-packing-slip` | PDF `<iframe>` | Always |
| Cabinet Vision (.ORD) | Items `exportText` assembled inline | `<pre>` code block | `hasORD` |
| Elias Export | `/export/elias` fetched lazily | `<pre>` code block | `hasElias` |
| Elias PDF | `/pdf/elias` | PDF `<iframe>` | `hasElias` |
| M&J Export | `/export/mj` fetched lazily | `<pre>` code block | `hasMJ \|\| hasGlass` |
| M&J Shaker PDF | `/pdf/mj` | PDF `<iframe>` | `hasMJ \|\| hasGlass` |
| ERP Import | `/export/erp` fetched lazily | `<pre>` code block | Always |
| Cut-to-Size | `/pdf/cut-to-size` | PDF `<iframe>` | `hasCTS` |
| Hardware | Filtered from items in memory | Items table | `hasHardware` |
| Glass | Filtered from items in memory | Items table | `hasGlass` |

- CSV tabs use `enabled: activeOutputTab === 'X' && outputDocsOpen` — zero fetch cost until you open the tab
- Each tab has a **Download** button in the top-right corner
- `Tabs` component from shadcn added to imports

### Part 4 — Image storage strategy comment (`server/routes.ts`)

Added 3-line comment above `POST /api/admin/products/bulk-upload-images` documenting that base64 DB storage is intentional (GCS/object storage unavailable in this deployment environment). Addresses code review comment from Task #16 merge.

---

## r11 — 2026-03-30 — Import Pipeline Diagnostic Logging

### Part 1 + 2: Comprehensive pipeline logging (upload + reprice)

**Upload handler (`server/routes.ts`)** — `[Upload Pipeline]` logs added at 6 checkpoints:
1. **Pre-load totals** — logs total products in DB, active products with skuPrefix, grid binding count, grid count, proxy var count. Logs ⚠ error if zero active products.
2. **Sample products** — logs first 5 active products (id, name, skuPrefix, pricingProxyId, exportProxyId) for verification.
3. **Header detection** — logs filename, total CSV rows, header row index. Logs all column headers if found, or dumps first 5 rows if not found.
4. **Row parsing** — logs how many data rows were parsed from the file. Logs first item's MANU_CODE and Material column values for spot-check.
5. **Per-item counters** — tracks matchCount / noMatchCount / pricingSuccessCount / pricingErrorCount inside the loop. Logs first 5 SKU no-matches and first 3 pricing errors inline.
6. **Per-file summary + batch** — logs all 4 counters + items-in-batch after loop, then logs batch insert confirmation.

**Reprice route** — same `[Reprice Pipeline]` structure added (active products count, header detection, row parsing, per-item counters, summary, batch insert confirmation).

### Part 3: `GET /api/admin/import-readiness` endpoint
New endpoint returning a fast system health check:
```json
{
  "ready": true,
  "products": { "total", "active", "activeWithSkuPrefix", "activeWithPricingFormula", "activeWithExportFormula", "sampleSkuPrefixes" },
  "grids": { "count", "totalRows", "names" },
  "bindings": { "total", "productsWithBindings" },
  "proxyVariables": { "total", "pricing", "export" },
  "issues": ["...actionable error strings..."]
}
```
`ready` is `false` if any of: no active products with skuPrefix, no products with pricing formula, no grid bindings.

### Part 4: Upload page readiness banner
- `useQuery` on `GET /api/admin/import-readiness` with `staleTime: 60s`
- **Amber banner** when `ready === false`: shows header, bullet-pointed issues list, and counts (products with SKU, with pricing, bindings total)
- **Green strip** when `ready === true`: shows products-with-pricing, bindings, and formula counts

### Part 5: Upload page results summary
After successful upload, instead of auto-redirecting to dashboard, now shows:
- Project name
- Total items processed
- ✅ N matched to products / ❌ N unmatched SKUs
- 💰 N priced successfully / ⚠ N pricing errors
- Total: $X.XX
- "Go to Dashboard" button (explicit navigation)

**Refactor:** Removed auto-redirect from `useUploadOrder` hook's `onSuccess`. Navigation is now handled by the component, giving the user time to read the summary first.

### Part 6: Multi-file upload verified
Confirmed `UploadOrder.tsx` already had: `files: File[]` state, `multiple={true}` on FileUpload, `formData.append("files", file)` loop — no fix needed.

---

## r10b — 2026-03-29 — Grid-Name Matching Fix + Reset & Recreate

### Fix (critical): Wrong-grid bindings from `auto-create-bindings`
**Root cause:** `findGridForAlias` compared underscore-pattern strings like `main_color_attribute` against database grid names with spaces (`Main Color Attribute 02202026`). The substring match always failed. The `color` alias then fell through to the generic `'color'` fallback which matched `mj colors 02202026` (contains "color") — binding every product to the MJ Colors grid instead of Main Color Attribute. MJ Colors has completely different columns, so all pricing formulas that reference `color.sqft_price`, `color.level_percent_upcharge`, etc. failed.

**Fix — `server/routes.ts` auto-create-bindings endpoint:**
- `gridNameMap` now stores **4 normalized variants** per grid: original lowercase, underscore-normalized, date-stripped, and date-stripped + underscore-normalized
- Date-suffix regex changed from `/_\d{8}$/` to `/[\s_]?\d{8}$/` — handles both space-separated (`Main Color Attribute 02202026`) and underscore-separated (`Main_Color_Attribute_02202026`) dates
- `findGridForAlias` normalizes the alias pattern to underscores before comparing: `const normPattern = pattern.replace(/\s+/g, '_').toLowerCase()` — `main_color_attribute` now correctly resolves to `Main Color Attribute 02202026`

### Feature: `reset: true` parameter on auto-create-bindings
- `POST /api/admin/auto-create-bindings` now accepts `{ dryRun: false, reset: true }`
- Deletes all existing bindings whose alias matches the known auto-create alias list before recreating
- Response includes `deleted: N` count alongside `created: N`
- Clears the ~1,790 wrong `color` bindings from previous broken runs

### Feature: Wrong-grid detection in pricing diagnostic
- After confirming a binding exists for an alias, now also checks if `color` alias points to a grid with `mj_color` in the normalized name
- If so, adds an error issue: `Binding "color" → "<grid>" — likely wrong grid. Should point to "Main Color Attribute". Run Reset & Recreate.`

### Feature: "Reset & Recreate Bindings" button on Pricing Diagnostic page
- Destructive red button — always visible, no dry-run required
- Calls `{ dryRun: false, reset: true }` and shows toast: "Deleted N old, Created N new bindings"
- Result summary banner updated to show deleted count when present
- Added `RotateCcw` icon import

---

## r10 — 2026-03-28 — Formula Tester Auto-Select + Diagnostic Banner

### Feature: Auto-select first grid value for non-MANU bindings
- `GridRowCombobox` in `FormulaTester.tsx` now accepts `autoSelect?: boolean` prop
- When `autoSelect` is true, fires `onChange(rowKeys[0].lookupKey)` as soon as row keys load and the current value is empty
- Non-MANU bindings (color, material, etc.) in the binding section pass `autoSelect` — no need to manually open the dropdown before running a test

### Feature: Diagnostic banner on Formula Tester page
- `GET /api/admin/pricing-diagnostic` fetched on page load with `staleTime: 60s`
- When `withPricingProxy === 0` or `withBindings === 0`, shows amber banner: "Pricing is not fully configured. X/Y products have pricing formulas · X/Y have grid bindings. Go to Diagnostic Page →"

---

## r9 — 2026-03-28 — Pricing Diagnostic + Auto-Create Bindings

### Feature: `GET /api/admin/pricing-diagnostic`
Full health check across all active products. Returns:
- Stats: totalProducts, activeProducts, withSkuPrefix, withPricingProxy, withExportProxy, withBindings, withNoBindings, totalBindings, totalProxyVars, totalGrids, pricingProxies, exportProxies
- Per-product issue list with severity (error/warning), capped at 300 issues
- Formula-alias cross-reference — detects aliases referenced in pricing formula that have no binding

### Feature: `POST /api/admin/auto-create-bindings` (with dry-run)
- Extracts all alias references (`word.`) from each product's pricing + export proxy formulas
- Maps aliases to grids via `aliasToGridPatterns` dictionary (35+ aliases, 50+ patterns)
- Color-type aliases (`color`, `mj_colors`, `richelieu_colors`, `edgebanding`) use `lookupColumn: 'Material'`; all others use `MANU_CODE`
- `dryRun: true` (default) returns preview without writing; `dryRun: false` creates missing bindings
- Idempotent — existing `productId:gridId:alias` combos skipped

### Feature: Pricing Diagnostic page (`/admin/diagnostic`)
- 6+4 stats cards (active/SKU/formula/binding/error counts)
- Summary callout with assessment (all OK vs. N issues)
- Severity filter (All / Errors / Warnings) on issue table
- Auto-Create Bindings panel: Dry Run → review sample table + skipped collapsibles → Confirm button

### Feature: Formula Tester binding status panel
- After selecting a product, extracts alias refs from pricing formula
- Shows ✅/❌ per alias vs. bound grids; links to Diagnostic page for missing ones
- `formatPricingError()` parses "Undefined symbol X" errors → contextual explanation with fix link

### Nav: "Pricing Diagnostic" added to admin sidebar (Zap icon)

---

## r8 — 2026-03-26 — Pipeline Fixes + Formula Tester Combobox

### Fix (Bug 2): Non-MANU binding `autoValue` was wrong in formula-test endpoint
- Was passing `autoValue = skuPrefix` for all bindings; non-MANU bindings should use the user-supplied `gridLookups[alias]` value (empty string as autoValue signals "use gridLookups")

### Fix (Bug 3): Case-insensitive fallback column matching
- `findGridRowInCache` in all three pipeline locations now falls back to case-insensitive column matching when exact `MANU_CODE` lookup fails
- Fixes `divider_panels.BASE_PRICE` resolving correctly when formula uses `divider_panels.base_price`

### Fix (Bug 4): Batch insert for order_items
- `createOrderItemsBatch(items: InsertOrderItem[])` added to `IStorage` interface and `DatabaseStorage`
- All three pipeline locations (upload handler, reprice route, Asana scheduler) now accumulate to an array then call one bulk insert after the loop

### Fix (Bug 5): `gridRowToScope()` helper
- Added to `pricingEngine.ts` — lowercases all rowData keys AND coerces numeric string values to numbers
- Replaced all inline `Object.fromEntries(Object.entries(rawData).map(...))` in formula-test endpoint, reprice route, upload handler, and Asana scheduler

### Feature: Formula Tester `GridRowCombobox`
- Replaces free-text Input for non-MANU bindings with a searchable popover combobox
- Fetches available row keys from `GET /api/admin/attribute-grids/:id/row-keys` (endpoint already existed)
- Response format `[{ lookupKey, displayLabel }]` — filtered/sorted, no header rows, no unavailable rows
- Ad-hoc grid lookup rows also use `GridRowCombobox` when a grid is selected

---

## Features (2026-03-22 r7)

### Part A — Attribute Grid Manager: Bindings Tab

**Storage (server/storage.ts):**
- Added `updateProductGridBinding(id, { alias?, lookupColumn? })` — targeted single-binding update using Drizzle `.update().set().returning()`
- Added `getBindingsWithProductInfo(gridId)` — join of `product_grid_bindings` + `allmoxy_products` returning `{ id, productId, productName, skuPrefix, alias, lookupColumn, gridId }`, ordered by product name

**Routes (server/routes.ts) — 4 new endpoints:**
- `GET /api/admin/attribute-grids/:id/bindings` — all bindings for a grid with product info
- `PATCH /api/admin/attribute-grids/:gridId/bindings/bulk-alias` — update alias on every binding for a grid (registered before `/:bindingId` to avoid param collision)
- `POST /api/admin/attribute-grids/:gridId/bindings/bulk-add` — add bindings to products matching `formula-contains` fragment (finds proxy vars whose formula includes the text → all products with that pricing proxy) or explicit `productIds`; duplicate-checks against existing bindings
- `PATCH /api/admin/attribute-grids/:gridId/bindings/:bindingId` — update alias/lookupColumn on a single binding

**Frontend (DynamicGridManager.tsx):**
- Rows | Bindings tab bar added between the toolbar and content area; Bindings shows count in label
- Bindings tab: table of all bound products (Product Name, SKU Prefix, Alias, Lookup Column, Remove); click Alias or Lookup Column for inline edit; Save on Enter/blur, cancel on Escape; green checkmark flash on save
- Remove: confirms → fetches current bindings → filters this gridId → calls replace endpoint
- **Bulk Update Alias dialog**: pre-fills current shared alias if all bindings agree; calls bulk-alias; shows confirmation toast
- **Bulk Add Binding dialog**: Alias + Lookup Column fields; mode radio (formula-contains with text input OR explicit product multi-select); searchable checkbox list of all products for explicit mode; Preview button does a real server call with `dryRun:true` (dry run falls back gracefully if not supported — shows actual result count); calls bulk-add; toast shows inserted/skipped counts

### Part B — Formula Tester: Ad-hoc Grid Lookups

**Backend (server/routes.ts — formula-test):**
- Accepts `req.body.adHocLookups: Array<{ gridId, alias, lookupValue }>`
- After real bindings are resolved, iterates adHocLookups: skips if `contextScope[alias]` already set (real binding wins); looks up row by lookupValue using `getAttributeGridRowByKey`; adds to contextScope and gridLookupResults with `isAdHoc: true`
- `gridLookupResults` type extended with `isAdHoc?: boolean`

**Frontend (FormulaTester.tsx):**
- New `AdHocRow` type + `adHocRows` state
- `allGrids` query (GET /api/admin/attribute-grids)
- Collapsible "Ad-hoc Grid Lookups" section below Grid Lookup Overrides in left panel; shows row count when collapsed
- Each row: Grid dropdown (all attribute grids), Alias input, Lookup Value input, Remove button
- "+ Add Lookup" button appends a new empty row
- Mutation passes filtered adHocLookups (only complete rows) to formula-test endpoint
- Results: ad-hoc entries shown with dashed amber border + amber "ad-hoc" badge to distinguish from real bindings

---

## Fixes (2026-03-21 r6)

### Fix: Multi-line formulas crash with "Syntax error (char N)"
**Root cause:** `stripComments` in `pricingEngine.ts` removed block/line comments but left internal newlines intact. mathjs cannot parse ternary operators when the `?` or branches are on a separate line — it sees a line break as an expression terminator and throws a syntax error. Every multi-line formula was broken by this.

**Fix:** Added `result.replace(/\s+/g, " ")` after comment removal in `stripComments`. All newlines and runs of whitespace are collapsed to a single space before the formula is handed to mathjs. No changes needed to calling code.

### Feature: Per-binding Grid Lookup Overrides in Formula Tester
**Problem:** The Formula Tester had no way to supply lookup values for grid bindings that resolve from something other than the product SKU (e.g., color/material codes like `TFL1W`). Those bindings always missed, `color.*` was never in scope, and pricing formulas that depend on color grids always returned an error.

**Frontend — `FormulaTester.tsx`:**
- Removed the combined "Lookup: using product SKU automatically" note
- Added "Grid Lookup Overrides" section that renders one row per binding
- Auto-resolved bindings (`lookupColumn` contains `manu`) show a read-only pill with the product SKU so the user knows they're handled automatically
- Manual bindings (e.g., `COLOR`, `MATERIAL`) render an editable `Input` with placeholder "e.g. TFL1W" and a helper showing the column name
- `lookupInputs` state is now keyed by `binding.alias` (was mixed with `lookupColumn`)
- Mutation now sends `{ inputs: { dimensions }, gridLookups: lookupInputs }` to the endpoint; `inputs` is dimensions-only. The endpoint already checked `gridLookups[binding.alias]` first — no backend change needed.

---

## Recent Fixes (2026-03-21 r5) — Prompts 1 & 2

### Fix: Grid row cache not used in reprice / Asana pipeline (Prompt 1)
**Root cause:** `findGridRowInCache` and `gridRowsCache` were only built in the upload handler. The reprice route and Asana import scheduler still called `await storage.getAttributeGridRowByKey(...)` per item — a DB round-trip per binding per line item. Grid alias keys were also not lowercased, so formulas like `parts.base_price` couldn't find the alias `Parts` in `contextScope`.

**Fix — all three locations (upload handler, reprice route, Asana scheduler):**
- Bulk `getAllProductGridBindings()` + `Promise.all` for grids and grid rows instead of sequential per-product fetches
- `findGridRowInCache` closure (exact → case-insensitive → rowData column fallback) added to reprice route and Asana scheduler, matching the upload handler
- `contextScope[binding.alias.toLowerCase()]` with `Object.fromEntries(...k.toLowerCase())` — alias and all column keys now consistently lowercase in all three locations
- Asana scheduler `createOrderItem` now uses `pricingItem` (normalized numeric dimensions) instead of raw CSV strings

### Fix: Proxy variable values not in formula scope (Prompt 2 — pricing engine)
**Root cause:** The mathjs formula for a product can reference other proxy variable names (e.g., `sq_ft`, `margin`). Those names were never pre-computed and added to the scope before the main formula ran, so they evaluated to `undefined` (mathjs silently returns 0 or throws), causing `$0.00` prices.

**Fix — `server/services/pricingEngine.ts`:**
- Added optional `allProxyVars: Array<{name, formula}>` 4th parameter to `evaluatePrice`
- Before the main formula runs, each proxy var's formula is evaluated against the current scope (dimensions + grid aliases) and its result is added to the scope under its name — so `sq_ft`, `margin`, etc. are available to the main formula
- Re-throw on evaluation error instead of returning 0 silently — callers' existing `try/catch` blocks now populate `pricingError` correctly
- Added `console.log` of the full scope before evaluation and `console.error` with formula + scope on failure

**All callers updated:**
- Upload handler, reprice route, Asana scheduler, formula tester endpoint — all now pass `[...proxyVarMap.values()]` as the 4th argument
- Formula tester endpoint logs the resolved scope to console before calling `evaluatePrice`
- Formula tester UI (FormulaTester.tsx) already displayed `pricingError` in a red box — no frontend change needed

---

## Recent Fixes (2026-03-21 r4) — Task #25

### Fix: Order CSV import created zero order_items (critical)
**Root cause:** `parseSync(content, { columns: true })` treated the *first* row of the Allmoxy CSV as column headers. Allmoxy order CSVs have a metadata preamble (PO number, dealer name, address), so the real `MANU_CODE` header was buried further down. Every parsed object had metadata labels as keys, `item.MANU_CODE` was always undefined, and every row was skipped by `if (!sku) continue` — resulting in zero `order_items` ever being created.

**Fix:** Replaced `parseSync` with header-aware parsing directly on `pf.records` (`string[][]`). Scans for the first row whose first cell contains `"manuf"`, uses that row as the column headers, then builds objects for all subsequent data rows — matching the existing pattern in `countPartsFromCSV` / `extractCTSParts` in `csvHelpers.ts`.

**Impact:** All output pages (invoice, packing slip, ORD export, Elias export, MJ export, CTS export, hardware export) were empty because they are driven by `order_items`. These will now populate correctly after any order CSV upload.

### Fix: Import pipeline was extremely slow (2,363+ sequential DB queries)
**Root cause:** The pre-load block before processing called `storage.getProductGridBindings(productId)` once per active product in a sequential `for` loop. With 2,363 active products in production this was 2,363 round-trips. Additionally, each order item fired `storage.getAttributeGridRowByKey()` — another DB hit per binding per item.

**Fix — Bulk binding load:** Added `getAllProductGridBindings()` to the storage interface and implementation (single `SELECT` on `product_grid_bindings` with no `WHERE`). The pre-load loop is replaced with one bulk call; results are grouped into a `Map<productId, bindings[]>` in memory.

**Fix — In-memory grid row cache:** All grid rows are loaded upfront via `Promise.all` over `storage.getAttributeGridRows()` per grid (grids run in parallel). A `Map<gridId, rows[]>` is built in memory. Per-item grid lookups are replaced with `findGridRowInCache()` — an in-memory function implementing the same exact → case-insensitive → rowData column fallback logic as the original DB method.

**Fix — Parallel table pre-load:** The four pre-load queries (proxy vars, products, bindings, grids) now run concurrently via `Promise.all` instead of sequentially.

**Net result:** Import time drops from O(N_products) sequential DB queries to a small constant number of parallel bulk queries, followed by O(1) in-memory lookups during per-item processing.

---

## Stack Overview

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Wouter, TanStack Query v5, shadcn/ui, Tailwind CSS |
| Backend | Express.js + TypeScript (tsx), 156+ REST API routes |
| Database | PostgreSQL + Drizzle ORM — `shared/schema.ts` + `migrations/` |
| Pricing Engine | mathjs formula evaluator (`server/services/pricingEngine.ts`) |
| Auth | Replit OIDC — single-user, gated by `allowed_users` table + `is_admin` flag |

---

## Feature Index (Live & Working)

### Orders / Projects
- Upload closet order CSVs via drag-and-drop (`/upload`)
- CSV parsed into `projects` + `order_files` + `order_items` tables
- Multi-CSV support — multiple CSVs can belong to one project
- Project detail view with full line-item table, pricing, and status (`/orders/:id`)
- 20+ columns on `projects`: dealer, shipping address, production status array, ship date, job number, notes, etc.
- Edit individual order items inline (dimensions, quantity, price overrides)
- Soft-delete / archive orders (admin only)
- SKU-prefix matching at upload time: CSV `product_name` matched to `allmoxy_products.skuPrefix`
- mathjs formula evaluation at upload: pricing computed live from proxy variables + grid lookups

### Pricing Engine
- `proxy_variables` table: named formula strings evaluated with mathjs
- Each `allmoxy_product` has a `pricingProxyId` (pricing formula) and `exportProxyId` (ORD export formula)
- Attribute grids (`attribute_grids` + `attribute_grid_rows`): named CSV lookup tables
- `product_grid_bindings`: links a product to one or more grids with key/value column mappings
- Formula tester endpoint (`POST /api/admin/formula-test`) and live UI at `/admin/formula-tester`
- Formula scope built from: order item dimensions (h, w, l, qty), matched grid row columns, computed proxies
- Comments stripped from formula strings before evaluation

### Admin UIs
- **Allmoxy Product Manager** (`/admin/products`): full CRUD for `allmoxy_products`; per-product image upload/clear; category assignment
- **Attribute Grid Manager** (`/admin/grids`): import grids from CSV; view/edit rows; manage product-grid bindings
- **Proxy Variable Manager** (`/admin/proxies`): create/edit/delete formula variables; live formula preview
- **Formula Tester** (`/admin/formula-tester`): test any formula string with custom variable scope
- **ORD Settings** (`/admin/ord-settings`): configure Cabinet Vision header template fields (stored in `app_settings`)
- **Admin Users** (`/admin/users`): manage the `allowed_users` whitelist
- **Product Category Manager**: categorize Allmoxy products

### Hardware Products (`products` table)
- Separate hardware catalog at `/products` (distinct from Allmoxy products)
- Import from CSV via `/admin/hardware-import`
- Component import at `/admin/component-import`
- Per-product image upload — images stored as base64 in DB (`image_data` column)
- Bulk image uploader at `/admin/product-images` — matches uploaded filenames to products across both Allmoxy and Hardware tables; client-side batching (25 files/batch) with progress bar and cancel

### Product Images
- **Storage**: Base64 text in `image_data` column in PostgreSQL — no object storage dependency; survives redeployments
- **Serve routes**:
  - `GET /api/product-images/by-id/:id` → Allmoxy product image from DB
  - `GET /api/product-images/hardware/by-id/:id` → hardware product image from DB
- Both routes: decode base64, detect Content-Type from file extension, set `Cache-Control: public, max-age=86400`
- Per-product upload: `POST /api/admin/allmoxy-products/:id/image`
- Per-product clear: `DELETE /api/admin/allmoxy-products/:id/image` (nulls both `image_path` and `image_data`)
- Bulk upload: `POST /api/admin/products/bulk-upload-images` (matches by filename stem to product name / SKU prefix / hardware code)

### Pallet System
- `pallets` + `pallet_file_assignments` tables
- Pallet management UI — assign order files to pallets, track pallet counts
- Pallet size recommendation based on order dimensions

### Hardware Packing Checklist
- `hardware_checklist_items` table (15 columns: isPacked, packedAt, packedBy, buyoutArrived, etc.)
- Checklist generated from hardware CSV; cross-references products DB
- UI at `/hardware-checklist/:fileId` with check-off, timestamps, buyout item tracking

### Packing Slip / CTS Checklist
- Packing slip checklist generated directly from order CSV data (no PDF parsing)
- Includes CTS cut lengths
- UI at `/packing-checklist/:fileId`

### CTS (Cut-to-Size) System
- `cts_parts` + `cts_part_configs` tracking tables
- `/cut-to-size` page

### Output Documents / Exports
- Invoice PDF — priced line items + totals
- Customer Packing Slip PDF
- Internal Packing Slip PDF
- ELIAS export (supplier-specific)
- MJ export (M&J Woodcraft)
- ERP export (component + hardware lines)
- CTS export (cut-to-size parts)
- Export routing by `exportType` field on `allmoxy_products`: `ORD | HARDWARE | ELIAS | MJ | CTS | GLASS | NONE`

### Integrations
- **Asana**: OAuth via Replit Connectors — syncs orders as tasks; auto-imports from "NEW JOBS" project; updates existing tasks; background scheduler every 5 min; notes sync daily
- **Outlook (Microsoft Graph)**: OAuth via Replit Connectors — auto-fetches packing slip PDFs + hardware CSV attachments; polls every 30 min
- **Google Sheets**: OAuth via Replit Connectors — daily automated backup of all DB data to a designated Drive folder at 3:00 AM; manual backup trigger also available
- **Replit Auth (OIDC)**: Login gated by `allowed_users` table; `is_admin` flag controls destructive operations

### UX / UI
- Color breakdown: part counts by material color cross-referenced against `color_grid` table
- Full responsive layout across all pages
- Dark mode via ThemeProvider + localStorage persistence
- Sidebar navigation
- Skeleton loading states throughout

---

## Database Tables (26 total)

| Table | Purpose |
|---|---|
| `projects` | Orders — 20+ cols including dealer, address, status, ship date, job number |
| `order_files` | CSVs uploaded per project (multiple per project supported) |
| `order_items` | Line items with pricing, dimensions, SKU match |
| `allmoxy_products` | Allmoxy product catalog (skuPrefix, pricingProxyId, exportProxyId, imageData) |
| `products` | Hardware/component catalog (code, supplier, imageData) |
| `product_categories` | Category labels for Allmoxy products |
| `proxy_variables` | Named mathjs formula strings |
| `attribute_grids` | Named grid lookup tables (CSV-imported) |
| `attribute_grid_rows` | Rows within each grid |
| `product_grid_bindings` | Product ↔ grid linkage with key/value column mapping |
| `pallets` | Pallet records per project |
| `pallet_file_assignments` | Pallet ↔ order file mapping |
| `hardware_checklist_items` | Per-file hardware packing items |
| `packing_slip_items` | Packing slip line items |
| `cts_parts` | CTS part records |
| `cts_part_configs` | CTS part configuration |
| `color_grid` | Material color lookup for breakdown analysis |
| `users` | Auth users (from OIDC) |
| `allowed_users` | Whitelist of users permitted to log in |
| `sessions` | Express session store |
| `processed_asana_tasks` | Dedup tracking for Asana import |
| `processed_outlook_emails` | Dedup tracking for Outlook fetch |
| `asana_import_sync_status` | Asana scheduler metadata |
| `outlook_sync_status` | Outlook scheduler metadata |
| `agentmail_sync_status` | AgentMail scheduler metadata |
| `app_settings` | Key-value config store (ORD header template, etc.) |

---

## Recent Fixes (this session — 2026-03-21)

- **Allmoxy product import — upsert on re-import** (Task #23): Re-importing a product CSV no longer crashes on duplicate names or wipes proxy assignments, images, or SKU prefixes. New products are inserted; existing products (matched by name) have their form-selected fields updated (exportType, supplyType, categoryId, proxy IDs if specified), while admin-configured fields (skuPrefix, imagePath, imageData, notes) are preserved. Products absent from the new CSV are left untouched.

- **Allmoxy product import — deduplicate rows before upsert** (Task #24): If the CSV itself contains two or more rows with the same product name, the import previously crashed with "ON CONFLICT DO UPDATE command cannot affect a row a second time". The CSV rows are now deduplicated by name (last row wins) before the database call, eliminating this error entirely.

---

## Known Gaps (Spec Defined, Not Yet Built)

- `allmoxy_products` missing columns: `isCustomCut`, `isHardware`, `supplierName`, `active`
- `order_items` missing columns: `formulaSnapshot`, `variableSnapshot`, `ordExportBlock`, `erpExportRow`, `colorCode`
- `proxy_variables` missing: `description` column
- `attribute_grids` missing: `displayName`, `updatedAt` columns
- `attribute_grid_rows` missing: `sortOrder` column
- Cabinet Vision `.ORD` file final assembler (per-line `ordExportBlock` values → assembled `.ORD` file download)
- Pricing audit trail (formula + variable snapshots stored per order item at calculation time)

---

## Migration History

| File | Key Changes |
|---|---|
| `0000_faithful_vance_astro` | Initial schema: projects, order_files, order_items, users, sessions, allowed_users |
| `0001_left_thunderbolt` | Asana / Outlook sync status tables |
| `0002_long_earthquake` | Attribute grids system; email column on allowed_users |
| `0003_magenta_nomad` | Proxy variables, allmoxy_products, product_grid_bindings |
| `0004_tense_silhouette` | Pallet system, hardware checklist, packing slip items |
| `0005_legal_maverick` | CTS parts system, color_grid, agentmail_sync_status |
| `0006_reflective_dark_phoenix` | Added `image_path` to allmoxy_products |
| `0007_image_data_columns` | Added `image_data` (base64 DB storage) to allmoxy_products + products; product_categories table; supply_type on order_items |

---

## Key File Map

```
shared/schema.ts                          Single source of truth for all DB types and Zod schemas
server/routes.ts                          All API route handlers (156+)
server/storage.ts                         DB query layer (IStorage interface + DatabaseStorage impl)
server/services/pricingEngine.ts          mathjs formula evaluator + grid resolver
server/replit_integrations/               Asana, Outlook, Google Sheets, Auth, Object Storage connectors
client/src/App.tsx                        Route definitions
client/src/pages/
  Dashboard.tsx                           Order list + status overview
  OrderDetails.tsx                        Line-item detail, exports, pricing
  UploadOrder.tsx                         CSV drag-and-drop upload
  Products.tsx                            Hardware product catalog
  HardwareChecklist.tsx                   Hardware packing checklist UI
  PackingChecklist.tsx                    Packing slip checklist UI
  CutToSize.tsx                           CTS parts page
client/src/pages/admin/
  AllmoxyProductManager.tsx              Allmoxy product CRUD + image upload
  DynamicGridManager.tsx                 Attribute grid import + binding UI
  ProxyVariableManager.tsx              Formula variable CRUD
  FormulaTester.tsx                      Live formula testing UI
  ProductImageUploader.tsx              Bulk image matching + upload (batched)
  OrdSettings.tsx                        ORD header template config
  AdminUsers.tsx                         Allowed-users whitelist manager
docs/MASTER_ARCHITECTURE_SPEC_v4.md      Full system specification (authoritative)
CHANGELOG.md                             This file — keep updated after each task
```
