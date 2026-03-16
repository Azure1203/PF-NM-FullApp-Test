# PERFECT FIT CLOSETS
## Allmoxy Clone — Order Management System
### Master Architecture Specification v4.0

---

## 1. Purpose & Scope

This document is the single authoritative reference for building the Perfect Fit Closets order management system — an Allmoxy replacement built on Replit. It captures every system requirement, data model, formula pattern, output document, and build prompt needed to take the application from the current test-app state to full production.

The system processes CSV orders and produces:

- Priced invoice / bid documents
- Cabinet Vision .ORD files for CNC production
- Customer and internal packing slip PDFs
- Supplier-specific exports (grouped by product exportType)
- ERP import file (component + hardware lines)
- Cut-to-size part list

All products, pricing formulas, export formulas, attribute grids, and grid bindings are manually configured by the admin through the UI. The app does not hardcode any specific products, SKUs, supplier names, grid names, or formula definitions — it provides the engine and the admin provides the data.

The replacement must be dramatically easier to manage than Allmoxy — pricing changes via form-based tables, not code, and the system must self-document how every product is priced.

---

## 2. System Architecture

### 2.1 Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + TypeScript | Vite, Wouter, TanStack Query, shadcn/ui, Tailwind CSS |
| Backend | Express.js + TypeScript | REST API, Multer, csv-parse |
| Database | PostgreSQL + Drizzle ORM | Schema in shared/schema.ts; Drizzle Kit migrations |
| Pricing Engine | mathjs | Formula evaluation with variable substitution |
| ORD Export | Template engine | ordExporter.ts — per-product placeholder blocks |
| Hosting | Replit | github.com/Azure1203/PF-NM-FullApp-Test |

### 2.2 Key Design Principles

- **Template inheritance**: shared pricing formulas defined once, inherited across product categories — not duplicated per product as in Allmoxy
- **Form-driven management**: all pricing changes via table UI, not code editors
- **Self-documenting**: every product shows its formula, the variables it uses, and what grid it reads from
- **SKU-prefix matching**: CSV line items matched to products via skuPrefix field
- **Manual data management**: all products, proxy variables (pricing and export formulas), attribute grids, and grid bindings are added and assigned manually through the admin UI. There are no bulk seed, auto-assign, or setup wizard features — the admin is the only person configuring the system and does so deliberately through forms. The backend only needs to provide the CRUD endpoints and the runtime pricing/export engine that consumes the manually configured data.
- **Future-ready schema**: customer-specific price adjustments, validation rules, and automation triggers built in from the start

---

## 3. Database Schema

### 3.1 products (implemented as `allmoxy_products`)

Central product catalog. Every CSV line item must match a row via skuPrefix.

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| skuPrefix | text UNIQUE NOT NULL | Matches CSV product_name prefix |
| name | text NOT NULL | Display name shown in admin UI |
| category | text | Admin-defined category for grouping |
| pricingProxyId | integer FK | References proxy_variables.id — the pricing formula for this product |
| exportProxyId | integer FK | References proxy_variables.id — the export formula for this product |
| exportType | text | Routing tag for which output file this product belongs to (e.g. 'ORD', 'CTS', etc.) — admin-defined per product |
| supplyType | text | 'STOCK' or 'BUYOUT' — admin-defined per product |
| isCustomCut | boolean | True = length-based pricing |
| isHardware | boolean | True = flat per-unit, no dimensions |
| supplierName | text | Supplier name for routing to correct export |
| active | boolean DEFAULT true | Soft delete |

> **Implementation note**: In the codebase this table is named `allmoxy_products`. The separate `products` table is the internal hardware catalog. Columns `isCustomCut`, `isHardware`, `supplierName`, `active`, and `category` are spec-defined but not yet added to `allmoxy_products`.

### 3.2 attribute_grids

Named lookup tables (one CSV each). Each grid has rows of options and columns of data values.

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| name | text UNIQUE NOT NULL | Admin-defined name (typically from CSV filename) |
| displayName | text | Human-readable label for UI |
| columnHeaders | jsonb | Array of column names from CSV header row (built as `columns`) |
| updatedAt | timestamp | Last CSV import date |

> **Implementation note**: Built column is named `columns` (not `columnHeaders`). `displayName` and `updatedAt` are not yet added. Also has an extra `keyColumn` field for default lookup key.

### 3.3 attribute_grid_rows

One row per option in a grid (e.g. each color, each shelf pricing tier).

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| gridId | integer FK | References attribute_grids.id |
| rowKey | text | The lookup key (value from the lookup column) — built as `lookupKey` |
| rowData | jsonb | All column values for this row as key:value pairs |
| sortOrder | integer | Display order in admin UI — not yet added |

### 3.4 product_grid_bindings

Declares which attribute grids a product's formula reads from, and what namespace alias to use.

| Column | Type | Description |
|---|---|---|
| productId | integer FK | References products.id |
| gridId | integer FK | References attribute_grids.id |
| alias | text NOT NULL | Variable namespace in formula — admin-defined per binding |
| lookupKey | text | CSV column name supplying the row key, or 'fixed:VALUE' — built as `lookupColumn` |

### 3.5 proxy_variables

Named computed values reusable across formulas — e.g. `sq_ft = (height*width)/92900`.

| Column | Type | Description |
|---|---|---|
| name | text UNIQUE NOT NULL | Variable name used in formulas |
| formula | text NOT NULL | mathjs expression — e.g. `(height * width) / 92900` |
| description | text | Human explanation of what this computes — not yet added |
| type | text | 'pricing' or 'export' — added in implementation |

### 3.6 order_items

Persists every processed CSV line item with all computed pricing and export data.

| Column | Type | Description |
|---|---|---|
| orderId | integer FK | References orders.id — built as `projectId` (also has `fileId`) |
| productId | integer FK | Resolved product |
| quantity | integer | |
| height, width, length, thickness | numeric | Dimensions in mm — built uses `depth` instead of `length`+`thickness` |
| colorCode | text | Color code from CSV row — not yet added |
| unitPrice | numeric | Computed by pricing engine |
| lineTotal | numeric | unitPrice × quantity — built as `totalPrice` |
| formulaSnapshot | text | Formula text at calculation time (audit) — not yet added |
| variableSnapshot | jsonb | All variable values used (audit) — not yet added |
| ordExportBlock | text | Rendered ORD block for this line — not yet added |
| exportText | text | Rendered supplier export row (if applicable) |
| erpExportRow | text | Rendered ERP import row — not yet added |

> **Implementation note**: Built also includes `sku`, `description`, `pricingError`, `rawRowData`, `exportType`, `supplyType` — additions beyond spec.

### 3.7 orders (implemented as `projects`)

| Column | Type | Description |
|---|---|---|
| orderName | text | Order/project name from CSV or manual entry — built as `name` |
| jobNumber | integer | Auto-assigned job number |
| status | text | 'bid' \| 'production' \| 'shipped' |
| orderTotal | numeric | SUM of order_items.lineTotal |
| asanaTaskId | text | Asana task GID |
| palletCount | integer | Calculated pallet recommendation |

> **Implementation note**: The `projects` table is significantly richer than the spec — includes dealer, shippingAddress, phone, taxId, powerTailgate, phoneAppointment, pfOrderStatus, pfProductionStatus array, asanaSection, cienappsJobNumber, lastAsanaSyncAt, notes, buyoutHardware, createdAt. The system also has an `order_files` sub-table so multiple CSV files can belong to one project — this is an evolution beyond the spec.

---

## 4. Pricing Formula Reference

All formulas stored in `proxy_variables.formula`, evaluated by mathjs. Variables come from: (1) CSV dimensions, (2) resolved attribute grid rows, (3) proxy variables.

### 4.1 Variable Namespaces

| Variable Source | How It Works | Example (illustrative) |
|---|---|---|
| CSV dimensions | height, width, length, thickness — always available from CSV row | height = 355.625 |
| quantity | CSV line item quantity | quantity = 5 |
| [alias].* | Grid binding alias → resolved row data columns, all lowercase | If a product binds to a grid with alias 'color', formulas use `color.base_price`, etc. |
| [proxy_name] | Proxy variables (computed values) | A proxy named 'sq_ft' with formula `(height * width) / 92900` |

The alias names (color, shelves, etc.) are set by the admin when configuring grid bindings per product. The app treats them as arbitrary namespaces — it does not know or care what they are called.

### 4.2 Formula Pattern Types

The pricing engine supports any mathjs expression. The admin creates formulas as proxy variables and assigns them to products. Common formula patterns include:

**Square Footage Panel Pricing (two branches)**

Branch 1 (color upcharge from grid percentage field):
```
(base_price + max(floor_min, sq_ft) * sq_ft_price) * (1 + [alias].upcharge_field) * (1 + margin)
```

Branch 2 (sq ft rate from grid directly):
```
(base_price + max(floor_min, sq_ft) * [alias].sqft_price) * (1 + margin)
```

`sq_ft = (height * width) / 92900` [proxy variable; 92900 mm² per sq ft]

**Surface Area Pricing (e.g. drawer boxes)**
```
surface_area = (height*width*2) + (width*length) + (length*height*2)
(base_price + surface_area/92900 * sq_ft_price) * upcharge * margin
```

**Dimension-Based Door Pricing**

Size in sq ft computed using inches (ceil to next inch). Min size applied. Rate selected by a `pricing_id` field in the grid row that points to different cost columns in the color grid.

**Custom Cut Linear Pricing (rods, rails, moldings)**
```
([alias].price * (length / 25.4)) * (1 + [alias].margin) + [alias].price_per_cut
```

**Flat Per-Unit Pricing (hardware, slides, handles, hinges)**
```
[alias].price * (1 + [alias].margin)
```

**Buyout / No Formula**

Price is a fixed value from the grid row. No formula evaluation needed.

These are patterns, not hardcoded formulas. The admin writes the actual mathjs expressions as proxy variables and can create any formula structure the pricing logic requires.

---

## 5. Attribute Grids

Attribute grids are named lookup tables uploaded as CSVs by the admin. The system does not hardcode any specific grid names, column names, or row counts. The admin creates as many or as few grids as needed.

Each grid has:
- A name (set by the admin or derived from the CSV filename)
- Column headers (from the CSV header row)
- Rows of data (each row has a key value and data columns)

Products reference grids through grid bindings, which specify:
- Which grid to bind to
- An alias (the variable namespace used in formulas)
- A lookup column (which CSV column in the order file provides the key to look up the correct row)

When the pricing engine processes a CSV line item, it uses the grid bindings to look up the correct row in each bound grid, then makes all of that row's column values available to the formula under the alias namespace (e.g. if alias = 'color' and the row has a column 'base_price' with value 5.00, the formula can reference `color.base_price`).

---

## 6. Output Documents

### 6.1 Invoice / Bid

Header: Company logo, Bill To, Ship To, Order Name, Status, Payment Due, Ship Date, Project & CNC Label #.

Body: One bordered section per SKU group. Section shows: SKU + Color header, table of line items (ID, Qty, Height, Width, Length/Thickness, product type label, Price, Total), section subtotal.

Footer: Original Total, Discount Amount, Final Order Total.

Products appear in CSV input order. Generated as PDF.

### 6.2 Customer Packing Slip

Same structure as Invoice but without Price and Total columns. Header reads CUSTOMER PACKING SLIP / SEND WITH ORDER IN MARKED ENVELOPE. Packing List # shown with barcode.

### 6.3 Internal Packing Slip

Matches Customer Packing Slip with these additions:
- Extra 'hidden attribute for aligning' column (always 0) between Width and Thickness
- 'Buyout Or Stock?' column for hardware and rod items
- 'Rack Location' column for items with known rack positions
- CNC thumbnail image to the left of each SKU header block

Marked 'INTERNAL PACKING LIST (DO NOT SEND WITH JOB)'. No pricing shown.

### 6.4 Cabinet Vision .ORD File

One block per line item that has an export formula assigned. The export formula is a template with `{{placeholders}}` that get substituted with values from the CSV row and resolved grid data. The admin defines these templates as export-type proxy variables. Example structure:

```
[Catalog]
Name="{{catalog_name}}"
Materials="{{color.panel_export}}"

[Parameters]
Attribute="Banding","xPFC_BAND","text","{{EL}}{{ER}}{{ET}}{{EB}}"

[Cabinets]
1,"{{product_name}}",{{width}},{{height}},{{thickness}},"*","N",{{quantity}}

;
```

Banding code: E = edge present, N = none. Order: Left, Right, Top, Bottom. Products without export formulas do not produce ORD blocks.

### 6.5 Supplier Export (e.g. Dovetail Drawer Boxes) — ELIAS export type

CSV export for supplier orders. Products are grouped into supplier exports based on their `exportType` field (admin-defined per product). The export template is defined by the admin as an export-type proxy variable using `{{placeholders}}` that reference grid data columns. The template structure is driven entirely by data the admin enters — the app does not hardcode any specific supplier field names.

### 6.6 Door Supplier Export (e.g. 5-Piece Shaker Doors) — MJ export type

CSV export for door supplier orders. Products with `exportType = 'MJ'` are grouped into this export. Like the dovetail export, the template is an admin-defined proxy variable with `{{placeholders}}` resolved from grid data.

### 6.7 ERP Import File

```
Components:
{{quantity}},{{product_name}},{{width}},{{height}},{{thickness}},COMPONENT,,,,,,,,,,,,,,

Drawer Boxes:
{{quantity}},{{product_name}},{{width}},{{height}},{{length}},COMPONENT,,,,,,,,,,,,,,

Hardware:
{{quantity}},{{product_name}},,,,HARDWARE,,,,,,,,,,,,,,
```

19 trailing commas are fixed empty ERP fields.

### 6.8 Cut-to-Size Part List

Internal document for custom-cut items (products with `isCustomCut = true`). Shows per product: ID, Qty, Length, Buyout Or Stock?, Rack Location. Item Totals section: sum of all lengths × qty in mm, in inches, and total stock units required.

---

## 7. CSV Input Format

### 7.1 Column Mapping

| CSV Column | Maps To | Notes |
|---|---|---|
| product_name / MANU_CODE / SKU | skuPrefix match | Matched by longest prefix match against product skuPrefix values |
| quantity / Qty | order_items.quantity | |
| height / Height | order_items.height | In mm |
| width / Width | order_items.width | In mm |
| length / Length | order_items.length | Used for drawer boxes, rods, etc. |
| thickness | order_items.thickness | In mm |
| color / Color | colorCode → grid lookup | Lookup key for color grid binding |
| edge_left/right/top/bottom | order_items.edge_* | 1 = banded, 0 = none → ORD banding string |

### 7.2 SKU Prefix Matching

Pipeline checks whether the CSV `product_name` column starts with any product's `skuPrefix`. Uses longest-prefix-match so that more specific prefixes win over shorter ones (e.g. a SKU 'ABCD_123_456' matches product with skuPrefix 'ABCD_123' over product with skuPrefix 'ABCD'). Unmatched rows are logged as warnings and skipped without failing the import.

---

## 8. Order Processing Pipeline

| # | Step | Detail |
|---|---|---|
| 1 | CSV Parse | Multer + csv-parse; validates required columns |
| 2 | Order Create | Insert orders row; assign jobNumber |
| 3 | SKU Match | Find product by skuPrefix; log warnings for misses |
| 4 | Grid Resolution | Load product_grid_bindings; fetch attribute_grid_rows by lookupKey |
| 5 | Variable Build | Assemble mathjs scope: dimensions + grid values + proxy vars |
| 6 | Price Eval | `mathjs.evaluate(product.pricingFormula, scope)` |
| 7 | Export Render | Substitute placeholders in all export templates |
| 8 | Persist | Insert order_items row with all computed values and snapshots |
| 9 | Order Total | `UPDATE orders SET orderTotal = SUM(order_items.lineTotal)` |
| 10 | Pallet Calc | Calculate pallet count from panel dimensions |
| 11 | Asana Sync | Create/update Asana task with order summary |

---

## 9. Admin UI Pages

All system configuration is performed manually through these admin pages. There are no setup wizards, seed scripts, or auto-assign features. The admin adds products, creates proxy variables, uploads attribute grids, and wires everything together through the UI.

### 9.1 Product Manager

- Table of all products — skuPrefix, name, category, active toggle
- Expand to full editor: basic fields, SKU prefix, export type, supply type
- Manually assign a Pricing Formula (proxy variable dropdown) and Export Formula (proxy variable dropdown) per product
- Manually configure Grid Bindings per product: select which attribute grid to bind, set the alias (variable namespace in formula), and set the CSV lookup column
- Formula tester built into product editor: enter test dimensions and color → see full variable resolution and computed price
- 'How is this product priced?' self-documentation panel showing formula in plain English

### 9.2 Attribute Grid Manager

- Table of all grids — name, row count, last updated
- Upload CSV to create or refresh a grid; view/edit individual rows in paginated table
- See which products bind to each grid
- Grids are manually created by uploading attribute CSV files

### 9.3 Proxy Variable Manager

- Table of all proxy variables — name, type (pricing or export), formula, description; inline edit
- Manually create new pricing formulas (mathjs expressions) and export formulas (ORD template blocks with `{{placeholders}}`)
- These are the formulas assigned to products via the Product Manager dropdowns

### 9.4 Order Processing Dashboard

- Drag-and-drop CSV upload; shows matched/unmatched SKUs, total, download buttons for all outputs

### 9.5 Formula Tester / Pricing Sandbox

- Select product, enter test dimensions and color → shows full variable resolution, intermediate values, and final price

---

## 10. Manual Setup Workflow

There are no setup wizards, seed scripts, auto-assign features, or auto-classify features in this system. All configuration is performed manually by the admin through the UI. The backend only needs to provide CRUD endpoints for products, proxy variables, attribute grids, and grid bindings, plus the runtime pricing/export engine that consumes them.

### 10.1 Setup Order

| Step | Action | Where |
|---|---|---|
| 1 | Upload attribute grid CSVs | Attribute Grid Manager — drag and drop CSV files to create grids |
| 2 | Create pricing formulas (mathjs expressions) | Proxy Variable Manager — add new variable with type = pricing |
| 3 | Create export formulas (ORD template blocks) | Proxy Variable Manager — add new variable with type = export |
| 4 | Create products with SKU prefixes | Product Manager — new product form with skuPrefix, name, category, export type, supply type |
| 5 | Assign pricing formula to each product | Product Manager — select from pricing proxy variable dropdown |
| 6 | Assign export formula to each product | Product Manager — select from export proxy variable dropdown |
| 7 | Configure grid bindings for each product | Product Manager — add grid bindings with alias and CSV lookup column |
| 8 | Test pricing with formula tester | Product Manager — formula tester panel, enter test dimensions |

### 10.2 What the Backend Must Provide

- CRUD API for products (with skuPrefix, pricingProxyId, exportProxyId, exportType, supplyType fields)
- CRUD API for proxy variables (name, type, formula)
- CRUD API for attribute grids (CSV upload, row editing)
- CRUD API for product grid bindings (gridId, alias, lookupColumn)
- Runtime pricing engine: mathjs evaluation with grid variable resolution
- Runtime export engine: template substitution for all export types (ORD, supplier exports, ERP)
- Formula tester endpoint for sandbox pricing evaluation
- SKU-prefix matching at order upload time to resolve CSV line items to products

### 10.3 What the Backend Does NOT Need

- No seed-formulas endpoint (formulas are created manually)
- No auto-assign-formulas endpoint (formula assignments are manual)
- No auto-assign-grid-bindings endpoint (bindings are manual)
- No auto-classify-export-types endpoint (export types set manually)
- No setup wizard page or component
- No hardcoded SKU-to-formula mapping arrays
- No hardcoded formula definition arrays

---

## 11. Sequential Build Prompts

Run these 13 prompts in order in Replit. Commit to GitHub after each. Each prompt references this spec document.

| # | Prompt Title | Deliverable |
|---|---|---|
| 1 | Schema Foundation | Add skuPrefix to products; create product_grid_bindings, order_items tables; Drizzle migration |
| 2 | Grid Binding UI | Admin page to manage which grids a product binds to, with alias and lookupKey fields |
| 3 | SKU Prefix + Product Admin | skuPrefix field in product editor; unique constraint; search/filter by prefix |
| 4 | Pipeline Rewrite | Replace naive pipeline with SKU-prefix matching, grid resolution, mathjs pricing, snapshot storage |
| 5 | Formula Tester UI | Pricing sandbox: pick product, enter dims → full variable breakdown and computed price |
| 6 | Order Item Persistence | order_items fully populated; order total computed; order detail page shows itemized pricing |
| 7 | ORD Export Improvements | Per-product ORD template management; assembler uses persisted ordExportBlock from order_items |
| 8 | Supplier + ERP Exports | Generate supplier-specific exports and ERP import from order_items; downloadable from order page |
| 9 | Cut-to-Size Part List | CTS document from custom-cut items; printable part list format |
| 10 | Invoice + Packing Slips | Generate Invoice PDF, Customer Packing Slip PDF, Internal Packing Slip PDF |
| 11 | Packing Checklist UI | Hardware packing checklist from order_items; check-off UI; print view |
| 12 | Asana Sync + Pallet Tracking | Full Asana task creation/update; pallet count calculation; order status sync |
| 13 | Google Sheets Backup | Daily automated + manual backup of orders and order_items to Google Sheets |

---

## 12. Integrations

### 12.1 Asana

Each order creates/updates an Asana task. Task contains order name, job number, total, ship date, status. Webhooks update order status.

### 12.2 AgentMail

Receives inbound packing slips and hardware CSVs. Future: outbound delivery of export files to recipients.

### 12.3 Google Sheets

Daily automated backup + manual backup of orders and order_items.

### 12.4 Outlook

Fetch packing slips and hardware CSVs from inbox. Future scope.

---

## 13. Testing & Validation Strategy

- Upload reference CSV files; compute prices; compare to known invoice totals from reference PDFs
- ORD diff: compare generated .ORD content against reference .ORD template files line-by-line
- Export validation: supplier exports and ERP exports validated against known-good samples
- System health dashboard: last test run, pass/fail counts, pricing drift alerts

Regression suite runs automatically on each CSV upload during the Allmoxy transition period.

---

## Appendix: Formula Quick Reference

| Concept | Formula / Value |
|---|---|
| sq_ft (proxy) | `(height × width) / 92900` |
| box surface area (proxy) | `(h×w×2) + (w×l) + (l×h×2)` |
| door sq ft (proxy, inches-based) | `ceil(h/25.4) × ceil(w/25.4) / 144` |
| rod length in inches (proxy) | `length / 25.4` |
| pricing_id=1 panels | `(base + max(floor_min, sq_ft) × sq_ft_price) × (1 + color_upcharge) × (1 + margin)` |
| pricing_id=2 panels | `(base + sq_ft × color.sqft_price) × (1 + margin)` |
| custom cut rod/rail | `(price × length_in) × (1 + margin) + price_per_cut` |
| flat hardware/slides/hinges | `item.price × (1 + item.margin)` |
| banding string | E if edge=1, N if edge=0; order = Left, Right, Top, Bottom |
| 92900 | mm² per square foot (304.8² = 92,903 ≈ 92,900) |

---

## 14. Implementation Status & Known Gaps (added during build)

This section tracks where the built system diverges from the spec above.

### Built and Matches Spec
- `attribute_grids`, `attribute_grid_rows`, `product_grid_bindings`, `proxy_variables`, `allmoxy_products` (core fields)
- All admin UIs: Product Manager, Attribute Grid Manager, Proxy Variable Manager
- SKU-prefix matching pipeline at CSV upload
- mathjs formula evaluation + grid resolution engine
- Formula tester endpoint (`POST /api/admin/formula-test`)
- All output documents: Invoice PDF, Customer/Internal Packing Slips, ELIAS export, MJ export, ERP export, CTS export
- All four integrations: Asana, AgentMail, Google Sheets backup, Outlook

### Built But Evolved Beyond Spec
- `orders` table is `projects` with 20+ columns (dealer, shipping address, production status array, etc.)
- System has `order_files` sub-table — multiple CSVs can belong to one project
- Full pallet management system (`pallets`, `pallet_file_assignments`) — not in spec
- Hardware checklist + packing slip checklist UIs with check-off, timestamps, buyout tracking
- CTS parts have dedicated `cts_parts` + `cts_part_configs` tracking tables

### Gaps — In Spec, Not Yet Built
- `allmoxy_products` missing columns: `isCustomCut`, `isHardware`, `supplierName`, `active`, `category`
- `order_items` missing audit/ORD columns: `formulaSnapshot`, `variableSnapshot`, `ordExportBlock`, `erpExportRow`, `colorCode`
- `proxy_variables` missing `description` column
- `attribute_grids` missing `displayName` and `updatedAt` columns
- `attribute_grid_rows` missing `sortOrder` column
- Cabinet Vision .ORD file assembly from per-line `ordExportBlock` values (the final .ORD assembler endpoint)
- Pricing audit trail — formula + variable snapshots stored at calculation time
