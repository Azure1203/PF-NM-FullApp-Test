# Perfect Fit Closets / Netley Millwork — Order Management System
## Build State Reference
> Last updated: 2026-03-29 (r10b) · React + Express + PostgreSQL on Replit

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
| Backend | Express.js + TypeScript (tsx), 156+ REST API routes (6,934 lines) |
| Database | PostgreSQL + Drizzle ORM — 26 tables, schema in `shared/schema.ts` |
| Pricing Engine | mathjs formula evaluator (`server/services/pricingEngine.ts`) |
| Auth | Replit OIDC — single user, gated by `allowed_users` table + `is_admin` flag |

---

## All 16 Pages (Routes)

| URL | Page | Purpose |
|---|---|---|
| `/` | Order Processing Dashboard | Daily workflow hub — drag-and-drop, Asana sync, status overview |
| `/orders` | Dashboard | Full order list with filters |
| `/orders/:id` | Order Details | Line-item table, pricing, all export downloads |
| `/upload` | Upload Order | CSV drag-and-drop upload |
| `/products` | Hardware Products | Internal hardware catalog |
| `/products/import` | Hardware Import | Import hardware CSV |
| `/products/import-components` | Component Import | Import component CSV |
| `/files/:fileId/cts` | Cut to Size | CTS part list for a file |
| `/files/:fileId/checklist` | Packing Checklist | Packing slip check-off UI |
| `/files/:fileId/hardware-checklist` | Hardware Checklist | Hardware packing check-off UI |
| `/admin/allmoxy-products` | Allmoxy Product Manager | Full CRUD for products, images, category, formula assignments |
| `/admin/attribute-grids` | Attribute Grid Manager | Import grids from CSV, edit rows, manage product-grid bindings |
| `/admin/proxy-variables` | Proxy Variable Manager | Create/edit/delete formula variables, live preview |
| `/admin/formula-tester` | Formula Tester | Test any formula with a custom scope, live result — binding status panel, better error messages |
| `/admin/product-images` | Bulk Image Uploader | Match + upload images to products by filename (batched, progress bar) |
| `/admin/diagnostic` | Pricing Diagnostic | Health check: stats, issue list, auto-create missing grid bindings |
| `/admin/settings` | ORD Settings | Cabinet Vision header template configuration |
| `/admin/users` | Admin Users | Allowed-users whitelist management |
| `/how-it-works` | How It Works | Internal documentation page |

---

## Database — 26 Tables

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
shared/schema.ts                    Single source of truth — all DB types, Drizzle tables, Zod schemas, DTO types
server/routes.ts                    All API route handlers (156+ routes, 6,934 lines)
server/storage.ts                   DB query layer — IStorage interface + DatabaseStorage implementation (1,041 lines)
server/services/pricingEngine.ts    mathjs formula evaluator + grid resolver
server/csvHelpers.ts                CSV parsing helpers — countPartsFromCSV, extractCTSParts, etc.
server/replit_integrations/         Asana, Outlook, Google Sheets, Auth connectors
client/src/App.tsx                  Route definitions (16 pages)
client/src/pages/                   All page components
client/src/pages/admin/             Admin-only pages
docs/MASTER_ARCHITECTURE_SPEC_v4.md Full system specification (authoritative)
docs/BUILD_STATE.md                 This file — current build state, updated alongside CHANGELOG.md
CHANGELOG.md                        Per-release fix log
```

---

## What's Working End-to-End (as of r10b)

- [x] CSV upload → order items created (fixed r4 — header-aware parsing)
- [x] Multi-file CSV upload → single project with all files merged
- [x] SKU prefix matching → product resolved per line item
- [x] mathjs pricing engine → unit price computed per line item
- [x] Proxy variables pre-computed into formula scope (r5)
- [x] Grid row cache in all three pipeline locations — O(1) in-memory lookups (r5)
- [x] Fast pipeline — no sequential DB queries (fixed r4)
- [x] All output documents downloadable from Order Details page
- [x] Re-run Pricing button on Order Details — reprices all items, shows ✅/⚠/$0 badges per item
- [x] Allmoxy Product Manager — full CRUD, image upload/clear, category, formula assignment
- [x] Attribute Grid Manager — CSV import, row editing, product binding management (Rows + Bindings tabs)
- [x] Proxy Variable Manager — formula CRUD, live preview
- [x] Formula Tester — live sandbox with: binding status panel, searchable color/grid dropdowns (auto-select first value), better error messages, diagnostic banner
- [x] Ad-hoc grid lookups in Formula Tester — test any grid without a configured binding
- [x] Bulk image uploader — matches 2,363 products by filename, batched with progress
- [x] Product list endpoints — no `imageData` in list queries (fixed r4 — no more timeout)
- [x] Asana sync — background scheduler, task creation/update, dedup
- [x] Outlook sync — background scheduler, attachment fetch, dedup
- [x] Google Sheets backup — daily at 3 AM + manual trigger
- [x] Hardware packing checklist — check-off, timestamps, buyout tracking
- [x] Packing slip checklist
- [x] CTS parts page
- [x] Pallet management
- [x] Dark mode, responsive layout, sidebar navigation
- [x] Pricing Diagnostic page — health check stats, issue list, auto-create bindings (dry-run → confirm), Reset & Recreate (fixes wrong-grid bindings)

---

## Known Gaps — Spec Defined, Not Yet Built

| Gap | Impact |
|---|---|
| `allmoxy_products` missing: `isCustomCut`, `isHardware`, `supplierName`, `active` columns | Custom-cut and hardware routing relies on manual `exportType` config instead |
| `order_items` missing: `formulaSnapshot`, `variableSnapshot`, `ordExportBlock`, `erpExportRow`, `colorCode` | No pricing audit trail; Cabinet Vision .ORD assembler blocked on `ordExportBlock` |
| `proxy_variables` missing: `description` column | Admins can't annotate what a formula does in the UI |
| `attribute_grids` missing: `displayName`, `updatedAt` columns | Grid list shows raw name only |
| `attribute_grid_rows` missing: `sortOrder` column | Grid rows appear in DB insert order only |
| Cabinet Vision .ORD final assembler | The per-line `ordExportBlock` column doesn't exist yet; final .ORD download is blocked |
| Pricing audit trail | Formula + variable snapshots not stored at calculation time |

---

## Release History

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
