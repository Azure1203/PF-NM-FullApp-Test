# CHANGELOG — Perfect Fit Closets / Netley Millwork Order Management System
> Replit full-stack app · React + Express + PostgreSQL
> Last updated: 2026-03-21

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
