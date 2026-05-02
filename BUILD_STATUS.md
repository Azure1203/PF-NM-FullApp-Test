# BUILD_STATUS.md — Perfect Fit Closets / Netley Millwork Order Management System

> **Living document.** Updated automatically with every meaningful change.
> For an outside developer or AI: read this file first. It is the single source of truth for the current state of the application.

---

## 1. App Overview

This is a production-ready internal order management dashboard built for **Netley Millwork / Perfect Fit Closets**, replacing their legacy Allmoxy system. Shop staff upload CSV order exports, the app prices every line item using SKU-matched formulas evaluated against attribute lookup grids, and then generates all downstream outputs: Cabinet Vision `.ORD` files, ELIAS dovetail PDFs, M&J Shaker door job lists, hardware/glass manifests, cut-to-size sheets, packing checklists, and invoices. Orders sync bidirectionally with Asana for production tracking, and inbound packing-slip PDFs are ingested automatically via AgentMail. The tech stack is **React 18 + TypeScript (Vite)** on the frontend, **Express.js + TypeScript** on the backend, and **PostgreSQL with Drizzle ORM** for persistence, all running on Replit.

**Current stage:** Production-ready / actively deployed.

---

## 2. Current Build Snapshot

| Field | Value |
|---|---|
| **Last updated** | 2026-05-02 19:00 UTC |
| **Current release** | r25 |
| **Active branch** | main (Replit managed) |
| **How to run (dev)** | `npm run dev` → starts Express + Vite on port 5000 |
| **Entry point (backend)** | `server/index.ts` |
| **Entry point (frontend)** | `client/src/main.tsx` |
| **Database** | PostgreSQL via `DATABASE_URL` env var |
| **Auth** | Replit OpenID Connect (`REPL_IDENTITY` / `WEB_REPL_RENEWAL`) |

### Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| react | ^18.3.1 | Frontend UI |
| express | ^4.21.2 | Backend HTTP server |
| drizzle-orm | ^0.39.3 | ORM + query builder |
| drizzle-kit | ^0.31.8 | Schema migrations |
| drizzle-zod | ^0.7.0 | Zod schema generation from Drizzle tables |
| @tanstack/react-query | ^5.60.5 | Server state / data fetching |
| wouter | ^3.3.5 | Client-side routing |
| mathjs | ^15.1.1 | Pricing formula evaluation |
| zod | ^3.24.2 | Runtime validation |
| vite | ^7.3.0 | Frontend build tool |
| tsx | ^4.21.0 | Backend TypeScript runner |
| tailwindcss | ^3.4.17 | Utility CSS |
| shadcn/ui (Radix UI) | various | Component library |
| asana | ^3.1.5 | Asana API client |
| @microsoft/microsoft-graph-client | ^3.0.7 | Retained as dependency; Outlook integration removed |
| googleapis | ^148.0.0 | Google Sheets / Drive backup |
| archiver | ^7.0.1 | ZIP generation for multi-file ORD downloads |
| exceljs | ^4.4.0 | Hardware XLSX export |
| pdf-lib / pdfjs-dist | ^1.17.1 / ^5.4.530 | PDF generation and parsing |
| multer | ^2.0.2 | File upload handling |
| csv-parse | ^6.1.0 | CSV parsing |
| papaparse | ^5.5.3 | Client-side CSV parsing |

---

## 3. File & Folder Structure

```
project root
├── BUILD_STATUS.md              ← This file (living build state)
├── CHANGELOG.md                 ← Full reverse-chronological change log (r1–r25)
├── ORDER_PROCESS_GUIDE.md       ← End-to-end guide for shop staff
├── replit.md                    ← Replit-specific notes + architecture pointer
├── package.json                 ← Scripts and all dependencies
├── tsconfig.json                ← TypeScript config (shared paths)
├── vite.config.ts               ← Vite config (aliases, plugins)
├── tailwind.config.ts           ← Tailwind theme + dark mode config
├── drizzle.config.ts            ← Drizzle Kit migration config
├── components.json              ← shadcn/ui component registry
│
├── shared/
│   ├── schema.ts                ← All 23 Drizzle table definitions + Zod insert schemas + TS types
│   ├── routes.ts                ← Shared route path constants
│   └── models/
│       └── auth.ts              ← Replit Auth user/session model
│
├── server/
│   ├── index.ts                 ← Express app entry point; starts schedulers after server boot
│   ├── routes.ts                ← All ~130 API route handlers (8,376 lines)
│   ├── storage.ts               ← IStorage interface + DatabaseStorage class (all DB CRUD)
│   ├── db.ts                    ← Drizzle/pg connection pool
│   ├── static.ts                ← Production static file serving
│   ├── vite.ts                  ← Vite dev-server middleware (dev only)
│   ├── csvHelpers.ts            ← CSV parsing utilities (normalise columns, extract metadata)
│   ├── backfillMigration.ts     ← One-time startup migration for legacy order files
│   ├── googleSheets.ts          ← Google Sheets / Drive OAuth client factory
│   ├── backupScheduler.ts       ← Daily 3 AM Google Sheets backup scheduler
│   ├── agentmail.ts             ← AgentMail API client (inbound email ingestion)
│   ├── agentmailScheduler.ts    ← AgentMail polling scheduler (every 30 min); uses processed_outlook_emails table for dedup
│   ├── asanaNotes.ts            ← Asana task note sync helpers
│   ├── asanaNotesScheduler.ts   ← Asana notes scheduler (first run 5 min, then 24 h)
│   ├── asanaImportScheduler.ts  ← Asana "READY TO IMPORT" polling (every 10 min)
│   ├── lib/
│   │   └── asana.ts             ← Asana OAuth token helper
│   ├── services/
│   │   ├── pricingEngine.ts     ← mathjs formula evaluator; gridRowToScope + sanitizeDigitAccessors
│   │   ├── ordExporter.ts       ← Cabinet Vision .ORD file builder + header template engine
│   │   └── pdfGenerator.ts      ← PDF generation orchestration
│   └── replit_integrations/
│       ├── auth/                ← Replit OpenID Connect auth middleware + session storage
│       └── object_storage/      ← Replit Object Storage client + ACL routes
│
├── client/src/
│   ├── main.tsx                 ← React entry point
│   ├── App.tsx                  ← Router (16 routes) + auth guard + ErrorBoundary
│   ├── index.css                ← Tailwind base + CSS custom properties (light/dark theme vars)
│   ├── components/
│   │   ├── AppLayout.tsx        ← Sidebar + top header shell; 7-item nav
│   │   ├── ErrorBoundary.tsx    ← React class error boundary (catches render crashes)
│   │   ├── FileUpload.tsx       ← Drag-and-drop CSV upload component
│   │   ├── HardwareCsvUploadSection.tsx  ← Hardware CSV upload with auto-checklist generation
│   │   ├── HardwarePackingChecklist.tsx  ← Interactive hardware checklist component
│   │   ├── ObjectUploader.tsx   ← Generic object storage upload wrapper
│   │   ├── PackingSlipChecklist.tsx  ← Interactive packing checklist component
│   │   ├── PageHeader.tsx       ← Reusable page title + subtitle header
│   │   ├── PrinterSettings.tsx  ← QZ Tray printer configuration
│   │   └── StatusBadge.tsx      ← Order status pill badge
│   ├── hooks/
│   │   ├── use-admin.ts         ← Admin role check hook
│   │   ├── use-auth.ts          ← Auth state hook (Replit OIDC)
│   │   ├── use-mobile.tsx       ← Mobile breakpoint hook
│   │   ├── use-orders.ts        ← Orders data hook
│   │   ├── use-toast.ts         ← Toast notification hook
│   │   └── use-upload.ts        ← File upload state hook
│   ├── lib/
│   │   ├── auth-utils.ts        ← Auth helper utilities
│   │   ├── queryClient.ts       ← TanStack Query client + apiRequest helper
│   │   ├── qzTray.ts            ← QZ Tray label printer integration
│   │   └── utils.ts             ← cn() and other utilities
│   └── pages/
│       ├── Dashboard.tsx        ← /orders — order list + AgentMail/Asana sync controls
│       ├── OrderDetails.tsx     ← /orders/:id — two-panel order view (FileSidebar + Documents/Shipping)
│       ├── UploadOrder.tsx      ← /upload — CSV order upload flow
│       ├── Products.tsx         ← /products — hardware/component product catalog
│       ├── HardwareImport.tsx   ← /products/import — bulk hardware CSV import
│       ├── ComponentImport.tsx  ← /products/import-components — component CSV import
│       ├── CutToSize.tsx        ← /files/:fileId/cts — CTS parts cutting checklist
│       ├── PackingChecklist.tsx ← /files/:fileId/checklist — packing slip checklist
│       ├── HardwareChecklist.tsx← /files/:fileId/hardware-checklist — hardware packing checklist
│       ├── HowItWorks.tsx       ← /how-it-works — system documentation page
│       ├── Landing.tsx          ← Unauthenticated landing/login page
│       ├── not-found.tsx        ← 404 page
│       ├── order-detail/        ← Components used exclusively within OrderDetails
│       │   ├── FileSidebar.tsx       ← Left panel file list (Documents / Shipping mode)
│       │   ├── DocumentsView.tsx     ← Per-file tab bar: Items, Invoice, PDFs, exports
│       │   ├── ShippingView.tsx      ← Per-file shipping card with checklist/CTS/pallet links
│       │   ├── FileItemsTable.tsx    ← Per-file order items table with pricing badges
│       │   ├── PdfViewer.tsx         ← Reusable PDF iframe + download button
│       │   └── PalletManager.tsx     ← Pallet CRUD + 16-metric packaging dashboard
│       └── admin/
│           ├── AdminSettings.tsx     ← /admin/settings — 3-tab: ORD Export, Output Settings, Users
│           ├── AllmoxyProductManager.tsx ← /admin/allmoxy-products — product catalog editor
│           ├── DynamicGridManager.tsx    ← /admin/attribute-grids — attribute grid CRUD + bulk upload
│           ├── ProxyVariableManager.tsx  ← /admin/proxy-variables — formula/proxy variable editor
│           ├── FormulaTester.tsx         ← /admin/formula-tester — live pricing formula debugger
│           ├── ProductImageUploader.tsx  ← /admin/product-images — bulk image upload + auto-match
│           ├── PricingDiagnostic.tsx     ← /admin/diagnostic — pricing health + fix missing proxies
│           ├── OrdSettings.tsx           ← ORD header template settings (tab within AdminSettings)
│           └── OutputSettings.tsx        ← Output document toggles (tab within AdminSettings)
│
├── migrations/                  ← Drizzle migration SQL files (0000–0007)
├── docs/
│   ├── MASTER_ARCHITECTURE_SPEC_v4.md  ← Authoritative system specification
│   └── BUILD_STATE.md                  ← Previous build state snapshot (superseded by this file)
├── attached_assets/             ← Historical prompt files (r8–r24 build notes)
└── script/
    └── build.ts                 ← Production build script (esbuild backend + Vite frontend)
```

---

## 4. Feature Status

### Core Order Flow

| Feature | Status | Notes |
|---|---|---|
| CSV upload + parsing | ✅ Done | Multi-file projects; extracts metadata, CTS parts, dimensions |
| SKU → product matching | ✅ Done | Longest-prefix-wins; `matchProductToSku()` in routes.ts |
| Pricing formula evaluation | ✅ Done | mathjs + proxy variables + JSONB attribute grid lookups; digit-starting column names sanitized (r25) |
| Re-price button | ✅ Done | `POST /api/orders/:id/reprice`; regenerates checklists after repricing |
| Asana task sync | ✅ Done | Bidirectional; creates + updates tasks; reads PF ORDER STATUS, PRODUCTION STATUS, section |
| Asana auto-import | ✅ Done | Polls "READY TO IMPORT" section every 10 min; dedup via `processed_asana_tasks` |
| AgentMail PDF ingestion | ✅ Done | Polls every 30 min; matches PDFs to order files by job number; dedup via `processed_outlook_emails` |
| Outlook integration | ❌ Removed | Removed in r25; AgentMail is the sole email ingestion method |

### Export Documents

| Feature | Status | Notes |
|---|---|---|
| Cabinet Vision .ORD download | ✅ Done | One `.ord` per CSV file; multi-file → ZIP; 8-field standard format |
| Invoice PDF | ✅ Done | Per-file or full project |
| Customer packing slip PDF | ✅ Done | |
| Internal packing slip PDF | ✅ Done | No pricing; rack location column |
| ELIAS dovetail PDF | ✅ Done | |
| M&J Shaker door job list PDF | ✅ Done | Per-section: drawer front / door / glass layouts |
| Cut-to-size PDF | ✅ Done | Length summary + item detail + totals |
| Hardware CSV download | ✅ Done | Per-file or full project |
| Hardware XLSX download | ✅ Done | Bold headers, currency format, totals row (exceljs) |
| Glass items export | ✅ Done | Separate data endpoint; included in M&J PDF glass section |

### Checklists & Packing

| Feature | Status | Notes |
|---|---|---|
| Packing slip checklist | ✅ Done | Generated from order CSV (not PDF); items checked off by staff |
| Hardware checklist | ✅ Done | Generated from hardware CSV; buyout/BO status tracking |
| Cut-to-size checklist | ✅ Done | Mark individual rod cuts as done |
| Pallet manager | ✅ Done | Pallet CRUD; 16-metric packaging dashboard; file assignments; final size for Asana |

### Admin & Configuration

| Feature | Status | Notes |
|---|---|---|
| Attribute grid manager | ✅ Done | Bulk CSV upload; multi-select delete; per-row editing |
| Proxy variable (formula) manager | ✅ Done | CRUD; bulk import; type: PRICE / EXPORT |
| Allmoxy product manager | ✅ Done | Full CRUD; SKU prefix; pricing/export proxy; grid bindings; per-product images |
| Formula tester | ✅ Done | Live evaluation with scope inspector; auto-detect digit-prefix columns |
| Pricing diagnostic | ✅ Done | Coverage stats; "Fix Missing Proxy Assignments" tool; "Auto-Create Missing Bindings" |
| Bulk product image uploader | ✅ Done | Filename-exact matching; parallel upload; images stored as base64 in DB |
| Per-product image upload | ✅ Done | Click thumbnail in editor to replace; DELETE to clear |
| Export type auto-classifier | ✅ Done | 7-rule priority: CTS→ELIAS→MJ→GLASS→HARDWARE→ORD→NONE |
| Auto-assign pricing formulas | ✅ Done | Fuzzy SKU-prefix matching; also creates grid bindings |
| ORD header template | ✅ Done | `{{design_name}}` / `{{po_number}}` placeholders; stored in `app_settings` |
| Output settings toggles | ✅ Done | Per-document image/pricing visibility flags |
| Allowed users whitelist | ✅ Done | Admin role toggle; blocks non-whitelisted Replit users |
| Google Sheets backup | ✅ Done | Daily 3 AM auto-backup + manual trigger; all 23 tables |

### Integrations

| Feature | Status | Notes |
|---|---|---|
| Replit Auth (OIDC) | ✅ Done | Session-based; allowed-users whitelist; admin role |
| Asana | ✅ Done | OAuth via Replit Connectors; import + sync + notes |
| AgentMail | ✅ Done | API key via `AGENTMAIL_API_KEY` env var |
| Google Sheets / Drive | ✅ Done | OAuth via Replit Connectors |
| Replit Object Storage | ✅ Done | Used for CTS part config images, packing slip PDFs |
| QZ Tray label printing | ✅ Done | Certificate + signing endpoints; client-side printer settings |
| Outlook | ❌ Removed | Removed r25; files deleted, scheduler gone, routes removed |

---

## 5. Database Tables

All 23 tables defined in `shared/schema.ts`. PostgreSQL via Drizzle ORM.

| Table | Purpose |
|---|---|
| `projects` | Top-level order record (one per customer job); maps to Asana task |
| `order_files` | Individual CSV files within a project (one per room/closet) |
| `order_items` | Parsed line items from CSVs; holds pricing results and export text |
| `cts_parts` | Cut-to-size rod parts extracted per file |
| `cts_part_configs` | Shared image + rack location per CTS part type |
| `pallets` | Packaging pallets assigned to a project |
| `pallet_file_assignments` | Many-to-many: which CSV files are on which pallet |
| `packing_slip_items` | Checklist items generated from order CSV data |
| `hardware_checklist_items` | Checklist items from hardware CSV; buyout/packed tracking |
| `products` | Internal hardware/component product catalog |
| `product_categories` | Product category tags |
| `allmoxy_products` | Allmoxy product definitions: SKU prefix, pricing/export proxy IDs, images |
| `attribute_grids` | Named lookup tables (e.g. "Doors", "Color") |
| `attribute_grid_rows` | Individual rows in a grid; `row_data` is JSONB |
| `proxy_variables` | Pricing and export formula definitions evaluated by mathjs |
| `product_grid_bindings` | Links a product to a grid with an alias and lookup column |
| `allowed_users` | Whitelist of Replit users (username or email) allowed access |
| `color_grid` | Color code → description lookup |
| `processed_outlook_emails` | **AgentMail** dedup table (legacy name kept to avoid migration; prefix `agentmail:`) |
| `agentmail_sync_status` | AgentMail last sync time, error, counts |
| `processed_asana_tasks` | Dedup table for Asana auto-import |
| `asana_import_sync_status` | Asana import last sync time, error, counts |
| `app_settings` | Key-value store for app configuration (ORD header template, output flags) |

> **Orphaned DB tables** (exist in DB but no longer in schema): `outlook_sync_status` — safe to `DROP TABLE` at any time.

---

## 6. API Route Summary

All routes require `isAuthenticated` middleware (Replit session). Admin-only routes additionally check `isAdmin`.

### Orders & Files
- `GET /api/orders` — list all projects
- `GET /api/orders/:id` — single project detail
- `POST /api/orders/:id/reprice` — re-run pricing engine for all files
- `POST /api/orders/:id/regenerate-checklists` — rebuild packing + hardware checklists
- `GET /api/orders/:id/items` — order items (supports `?fileId=N`)
- `GET /api/orders/:id/files` — list files in project
- `GET /api/orders/:id/file-summary` — per-file metadata array (counts, flags)
- `GET /api/orders/:id/shipping-summary` — per-file shipping/checklist status

### Export Endpoints (all support `?fileId=N`)
- `GET /api/orders/:id/data/{invoice,elias,mj,hardware,glass,ord}` — JSON data
- `GET /api/orders/:id/pdf/{invoice,customer-packing-slip,internal-packing-slip,elias,mj,cut-to-size}` — PDF binary
- `GET /api/orders/:id/download/ord` — `.ord` or `.zip` Cabinet Vision file
- `GET /api/orders/:id/download/hardware-{csv,xlsx}` — hardware exports

### Admin
- `GET/PUT /api/admin/settings/:key` — app settings CRUD
- `GET/POST/PUT/DELETE /api/admin/attribute-grids` — grid management
- `GET/POST/PUT/DELETE /api/admin/proxy-variables` — formula management
- `GET/POST/PUT/DELETE /api/admin/allmoxy-products` — product management
- `POST /api/admin/products/auto-assign-formulas` — bulk formula assignment
- `POST /api/admin/products/fix-missing-proxies` — stem-match unassigned products
- `POST /api/admin/auto-create-bindings` — create all missing grid bindings
- `POST /api/admin/formula-test` — evaluate formula with test inputs
- `POST /api/admin/pricing-diagnostic` — pricing coverage report
- `POST /api/admin/products/bulk-upload-images` — parallel image upload + save
- `POST /api/admin/upload-dynamic-grids-bulk` — bulk CSV grid upload

### Integrations
- `GET/POST /api/agentmail/*` — AgentMail sync status + manual trigger
- `GET/POST /api/asana-import/*` — Asana import status + manual trigger
- `POST /api/sync-all-asana-status` — sync all project statuses from Asana
- `POST /api/backup/google-sheets` — trigger Google Sheets backup

---

## 7. Known Issues & Bugs

1. **[LOW] `outlook_sync_status` orphaned table** — The DB table still exists but the schema no longer references it. No harm, but can be cleaned up with `DROP TABLE outlook_sync_status;` directly in the production DB.

2. **[LOW] Asana 403 on task 1213347389204508** — One specific Asana task consistently returns "You do not have access to this task" on every import cycle. The scheduler handles the error gracefully (continues processing other tasks) but logs a verbose stack trace every 10 minutes. Workaround: none currently. Fix: filter this task GID out in `asanaImportScheduler.ts`, or remove it from the Asana "READY TO IMPORT" section.

3. **[LOW] `@microsoft/microsoft-graph-client` still in package.json** — The Outlook integration was removed in r25 but the npm package remains installed. It is not imported anywhere. No functional impact; can be uninstalled with `npm uninstall @microsoft/microsoft-graph-client` if desired.

4. **[LOW] Grid column digit-prefix warning** — When an attribute grid has a column whose name starts with a digit (e.g. `45_AND_90_PRICING_ID`), formulas must reference it with a leading underscore (e.g. `doors._45_and_90_pricing_id`). The pricing engine sanitizes this automatically, but the Grid Manager UI does not warn admins when such columns exist. Follow-up task #28 will add this hint.

5. **[MEDIUM] Product image storage is base64 in DB** — Images are stored as base64 text in `allmoxy_products.image_data`. For the current ~2,363 products this works, but list queries that accidentally include `image_data` would return hundreds of MB. The `getAllmoxyProducts()` and `getProducts()` storage methods explicitly exclude `image_data` from list queries; all read paths go through `GET /api/product-images/by-id/:id`. Do not add `image_data` to any list query.

---

## 8. Changelog (reverse-chronological)

---

### r25-b — 2026-05-02 — Remove Outlook Integration

**Files affected:**
- `server/outlook.ts` — **deleted**
- `server/outlookScheduler.ts` — **deleted**
- `server/index.ts` — removed Outlook scheduler startup block
- `server/routes.ts` — removed 10 `/api/outlook/*` routes + imports
- `server/storage.ts` — removed `clearProcessedOutlookEmails()` from interface + implementation
- `shared/schema.ts` — removed `outlookSyncStatus` table; retained `processedOutlookEmails` (renamed concept to "processed emails dedup", used by AgentMail)
- `client/src/pages/Dashboard.tsx` — removed Outlook sync query, two mutations, "Fetch Netley Emails" toolbar button, "Reset Processed Emails" diagnostic button
- `client/src/pages/HowItWorks.tsx` — removed "Outlook Integration (Preserved)" callout; updated two stale references to mention AgentMail

**Why:** Outlook was replaced by AgentMail. The Outlook scheduler was throwing a startup warning every boot (`Cannot read properties of undefined (reading 'settings')`) and running a wasted 30-minute polling loop. The `processed_outlook_emails` table is retained unchanged because `agentmailScheduler.ts` uses it for its own deduplication (keys prefixed with `agentmail:`).

**Side effects / follow-up:** `outlook_sync_status` DB table is now orphaned. Can be dropped manually. `@microsoft/microsoft-graph-client` npm package is still installed but unused.

---

### r25-a — 2026-05-02 — Fix TFL Shaker Door Pricing (Digit-Starting Column Names)

**Files affected:**
- `server/services/pricingEngine.ts`

**Root cause:** mathjs cannot dot-access object properties whose names start with a digit. The grid column `45_AND_90_PRICING_ID` (lowercased to `45_and_90_pricing_id`) caused `doors.45_and_90_pricing_id` to be tokenized as `doors × 0.45 × _and_90_pricing_id`, throwing `multiplyScalar (... actual: Object)` and yielding $0.00 on every TFL Shaker door line item.

**Fix:**
1. `gridRowToScope()` now also writes a `_`-prefixed alias for any key starting with a digit (e.g. both `45_and_90_pricing_id` and `_45_and_90_pricing_id`).
2. New `sanitizeDigitAccessors(formula)` helper rewrites `<identifier>.<digit-prefix-prop>` → `<identifier>._<digit-prefix-prop>` using regex `/([A-Za-z_]\w*)\.(\d[A-Za-z0-9_]*)/g`. Decimal literals (e.g. `1.5`, `92900) < 1.1`) are not affected because the regex requires a letter/underscore before the dot.
3. `evaluatePrice()` applies `sanitizeDigitAccessors` to both proxy variable sub-formulas and the main formula, after `stripComments`.

**Verified:** `LDRTFL90SHA` · 489.1 mm × 2269 mm · color TFL1W → $187.50/door (was $0.00 + error). Expected: ceil(2269÷25.4)=90, ceil(489.1÷25.4)=20, 1800÷144=12.5 sqft × $15/sqft TFL90 cost = $187.50 ✓

**Side effects:** None. The fix is globally backward-compatible. All four mathjs callers (upload pipeline, reprice route, formula tester, Asana import scheduler) flow through `evaluatePrice`.

---

### r24 — 2026-04-14 — Fix Door Pricing (LDRTFL90SHA / RDRTFL90SHA)

**Summary:** `LDRTFL90SHA` and `RDRTFL90SHA` existed in `allmoxy_products` but had `pricingProxyId = null`, causing $0.00 on all their order items. Added `POST /api/admin/products/fix-missing-proxies` endpoint (stem-match unassigned products to nearest known variant), `updateAllmoxyProduct()` partial-update method in storage, and a "Fix Missing Proxy Assignments" panel in the Pricing Diagnostic page. Also upgraded the M&J PDF door classifier from an exact `Set<string>` to a regex pattern `/^(?:[GHKM]?[LR]DRTFL|HDRTFL)/i`.

---

### r23 — 2026-04-12 — Door Pricing Diagnosis + Packing UI Revert + Hardware Downloads

**Summary:** Diagnosed root cause of LDRTFL90SHA pricing (missing product records — resolved in r24). Reverted ShippingView from inline checklists back to standalone page links. Added hardware CSV + XLSX download endpoints and frontend buttons. Deleted unused `PackingChecklistInline.tsx`, `HardwareChecklistInline.tsx`, `CtsPartsInline.tsx`.

---

### r22-hotfix-2 — 2026-04-12 — Fix "T.find is not a function" Crash on Order Details

**Summary:** Fixed `fileSummary` and `shippingSummary` queries in `OrderDetails.tsx` that were receiving `{ files: [...] }` objects but calling `.find()` directly on them. Added explicit `queryFn` implementations extracting `.files`, `safeFileSummary` guard, `pallet.fileIds ?? []` null guard in `PalletManager.tsx`, and removed erroneous `overflow-hidden` wrappers.

---

### r22-hotfix — 2026-04-12 — Production Blank Page Fix on /orders/:id

**Summary:** Blank page in production caused by `ErrorBoundary` closing tag accidentally omitted in r22 (silently crashed React render), plus `h-full` on `OrderDetails` root collapsing to 0 in production build. Added `ErrorBoundary` component, fixed flex layout on `AppLayout` + `OrderDetails`.

---

### r22 — 2026-04-12 — Full Order Page Redesign + App Navigation Overhaul

**Summary:** Complete rewrite of `OrderDetails.tsx` (3165 → ~340 lines). New two-panel layout: `FileSidebar` (left) + `DocumentsView` / `ShippingView` (right). Added `?fileId=N` to all 12 export endpoints. Two new summary endpoints: `file-summary` and `shipping-summary`. Sidebar reduced to 7 items. `/` redirects to `/orders`. `AdminSettings.tsx` consolidates ORD settings, output settings, and users into tabs.

---

### Merged Tasks (batch) — 2026-04-12 — Tasks #1–#26

**Summary of major features added:**
- ORD header template stored in `app_settings` with `{{design_name}}` / `{{po_number}}` placeholders
- Export type field on products + order items; 7-rule auto-classifier
- Bulk grid upload (multi-file CSV dropzone); multi-select grid delete
- Proxy variable bulk import; auto-assign formulas to products
- Bulk product image uploader (parallel, auto-save, base64 in DB)
- Per-product image upload in editor
- Internal packing slip PDF, Cut-to-size PDF, M&J Shaker door PDF
- Hardware CSV + XLSX download
- Product images stored as base64 in DB (GCS was broken in this environment)
- Product list queries exclude `image_data` to prevent timeout on large responses
- CSV import dedup fix (duplicate product names in one CSV)

---

### r21 — 2026-04-05 — ORD Format Overhaul

**Summary:** Switched from single combined `.ord` (18-field Extended Format) to one `.ord` per CSV file (8-field Standard Format). Multiple files → ZIP. Removed `[Walls]` section entirely. Entry number always `1`. `\r\n` line endings.

---

### r19 — 2026-04-05 — Scrolling Fix + ORD Download + Output Settings + PDF Page Breaks

*(See CHANGELOG.md for full detail on r1–r19)*

---

## 9. Next Steps

Ordered by priority:

1. **Deploy r25 to production** — The TFL Shaker pricing fix is in dev only. Once deployed, open any affected order and click "Re-run Pricing" to correct the $0.00 line items.

2. **Follow-up #28 — Add digit-column warning in Grid Manager** — When a grid is imported with a column starting with a digit, show a yellow info badge explaining the leading-underscore rule in formulas. Affects `client/src/pages/admin/DynamicGridManager.tsx` and `client/src/pages/admin/FormulaTester.tsx`.

3. **Drop orphaned `outlook_sync_status` DB table** — Run `DROP TABLE outlook_sync_status;` directly against the production database. Zero risk, purely cosmetic cleanup.

4. **Suppress Asana 403 on task 1213347389204508** — Either remove the task from Asana's "READY TO IMPORT" section, or add a skip list in `server/asanaImportScheduler.ts` to stop the verbose stack trace from appearing every 10 minutes.

5. **Uninstall `@microsoft/microsoft-graph-client`** — Now unused after Outlook removal. Run `npm uninstall @microsoft/microsoft-graph-client` and remove from `package.json` if desired.

6. **AgentMail end-to-end validation** — Send a real test PDF to the AgentMail inbox address and confirm it lands as a matched attachment on the correct order file. Verify dedup prevents double-processing on the next poll.
