# CHANGELOG — Perfect Fit Closets / Netley Millwork Order Management System
> Replit full-stack app · React + Express + PostgreSQL
> Last updated: 2026-03-29 (r10b)

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
