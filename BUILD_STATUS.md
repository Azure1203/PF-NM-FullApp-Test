# BUILD_STATUS.md — Perfect Fit Closets / Netley Millwork Order Management System

> **Living document.** Updated automatically with every meaningful change.
> For an outside developer or AI: read this file first. It is the single source of truth.
> Extracted from: `shared/schema.ts`, `server/routes.ts` (8 377 lines), `server/storage.ts`, `server/services/pricingEngine.ts`.

---

## 1. App Overview

Production-ready internal order management dashboard for **Netley Millwork / Perfect Fit Closets**, replacing their legacy Allmoxy system. Shop staff upload CSV order exports; the app prices every line item using SKU-matched mathjs formulas evaluated against JSONB attribute lookup grids, then generates all downstream outputs: Cabinet Vision `.ORD` files, ELIAS dovetail PDFs, M&J Shaker door job lists, hardware/glass manifests, cut-to-size sheets, packing checklists, and invoices. Orders sync bidirectionally with Asana for production tracking. Inbound packing-slip PDFs are ingested automatically via AgentMail.

**Stack:** React 18 + TypeScript (Vite) · Express.js + TypeScript · PostgreSQL + Drizzle ORM · Replit deployment.

**Current stage:** Production-ready / actively deployed.

---

## 2. Current Build Snapshot

| Field | Value |
|---|---|
| **Last updated** | 2026-05-02 |
| **Current release** | r28 |
| **Active branch** | main (Replit managed) |
| **How to run (dev)** | `npm run dev` → starts Express + Vite on port 5000 |
| **Entry point (backend)** | `server/index.ts` |
| **Entry point (frontend)** | `client/src/main.tsx` |
| **Database** | PostgreSQL via `DATABASE_URL` env var |
| **Auth** | Replit OpenID Connect (`REPL_IDENTITY` / `WEB_REPL_RENEWAL`) |

### Key Dependencies

| Package | Purpose |
|---|---|
| react ^18.3.1 | Frontend UI |
| express ^4.21.2 | Backend HTTP server |
| drizzle-orm ^0.39.3 | ORM + query builder |
| drizzle-kit ^0.31.8 | Schema migrations |
| drizzle-zod ^0.7.0 | Zod schema generation from Drizzle tables |
| @tanstack/react-query ^5.60.5 | Server state / data fetching |
| wouter ^3.3.5 | Client-side routing |
| mathjs ^15.2.0 | Pricing formula evaluation |
| zod ^3.24.2 | Runtime validation |
| vite ^7.3.2 | Frontend build tool |
| tsx ^4.21.0 | Backend TypeScript runner |
| tailwindcss ^3.4.17 | Utility CSS |
| shadcn/ui (Radix UI) | Component library |
| asana ^3.1.5 | Asana API client |
| googleapis ^148.0.0 | Google Sheets / Drive backup |
| archiver ^7.0.1 | ZIP generation for multi-file ORD downloads |
| exceljs ^4.4.0 | Hardware XLSX export |
| pdf-lib / pdfjs-dist | PDF generation and parsing |
| multer ^2.0.2 | File upload handling |
| csv-parse ^6.1.0 | CSV parsing |
| papaparse ^5.5.3 | Client-side CSV parsing |

---

## 3. File & Folder Structure

```
project root
├── BUILD_STATUS.md              ← This file (living build state)
├── CHANGELOG.md                 ← Full reverse-chronological change log (r1–r26)
├── ORDER_PROCESS_GUIDE.md       ← End-to-end guide for shop staff
├── replit.md                    ← Replit-specific notes + architecture pointer
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── components.json              ← shadcn/ui component registry
│
├── shared/
│   ├── schema.ts                ← All 23 Drizzle table definitions + Zod insert schemas + TS types
│   ├── routes.ts                ← Shared route path constants
│   └── models/auth.ts           ← Replit Auth user/session model
│
├── server/
│   ├── index.ts                 ← Express app entry point; starts schedulers after server boot
│   ├── routes.ts                ← All ~135 API route handlers (8 377 lines)
│   ├── storage.ts               ← IStorage interface + DatabaseStorage class (all DB CRUD)
│   ├── db.ts                    ← Drizzle/pg connection pool
│   ├── static.ts                ← Production static file serving
│   ├── vite.ts                  ← Vite dev-server middleware (dev only)
│   ├── csvHelpers.ts            ← CSV parsing utilities
│   ├── backfillMigration.ts     ← Startup migrations: order file backfill + product image migration to object storage
│   ├── scripts/
│   │   └── migrateProductImagesToObjectStorage.ts  ← Idempotent backfill: DB base64 → object storage
│   ├── googleSheets.ts          ← Google Sheets / Drive OAuth client factory
│   ├── backupScheduler.ts       ← Daily 3 AM Google Sheets backup scheduler
│   ├── agentmail.ts             ← AgentMail API client (inbound email ingestion)
│   ├── agentmailScheduler.ts    ← AgentMail polling scheduler (every 30 min)
│   ├── asanaNotes.ts            ← Asana task note sync helpers
│   ├── asanaNotesScheduler.ts   ← Asana notes scheduler (5 min delay, then 24 h)
│   ├── asanaImportScheduler.ts  ← Asana "READY TO IMPORT" polling (every 10 min)
│   ├── lib/asana.ts             ← Asana OAuth token helper
│   ├── services/
│   │   ├── pricingEngine.ts     ← mathjs formula evaluator; gridRowToScope + sanitizeDigitAccessors
│   │   ├── ordExporter.ts       ← Cabinet Vision .ORD file builder + header template engine
│   │   └── pdfGenerator.ts      ← PDF generation orchestration
│   └── replit_integrations/
│       ├── auth/                ← Replit OpenID Connect auth middleware + session storage
│       └── object_storage/      ← Replit Object Storage client + ACL routes
│
├── client/src/
│   ├── main.tsx
│   ├── App.tsx                  ← Router (16 routes) + auth guard + ErrorBoundary
│   ├── index.css                ← Tailwind base + CSS custom properties (light/dark theme vars)
│   ├── components/
│   │   ├── AppLayout.tsx        ← Sidebar + top header shell; 7-item nav
│   │   ├── ErrorBoundary.tsx
│   │   ├── FileUpload.tsx
│   │   ├── HardwareCsvUploadSection.tsx
│   │   ├── HardwarePackingChecklist.tsx
│   │   ├── ObjectUploader.tsx
│   │   ├── PackingSlipChecklist.tsx
│   │   ├── PageHeader.tsx
│   │   ├── PrinterSettings.tsx
│   │   └── StatusBadge.tsx
│   ├── hooks/
│   │   ├── use-admin.ts
│   │   ├── use-auth.ts
│   │   ├── use-mobile.tsx
│   │   ├── use-orders.ts
│   │   ├── use-toast.ts
│   │   └── use-upload.ts
│   ├── lib/
│   │   ├── auth-utils.ts
│   │   ├── queryClient.ts       ← TanStack Query client + apiRequest helper
│   │   ├── qzTray.ts            ← QZ Tray label printer integration
│   │   └── utils.ts
│   └── pages/
│       ├── Dashboard.tsx        ← /orders — order list + AgentMail/Asana sync controls
│       ├── OrderDetails.tsx     ← /orders/:id — two-panel order view
│       ├── UploadOrder.tsx      ← /upload — CSV order upload flow
│       ├── Products.tsx         ← /products — hardware/component product catalog
│       ├── HardwareImport.tsx   ← /products/import — bulk hardware CSV import
│       ├── ComponentImport.tsx  ← /products/import-components — component CSV import
│       ├── CutToSize.tsx        ← /files/:fileId/cts — CTS parts cutting checklist
│       ├── PackingChecklist.tsx ← /files/:fileId/checklist — packing slip checklist
│       ├── HardwareChecklist.tsx← /files/:fileId/hardware-checklist
│       ├── HowItWorks.tsx       ← /how-it-works — system documentation page
│       ├── Landing.tsx          ← Unauthenticated landing/login page
│       ├── not-found.tsx        ← 404 page
│       ├── order-detail/
│       │   ├── FileSidebar.tsx
│       │   ├── DocumentsView.tsx
│       │   ├── ShippingView.tsx
│       │   ├── FileItemsTable.tsx
│       │   ├── PdfViewer.tsx
│       │   └── PalletManager.tsx
│       └── admin/
│           ├── AdminSettings.tsx         ← /admin/settings — 3-tab: ORD Export, Output Settings, Users
│           ├── AllmoxyProductManager.tsx ← /admin/allmoxy-products
│           ├── DynamicGridManager.tsx    ← /admin/attribute-grids
│           ├── ProxyVariableManager.tsx  ← /admin/proxy-variables
│           ├── FormulaTester.tsx         ← /admin/formula-tester
│           ├── ProductImageUploader.tsx  ← /admin/product-images
│           ├── PricingDiagnostic.tsx     ← /admin/diagnostic
│           ├── OrdSettings.tsx
│           └── OutputSettings.tsx
│
├── migrations/                  ← Drizzle migration SQL files (0000–0008)
├── docs/
│   ├── MASTER_ARCHITECTURE_SPEC_v4.md
│   └── BUILD_STATE.md           ← Superseded by this file
├── attached_assets/             ← Historical prompt files (r8–r26 build notes)
└── script/build.ts              ← Production build script
```

---

## 4. Database Tables (from `shared/schema.ts`)

All 23 tables. PostgreSQL via Drizzle ORM.

### 4.1 `projects`
Top-level order record; one per customer job; maps to one Asana task.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | e.g. "Anderson PO25-391065" |
| date | text | YYYY-MM-DD |
| dealer | text | |
| shippingAddress | text | |
| phone | text | |
| taxId | text | |
| orderId | text | Allmoxy order ID |
| status | text | `'pending'` \| `'synced'` |
| asanaTaskId | text | GID of the Asana task after sync |
| asanaSection | text | Section name pulled from Asana |
| pfOrderStatus | text | `PF ORDER STATUS` custom field from Asana |
| pfProductionStatus | text[] | `PF PRODUCTION STATUS` multi-enum from Asana (also set locally) |
| cienappsJobNumber | text | Pulled from Asana `CIENAPPS JOB NUMBER` field |
| lastAsanaSyncAt | timestamp | |
| powerTailgate | boolean | |
| phoneAppointment | boolean | |
| notes | text | |
| createdAt | timestamp | |

### 4.2 `order_files`
Individual CSV files within a project (one per room/design).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| projectId | integer FK→projects | |
| originalFilename | text | |
| poNumber | text | Extracted from CSV |
| rawContent | text | Full CSV string stored for reprice/re-parse |
| coreParts | integer | |
| dovetails | integer | |
| assembledDrawers | integer | |
| fivePieceDoors | integer | |
| weightLbs | integer | |
| maxLength | integer | |
| maxWidth | integer | |
| largestPartWidth | integer | |
| widestPartLength | integer | |
| hasGlassParts | boolean | |
| glassInserts | integer | |
| glassShelves | integer | |
| hasMJDoors | boolean | |
| hasRichelieuDoors | boolean | |
| hasDoubleThick | boolean | |
| hasShakerDoors | boolean | |
| mjDoorsCount | integer | |
| richelieuDoorsCount | integer | |
| doubleThickCount | integer | |
| wallRailPieces | integer | |
| hardwareBoStatus | text | `'NO BO HARDWARE'` \| `'WAITING FOR BO HARDWARE'` \| `'BO HARDWARE ARRIVED'` |
| allmoxyJobNumber | text | Manually entered by staff |
| packagingLink | text | |
| notes | text | |
| cutToFilePdfPath | text | Object storage path for uploaded Cut-To-File PDF |
| eliasDovetailPdfPath | text | Object storage path |
| netley5PiecePdfPath | text | Object storage path |
| netleyPackingSlipPdfPath | text | Object storage path |
| createdAt | timestamp | |

### 4.3 `order_items`
Parsed line items from a CSV file; holds pricing results and generated ORD export text.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| projectId | integer FK→projects | |
| fileId | integer FK→order_files | |
| productId | integer FK→allmoxy_products nullable | |
| sku | text | Raw SKU from CSV |
| description | text | |
| width | numeric | |
| height | numeric | |
| depth | numeric | (CSV `Length` column) |
| quantity | integer | |
| unitPrice | numeric | Result of pricing formula evaluation |
| totalPrice | numeric | unitPrice × quantity |
| exportText | text | Generated ORD block or other export text |
| pricingError | text | Error message if formula evaluation failed |
| rawRowData | jsonb | Full CSV row as key→value map |
| exportType | text | `'ORD'` \| `'ELIAS'` \| `'MJ'` \| `'GLASS'` \| `'HARDWARE'` \| `'CTS'` \| `'NONE'` |
| supplyType | text | |
| createdAt | timestamp | |

### 4.4 `cts_parts`
Cut-to-size rod parts extracted per file.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| fileId | integer FK→order_files | |
| partNumber | text | e.g. `CRC.CTS` |
| description | text | |
| cutLength | numeric | |
| quantity | integer | |
| isCut | boolean | Staff marks this after cutting |
| createdAt | timestamp | |

### 4.5 `cts_part_configs`
Shared image URL + rack location per distinct CTS part number.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| partNumber | text UNIQUE | |
| imageUrl | text | |
| rackLocation | text | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### 4.6 `pallets`
Packaging pallets assigned to a project.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| projectId | integer FK→projects | |
| palletNumber | integer | Sequential per project |
| size | text | e.g. `'40x48'`, `'custom'` |
| customSize | text | |
| finalSize | text | Measured final size; syncs to Asana `PALLET SIZE` field |
| notes | text | |
| packagingStatus | jsonb | Key-value packaging step statuses |
| hardwarePackaged | boolean | When true (all pallets) → Asana `HARDWARE PACKED` |
| createdAt | timestamp | |

### 4.7 `pallet_file_assignments`
Many-to-many: which CSV files are on which pallet.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| palletId | integer FK→pallets | |
| fileId | integer FK→order_files | |
| hardwarePackaged | boolean | Per-assignment hardware packed flag |
| hardwarePackedBy | text | Name of packer |
| buyoutHardwareStatuses | text[] | `'NO BUYOUT HARDWARE'` \| `'WAITING FOR BO HARDWARE'` \| `'BO HARDWARE ARRIVED'` |
| createdAt | timestamp | |

### 4.8 `packing_slip_items`
Checklist items auto-generated from order CSV data (all parts, not just hardware).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| fileId | integer FK→order_files | |
| partCode | text | SKU/Manuf code |
| color | text | |
| quantity | integer | |
| height | numeric | |
| width | numeric | |
| length | numeric | |
| thickness | numeric | |
| description | text | |
| isChecked | boolean | |
| checkedBy | text | |
| checkedAt | timestamp | |
| sortOrder | integer | |
| createdAt | timestamp | |

### 4.9 `hardware_checklist_items`
Checklist items from hardware cross-reference; buyout/packed tracking.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| fileId | integer FK→order_files | |
| productId | integer FK→products nullable | |
| productCode | text | |
| productName | text | |
| quantity | integer | |
| cutLength | numeric | Populated for `.CTS` parts only |
| isBuyout | boolean | Derived from `products.stockStatus = 'BUYOUT'` |
| buyoutArrived | boolean | |
| isPacked | boolean | |
| packedBy | text | |
| packedAt | timestamp | |
| notInDatabase | boolean | True if code has hardware prefix but no DB record |
| sortOrder | integer | |
| createdAt | timestamp | |

### 4.10 `products`
Internal hardware/component product catalog.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| code | text UNIQUE NOT NULL | e.g. `H.BLD-15` |
| name | text | |
| supplier | text | |
| category | text | `'HARDWARE'` \| `'COMPONENT'` |
| stockStatus | text | `'IN_STOCK'` \| `'BUYOUT'` |
| weight | numeric | grams |
| imagePath | text | Object storage path for product image |
| notes | text | |
| importRowNumber | integer | Row number in import CSV (for image auto-linking) |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### 4.11 `product_categories`
Product category tags.

| Column | Type |
|---|---|
| id | serial PK |
| name | text UNIQUE NOT NULL |
| createdAt | timestamp |

### 4.12 `allmoxy_products`
Allmoxy product definitions: SKU prefix, pricing/export proxy IDs, export type, images.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | |
| skuPrefix | text | Longest-prefix-wins matching |
| status | text | `'active'` \| `'inactive'` |
| pricingProxyId | integer FK→proxy_variables nullable | |
| exportProxyId | integer FK→proxy_variables nullable | |
| exportType | text | `'ORD'` \| `'ELIAS'` \| `'MJ'` \| `'GLASS'` \| `'HARDWARE'` \| `'CTS'` \| `'NONE'` |
| supplyType | text | |
| description | text | |
| notes | text | |
| imagePath | text | Object storage path for product image |
| categoryId | integer FK→product_categories nullable | |

### 4.13 `attribute_grids`
Named lookup tables (e.g. "TFL Shaker Doors", "Colors").

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | |
| keyColumn | text | Column used as the lookup key |
| description | text | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### 4.14 `attribute_grid_rows`
Individual rows in a grid; `row_data` is JSONB.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| gridId | integer FK→attribute_grids | |
| lookupKey | text | Value matched against CSV field |
| rowData | jsonb | All column values for this row |
| createdAt | timestamp | |

### 4.15 `proxy_variables`
Pricing and export formula definitions evaluated by mathjs.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | |
| formula | text NOT NULL | mathjs expression; may reference other proxy vars |
| type | text | `'PRICE'` \| `'EXPORT'` |
| description | text | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### 4.16 `product_grid_bindings`
Links an `allmoxy_product` to a grid with an alias (scope name) and lookup column.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| productId | integer FK→allmoxy_products | |
| gridId | integer FK→attribute_grids | |
| alias | text | Variable name injected into formula scope (e.g. `"doors"`) |
| lookupColumn | text | CSV column name to use as the grid lookup key |
| createdAt | timestamp | |

### 4.17 `allowed_users`
Whitelist of Replit users (username or email) allowed to access the system.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| email | text | |
| username | text | |
| displayName | text | |
| isAdmin | boolean | Admin can manage users, settings, formulas |
| addedBy | text | |
| createdAt | timestamp | |

### 4.18 `color_grid`
Color code → description lookup (used by color-breakdown endpoint).

| Column | Type |
|---|---|
| id | serial PK |
| code | text UNIQUE NOT NULL |
| description | text |
| createdAt | timestamp |

### 4.19 `processed_outlook_emails`
**Dedup table for AgentMail** (legacy name kept to avoid migration). Keys prefixed `agentmail:`.

| Column | Type |
|---|---|
| id | serial PK |
| emailId | text UNIQUE NOT NULL |
| processedAt | timestamp |
| matchedOrderId | integer nullable |
| notes | text |

### 4.20 `agentmail_sync_status`
AgentMail last sync time, error, and counts.

| Column | Type |
|---|---|
| id | serial PK (always row 1) |
| lastSyncAt | timestamp |
| lastError | text |
| emailsProcessed | integer |
| emailsMatched | integer |
| updatedAt | timestamp |

### 4.21 `processed_asana_tasks`
Dedup table for Asana auto-import scheduler.

| Column | Type |
|---|---|
| id | serial PK |
| taskGid | text UNIQUE NOT NULL |
| projectId | integer FK→projects nullable |
| processedAt | timestamp |
| taskName | text |

### 4.22 `asana_import_sync_status`
Asana import last sync time, error, and counts.

| Column | Type |
|---|---|
| id | serial PK (always row 1) |
| lastSyncAt | timestamp |
| lastError | text |
| tasksProcessed | integer |
| tasksImported | integer |
| updatedAt | timestamp |

### 4.23 `app_settings`
Key-value store for app configuration.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| key | text UNIQUE NOT NULL | e.g. `ord_header_template`, `output.invoice.showPricing` |
| value | text | |
| description | text | |
| updatedAt | timestamp | |

> **Orphaned DB table** (production database only — already removed from dev in r25-c and from `shared/schema.ts` in r25-b): `outlook_sync_status`. Will be dropped automatically by Replit's Publish flow on the next publish via its dev↔prod schema diff. See Known Issues §9.

---

## 5. Storage Interface (`server/storage.ts` — `IStorage`)

All database access goes through this interface. `DatabaseStorage` implements it using Drizzle ORM.

### Projects
- `getProjects()` → `Project[]`
- `getProject(id)` → `Project | undefined`
- `createProject(data)` → `Project`
- `updateProject(id, data)` → `Project | undefined`
- `deleteProject(id)` → `boolean`

### Order Files
- `getProjectFiles(projectId)` → `OrderFile[]`
- `getOrderFile(id)` → `OrderFile | undefined`
- `getFileWithProject(fileId)` → `{ file, project } | undefined`
- `createOrderFile(data)` → `OrderFile`
- `updateOrderFile(id, data)` → `OrderFile | undefined`
- `deleteOrderFile(id)` → `boolean`

### Order Items
- `getOrderItemsByProject(projectId)` → `OrderItem[]`
- `getOrderItemsByFile(fileId)` → `OrderItem[]`
- `createOrderItem(data)` → `OrderItem`
- `createOrderItemsBatch(items[])` → `OrderItem[]`
- `deleteOrderItemsByFile(fileId)` → `void`
- `deleteOrderItemsByProject(projectId)` → `void`

### CTS Parts
- `getCtsPartsForFile(fileId)` → `CtsPart[]`
- `getCtsPartsCountForFile(fileId)` → `number`
- `createCtsPart(data)` → `CtsPart`
- `updateCtsPartCutStatus(partId, isCut)` → `CtsPart | undefined`
- `getCtsPartsCutStatus(fileId)` → `{ total, cut, remaining }`
- `deleteCtsPartsForFile(fileId)` → `void`
- `getCtsPartConfigs()` → `CtsPartConfig[]`
- `getCtsPartConfigByPartNumber(partNumber)` → `CtsPartConfig | undefined`
- `upsertCtsPartConfig(data)` → `CtsPartConfig`

### Pallets
- `getPalletsForProject(projectId)` → `Pallet[]`
- `getPallet(id)` → `Pallet | undefined`
- `getNextPalletNumber(projectId)` → `number`
- `createPallet(data)` → `Pallet`
- `updatePallet(id, data)` → `Pallet | undefined`
- `deletePallet(id)` → `boolean`

### Pallet File Assignments
- `getAssignmentsForPallet(palletId)` → `PalletFileAssignment[]`
- `getAssignmentsForFile(fileId)` → `PalletFileAssignment[]`
- `getAssignment(id)` → `PalletFileAssignment | undefined`
- `setAssignmentsForPallet(palletId, fileIds[])` → `PalletFileAssignment[]`
- `updateAssignmentHardwareStatus(id, packed, packedBy)` → `PalletFileAssignment | undefined`
- `updateAssignmentBuyoutStatuses(id, statuses[])` → `PalletFileAssignment | undefined`

### Packing Slip Checklist
- `getPackingSlipItems(fileId)` → `PackingSlipItem[]`
- `getPackingSlipProgress(fileId)` → `{ total, checked, remaining }`
- `createPackingSlipItems(items[])` → `PackingSlipItem[]`
- `togglePackingSlipItem(id, isChecked, checkedBy)` → `PackingSlipItem | undefined`
- `deletePackingSlipItemsForFile(fileId)` → `void`

### Hardware Checklist
- `getHardwareChecklistItems(fileId)` → `HardwareChecklistItem[]`
- `getHardwareChecklistProgress(fileId)` → `{ total, packed, remaining, buyoutTotal, buyoutPacked }`
- `createHardwareChecklistItems(items[])` → `HardwareChecklistItem[]`
- `replaceHardwareChecklist(fileId, items[])` → `HardwareChecklistItem[]` — atomic delete+insert; guarded against 0-item insert
- `toggleHardwareItemPacked(id, isPacked, packedBy)` → `HardwareChecklistItem | undefined`
- `toggleHardwareItemBuyoutArrived(id, buyoutArrived)` → `HardwareChecklistItem | undefined`
- `deleteHardwareChecklistItemsForFile(fileId)` → `void`

### Products (hardware catalog)
- `getProducts(search?, category?)` → `Product[]` — excludes `imageData`
- `getProduct(id)` → `Product | undefined`
- `getProductByCode(code)` → `Product | undefined`
- `getProductsByCode(codes[])` → `Product[]`
- `getProductsByImportRowNumbers(rowNumbers[])` → `Product[]`
- `createProduct(data)` → `Product`
- `updateProduct(id, data)` → `Product | undefined`
- `deleteProduct(id)` → `boolean`

### Allmoxy Products
- `getAllmoxyProducts()` → `AllmoxyProduct[]` — excludes `imageData`
- `getAllmoxyProduct(id)` → `AllmoxyProduct | undefined` — includes `imageData`
- `createAllmoxyProduct(data)` → `AllmoxyProduct`
- `updateAllmoxyProduct(id, data)` → `AllmoxyProduct | undefined`
- `deleteAllmoxyProduct(id)` → `boolean`
- `bulkInsertAllmoxyProducts(products[])` → `AllmoxyProduct[]` — COALESCE preserves existing pricingProxyId/exportProxyId

### Attribute Grids
- `getAttributeGrids()` → `AttributeGrid[]`
- `getAttributeGrid(id)` → `AttributeGrid | undefined`
- `createAttributeGrid(data)` → `AttributeGrid`
- `updateAttributeGrid(id, data)` → `AttributeGrid | undefined`
- `deleteAttributeGrid(id)` → `boolean`
- `getAttributeGridRows(gridId)` → `AttributeGridRow[]`
- `getAttributeGridRow(id)` → `AttributeGridRow | undefined`
- `getAttributeGridRowByKey(gridId, lookupKey, rowDataColumn?)` — tries exact → case-insensitive → rowData column → any rowData value
- `createAttributeGridRow(data)` → `AttributeGridRow`
- `updateAttributeGridRow(id, data)` → `AttributeGridRow | undefined`
- `deleteAttributeGridRow(id)` → `boolean`
- `deleteAttributeGridRows(gridId)` → `void`
- `bulkInsertAttributeGridRows(gridId, rows[])` → `AttributeGridRow[]`

### Proxy Variables
- `getProxyVariables()` → `ProxyVariable[]`
- `getProxyVariable(id)` → `ProxyVariable | undefined`
- `createProxyVariable(data)` → `ProxyVariable`
- `updateProxyVariable(id, data)` → `ProxyVariable | undefined`
- `deleteProxyVariable(id)` → `boolean`

### Product Grid Bindings
- `getProductGridBindings(productId)` → `ProductGridBinding[]`
- `getAllProductGridBindings()` → `ProductGridBinding[]`
- `createProductGridBinding(data)` → `ProductGridBinding`
- `deleteProductGridBinding(id)` → `boolean`
- `deleteProductGridBindingsForProduct(productId)` → `void`

### Color Grid
- `getColorGrid()` → `ColorGridEntry[]`

### Allowed Users
- `getAllowedUsers()` → `AllowedUser[]`
- `getAllowedUser(id)` → `AllowedUser | undefined`
- `getAllowedUserByEmail(email)` → `AllowedUser | undefined`
- `getAllowedUserByUsername(username)` → `AllowedUser | undefined`
- `isUserAllowed(username, email?)` → `boolean`
- `isUserAdmin(username, email?)` → `boolean`
- `createAllowedUser(data)` → `AllowedUser`
- `deleteAllowedUser(id)` → `boolean`
- `updateAllowedUserAdmin(id, isAdmin)` → `void`

### AgentMail / Processed Emails
- `getAgentMailSyncStatus()` → `AgentMailSyncStatus | undefined`
- `upsertAgentMailSyncStatus(data)` → `AgentMailSyncStatus`
- `getProcessedEmailById(emailId)` → `ProcessedEmail | undefined`
- `createProcessedEmail(data)` → `ProcessedEmail`
- `clearProcessedAgentMailEmails()` → `number` — deletes all rows with `agentmail:` prefix

### Asana Import
- `getAsanaImportSyncStatus()` → `AsanaImportSyncStatus | undefined`
- `upsertAsanaImportSyncStatus(data)` → `AsanaImportSyncStatus`
- `getProcessedAsanaTask(taskGid)` → `ProcessedAsanaTask | undefined`
- `createProcessedAsanaTask(data)` → `ProcessedAsanaTask`

### App Settings
- `getSetting(key)` → `AppSetting | undefined`
- `setSetting(key, value, description?)` → `AppSetting`
- `getAllSettings()` → `AppSetting[]`

---

## 6. Pricing Engine (`server/services/pricingEngine.ts`)

### `evaluatePrice(formula, item, contextScope, allProxyVars) → number`
Main entry point. Steps:
1. `stripComments(formula)` — removes `//` line comments.
2. `sanitizeDigitAccessors(formula)` — rewrites `obj.45_prop` → `obj._45_prop` using regex `/([A-Za-z_]\w*)\.(\d[A-Za-z0-9_]*)/g`. Decimal literals (e.g. `1.5`) are not affected.
3. Builds mathjs scope from `item` fields (`width`, `height`, `length`, `depth`, `quantity`) plus `contextScope` (grid row objects).
4. Resolves proxy variable references: for each other proxy var referenced in the formula, evaluates it recursively and injects the result into scope.
5. Evaluates final formula string via `mathjs.evaluate()`.
6. Returns `number` result (clamped to 0 on error, errors propagated by caller).

### `gridRowToScope(rowData: Record<string, any>) → Record<string, any>`
Converts a grid row's JSONB `rowData` into a safe mathjs scope object:
- All keys lowercased.
- Numeric strings coerced to `number`.
- For any key starting with a digit `d`, also writes a `_d` alias (e.g. `45_and_90_pricing_id` → also `_45_and_90_pricing_id`). This is the r25-a fix.

### `sanitizeDigitAccessors(formula: string) → string`
Regex: `/([A-Za-z_]\w*)\.(\d[A-Za-z0-9_]*)/g`
Rewrites `identifier.digit-starting-prop` to `identifier._digit-starting-prop`.
Safe for decimal literals because the regex requires `[A-Za-z_]` before the dot.

### `generateOrdItemBlock(item, contextScope, exportFormula) → string`
Evaluates an EXPORT-type proxy variable formula to produce a Cabinet Vision `.ORD` item block string.

### `matchProductToSku(sku, activeProducts) → AllmoxyProduct | undefined`
Longest-prefix-wins: iterates active products sorted by `skuPrefix.length DESC`, returns first match where `sku.toUpperCase().startsWith(prefix.toUpperCase())`.

---

## 7. API Route Summary (complete list from `server/routes.ts`)

All routes require `isAuthenticated` middleware (Replit session) unless noted.

### Orders (Projects)
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders` | List all projects |
| POST | `/api/orders` (multipart) | Upload CSV files → create project + items + checklists |
| GET | `/api/orders/:id` | Single project detail |
| PUT | `/api/orders/:id` | Update project fields |
| DELETE | `/api/orders/:id` | Delete project + all children |
| POST | `/api/orders/:id/reprice` | Re-run pricing engine for all files |
| POST | `/api/orders/:id/regenerate-checklists` | Rebuild packing + hardware checklists |
| GET | `/api/orders/:id/items` | Order items (`?fileId=N` optional) |
| GET | `/api/orders/:id/files` | List files in project |
| GET | `/api/orders/:id/file-summary` | Per-file metadata array (counts + flags) |
| GET | `/api/orders/:id/shipping-summary` | Per-file shipping/checklist/BO status |
| GET | `/api/orders/:id/pallets` | Get pallets with file assignments |
| POST | `/api/orders/:id/pallets` | Create pallet |
| GET | `/api/orders/:id/file-pallet-info` | File→pallet mapping |

### Export Data Endpoints (all support `?fileId=N`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders/:id/data/invoice` | Invoice line items JSON |
| GET | `/api/orders/:id/data/elias` | ELIAS dovetail rows JSON |
| GET | `/api/orders/:id/data/mj` | M&J door sections JSON |
| GET | `/api/orders/:id/data/hardware` | Hardware items JSON |
| GET | `/api/orders/:id/data/glass` | Glass items JSON |
| GET | `/api/orders/:id/data/ord` | Raw ORD text |
| GET | `/api/orders/:id/data/cts` | CTS parts JSON |

### Export PDF / Download Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders/:id/pdf/invoice` | Invoice PDF |
| GET | `/api/orders/:id/pdf/customer-packing-slip` | Customer packing slip PDF |
| GET | `/api/orders/:id/pdf/internal-packing-slip` | Internal packing slip PDF (no pricing) |
| GET | `/api/orders/:id/pdf/elias` | ELIAS dovetail PDF |
| GET | `/api/orders/:id/pdf/mj` | M&J Shaker door PDF |
| GET | `/api/orders/:id/pdf/cut-to-size` | Cut-to-size summary PDF |
| GET | `/api/orders/:id/download/ord` | `.ord` file or `.zip` (multi-file) |
| GET | `/api/orders/:id/download/hardware-csv` | Hardware CSV export |
| GET | `/api/orders/:id/download/hardware-xlsx` | Hardware XLSX export (exceljs) |

### Asana Sync
| Method | Path | Description |
|---|---|---|
| POST | `/api/orders/:id/sync` | Sync project to Asana (duplicate template or update existing task) |
| POST | `/api/orders/:id/sync-asana-status` | Pull `PF ORDER STATUS`, `PF PRODUCTION STATUS`, section, `CIENAPPS JOB NUMBER` from Asana |
| POST | `/api/sync-all-asana-status` | Batch pull status for all synced projects |
| GET | `/api/asana-import/status` | Asana import scheduler status |
| POST | `/api/asana-import/trigger` | Manually trigger Asana import |
| POST | `/api/asana-import/reset/:projectId` | Admin: delete project + clear processed task (admin only) |
| POST | `/api/asana-import/reset-orphan/:processedTaskId` | Admin: clear orphaned processed task entry |
| GET | `/api/asana-import/projects` | List all projects with their Asana sync state |
| POST | `/api/asana/sync-all-notes` | Admin: sync all task descriptions to Asana (admin only) |
| POST | `/api/admin/trigger-asana-import` | Alias for `/api/asana-import/trigger` |
| GET | `/api/admin/asana-import-status` | Alias for `/api/asana-import/status` |

### File-Level Routes
| Method | Path | Description |
|---|---|---|
| PATCH | `/api/files/:fileId/notes` | Update file notes |
| PATCH | `/api/files/:fileId/allmoxy-job` | Update Allmoxy Job # (triggers Asana notes sync) |
| PATCH | `/api/files/:fileId/allmoxy-job-number` | Alias for above |
| PATCH | `/api/files/:fileId/packaging-link` | Update packaging link |
| GET | `/api/files/:fileId/cts-status` | CTS cut progress `{total, cut, remaining}` |
| POST | `/api/files/:fileId/reparse-packing-slip` | Regenerate packing slip checklist from stored CSV |
| GET | `/api/files/:fileId/cut-to-file-pdf` | Download uploaded Cut-To-File PDF |
| DELETE | `/api/files/:fileId/cut-to-file-pdf` | Delete Cut-To-File PDF |
| GET | `/api/files/:fileId/elias-dovetail-pdf` | Download Elias dovetail PDF |
| DELETE | `/api/files/:fileId/elias-dovetail-pdf` | Delete Elias dovetail PDF |
| GET | `/api/files/:fileId/netley-5-piece-pdf` | Download Netley 5-piece shaker door PDF |
| DELETE | `/api/files/:fileId/netley-5-piece-pdf` | Delete Netley 5-piece PDF |
| GET | `/api/files/:fileId/netley-packing-slip-pdf` | Download Netley packing slip PDF |
| DELETE | `/api/files/:fileId/netley-packing-slip-pdf` | Delete Netley packing slip PDF |
| GET | `/api/files/:fileId/checklist` | Packing slip checklist items + progress (enriched with product info) |
| GET | `/api/files/:fileId/checklist/progress` | Packing slip progress only |
| GET | `/api/files/:fileId/hardware-checklist` | Hardware checklist items + progress (enriched with images + stock status) |
| POST | `/api/files/:fileId/generate-hardware-checklist` | Generate hardware checklist from uploaded CSV body |
| POST | `/api/files/:fileId/generate-hardware-from-order` | Generate hardware checklist from stored `rawContent` (cross-ref products DB) |
| GET | `/api/packing-slip-images/:imagePath` | Serve packing slip image from object storage (path format: `file-{id}-item-{n}.png`) |

### Pallets
| Method | Path | Description |
|---|---|---|
| PATCH | `/api/pallets/:palletId` | Update pallet size/notes/file assignments |
| DELETE | `/api/pallets/:palletId` | Delete pallet |
| PATCH | `/api/pallets/:palletId/final-size` | Set final size → sync to Asana `PALLET SIZE` field |
| PATCH | `/api/pallets/:palletId/packaging-status` | Update packaging step statuses JSONB |
| PATCH | `/api/pallets/:palletId/hardware-packaged` | Toggle hardware packed; syncs `HARDWARE PACKED` + `PF PRODUCTION STATUS` to Asana |

### Pallet Assignments
| Method | Path | Description |
|---|---|---|
| PATCH | `/api/assignments/:assignmentId/hardware-packaged` | Toggle per-assignment hardware packed (requires `hardwarePackedBy` name) |
| PATCH | `/api/assignments/:assignmentId/buyout-statuses` | Update buyout hardware statuses → recalculates project `pfProductionStatus` + syncs to Asana |

### Checklists
| Method | Path | Description |
|---|---|---|
| PATCH | `/api/checklist/:itemId/toggle` | Toggle packing slip item checked/unchecked |
| POST | `/api/hardware-checklist/:itemId/toggle-packed` | Toggle hardware item packed status → recalculates BO status |
| POST | `/api/hardware-checklist/:itemId/toggle-buyout-arrived` | Toggle hardware buyout-arrived → recalculates BO status + Asana sync |

### CTS Parts
| Method | Path | Description |
|---|---|---|
| GET | `/api/cts-parts/config` | List all CTS part configs |
| POST | `/api/cts-parts/config` | Upsert CTS part config (image URL + rack location) |
| PATCH | `/api/cts-parts/:partId/cut` | Mark CTS part as cut/uncut |

### Product Catalog (hardware/component)
| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List products (`?search=` `?category=`) — excludes imageData |
| GET | `/api/products/:id` | Single product |
| GET | `/api/products/by-code/:code` | Lookup by code |
| POST | `/api/products` | Create product |
| PATCH | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| POST | `/api/products/bulk-lookup` | Lookup multiple products by codes array → returns map |
| POST | `/api/products/import/preview` | Parse hardware CSV → categorize as new/changed/unchanged |
| POST | `/api/products/import` | Bulk-create new hardware products from parsed items |
| POST | `/api/products/import/update` | Bulk-update changed hardware products |
| POST | `/api/products/link-images` | Link image path to products by import row numbers |
| POST | `/api/components/import/preview` | Parse component CSV → categorize as new/changed/unchanged |
| POST | `/api/components/import` | Bulk-create new component products (category=COMPONENT) |
| POST | `/api/components/import/update` | Bulk-update changed components |

### Admin — Allmoxy Products
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/allmoxy-products` | List all Allmoxy products |
| GET | `/api/admin/allmoxy-products/:id` | Single product (includes imageData) |
| POST | `/api/admin/allmoxy-products` | Create Allmoxy product |
| PUT | `/api/admin/allmoxy-products/:id` | Update Allmoxy product |
| DELETE | `/api/admin/allmoxy-products/:id` | Delete |
| POST | `/api/admin/allmoxy-products/bulk-import` | Bulk insert from array |
| GET | `/api/admin/allmoxy-products/:id/image` | Serve product image (from imageData base64) |
| POST | `/api/admin/allmoxy-products/:id/image` | Upload + save product image as base64 in DB |
| DELETE | `/api/admin/allmoxy-products/:id/image` | Clear product image |

### Admin — Attribute Grids
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/attribute-grids` | List grids |
| POST | `/api/admin/attribute-grids` | Create grid |
| PUT | `/api/admin/attribute-grids/:id` | Update grid metadata |
| DELETE | `/api/admin/attribute-grids/:id` | Delete grid + rows |
| GET | `/api/admin/attribute-grids/:id/rows` | List rows for grid |
| POST | `/api/admin/attribute-grids/:id/rows` | Add row |
| PUT | `/api/admin/attribute-grids/:gridId/rows/:rowId` | Update row |
| DELETE | `/api/admin/attribute-grids/:gridId/rows/:rowId` | Delete row |
| POST | `/api/admin/upload-dynamic-grids-bulk` | Bulk CSV upload (multiple grids) |

### Admin — Proxy Variables
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/proxy-variables` | List all proxy vars |
| POST | `/api/admin/proxy-variables` | Create |
| PUT | `/api/admin/proxy-variables/:id` | Update |
| DELETE | `/api/admin/proxy-variables/:id` | Delete |
| POST | `/api/admin/proxy-variables/bulk-import` | Bulk create from array |

### Admin — Product Grid Bindings
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/allmoxy-products/:id/bindings` | List bindings for product |
| POST | `/api/admin/allmoxy-products/:id/bindings` | Create binding |
| DELETE | `/api/admin/allmoxy-products/:id/bindings/:bindingId` | Delete binding |

### Admin — Pricing Tools
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/formula-test` | Evaluate formula with test inputs; returns result + scope |
| POST | `/api/admin/pricing-diagnostic` | Coverage stats: matched/unmatched SKUs across all orders |
| POST | `/api/admin/products/auto-assign-formulas` | Fuzzy-match products → assign pricingProxyId + exportProxyId + create bindings |
| POST | `/api/admin/products/fix-missing-proxies` | Stem-match products with no proxy assignment |
| POST | `/api/admin/auto-create-bindings` | Create all missing grid bindings for all products |

### Admin — Images
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/products/bulk-upload-images` | Batch upload images (up to 100); filename-match to allmoxy/hardware products; saves as base64 in DB |
| GET | `/api/product-images/by-id/:id/:table` | Serve product image from DB by ID + table (`allmoxy`\|`hardware`) |
| GET | `/api/product-images/*` | Serve product image from object storage by path |
| GET | `/api/admin/products/search-all` | Search across allmoxy + hardware products (`?q=`) |

### Admin — Users & Settings
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/allowed-users` | List allowed users |
| POST | `/api/admin/allowed-users` | Add allowed user (email or username) |
| DELETE | `/api/admin/allowed-users/:id` | Remove user |
| POST | `/api/admin/allowed-users/:id/toggle-admin` | Toggle admin role |
| POST | `/api/admin/bootstrap-admin` | First-time admin setup (no auth required if no admin exists) |
| GET | `/api/admin/is-admin` | Check if current user is admin |
| GET | `/api/admin/check-allowed/:username` | Check if a username is allowed (no auth required) |
| GET | `/api/admin/settings` | List all settings |
| GET | `/api/admin/settings/:key` | Get single setting |
| PUT | `/api/admin/settings/:key` | Upsert setting |
| GET | `/api/admin/output-settings` | Get all `output.*` settings merged with defaults |
| PUT | `/api/admin/output-settings` | Set a single `output.*` key |
| POST | `/api/admin/backfill-file-metrics` | Re-parse all stored CSVs and update file metric columns |

### AgentMail
| Method | Path | Description |
|---|---|---|
| GET | `/api/agentmail/status` | Sync status (last run, counts, error) |
| POST | `/api/agentmail/fetch` | Manually trigger AgentMail fetch + process cycle |
| POST | `/api/agentmail/clear` | Clear all processed AgentMail records |
| POST | `/api/agentmail/test` | Test AgentMail connection |
| DELETE | `/api/agentmail/processed-emails` | Alias for clear processed emails |

### Backup
| Method | Path | Description |
|---|---|---|
| POST | `/api/backup/google-sheets` | Create timestamped Google Sheets backup in Drive folder "Perfect Fit Orders Replit Backup" |
| GET | `/api/backup/status` | Backup scheduler status |

### Miscellaneous
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/color-breakdown` | Per-file color/quantity breakdown from stored CSV (excludes hardware, dovetails, glass; requires `color_grid` match) |

---

## 8. Feature Status

### Core Order Flow

| Feature | Status | Notes |
|---|---|---|
| CSV upload + parsing | ✅ Done | Multi-file projects; extracts metadata, CTS parts, dimensions |
| SKU → product matching | ✅ Done | Longest-prefix-wins; `matchProductToSku()` |
| Pricing formula evaluation | ✅ Done | mathjs + proxy variables + JSONB attribute grid lookups; digit-starting column names sanitized (r25) |
| Re-price button | ✅ Done | `POST /api/orders/:id/reprice` |
| Asana task sync | ✅ Done | Bidirectional; creates + updates tasks; reads PF ORDER STATUS, PRODUCTION STATUS, section |
| Asana auto-import | ✅ Done | Polls "READY TO IMPORT" section every 10 min; dedup via `processed_asana_tasks` |
| AgentMail PDF ingestion | ✅ Done | Polls every 30 min; matches PDFs to order files by job number |
| Outlook integration | ❌ Removed | Removed r25; AgentMail is sole email ingestion method |

### Export Documents

| Feature | Status | Notes |
|---|---|---|
| Cabinet Vision .ORD download | ✅ Done | One `.ord` per CSV file; multi-file → ZIP |
| Invoice PDF | ✅ Done | Per-file or full project |
| Customer packing slip PDF | ✅ Done | |
| Internal packing slip PDF | ✅ Done | No pricing; rack location column |
| ELIAS dovetail PDF | ✅ Done | |
| M&J Shaker door job list PDF | ✅ Done | |
| Cut-to-size PDF | ✅ Done | |
| Hardware CSV download | ✅ Done | |
| Hardware XLSX download | ✅ Done | Bold headers, currency format, totals row |
| Glass items export | ✅ Done | |

### Checklists & Packing

| Feature | Status | Notes |
|---|---|---|
| Packing slip checklist | ✅ Done | Generated from order CSV; items checked off by staff |
| Hardware checklist | ✅ Done | Generated from hardware cross-ref; buyout/BO status tracking |
| Cut-to-size checklist | ✅ Done | Mark individual rod cuts as done |
| Pallet manager | ✅ Done | CRUD; 16-metric packaging dashboard; file assignments; final size → Asana |

### Admin & Configuration

| Feature | Status | Notes |
|---|---|---|
| Attribute grid manager | ✅ Done | Bulk CSV upload; multi-select delete; per-row editing |
| Proxy variable (formula) manager | ✅ Done | CRUD; bulk import; type: PRICE / EXPORT |
| Allmoxy product manager | ✅ Done | Full CRUD; SKU prefix; pricing/export proxy; grid bindings; per-product images |
| Formula tester | ✅ Done | Live evaluation with scope inspector; auto-detect digit-prefix columns |
| Pricing diagnostic | ✅ Done | Coverage stats; "Fix Missing Proxy Assignments"; "Auto-Create Missing Bindings" |
| Bulk product image uploader | ✅ Done | Filename-exact matching; parallel upload to object storage; only `imagePath` persisted in DB |
| Per-product image upload | ✅ Done | Click thumbnail in editor to replace; DELETE clears DB path + deletes object |
| ORD header template | ✅ Done | `{{design_name}}` / `{{po_number}}` placeholders; stored in `app_settings` |
| Output settings toggles | ✅ Done | Per-document image/pricing visibility flags |
| Allowed users whitelist | ✅ Done | Admin role toggle; blocks non-whitelisted Replit users |
| Google Sheets backup | ✅ Done | Daily 3 AM auto-backup + manual trigger; exports 6 sheets |

### Integrations

| Feature | Status | Notes |
|---|---|---|
| Replit Auth (OIDC) | ✅ Done | Session-based; allowed-users whitelist; admin role |
| Asana | ✅ Done | OAuth via Replit Connectors; import + sync + notes |
| AgentMail | ✅ Done | API key via `AGENTMAIL_API_KEY` env var |
| Google Sheets / Drive | ✅ Done | OAuth via Replit Connectors |
| Replit Object Storage | ✅ Done | Used for CTS part config images, uploaded PDFs, and all product images |
| QZ Tray label printing | ✅ Done | Certificate + signing endpoints; client-side printer settings |
| Outlook | ❌ Removed | r25; files deleted, scheduler gone, routes removed |

---

## 9. Known Issues & Bugs

1. **[LOW] `outlook_sync_status` orphaned in production DB only** — Dropped from the development database in r25-c, but still exists in the production database. `outlookSyncStatus` was removed from `shared/schema.ts` in r25-b, so Replit's Publish flow will detect the orphan during its dev↔prod schema diff on the next publish and offer to drop it. No manual action required — agents must NOT write migration scripts, deploy-build hooks, or startup-time DDL to drop it; the supported path is Publish.

2. **[RESOLVED] Grid column digit-prefix UI warning** — Resolved in r28. Grid Manager now displays an amber banner at the top of the selected grid when any column name starts with a digit, listing the offending columns and showing an example formula reference (`alias._{column}` form) so admins know to add the leading underscore.

3. **[RESOLVED] `image_data` columns dropped from DB (Task #32)** — Verified zero non-null rows in both `products` and `allmoxy_products`, then applied `migrations/0008_drop_image_data.sql` directly via SQL (`ALTER TABLE products DROP COLUMN IF EXISTS image_data; ALTER TABLE allmoxy_products DROP COLUMN IF EXISTS image_data;`). Confirmed via `information_schema.columns` that neither column exists anymore. No application code changes were required (Drizzle schema had already removed `imageData` in Task #30).

---

## 10. Changelog (reverse-chronological, recent releases)

### r28 — 2026-05-02 — Post-merge hardening, Grid Manager digit-prefix warning, security patches

**Three small improvements bundled together:**

**A. Non-interactive `db:push` in `scripts/post-merge.sh`** — Post-merge hook
previously hung when `drizzle-kit push` prompted about adding a unique
constraint to a populated table (observed during Task #32 merge). Wrapped the
command with `yes "" |` so any drizzle-kit interactive prompt receives
repeated newlines and auto-accepts the highlighted (default = non-destructive)
option. Prevents future post-merge hangs.

**B. Digit-prefix column warning in Grid Manager**
(`client/src/pages/admin/DynamicGridManager.tsx`) — When the selected
attribute grid has any column whose name begins with a digit (e.g.
`45_AND_90_PRICING_ID`), an amber banner now appears between the toolbar and
the tab bar listing the offending columns and showing an example
(`alias._45_and_90_pricing_id`) so admins know pricing formulas must use a
leading underscore. The pricing engine already sanitizes these automatically;
the banner only addresses the discoverability gap (BUILD_STATUS §9 item 2).
Implementation: `digitPrefixColumns` `useMemo` (line ~116) filters
`selectedGrid.columns` with `/^\d/`; banner renders only when non-empty;
example uses the first binding's alias from `gridBindings` (falls back to
`'alias'`).

**C. Security patches — non-breaking dependency updates**
- `mathjs` 15.1.1 → 15.2.0 (fixes "Improperly Controlled Modification of
  Dynamically-Determined Object Attributes" + "Unsafe object property setter")
- `multer` 2.0.2 → 2.1.1 (fixes two DoS advisories)
- `vite` 7.3.0 → 7.3.2 (fixes path-traversal in optimized-deps `.map`
  handling and `server.fs.deny` query bypass)
- `postcss` 8.4.47 → 8.5.13 (fixes XSS via unescaped `</style>` in CSS
  stringify output)
- Audit total dropped 26 → 22 (high: 10 → 7, moderate: 14 → 13).

**Major-bump advisories deliberately deferred** (require explicit user
approval — high regression risk to ORM, exports, Google integrations):
`drizzle-orm` 0.39 → 0.45, `exceljs` 4.4 → 4-latest, `googleapis` 148 → 171.
Other transitives (`@google-cloud/storage`, `@replit/object-storage`, `uuid`)
have no upstream fix yet.

**Files affected:** `scripts/post-merge.sh`,
`client/src/pages/admin/DynamicGridManager.tsx`, `package.json`,
`package-lock.json`, `BUILD_STATUS.md`.

---

### r27 — 2026-05-02 — Migrate product images from DB to Object Storage (Task #30)

**Problem:** Both `products` and `allmoxy_products` tables stored image bytes as base64 text in `image_data` columns. This bloated DB backups and forced `getProducts()` / `getAllmoxyProducts()` to maintain fragile hand-built column exclusion lists to avoid dragging megabytes of base64 through every list query.

**Changes:**
- **`server/scripts/migrateProductImagesToObjectStorage.ts`** — new idempotent startup backfill: reads any row with `image_data IS NOT NULL` from both tables via raw SQL, uploads to object storage at the row's existing `imagePath` (or synthesizes `product-images/migrated/{table}-{id}.{ext}`), updates `image_path` if null, skips rows whose object already exists. Runs via `backfillMigration.ts` on startup.
- **`server/routes.ts`** — `POST /api/admin/allmoxy-products/:id/image`: now calls `objectStorageService.uploadBuffer()` instead of encoding to base64; only `imagePath` persisted. `DELETE /api/admin/allmoxy-products/:id/image`: reads existing `imagePath`, calls `objectStorageService.deleteObject()` (best-effort), nulls only `imagePath`. `POST /api/admin/products/bulk-upload-images`: uploads each file to object storage, persists only `imagePath`; removed base64 imageData writes. `GET /api/product-images/by-id/:id` and `GET /api/product-images/hardware/by-id/:id`: now look up `imagePath` and call `objectStorageService.downloadBuffer()` instead of decoding base64 from DB. Path-based route `GET /api/product-images/*` unchanged.
- **`shared/schema.ts`** — removed `imageData: text("image_data")` from both `products` and `allmoxy_products`. Removed `ProductListItem = Omit<Product, 'imageData'>` and `AllmoxyProductListItem = Omit<AllmoxyProduct, 'imageData'>` type aliases; both are now plain `= Product` / `= AllmoxyProduct` respectively.
- **`server/storage.ts`** — `getProducts()` and `getAllmoxyProducts()` now use plain `db.select().from(...)` — no hand-built column exclusion needed. Removed `AllmoxyProductListItem` import. Updated comment in `bulkInsertAllmoxyProducts`.
- **`client/src/pages/admin/DynamicGridManager.tsx`** — updated import and query type from `AllmoxyProductListItem` to `AllmoxyProduct`.
- **`migrations/0008_drop_image_data.sql`** — SQL to drop `image_data` from both tables; must be applied manually after confirming zero rows (see Known Issues §9 item 3).

**Files affected:** `server/scripts/migrateProductImagesToObjectStorage.ts` (new), `server/backfillMigration.ts`, `server/routes.ts`, `shared/schema.ts`, `server/storage.ts`, `client/src/pages/admin/DynamicGridManager.tsx`, `migrations/0008_drop_image_data.sql` (new).

---

### r26-a — 2026-05-02 — Clean stale Asana-403 test data

Removed two duplicate test projects (id 8 and 9, both named "TEST PERFECT FIT JOB") from the dev database. Both pointed to Asana task `1213347389204508`, which had become inaccessible (returns 403). The Asana sync-all job was hitting that task every 10 minutes and dumping a verbose stack trace into the logs. Cascade-deleted 8 order files, 16 CTS parts, 182 hardware checklist items, 528 packing-slip items, plus the orphaned `processed_asana_tasks` row referencing the same GID. No code changes — the scheduler now finds zero stale references and the 403 spam is gone.

---

### r26 — 2026-05-02 — BUILD_STATUS.md comprehensive rewrite

Updated BUILD_STATUS.md to incorporate all information extracted directly from `schema.ts` (all 23 tables, all columns), `storage.ts` (full IStorage interface, all ~70 methods), `pricingEngine.ts` (all functions + logic), and `routes.ts` (all 8 377 lines, all ~135 routes fully documented).

---

### r25-b — 2026-05-02 — Remove Outlook Integration

**Files affected:**
- `server/outlook.ts` — deleted
- `server/outlookScheduler.ts` — deleted
- `server/index.ts` — removed Outlook scheduler startup block
- `server/routes.ts` — removed 10 `/api/outlook/*` routes + imports
- `server/storage.ts` — removed `clearProcessedOutlookEmails()` from interface + implementation
- `shared/schema.ts` — removed `outlookSyncStatus` table; retained `processedOutlookEmails` (AgentMail dedup)
- `client/src/pages/Dashboard.tsx` — removed Outlook sync query, two mutations, "Fetch Netley Emails" and "Reset Processed Emails" buttons
- `client/src/pages/HowItWorks.tsx` — removed Outlook callout; updated references to mention AgentMail

**Why:** Outlook was replaced by AgentMail. The Outlook scheduler was throwing a startup warning every boot and running a wasted 30-minute polling loop. The `processed_outlook_emails` table is retained because `agentmailScheduler.ts` uses it for deduplication (keys prefixed with `agentmail:`).

---

### r25-c — 2026-05-02 — Outlook teardown leftovers cleanup

**Files affected:**
- `package.json` / `package-lock.json` — removed `@microsoft/microsoft-graph-client` (unused since r25-b)
- `BUILD_STATUS.md` — replaced two old "Known cleanup items" entries (section 9) with a single entry covering only the prod-DB orphan; reworded the orphaned-table note in section 4 to "production-only, pending next Publish"; deleted dependency-table row for the graph client (section 2)

**Database changes:**
- Dropped orphaned `outlook_sync_status` table from the development database (`DROP TABLE IF EXISTS outlook_sync_status`)
- Production drop deferred to next Publish: the database skill's production query path is read-only and rejects DDL. Because `outlookSyncStatus` was already removed from `shared/schema.ts` in r25-b, Replit's Publish flow will detect the orphan during its dev↔prod schema diff on the next publish and drop it then. No code or migration script written for prod.

**Why:** Closes out the Outlook integration removal — drops dead weight from the dependency tree and the dev DB. AgentMail email ingestion is unaffected; `processed_outlook_emails` is intentionally retained as it is reused by `agentmailScheduler.ts` for AgentMail dedup keys (`agentmail:` prefix).

---

### r25-a — 2026-05-02 — Fix TFL Shaker Door Pricing (Digit-Starting Column Names)

**Files affected:** `server/services/pricingEngine.ts`

**Root cause:** mathjs tokenizes `doors.45_and_90_pricing_id` as `doors × 0.45 × _and_90_pricing_id`, throwing `multiplyScalar (... actual: Object)` and yielding $0.00 on every TFL Shaker door line item.

**Fix:**
1. `gridRowToScope()` writes `_`-prefixed alias for any key starting with a digit.
2. New `sanitizeDigitAccessors(formula)` rewrites `obj.digit-prop` → `obj._digit-prop`.
3. `evaluatePrice()` applies `sanitizeDigitAccessors` before mathjs eval.

**Verified:** `LDRTFL90SHA` · 489.1mm × 2269mm · TFL1W → $187.50/door (was $0.00).

---

### r24 — 2026-04-14 — Fix Door Pricing (LDRTFL90SHA / RDRTFL90SHA)

Earlier door pricing fix round. See `CHANGELOG.md` for full detail on r1–r24.
