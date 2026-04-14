# Allmoxy vs Perfect Fit Closets App — Gap Analysis

## Context

Allmoxy is a general-purpose manufacturing order management platform. Your app replaces **only the subset of Allmoxy functionality** that Perfect Fit / Netley Millwork actually uses: CSV order ingestion → pricing → output document generation. You don't need Allmoxy's customer portal, quoting workflow, multi-customer management, or ordering UI.

---

## What Allmoxy Does That Your App Already Handles ✅

These are fully functional and equivalent (or better) than Allmoxy:

| Allmoxy Feature | Your App Status |
|---|---|
| **Product catalog with SKU prefixes** | ✅ 2,363 products in `allmoxy_products` with skuPrefix matching |
| **Attribute grids** (35 option tables) | ✅ All 35 grids imported, editable, multi-file CSV upload |
| **Proxy variables** (shared formulas) | ✅ ~55 proxy variables, evaluated in order, pre-computed into scope |
| **Product-grid bindings** (alias mapping) | ✅ Auto-create, diagnostic page, reset & recreate |
| **CSV order import** | ✅ Multi-file upload, header-aware parsing, Allmoxy column names handled |
| **Pricing engine** (mathjs formulas) | ✅ All formula patterns working: panels, doors, hardware, CTS, drawers |
| **Invoice PDF** | ✅ ReportLab, matches reference layout |
| **Customer Packing Slip PDF** | ✅ No pricing, "SEND WITH ORDER" header |
| **Internal Packing Slip PDF** | ✅ Rack locations, hidden alignment column, "DO NOT SEND" |
| **Cabinet Vision .ORD files** | ✅ One .ord per CSV file, 8-field standard format, ZIP download |
| **Elias Dovetail Drawer CSV** | ✅ Template-based export with all drawer_boxes grid fields |
| **M&J Shaker Door PDF** | ✅ Drawer fronts + doors + glass sections, Premoule supplier |
| **ERP Import CSV** | ✅ Component + Hardware lines with 19 trailing commas |
| **Cut-to-Size PDF** | ✅ Length summary, item table, rod totals |
| **Product images** | ✅ Base64 in DB, bulk upload, per-product upload |
| **Formula tester** | ✅ Live sandbox with grid lookups, binding status panel |
| **Pricing diagnostics** | ✅ Health check, auto-create bindings, wrong-grid detection |

---

## What Allmoxy Does That Your App Still Needs 🔧

These are features Allmoxy provides that are either missing, partially built, or broken:

### 1. Export Template Resolution for Non-ORD Exports — PARTIALLY DONE

**Allmoxy behavior:** Every product has per-exporter templates. When you click "Send To → Cabinet Vision", Allmoxy evaluates the ORD template for each item. When you click "Send To → Elias", it evaluates the Elias template. Each export type has its own template with `{{placeholder}}` resolution.

**Your app:** The ORD export template resolution works (`generateOrdItemBlock` resolves `{{color.panel_export}}`, `{{product_name}}`, etc.). But the Elias CSV, M&J CSV, and ERP CSV exports currently just use the raw `exportText` field from `order_items` — which is only populated by the ORD export proxy. The Elias/MJ/ERP templates in your project knowledge (e.g., `elias_exporter.txt`, `MJ_Export_Formula.txt`, `ERP_Component_export.txt`) define the correct placeholder formats, but there's no separate export proxy for each type.

**Gap:** Elias CSV download currently outputs basic item data (sku, qty, dimensions) rather than the fully-resolved template with `drawer_boxes.elias_style`, `drawer_boxes.elias_species`, etc. Same for M&J CSV (missing `mjdoors.mj_hinges`, `mjcolors.mj_color`, etc.).

**Impact:** Medium-high. Elias and M&J suppliers need specific field formats.

### 2. Per-File Output Documents — PARTIALLY DONE

**Allmoxy behavior:** Each CSV order file gets its own independent set of output documents.

**Your app:** The `?fileId=N` query parameter was added to all endpoints in r22, and the UI now has a file sidebar. But need to verify that all PDF generators actually use the `fileLabel` to show the room/file name in the document header, and that every tab correctly passes `fileId`.

**Impact:** Medium. Functionally the filtering works but the polish may be incomplete.

### 3. Downloadable Exports for All Output Types — MOSTLY DONE

**Allmoxy behavior:** Every output page has a "Send To" dropdown that downloads the file.

**Your app status by type:**

| Output | Viewable | Downloadable | Format |
|---|---|---|---|
| Invoice PDF | ✅ iframe | ✅ download button | PDF |
| Customer Packing Slip | ✅ iframe | ✅ download button | PDF |
| Internal Packing Slip | ✅ iframe | ✅ download button | PDF |
| Cabinet Vision ORD | ✅ preview | ✅ download (.ord or .zip) | ORD |
| Elias PDF | ✅ iframe | ✅ download button | PDF |
| Elias CSV | ❌ no tab button | ✅ endpoint exists | CSV |
| M&J PDF | ✅ iframe | ✅ download button | PDF |
| M&J CSV | ❌ no tab button | ✅ endpoint exists | CSV |
| ERP CSV | ❌ no tab button | ✅ endpoint exists | CSV |
| CTS PDF | ✅ iframe | ✅ download button | PDF |
| Hardware | ✅ data table | ❌ no download | — |
| Glass | ✅ data table | ❌ no download | — |

**Gap:** Hardware needs CSV + XLSX download buttons (covered in r23 prompt). Elias/MJ/ERP CSV download endpoints exist but the UI tabs may not have download buttons for the CSV versions (only the PDF versions). Glass has no download at all.

### 4. SKU Prefix Collision Resolution — BUG

**Allmoxy behavior:** Longest-prefix-first matching. `LDRTFL90SHAGD` matches before `LDRTFL90SHA`.

**Your app:** Products are matched in database iteration order, not sorted by prefix length. Shorter prefixes can shadow longer ones.

**Impact:** High. Causes wrong product match → wrong formula → $0.00 or wrong price. Affects all door variants with GD/non-GD suffixes.

### 5. Hinge Hole Cost Calculation — NOT BUILT

**Allmoxy behavior:** Door and drawer front products have a separate hinge hole drilling cost added on top of the base price. The spec references `doors_hinge_hole_cost.txt`, `hamper_doors_hinge_hole_cost.txt`, and `mjdoors_hinge_hole_cost.txt` as separate pricing components.

**Your app:** The `HINGE_HOLE_COST` column exists in the Doors grid data, but the pricing formula doesn't add it. The door pricing formula calculates the panel area cost but doesn't add `doors.hinge_hole_cost * quantity` or similar.

**Impact:** Low-medium. Affects door pricing accuracy but may be folded into the sq ft rate.

### 6. "How Is This Product Priced?" Self-Documentation — NOT BUILT

**Allmoxy behavior:** N/A (Allmoxy doesn't have this — it's a spec goal for your app to be *better* than Allmoxy).

**Your spec says:** Each product should show a "How is this product priced?" panel that explains the formula in plain English, shows which grids it reads from, and what variables contribute to the final price.

**Your app:** The Formula Tester serves a similar purpose but requires manual product selection. The Product Manager shows which proxy is assigned but doesn't render a human-readable explanation of the formula.

**Impact:** Low. Nice-to-have for admin usability.

### 7. Pricing Validation / Regression Testing — NOT BUILT

**Allmoxy behavior:** N/A (manual verification).

**Your spec says:** Upload 8 reference CSV files, compute prices, compare to known invoice totals. ORD diff against 8 reference templates. System health dashboard with pass/fail counts.

**Your app:** The Pricing Diagnostic page checks for configuration issues (missing bindings, formulas) but doesn't do output validation against known-good reference files.

**Impact:** Medium. Important for confidence during the Allmoxy transition but not a daily workflow need.

### 8. Export Proxy per Export Type — ARCHITECTURAL GAP

**Allmoxy behavior:** Each product has separate "parts" for each exporter. A shelf product has a Cabinet Vision part, an ERP part, etc. Each part has its own template.

**Your app:** Each product has ONE `exportProxyId` which generates `exportText` — currently only used for ORD blocks. The Elias, M&J, and ERP export templates exist in project knowledge but aren't wired as separate per-product proxies. Instead, the Elias/MJ/ERP CSV endpoints just dump raw item fields.

**What this means:** The Elias CSV download works but only outputs basic dimensions — not the fully-resolved template with `drawer_boxes.elias_style`, `drawer_boxes.elias_species`, etc. For Elias to work properly, the CSV export needs to resolve the template against the item's grid data at download time (or at upload time with a separate `eliasExportText` field).

**Impact:** High for Elias supplier accuracy. The current Elias CSV is missing ~11 supplier-specific fields.

---

## What Allmoxy Does That You DON'T Need ❌

These are Allmoxy features your app intentionally skips:

| Allmoxy Feature | Why Not Needed |
|---|---|
| Customer-facing ordering portal | Single customer (Netley) sends CSVs directly |
| Quoting / bid workflow | Orders arrive pre-quoted from Allmoxy during transition |
| Multi-customer management | Single customer |
| Shopping cart / product configurator | N/A — CSV-based input |
| Payment processing | Handled outside the system |
| Shipping label generation | Manual process |
| User-facing product catalog | Internal tool only |
| Mobile ordering app | Desktop admin tool |
| Customer notifications | Asana handles communications |

---

## Priority Summary — What to Build Next

| # | Item | Effort | Impact |
|---|---|---|---|
| 1 | **SKU prefix collision fix** (sort by length desc) | Small (3 lines × 3 locations) | Fixes door pricing errors |
| 2 | **Hardware CSV + XLSX download** | Small (2 new endpoints + 2 buttons) | Completes output downloads |
| 3 | **Elias CSV template resolution** | Medium (resolve template at export time using grid data) | Correct supplier format |
| 4 | **Download buttons for Elias/MJ/ERP CSVs in UI** | Small (add buttons to tabs) | All exports downloadable |
| 5 | **Glass CSV/XLSX download** | Small (same pattern as hardware) | Completes output downloads |
| 6 | **Packing & Shipping UI revert** | Small (link to standalone pages) | Better UX |
| 7 | **Verify per-file PDF headers** | Small (check fileLabel in Python scripts) | Correct document titles |
| 8 | **overflow-hidden removal** | Small (CSS fix) | Fix scroll truncation |
| 9 | **Hinge hole cost in door formula** | Small (add term to formula) | Pricing accuracy |
| 10 | **Pricing regression test suite** | Medium (8 reference files + comparison) | Transition confidence |

Items 1-5 are the remaining functional gaps vs Allmoxy. Items 6-8 are UI bugs. Items 9-10 are accuracy/confidence improvements.
