# Perfect Fit Closets / Netley Millwork — Order Management System
## Build State Reference
> Last updated: 2026-04-12 (r22-hotfix) · React + Express + PostgreSQL on Replit

---

## What This App Is

A full-stack order management and manufacturing workflow system built to replace
Allmoxy for Netley Millwork. It ingests closet order CSVs from Allmoxy, prices
every line item using admin-configured mathjs formulas and attribute grid lookups,
and produces all downstream documents needed for production, shipping, and suppliers.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Wouter, TanStack Query v5, shadcn/ui, Tailwind CSS |
| Backend | Express.js + TypeScript (tsx), 180+ REST API routes (8,153 lines) |
| Database | PostgreSQL + Drizzle ORM — 27 tables, schema in `shared/schema.ts` |
| Pricing Engine | mathjs formula evaluator (`server/services/pricingEngine.ts`) |
| PDF Generation | Python/ReportLab scripts — 6 scripts: invoice, customer slip, internal slip, Elias, M&J, CTS |
| Auth | Replit OIDC — single user, gated by `allowed_users` table + `is_admin` flag |

---

## All 17 Pages (Routes)

| URL | Page | Purpose |
|---|---|---|
| `/` | — | Redirects to `/orders` |
| `/orders` | All Orders | Full order list with filters, email sync, Asana import |
| `/orders/:id` | Order Details | Sticky header, FileSidebar, Documents / Packing & Shipping sections; full-height layout, no AppLayout top bar |
| `/upload` | Upload Order | CSV drag-and-drop upload with readiness banner and post-upload results summary |
| `/products` | Hardware Products | Internal hardware catalog |
| `/products/import` | Hardware Import | Import hardware CSV |
| `/products/import-components` | Component Import | Import component CSV |
| `/files/:fileId/cts` | Cut to Size | CTS part list for a file |
| `/files/:fileId/checklist` | Packing Checklist | Packing slip check-off UI |
| `/files/:fileId/hardware-checklist` | Hardware Checklist | Hardware packing check-off UI |
| `/admin/allmoxy-products` | Allmoxy Product Manager | Full CRUD for products, images, category, formula assignments, export type |
| `/admin/attribute-grids` | Attribute Grid Manager | Multi-file CSV import, row editing, multi-select delete, product-grid bindings |
| `/admin/proxy-variables` | Proxy Variable Manager | Create/edit/delete formula variables, live preview |
| `/admin/formula-tester` | Formula Tester | Test any formula with a custom scope, live result — binding status panel, better error messages |
| `/admin/product-images` | Bulk Image Uploader | Match + upload images by filename (exact match, both tables, auto-save, progress bar) |
| `/admin/diagnostic` | Pricing Diagnostic | Health check: stats, issue list, auto-create/reset bindings |
| `/admin/settings` | Admin Settings | 3-tab consolidated settings page: **ORD Export** (header template) · **Output Settings** (per-doc image/pricing toggles) · **Users** (allowed-users whitelist) |

---

## Database — 27 Tables

| Table | Purpose |
|---|---|
| `projects` | Orders — 20+ cols: dealer, address, status array, ship date, job number, Asana ID, notes |
| `order_files` | CSVs per project (multiple files per project supported) |
| `order_items` | Line items with SKU, pricing, dimensions, exportType, pricingError, rawRowData |
| `allmoxy_products` | Product catalog: skuPrefix, pricingProxyId, exportProxyId, exportType, supplyType, imageData |
| `products` | Hardware/component catalog: code, supplier, imageData |
| `product_categories` | Category labels for Allmoxy products |
| `proxy_variables` | Named mathjs formula strings (type: pricing or export) |
| `attribute_grids` | Named grid lookup tables (CSV-imported, JSONB columns array) |
| `attribute_grid_rows` | Rows within each grid — lookupKey + rowData JSONB |
| `product_grid_bindings` | Product ↔ grid linkage with alias and lookupColumn mapping |
| `pallets` | Pallet records per project |
| `pallet_file_assignments` | Pallet ↔ order file mapping |
| `hardware_checklist_items` | Per-file hardware packing items (15 cols, timestamps, buyout tracking) |
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

**Production DB state (as of 2026-03-22):** 2,363 active Allmoxy products (all with images matched), 2 projects.

---

## How the CSV → Order Pipeline Works

1. User drags a CSV onto the Upload page
2. Server scans `pf.records` for the row whose first cell contains `"manuf"` — that row becomes the column headers (Allmoxy CSVs have a metadata preamble before the real header)
3. Each subsequent row is a line item with a `MANU_CODE` value (the SKU)
4. SKU prefix matched against `allmoxy_products.skuPrefix` to resolve the product
5. Pricing engine fires:
   - All proxy variables, products, grid bindings, and grid rows loaded in parallel (4 bulk queries via `Promise.all`)
   - Grid bindings grouped into a `Map<productId, bindings[]>` in memory
   - Grid rows cached in a `Map<gridId, rows[]>` in memory
   - Per-item lookups are O(1) in-memory (`findGridRowInCache`) — no sequential DB queries
   - mathjs evaluates the product's pricing formula with scope: CSV dimensions + resolved grid row columns + computed proxy values
6. Line items written to `order_items` with unitPrice, totalPrice, sku, exportType, pricingError if any
7. Project and order_file records created/updated

**Performance:** Fixed in r4 — reduced from 2,363+ sequential DB queries to a fixed small number of parallel bulk queries.

---

## Pricing Engine — How Formulas Work

All formulas live in `proxy_variables.formula` and are evaluated by mathjs.

**Variable scope built per line item:**

| Source | How it gets in |
|---|---|
| CSV dimensions | `height`, `width`, `depth`, `quantity` from the CSV row |
| Proxy variables | Named computed values, e.g. `sq_ft = (height * width) / 92900` |
| Grid aliases | Product bound to a grid with alias `color` → `color.base_price`, `color.upcharge`, etc. |

**Formula examples:**
```
// Panel pricing with color upcharge
(base_price + max(floor_min, sq_ft) * sq_ft_price) * (1 + color.upcharge) * (1 + margin)

// Custom cut rod/rail
(price * length_in) * (1 + margin) + price_per_cut

// Flat hardware
item.price * (1 + item.margin)
```

Comments (`//`) are stripped before evaluation. The Formula Tester page lets admins test any formula live.

---

## Output Documents & Exports

All generated from `order_items`. Routed by `exportType` field on each product.

| Export | Type Tag | Description |
|---|---|---|
| Invoice PDF | — | Priced line items + totals |
| Customer Packing Slip PDF | — | Customer-facing slip |
| Internal Packing Slip PDF | — | Internal production slip |
| ELIAS Export | `ELIAS` | Supplier-specific format |
| MJ Export | `MJ` | M&J Woodcraft format |
| ERP Export | — | Component + hardware lines |
| CTS Export | `CTS` | Cut-to-size parts list |
| Cabinet Vision .ORD | `ORD` | CNC production file (header configurable via ORD Settings page) |
| Hardware Export | `HARDWARE` | Hardware line items |
| Glass Export | `GLASS` | Glass line items |

---

## Product Images

- **Storage:** Base64 text in `image_data` column in PostgreSQL — no object storage dependency
- **List endpoints** (`getAllmoxyProducts`, `getProducts`): explicitly exclude `imageData` column — safe to call with 2,363+ products
- **Single-product endpoints** (`getProduct`, `getProductByCode`): return full record including `imageData`
- **Serve routes:** `GET /api/product-images/by-id/:id` (Allmoxy), `GET /api/product-images/hardware/by-id/:id` (hardware)
- **Bulk uploader** at `/admin/product-images`: matches uploaded filenames to products by name/SKU prefix/hardware code; client-side batching (25 files/batch) with live progress bar

---

## Integrations (All Live)

| Integration | How | What it does |
|---|---|---|
| **Asana** | OAuth via Replit Connectors | Syncs orders as tasks; auto-imports from "NEW JOBS" project; background scheduler every 5 min |
| **Outlook** | OAuth via Replit Connectors | Auto-fetches packing slip PDFs + hardware CSV attachments; polls every 30 min |
| **Google Sheets** | OAuth via Replit Connectors | Daily automated backup of all DB data at 3:00 AM; manual backup trigger available |
| **Replit Auth (OIDC)** | Built-in | Login gated by `allowed_users` table; `is_admin` flag controls destructive operations |

---

## Key Files

```
shared/schema.ts                          Single source of truth — all DB types, Drizzle tables, Zod schemas, DTO types
server/routes.ts                          All API route handlers (180+ routes, ~8,200 lines)
server/storage.ts                         DB query layer — IStorage interface + DatabaseStorage implementation
server/services/pricingEngine.ts          mathjs formula evaluator + grid resolver
server/csvHelpers.ts                      CSV parsing helpers — countPartsFromCSV, extractCTSParts, etc.
server/replit_integrations/               Asana, Outlook, Google Sheets, Auth connectors
client/src/App.tsx                        Route definitions (17 pages)
client/src/pages/OrderDetails.tsx         Order detail page — ~340 lines, sticky header + two-section layout
client/src/pages/order-detail/            9 sub-components: FileSidebar, DocumentsView, ShippingView,
                                            FileItemsTable, PdfViewer, PackingChecklistInline,
                                            HardwareChecklistInline, CtsPartsInline, PalletManager
client/src/pages/admin/AdminSettings.tsx  Consolidated 3-tab settings page (ORD Export · Output · Users)
client/src/pages/admin/                   All other admin pages
docs/MASTER_ARCHITECTURE_SPEC_v4.md       Full system specification (authoritative)
docs/BUILD_STATE.md                       This file — current build state, updated alongside CHANGELOG.md
CHANGELOG.md                              Per-release fix log
```

---

## What's Working End-to-End (as of r22)

### Upload & Pricing Pipeline
- [x] CSV upload → order items created (r4 header-aware parsing + r14 column name fix)
- [x] Allmoxy CSV column names handled: `Manuf code`, `Width(R)`, `Length(L)`, `Quantity` (r14)
- [x] Multi-file CSV upload → single project with all files merged
- [x] SKU prefix matching → product resolved per line item
- [x] mathjs pricing engine → unit price computed per line item
- [x] Proxy variables pre-computed into formula scope (r5)
- [x] Grid row cache in all three pipeline locations — O(1) in-memory lookups (r5)
- [x] Fast pipeline — no sequential DB queries (r4)
- [x] MANU_CODE grid bindings correctly use extracted SKU in both upload + reprice pipelines (r15)
- [x] `exportType` copied from matched product to `order_items` at upload time (task #8)
- [x] Duplicate product names in import CSV are deduplicated before upsert — no more constraint crash (task #24)
- [x] Checklist regeneration wired into reprice endpoint — checklists auto-update after re-price (task #2)
- [x] Comprehensive pipeline logging — `[Upload Pipeline]` / `[Reprice Pipeline]` at every step (r11)
- [x] Missing-alias diagnostic logging — logs unresolved grid aliases for first 3 matched items per upload (r16)

### Order Details (r22 Redesign)
- [x] Full-height layout — hides AppLayout top bar; own sticky `ProjectHeaderBar` with project name, status, dealer, file count, total price, actions dropdown (r22)
- [x] Two-section toggle: **Documents** and **Packing & Shipping** (r22)
- [x] `FileSidebar` — file list left panel, shown only for multi-file projects; badges show pricing status and packing progress; switches between Documents/Shipping modes (r22)
- [x] **Documents section** tabs (per selected file): Items · Invoice · Customer Slip · Internal Slip · Cabinet Vision · Elias · M&J · Hardware · Glass (r22)
- [x] **Packing & Shipping section** tabs (per selected file): Packing Checklist · Hardware Checklist · CTS Parts · Pallets (r22)
- [x] `?fileId=N` filtering supported on all 12+ data/PDF/ORD endpoints — components render per-file content (r22)
- [x] `GET /api/orders/:id/file-summary` — per-file summary (pricing/export type, item counts, total) (r22)
- [x] `GET /api/orders/:id/shipping-summary` — per-file packing/hardware/CTS progress summary (r22)
- [x] `PalletManager` — full pallet CRUD + 12-tile packaging metrics display, extracted to standalone component (r22)
- [x] `ProjectDetailsDialog` + `ProductionStatusDialog` accessible from the actions dropdown (r22)
- [x] Old `order-tabs/` directory deleted; `OrderDetails.tsx` reduced 3165 → ~340 lines (r22)
- [x] Re-run Pricing button — reprices all items, shows ✅/⚠/$0 badges per item
- [x] Regenerate Checklists button — re-runs hardware + packing checklist generation for all files (task #2)

### Admin — Products
- [x] Allmoxy Product Manager — full CRUD, per-product image upload/clear, category, formula assignment, `exportType` dropdown with auto-classify (tasks #8, #17)
- [x] `exportType` auto-classify — `POST /api/admin/products/auto-classify-export-types` classifies all active products by SKU prefix rules (task #8)
- [x] Per-product image upload in editor — click thumbnail to replace, × to clear; saves to DB immediately (task #17)
- [x] Bulk image uploader (`/admin/product-images`) — exact-match by filename-without-extension against both tables; auto-saves on upload (no separate confirm step); shows saved/unmatched results (tasks #10, #16, #23)
- [x] Product images stored as base64 `image_data` in PostgreSQL — no object storage dependency (task #23)
- [x] Product list endpoints exclude `imageData` column — no timeout with 2,363+ products (task #26)
- [x] Image serve routes: `GET /api/product-images/by-id/:id` (Allmoxy), `GET /api/product-images/hardware/by-id/:id` (hardware) (task #23)

### Admin — Grids, Formulas, Setup
- [x] Attribute Grid Manager — **multi-file CSV upload** (derives name from filename, no manual entry); **multi-select delete** with checkbox mode + "Delete X grids" confirmation (task #6)
- [x] Proxy Variable Manager — formula CRUD, live preview
- [x] Formula Tester — live sandbox with: binding status panel, searchable color/grid dropdowns (auto-select first value), better error messages, diagnostic banner
- [x] Ad-hoc grid lookups in Formula Tester — test any grid without a configured binding
- [x] Bulk formula seed — `POST /api/admin/seed-formulas` creates/updates all ~55 pricing + export proxy variables from hardcoded spec (task #9)
- [x] Auto-assign formulas & bindings — `POST /api/admin/products/auto-assign-formulas` matches every product's SKU prefix to the correct pricing/export proxy and creates grid bindings via fuzzy grid name matching (task #9)
- [x] Pricing Diagnostic page — health check stats, issue list, auto-create bindings (dry-run → confirm), Reset & Recreate
- [x] `GET /api/admin/import-readiness` — fast pre-flight check covering products, grids, bindings, proxy vars (r11)
- [x] ORD Settings page — `app_settings`-backed header template editor with `{{design_name}}` / `{{po_number}}` placeholders (tasks #1, r15)
- [x] Output Settings page — toggle `showProductImages` and `showPricing` per document type (r19)

### Sidebar & Navigation
- [x] "All Orders" (`/orders`) and "Users" (`/admin/users`) surfaced in sidebar (task #3)
- [x] Email Sync card removed from Order Processing Dashboard — controls live on All Orders page (task #3)
- [x] Sidebar simplified to 7 items — removed redundant "Order Processing" entry (r22)
- [x] `/` redirects to `/orders` (r22)
- [x] `/admin/settings` consolidated to 3-tab page: ORD Export · Output Settings · Users (r22)
- [x] `/admin/output-settings` and `/admin/users` removed as standalone routes (merged into `/admin/settings`) (r22)
- [x] Dark mode, responsive layout, sidebar navigation

### Integrations & Automation
- [x] Asana sync — background scheduler every 5 min, task creation/update, dedup
- [x] Outlook sync — background scheduler every 30 min, attachment fetch, dedup
- [x] Google Sheets backup — daily at 3 AM + manual trigger
- [x] Hardware packing checklist — check-off, timestamps, buyout tracking
- [x] Packing slip checklist
- [x] CTS parts page
- [x] Pallet management
- [x] Upload page readiness banner — green/amber pre-flight status before uploading (r11)
- [x] Upload page results summary — matched/unmatched/priced/error counts + "Go to Dashboard" (r11)
- [x] PDF page breaks — `KeepTogether` for sections ≤ 6 items across all 5 Python generators (r19)

---

## Known Gaps — Spec Defined, Not Yet Built

| Gap | Impact |
|---|---|
| `allmoxy_products` missing: `isCustomCut`, `isHardware`, `supplierName`, `active` columns | Custom-cut and hardware routing relies on manual `exportType` config instead |
| `order_items` missing: `formulaSnapshot`, `variableSnapshot`, `colorCode` | No pricing audit trail |
| `proxy_variables` missing: `description` column | Admins can't annotate what a formula does in the UI |
| `attribute_grids` missing: `displayName`, `updatedAt` columns | Grid list shows raw name only |
| `attribute_grid_rows` missing: `sortOrder` column | Grid rows appear in DB insert order only |
| Pricing audit trail | Formula + variable snapshots not stored at calculation time |

---

## Release History

### r22-hotfix — 2026-04-12
**Fix (critical):** Production blank page on `/orders/:id`. Dev worked; production showed nothing. Root causes:
1. **Missing `</ErrorBoundary>` closing tag** — the tag was accidentally omitted in the r22 commit. React render crashes were completely silent (no visible error). Created `client/src/components/ErrorBoundary.tsx` (class component, `getDerivedStateFromError` + `componentDidCatch`) and properly wrapped the entire `<Switch>` in `App.tsx` with it. Render errors now show an error message + "Reload page" button instead of a blank screen.
2. **`h-full` collapsing to 0 in production builds** — `OrderDetails` root used `h-full` inside a flex item that was not itself a flex container. In production (minified) builds, `height: 100%` on a block element inside a non-container flex item can resolve to 0. Fixed by: (a) adding `flex flex-col` to the AppLayout order-detail content wrapper, (b) replacing `h-full` with `flex-1` on the `OrderDetails` root div.

---

### r22 — 2026-04-12
**Feature:** Full Order Details page redesign. `OrderDetails.tsx` reduced from 3,165 lines to ~340 lines.
- **Sticky `ProjectHeaderBar`** — project name, status, dealer, file count, total price, Actions dropdown (Project Details · Production Status · Asana sync · Delete).
- **Two-section toggle** — **Documents** and **Packing & Shipping**, each with their own per-file tab sets.
- **`FileSidebar`** (left panel, multi-file projects only) — file list with pricing/packing progress badges; clicking a file scopes all content to that file. Hidden for single-file projects.
- **`DocumentsView`** tabs: Items · Invoice · Customer Slip · Internal Slip · Cabinet Vision · Elias · M&J · Hardware · Glass.
- **`ShippingView`** tabs: Packing Checklist · Hardware Checklist · CTS Parts · Pallets.
- **9 new components** in `client/src/pages/order-detail/`: `FileSidebar`, `DocumentsView`, `ShippingView`, `FileItemsTable`, `PdfViewer`, `PackingChecklistInline`, `HardwareChecklistInline`, `CtsPartsInline`, `PalletManager`.
- Old `client/src/pages/order-tabs/` directory deleted (10 components removed).
- `?fileId=N` query parameter added to all 12 data/PDF/ORD endpoints.
- `GET /api/orders/:id/file-summary` — per-file pricing/export-type summary.
- `GET /api/orders/:id/shipping-summary` — per-file packing/hardware/CTS progress.

**Feature:** App navigation overhaul.
- `/` now redirects to `/orders`.
- AppLayout sidebar simplified from 8 items to 7 (removed "Order Processing").
- `OrderDetails` pages bypass the AppLayout top bar and use a full-height overflow-hidden flex layout.
- `/admin/settings` consolidated into a 3-tab page: **ORD Export** · **Output Settings** · **Users**. Standalone routes `/admin/output-settings`, `/admin/users`, and `/how-it-works` removed.
- `AdminSettings.tsx` created (`client/src/pages/admin/AdminSettings.tsx`).

---

### r19 — 2026-04-05
**Fix (critical):** Removed `overflow-hidden` from outer `<div>` wrapper and `<main>` in `AppLayout.tsx` — was silently clipping the `overflow-y-auto` scroll container, preventing scroll on the Order Details page.
**Fix:** "Download .ORD" button replaced with `window.location.href` to backend endpoint — old client-side assembly code (header template fetch + groupByFile + Blob) deleted; button now uses `GET /api/orders/:id/download/ord` (multi-room format, r16).
**Added:** Output Settings page (`/admin/output-settings`) — GET/PUT endpoints + new frontend page with per-document toggle switches (showProductImages, showPricing). Settings stored as `output.<page>.<key>` in `app_settings`.
**Fixed:** PDF page break formatting — `KeepTogether` now applied for small sections (≤ 6 items) across 5 Python PDF generators. `KeepTogether` import added to elias, mj, and cts scripts.

### r18 — 2026-04-05
**Fix (critical):** `gridNameMap` construction — added sort so grids with date suffixes (the current active ones) are always written last into the map, guaranteeing they overwrite any old/empty grid that produces the same normalized key. Old `Shelves` (0 rows) can no longer shadow `Shelves 02202026` (47 rows).
**Added:** `GET /api/admin/duplicate-grids` — diagnostic endpoint listing all grids that share a base name after stripping the date suffix, with row counts, so stale/empty duplicates can be identified and deleted via the Grid Manager.

### r17 — 2026-04-05
**Fix (critical):** `findGridForAlias` — replaced single-pass `includes()` with a 3-pass priority system: (1) exact match, (2) starts-with (date suffix tolerance), (3) contains fallback. Previously `shelves` matched "Corner Shelves" before "Shelves", putting all shelves-dependent products on the wrong grid and generating zero correct bindings. After deploying: run "Reset & Recreate Bindings" on the Diagnostic page, then "Re-run Pricing" on the affected order.

### Merged Tasks (task agents, 2026-04-12)

**Task #1 — ORD Header Template & Settings Infrastructure**
Added `app_settings` table (27th DB table) with `getSetting` / `setSetting` / `getAllSettings` storage methods. Seeded default ORD `[Header]` template at startup. Added `GET/PUT /api/admin/settings/:key` endpoints. Added `generateOrdHeader()` to `ordExporter.ts`. ORD Settings page (`/admin/settings`) shows a textarea editor for the header template with `{{design_name}}` / `{{po_number}}` placeholder hints.

**Task #2 — Port Production Workflow Features**
`productsMap` is now passed to `countPartsFromCSV` in the upload handler so M&J/Richelieu door detection works correctly. Reprice endpoint now calls both checklist generators for every file after pricing. Added `GET /api/orders/:id/files` endpoint. Added `POST /api/orders/:id/regenerate-checklists` endpoint + "Regenerate Checklists" button on Order Details.

**Task #3 — Surface Features via Sidebar Navigation**
"All Orders" (`/orders`) and "Users" (`/admin/users`) added to sidebar. Page title resolver updated for both. Email Sync card removed from Order Processing Dashboard (controls live on `/orders` page).

**Task #6 — Bulk Grid Upload + Multi-Select Delete**
`POST /api/admin/upload-dynamic-grids-bulk` — accepts multiple CSV files; derives grid name from filename automatically. `DELETE /api/admin/attribute-grids/bulk` — accepts `{ ids: number[] }` and deletes all. Grid Manager left panel redesigned: multi-file dropzone (no name input), "Upload All" button with per-file results, checkbox-based selection mode with "Delete X grids" confirmation.

**Task #8 — Export Type Field**
`export_type` column added to `allmoxy_products` and `order_items`. Product Manager edit form has an "Export Type" dropdown. Product list shows colored export-type badges (ORD=blue, HARDWARE=gray, ELIAS=green, MJ=purple, CTS=orange, GLASS=cyan). `POST /api/admin/products/auto-classify-export-types` applies SKU-prefix classification rules to all active products. `export_type` is propagated from product to `order_items` at upload time.

**Task #9 — Bulk Formula Seed & Setup Wizard**
`POST /api/admin/seed-formulas` — creates or updates all ~55 pricing and export proxy variables from the hardcoded spec list; returns `{ created, updated, total }`. `POST /api/admin/products/auto-assign-formulas` — for each active product, matches its SKU prefix to the correct proxy variables and creates grid bindings via fuzzy name matching; accepts `overwrite` boolean; returns `{ formulasAssigned, bindingsCreated, skipped, errors }`.

**Task #10 — Bulk Product Image Uploader**
Initial bulk image uploader at `/admin/product-images`. Drag-and-drop multiple image files; uploads to object storage; matches by filename prefix/partial against both Allmoxy and hardware product tables; preview table with confidence badges; "Save X Image Assignments" confirm step.

**Task #11 — Internal Packing Slip PDF**
`server/scripts/generate_internal_packing_slip.py` — internal production document with rack location column (resolved from product grid bindings). `GET /api/orders/:id/pdf/internal-packing-slip` endpoint. "Internal Packing Slip" PDF iframe tab on Order Details.

**Task #12 — Cut-to-Size PDF**
`server/scripts/generate_cut_to_size.py` — PDF with "DO NOT SEND WITH JOB" header, length summary table (unique lengths × qty), item detail table (ID/Qty/Length/Buyout or Stock?/Rack Location), item totals (total mm/in/rods). `GET /api/orders/:id/pdf/cut-to-size` endpoint. "Cut-to-Size PDF" tab on Order Details, visible only when CTS items exist.

**Task #13 — M&J Shaker Door PDF**
`server/scripts/generate_mj_pdf.py` — "NETLEY 5 PIECE SHAKER JOB LIST"; Letter-size pages; sections for drawer fronts, doors, and glass (each with Supplier/Premoule label, X checkmarks, item table); no pricing. `GET /api/orders/:id/pdf/mj` endpoint. "M&J Shaker PDF" tab on Order Details visible when MJ or GLASS items exist.

**Task #16 — Bulk Image Uploader Redesign (Parallel Upload + Auto-Save)**
Rewrote bulk upload backend to: build in-memory product map first, match by exact filename-without-extension (case-insensitive) only, upload matched files to GCS in parallel batches of 10, write `image_path` to the product row in the same step. No separate confirm step. Frontend redesigned: single "Upload & Save" button, loading spinner, two-section results (Saved ✓ / Unmatched ✗).

**Task #17 — Per-Product Image Upload in Product Editor**
Image thumbnail in Allmoxy product editor is now clickable. Selecting a file uploads immediately and updates the thumbnail. A "×" button clears the image. List thumbnails update after upload via TanStack Query cache invalidation.

**Tasks #19–#22 — GCS Upload Fix Iterations**
Multiple attempts to fix GCS object storage uploads (signed URL approach, sidecar token passing, GCS client library). All failed due to broken GCS environment.

**Task #23 — Store Product Images in Database (Final Solution)**
GCS abandoned. `image_data` text column added to `allmoxy_products` (base64-encoded bytes). Both single and bulk upload routes now write base64 to `image_data` column (no GCS calls). New image serve routes: `GET /api/product-images/by-id/:id` and `GET /api/product-images/hardware/by-id/:id`. Frontend updated to use ID-based URLs. `image_path` retained as filename reference only.

**Task #24 — Fix CSV Import Crash on Duplicate Product Names**
After building `productsToInsert` from the CSV rows, a `Map<name, ...>` deduplication step now runs before the upsert — last occurrence of any duplicate name wins. Eliminates the "ON CONFLICT DO UPDATE command cannot affect a row a second time" PostgreSQL crash.

**Task #26 — Fix Product List — Stop Sending Image Data**
`getAllmoxyProducts()` and `getProducts()` in `server/storage.ts` now explicitly select all columns except `imageData` using Drizzle's column selection syntax. Eliminates the multi-hundred-MB response that caused page timeouts after all 2,363 product images were stored in DB.

---

### r21 — 2026-04-05
**Feature:** ORD format overhaul — `GET /api/orders/:id/download/ord` rewritten. One `.ord` file per CSV file; single file → single `.ord` download, multiple files → ZIP (via `archiver`). Each `.ord` has its own `[Header]` populated from the stored template using that file's PO number. Standard 8-field cabinet lines (`1,"SKU",W,H,D,"hinge","type",QTY`), entry number always `1`, no `[Walls]` section, `\r\n` line endings. OrdTab button updates to "Download ORD Files (.ZIP)" or "Download .ORD" based on `downloadFormat` field from `/data/ord` endpoint.

### r16 — 2026-04-05
**Feature:** Cabinet Vision ORD — initial multi-room implementation (later superseded by r21). One combined `.ord` file with `[Header]`, `[Walls]`, 18-field extended cabinet lines (room number in field 14), global sequential entry numbers, `Note=` banding.
**Feature:** `/data/ord` now returns room-grouped structure `{ projectName, rooms[], totalItems, total }` instead of flat `items[]` + `assembledOrdText`.
**Feature:** OrdTab redesigned — room-labelled sections, "Multi-Room" badge, download via server-side endpoint, removed raw text preview.
**Feature:** Missing-alias diagnostic logging in upload handler — logs unresolved formula aliases with binding list for the first 3 matched items per upload.
**Fix:** Scrolling hardened — added `min-height: 100vh; overflow-y: auto` to `html, body, #root` in `index.css`.

### r15 — 2026-04-05
**Fix:** Page scrolling — `h-full` on the `max-w-7xl` content wrapper in `AppLayout.tsx` was capping the scrollable area to exactly the viewport height, preventing `overflow-y-auto` from ever activating. Changed to `min-h-full`; moved `p-8` inside the wrapper.
**Fix:** `DEFAULT_ORD_HEADER_TEMPLATE` updated with quoted values and `Customer`/`Address1` fields for Cabinet Vision compatibility.
**Fix:** `/api/orders/:id/data/ord` now filters to `exportType === 'ORD'` items only and prepends the generated `[Header]` block to `assembledOrdText`. Cabinet Vision tab download now produces a fully-formed `.ord` file.
**Added:** `GET /api/orders/:id/download/ord` — server-side file download endpoint returning the assembled `.ord` file as an attachment.
**Fix:** MANU_CODE grid bindings — when `lookupColumn` contains `"manu"`, the pipeline now uses the already-extracted SKU string instead of attempting to look up a non-existent `item['MANU_CODE']` CSV column. Applied to both upload and reprice pipelines. Also added `item['COLOR']` uppercase fallback in color resolution chain.

### r14 — 2026-04-03
**Fix (critical):** CSV column name mismatch — `Manuf code` (lowercase 'c') was not matched by any SKU extraction variant, causing `if (!sku) continue` to skip every row and produce zero order items on every upload. Also fixed `Width(R)`, `Length(L)`, `Quantity` column names for dimensions. Applied across all 3 pipeline locations (upload handler, reprice route, Asana scheduler).
**Fix:** Color binding `lookupColumn` changed from `'Material'` → `'Color'` in auto-create-bindings to match actual CSV column name. Per-pipeline fallback was already handling this correctly.
**Fix:** Description field now falls back to `item['Manuf code']` when NAME/Part Name/Description absent.
**Added:** `GET /api/test/order-check/:id` — diagnostic endpoint returning item count, sample items with prices, total price, and error count for quick post-upload verification.

### r13 — 2026-04-03
**Feature:** 6 new JSON data endpoints — `/api/orders/:id/data/{invoice,elias,mj,hardware,glass,ord}` — serve structured JSON for order output data consumed by tab components.
**Refactor:** Order Details page fully redesigned with a persistent 12-tab layout. Replaced "Pricing & Export" and "Output Documents" collapsibles (~560 lines removed) with a `<Tabs>` bar. Overview tab holds all management sections; each output format has its own dedicated tab. 10 new self-contained tab components created in `client/src/pages/order-tabs/`.
**Cleanup:** Removed `pricingOpen`, `outputDocsOpen`, `activeOutputTab`, `fileFilter` states and lazy export queries from `OrderDetails.tsx`; `fileFilter` now managed inside `AllItemsTab`.

### r12 — 2026-04-03
**Fix (critical):** Console log flood — `evaluatePrice()` was calling `console.log` twice per item (formula text + full JSON scope), burying `[Upload Pipeline]` checkpoints in thousands of lines on large CSVs. Removed both per-item logs; simplified catch block to single `[PricingEngine] FAILED SKU="X": msg` line. Removed per-item match log from upload handler inner loop.
**Feature:** Pipeline complete summary — 5-line block logged after `savedItems` is fetched: PIPELINE COMPLETE / Project id+name / Files processed / Total order items / Total price.
**Feature:** Per-file filter on Order Details items table — pill buttons above table when project has >1 file; filters `orderItems` by `fileId`; summary row switches between "File Subtotal" and "Grand Total" and shows parenthetical order total when filtered.
**Feature:** "Output Documents" collapsible card on Order Details — tabbed section with inline PDF viewers (`<iframe>`) for Invoice, Packing Slips, CTS, Elias PDF, M&J PDF; lazily-fetched CSV code blocks for Elias, M&J, ERP exports; ORD assembled from items in-memory; Hardware/Glass filtered item tables. Only tabs with content shown. Each tab has a Download button.
**Docs:** Added 3-line comment to `POST /api/admin/products/bulk-upload-images` documenting intentional DB/base64 storage strategy (GCS unavailable).

### r11 — 2026-03-30
**Feature:** `GET /api/admin/import-readiness` — fast pre-flight health check returning: products (total/active/withSkuPrefix/withPricing/withExport), grids (count/totalRows/names), bindings (total/productsWithBindings), proxyVariables (total/pricing/export), `ready: bool`, `issues: string[]`.
**Feature:** Upload page readiness banner — fetches import-readiness on load; shows amber warning with bullet-pointed issues when `ready === false`; shows green confirmation when ready. Includes counts of products with pricing and bindings.
**Feature:** Upload page results summary — after successful upload, shows project name, total items processed, SKU matches, unmatched SKUs, pricing success count, pricing errors, total price. Replaced auto-redirect with explicit "Go to Dashboard" button.
**Logging:** `[Upload Pipeline]` logs added at 6 checkpoints in the upload handler: pre-load totals (products/bindings/grids/proxy vars + ⚠ if zero), header row detection (index + columns or 5-row debug dump), data rows parsed (first item MANU_CODE + Material), per-item SKU match/no-match (first 5 no-matches shown), pricing error (first 3 shown), per-file summary (parsed/matched/no-match/success/error/batch size), batch insert confirmation.
**Logging:** `[Reprice Pipeline]` logs added with the same structure in the reprice route.
**Refactor:** `useUploadOrder` no longer auto-redirects on success — navigation handled by the component after the results summary is shown.

### r10b — 2026-03-29
**Fix (critical):** Grid name matching bug in `auto-create-bindings` endpoint — alias patterns like `main_color_attribute` were failing to match grid names with spaces (`Main Color Attribute 02202026`), causing the `color` alias to fall through to `mj_colors` (wrong grid). Fixed by storing 4 normalized variants per grid in `gridNameMap` and normalizing both sides to underscores before `includes()` comparison. Also fixed date-suffix stripping regex to handle space-separated dates.
**Feature:** `reset: true` parameter on auto-create-bindings — deletes all existing auto-created bindings (by known alias list) before recreating fresh. Clears ~1,790 wrong bindings from previous broken runs.
**Feature:** Wrong-grid detection in pricing diagnostic — explicitly flags `color` bindings pointing to MJ Colors grid as errors.
**Feature:** "Reset & Recreate Bindings" (destructive red) button on Pricing Diagnostic page — runs delete + recreate in one shot, shows deleted/created counts.

### r10 — 2026-03-28
**Feature:** Formula Tester auto-select — non-MANU grid bindings (color, material, etc.) now auto-select the first available row key when a product is chosen; `autoSelect` prop added to `GridRowCombobox`.
**Feature:** Formula Tester diagnostic banner — on page load, fetches pricing diagnostic stats; shows amber warning when `withPricingProxy` or `withBindings` is 0, with link to Diagnostic page.

### r9 — 2026-03-28
**Feature:** `GET /api/admin/pricing-diagnostic` — full health check across all active products; returns stats (6+4 cards) + per-product issue list (severity: error/warning) + formula-alias cross-reference.
**Feature:** `POST /api/admin/auto-create-bindings` (with `dryRun` support) — analyzes product pricing/export formulas for alias refs, maps to grids via `aliasToGridPatterns` dictionary (50+ patterns), creates missing `ProductGridBinding` rows. Color-type aliases use `lookupColumn: 'Material'`; all others use `MANU_CODE`. Idempotent.
**Feature:** Pricing Diagnostic page (`/admin/diagnostic`) — stats grid, severity-filtered issue table, dry-run → confirm binding creation flow with sample table + skipped list collapsibles.
**Feature:** Formula Tester binding status panel — shows ✅/❌ per alias referenced in pricing formula vs. bound grids; `formatPricingError()` parses "Undefined symbol" errors with contextual guidance.
**Nav:** "Pricing Diagnostic" added to admin sidebar (Zap icon).

### r8 — 2026-03-26
**Fix (Bug 2):** Non-MANU bindings in formula-test endpoint incorrectly used `autoValue = skuPrefix`; changed to empty string so the grid lookup uses the user-supplied `gridLookups[alias]` value.
**Fix (Bug 3):** Case-insensitive fallback column matching added to `findGridRowInCache` in all three pipeline locations (upload, reprice, Asana scheduler) — `divider_panels.BASE_PRICE` now resolves when formula says `divider_panels.base_price`.
**Fix (Bug 4):** Batch insert for order items — `createOrderItemsBatch()` added to storage interface + implementation; all three pipeline locations now accumulate items in an array and bulk-insert after the loop instead of one-by-one.
**Fix (Bug 5):** Replaced all inline `Object.fromEntries(Object.entries(rawData).map(...))` with `gridRowToScope()` helper — normalizes all rowData keys to lowercase AND coerces numeric strings to numbers.
**Feature:** `gridRowToScope()` helper added to `pricingEngine.ts`.
**Feature:** Formula Tester combobox for non-MANU bindings — `GridRowCombobox` component uses `GET /api/admin/attribute-grids/:id/row-keys` endpoint; replaces free-text input with searchable popover dropdown; ad-hoc lookups also use it.

### r6 — 2026-03-21
**Fix:** `stripComments` now collapses internal whitespace — multi-line formulas with newlines before `?` or branches no longer throw "Syntax error (char N)"
**Feature:** Formula Tester "Grid Lookup Overrides" — per-binding inputs for non-SKU lookup columns (color, material, etc.); auto-resolved bindings show read-only pill; `gridLookups` sent separately from `inputs` in request body

### r5 — 2026-03-21

**Prompt 1 — Grid row cache in all three pipeline locations**
- `findGridRowInCache` + `gridRowsCache` added to reprice route and Asana scheduler (was only in upload handler)
- Per-product `getProductGridBindings` sequential loops replaced with `getAllProductGridBindings()` bulk fetch + `Promise.all` in both locations
- All three locations now lowercase `binding.alias` and all rowData column keys when building `contextScope` — fixes alias lookup mismatches like `Parts` vs `parts`
- Asana scheduler `createOrderItem` now stores normalized numeric dimensions from `pricingItem` instead of raw CSV strings

**Prompt 2 — Proxy variable values pre-computed into formula scope**
- `evaluatePrice` in `pricingEngine.ts` accepts an optional 4th arg `allProxyVars: Array<{name, formula}>`
- Before evaluating the main formula, every proxy variable is evaluated in order and its result added to the mathjs scope — so formulas can reference `sq_ft`, `margin`, and other named proxy vars by name
- Errors re-thrown instead of silently returning `0` — callers' existing `try/catch` blocks populate `pricingError`; Formula Tester UI shows them in a red box (already existed)
- All callers pass `[...proxyVarMap.values()]` as the 4th argument: upload handler, reprice route, Asana scheduler, formula tester endpoint
- Full scope JSON logged to console before each evaluation; formula + scope logged on error

### r4 — 2026-03-21

**Task #26 — Fix product list timeout**
- Added `AllmoxyProductListItem` and `ProductListItem` DTO types (`Omit<..., 'imageData'>`) to `shared/schema.ts`
- Rewrote `getAllmoxyProducts()` and `getProducts()` in `server/storage.ts` with explicit Drizzle column projection excluding `imageData`
- Updated `IStorage` interface return types to match
- No forced type casts — Drizzle infers correctly from the column selection
- Eliminates hundreds-of-MB responses that were crashing the browser and timing out the Products page and Formula Tester

**Task #25 — Fix zero order_items bug + pipeline performance**
- Fixed header-aware CSV parsing: scans `pf.records` for the `"manuf"` header row instead of treating the metadata preamble as headers
- Added `getAllProductGridBindings()` — one bulk SELECT replacing 2,363+ sequential per-product queries
- Pre-load now runs 4 table fetches in parallel via `Promise.all`
- `findGridRowInCache` in-memory arrow function replaces per-item DB calls for grid row lookups

**Task #24 — Allmoxy product import deduplication**
- CSV rows are deduplicated by name (last row wins) before the database upsert call
- Eliminates "ON CONFLICT DO UPDATE command cannot affect a row a second time" crash on duplicate-name CSVs

**Task #23 — Allmoxy product import upsert**
- Re-importing no longer crashes on duplicate names or wipes proxy assignments, images, or SKU prefixes
- New products inserted; existing products updated (exportType, supplyType, categoryId, proxy IDs); admin-configured fields preserved; products absent from CSV left untouched
