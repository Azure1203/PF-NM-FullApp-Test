# r9 — Pricing Pipeline Diagnostic + Auto-Configuration + Multi-File Upload Fix

## Pre-Read

Read these files before starting:
- `BUILD_STATE.md`, `CHANGELOG.md`
- `shared/schema.ts`
- `server/routes.ts` (especially the formula-test endpoint ~line 701, the upload handler ~line 2272, and the reprice route ~line 1830)
- `server/storage.ts`
- `server/services/pricingEngine.ts`

---

## Problem Summary

Pricing still returns `$0.00` or errors on both the Formula Tester page and after CSV import. The r8 code fixes (gridRowToScope, findGridRowInCache, column fallback, batch insert) are all implemented correctly — **the problem is now data configuration, not code logic.**

Every pricing formula references grid aliases like `divider_panels.base_price`, `color.level_percent_upcharge`, etc. These require **product_grid_bindings** rows linking each product to its attribute grids. Without bindings, the grid data never enters the formula scope, and mathjs throws "Undefined symbol X".

There are 2,363 products in the database but we cannot confirm that bindings exist for them. We need:

1. A **diagnostic endpoint** to identify exactly what's misconfigured
2. A way to **auto-create missing bindings** based on formula analysis
3. Formula tester fixes so it actually works for testing
4. Multi-file CSV upload fix

---

## Part 1 — Pricing Diagnostic Endpoint

Add `GET /api/admin/pricing-diagnostic` that returns a comprehensive health check:

```ts
app.get('/api/admin/pricing-diagnostic', isAuthenticated, async (req, res) => {
  try {
    const allProducts = await storage.getAllmoxyProducts();
    const allBindings = await storage.getAllProductGridBindings();
    const allProxyVars = await storage.getProxyVariables();
    const allGrids = await storage.getAttributeGrids();

    const bindingsByProduct = new Map<number, ProductGridBinding[]>();
    for (const b of allBindings) {
      const list = bindingsByProduct.get(b.productId) ?? [];
      list.push(b);
      bindingsByProduct.set(b.productId, list);
    }

    const proxyMap = new Map(allProxyVars.map(v => [v.id, v]));
    const gridMap = new Map(allGrids.map(g => [g.id, g]));

    const issues: Array<{
      productId: number;
      productName: string;
      skuPrefix: string | null;
      issue: string;
      severity: 'error' | 'warning';
    }> = [];

    const stats = {
      totalProducts: allProducts.length,
      activeProducts: 0,
      withSkuPrefix: 0,
      withPricingProxy: 0,
      withExportProxy: 0,
      withBindings: 0,
      withNoBindings: 0,
      totalBindings: allBindings.length,
      totalProxyVars: allProxyVars.length,
      totalGrids: allGrids.length,
      pricingProxies: allProxyVars.filter(v => v.type === 'pricing').length,
      exportProxies: allProxyVars.filter(v => v.type === 'export').length,
    };

    for (const product of allProducts) {
      if (product.status !== 'active') continue;
      stats.activeProducts++;

      if (!product.skuPrefix) {
        issues.push({
          productId: product.id,
          productName: product.name,
          skuPrefix: null,
          issue: 'No SKU prefix — will never match a CSV line item',
          severity: 'error',
        });
        continue;
      }
      stats.withSkuPrefix++;

      if (!product.pricingProxyId) {
        issues.push({
          productId: product.id,
          productName: product.name,
          skuPrefix: product.skuPrefix,
          issue: 'No pricing formula assigned (pricingProxyId is null)',
          severity: 'error',
        });
      } else {
        stats.withPricingProxy++;
        const proxy = proxyMap.get(product.pricingProxyId);
        if (proxy) {
          // Check what grid aliases the formula references
          const formulaText = proxy.formula.toLowerCase();
          const bindings = bindingsByProduct.get(product.id) ?? [];
          const boundAliases = new Set(bindings.map(b => b.alias.toLowerCase()));

          // Extract "word." patterns that look like grid alias references
          const aliasRefs = new Set(
            [...formulaText.matchAll(/([a-z_][a-z0-9_]*)\./g)].map(m => m[1])
          );
          // Filter out known non-alias patterns
          const nonAliases = new Set(['math', 'number', 'string', 'object', 'array', 'json']);

          for (const ref of aliasRefs) {
            if (nonAliases.has(ref)) continue;
            if (!boundAliases.has(ref)) {
              issues.push({
                productId: product.id,
                productName: product.name,
                skuPrefix: product.skuPrefix,
                issue: `Formula references "${ref}.*" but no grid binding with alias "${ref}" exists`,
                severity: 'error',
              });
            }
          }
        }
      }

      if (!product.exportProxyId) {
        issues.push({
          productId: product.id,
          productName: product.name,
          skuPrefix: product.skuPrefix,
          issue: 'No export formula assigned (exportProxyId is null)',
          severity: 'warning',
        });
      } else {
        stats.withExportProxy++;
      }

      const bindings = bindingsByProduct.get(product.id) ?? [];
      if (bindings.length > 0) {
        stats.withBindings++;
        for (const b of bindings) {
          if (!gridMap.has(b.gridId)) {
            issues.push({
              productId: product.id,
              productName: product.name,
              skuPrefix: product.skuPrefix,
              issue: `Binding alias "${b.alias}" references grid ID ${b.gridId} which does not exist`,
              severity: 'error',
            });
          }
        }
      } else {
        stats.withNoBindings++;
      }
    }

    // Deduplicate issues by grouping similar ones
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    res.json({
      stats,
      errorCount,
      warningCount,
      issues: issues.slice(0, 200), // Cap to avoid huge responses
      totalIssues: issues.length,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

**Also add a frontend page or section** — add a "Diagnostic" button to the Formula Tester page (or create a new admin page at `/admin/diagnostic`) that calls this endpoint and displays the results in a summary card + scrollable issues table.

The summary card should show:
- Total products / active / with SKU prefix / with pricing formula / with export formula / with bindings
- Error count / warning count
- Quick assessment: "X products are ready for pricing, Y have issues"

---

## Part 2 — Auto-Create Missing Grid Bindings

The diagnostic will likely show that most products are missing grid bindings. The system needs a way to bulk-create them.

Add `POST /api/admin/auto-create-bindings` that analyzes each product's pricing formula and automatically creates the needed grid bindings:

```ts
app.post('/api/admin/auto-create-bindings', isAuthenticated, async (req, res) => {
  try {
    const { dryRun = true } = req.body;

    const allProducts = await storage.getAllmoxyProducts();
    const allBindings = await storage.getAllProductGridBindings();
    const allProxyVars = await storage.getProxyVariables();
    const allGrids = await storage.getAttributeGrids();

    const proxyMap = new Map(allProxyVars.map(v => [v.id, v]));
    const gridNameMap = new Map<string, typeof allGrids[0]>();
    for (const g of allGrids) {
      // Map normalized grid names to grid objects
      // e.g. "Divider_Panels_02202026" → normalize to find matching alias
      gridNameMap.set(g.name.toLowerCase(), g);
      // Also try without date suffix
      const noDate = g.name.replace(/_\d{8}$/, '').toLowerCase();
      gridNameMap.set(noDate, g);
    }

    // Map from formula alias to grid name patterns
    // These are derived from analyzing all pricing formulas and their corresponding grid CSVs
    const aliasToGridPatterns: Record<string, string[]> = {
      'shelves':                  ['shelves', 'shelf'],
      'divider_panels':           ['divider_panels', 'divider'],
      'floor_panels':             ['floor_panels', 'floor_panel'],
      'wall_panels':              ['wall_panels', 'wall_panel'],
      'corner_shelves':           ['corner_shelves', 'corner_shelf'],
      'outside_corner_shelves':   ['outside_corner_shelves', 'outside_corner'],
      'island_panels':            ['island_panels', 'island_panel'],
      'garage_panels':            ['garage_panels', 'garage_panel'],
      'product_parts':            ['product_parts', 'parts'],
      'parts':                    ['product_parts', 'parts'],
      'doors':                    ['doors', 'door'],
      'drawer_fronts':            ['drawer_fronts', 'drawer_front'],
      'drawer_boxes':             ['drawer_boxes', 'drawer_box'],
      'moldings':                 ['moldings', 'molding'],
      'handles':                  ['handles', 'handle'],
      'hinges':                   ['hinges', 'hinge'],
      'slides':                   ['slides', 'slide'],
      'closet_rod':               ['closet_rod', 'closet_rods'],
      'closet_accessories':       ['closet_accessories', 'closet_accessory'],
      'closet_led_lighting':      ['closet_led_lighting', 'closet_led'],
      'door_drawer_locks':        ['door_drawer_locks', 'door_drawer_lock'],
      'floating_shelf_hardware':  ['floating_shelf_hardware'],
      'garage_accessories':       ['garage_accessories', 'garage_accessory'],
      'hanging_rails_hardware':   ['hanging_rail', 'hanging_rails'],
      'hardware':                 ['hardware'],
      'jigs_tools':               ['jigs_tools', 'jigs__tools', 'jigs'],
      'office_accessories':       ['office_accessories', 'office_accessory'],
      'touch_up_sticks':          ['touch_up_sticks', 'touch_up'],
      'glass':                    ['glass'],
      'color':                    ['main_color_attribute', 'main_color', 'color'],
      'mj_doors':                 ['mj_doors', 'mj_door'],
      'mj_colors':                ['mj_colors', 'mj_color'],
      'richelieu_doors':          ['richelieu_doors', 'richelieu_door'],
      'richelieu_colors':         ['richelieu_colors', 'richelieu_color'],
      'edgebanding':              ['edgebanding', 'edgebanding_options'],
    };

    function findGridForAlias(alias: string): typeof allGrids[0] | undefined {
      const patterns = aliasToGridPatterns[alias] ?? [alias];
      for (const pattern of patterns) {
        for (const [key, grid] of gridNameMap) {
          if (key.includes(pattern)) return grid;
        }
      }
      return undefined;
    }

    // Determine lookupColumn for each alias
    function getLookupColumn(alias: string, grid: typeof allGrids[0]): string {
      // Color grid lookups come from the CSV 'Material' column (Allmoxy order CSV column name)
      if (alias === 'color' || alias === 'mj_colors' || alias === 'richelieu_colors' || alias === 'edgebanding') {
        return 'Material';
      }
      // All product-specific grids lookup by MANU_CODE
      return 'MANU_CODE';
    }

    const existingBindingSet = new Set(
      allBindings.map(b => `${b.productId}:${b.gridId}:${b.alias.toLowerCase()}`)
    );

    const toCreate: Array<{
      productId: number;
      productName: string;
      gridId: number;
      gridName: string;
      alias: string;
      lookupColumn: string;
    }> = [];
    const skipped: string[] = [];

    for (const product of allProducts) {
      if (product.status !== 'active' || !product.pricingProxyId) continue;
      const proxy = proxyMap.get(product.pricingProxyId);
      if (!proxy) continue;

      const formulaText = proxy.formula.toLowerCase();
      // Extract alias references: word followed by dot
      const aliasRefs = new Set(
        [...formulaText.matchAll(/([a-z_][a-z0-9_]*)\./g)].map(m => m[1])
      );

      // Also check export formula if assigned
      if (product.exportProxyId) {
        const exportProxy = proxyMap.get(product.exportProxyId);
        if (exportProxy) {
          const exportText = exportProxy.formula.toLowerCase();
          const exportRefs = [...exportText.matchAll(/([a-z_][a-z0-9_]*)\./g)].map(m => m[1]);
          exportRefs.forEach(r => aliasRefs.add(r));
        }
      }

      for (const alias of aliasRefs) {
        // Skip known non-grid references
        if (['math', 'number', 'string', 'object', 'array', 'json', 'console'].includes(alias)) continue;

        const grid = findGridForAlias(alias);
        if (!grid) {
          skipped.push(`${product.name}: alias "${alias}" — no matching grid found`);
          continue;
        }

        const key = `${product.id}:${grid.id}:${alias}`;
        if (existingBindingSet.has(key)) continue; // Already exists

        const lookupColumn = getLookupColumn(alias, grid);

        toCreate.push({
          productId: product.id,
          productName: product.name,
          gridId: grid.id,
          gridName: grid.name,
          alias,
          lookupColumn,
        });
        existingBindingSet.add(key); // Prevent duplicates in this run
      }
    }

    if (!dryRun) {
      let created = 0;
      for (const binding of toCreate) {
        try {
          await storage.createProductGridBinding({
            productId: binding.productId,
            gridId: binding.gridId,
            alias: binding.alias,
            lookupColumn: binding.lookupColumn,
          });
          created++;
        } catch (e: any) {
          skipped.push(`${binding.productName}: ${binding.alias} → ${e.message}`);
        }
      }
      res.json({
        dryRun: false,
        created,
        wouldCreate: toCreate.length,
        skipped,
        sample: toCreate.slice(0, 20),
      });
    } else {
      res.json({
        dryRun: true,
        wouldCreate: toCreate.length,
        skipped,
        sample: toCreate.slice(0, 50),
      });
    }
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

**Frontend:** Add a "Auto-Create Bindings" button to the diagnostic page. First call with `dryRun: true` to show what would be created (count + sample table). Then confirm to run with `dryRun: false`. Show results with created count and any skipped items.

---

## Part 3 — Formula Tester: Show Binding Status + Better Error Messages

The formula tester currently shows "Undefined symbol divider_panels" with no guidance on what's wrong.

### 3a. Show binding status before running the test

When a product is selected in the formula tester, immediately show a **binding status panel** before the user even clicks "Run Pricing Test":

- Fetch the product's bindings via `GET /api/admin/product-grid-bindings/:productId` (already exists)
- Fetch the product's pricing proxy formula
- Extract alias references from the formula (same `word.` pattern matching)
- Show a checklist:
  - ✅ `divider_panels` → bound to grid "Divider_Panels_02202026" (MANU_CODE lookup)
  - ✅ `color` → bound to grid "Main_Color_Attribute_02202026" (Material lookup) — **needs value** [dropdown]
  - ❌ `some_alias` → **NOT BOUND** — pricing will fail
  - ⚠️ No pricing formula assigned

This makes it immediately obvious why pricing fails — the user can see that bindings are missing before they even try.

### 3b. Better error message formatting

When a pricing error occurs, instead of just showing the raw mathjs error ("Undefined symbol divider_panels"), parse it and show a helpful message:

```
❌ Pricing Error: "Undefined symbol divider_panels"

This means the formula references "divider_panels.base_price", "divider_panels.sq_ft_price", etc.
but no grid binding with alias "divider_panels" exists for this product.

Fix: Go to the Allmoxy Product Manager → select this product → add a grid binding
with alias "divider_panels" pointing to the Divider Panels grid.

Or use the Auto-Create Bindings tool on the Diagnostic page.
```

---

## Part 4 — Multi-File CSV Upload

### Root Cause

The backend route `app.post(api.orders.upload.path, ..., upload.array('files'), ...)` already accepts multiple files. The issue is in the **frontend** `UploadOrder.tsx`:

1. The `<input type="file">` element may be missing the `multiple` attribute
2. The drag-and-drop handler may only be processing `e.dataTransfer.files[0]` instead of all files
3. The FormData construction may only be appending one file

### Fix

In `client/src/pages/UploadOrder.tsx`:

1. Ensure the file input has `multiple` attribute: `<input type="file" multiple accept=".csv" ... />`
2. In the drag handler, process ALL files from `e.dataTransfer.files` (loop through the FileList)
3. In the form submission / mutation, append ALL files to the FormData:

```ts
const formData = new FormData();
for (const file of selectedFiles) {
  formData.append('files', file);
}
// If there's a project name input:
if (projectName) {
  formData.append('projectName', projectName);
}
```

4. Show a file list in the UI after selection/drop — showing all selected filenames with individual remove buttons
5. Show a count badge: "3 files selected"
6. After upload, show results per file (filename + item count + pricing errors if any)

---

## Part 5 — Pricing Debug Mode on Order Details

On the Order Details page (`/orders/:id`), when items show `$0.00` price or have pricing errors, it's not clear why. Add a debug view:

### 5a. Show pricing error column

The `order_items.pricingError` column already stores error messages. Display this in the Order Details line item table:
- Add a "Status" column that shows ✅ for priced items, ❌ for items with `pricingError`
- Clicking ❌ shows a tooltip or expandable row with the error message
- Items with no product match show "No product match for SKU: XXX"
- Items with missing bindings show "Undefined symbol: XXX"

### 5b. Add "Reprice Order" button

The reprice endpoint already exists at `POST /api/orders/:id/reprice`. Add a button to the Order Details page that triggers it. After repricing:
- Refresh the line item table
- Show a toast with the new total and error count
- This lets the user fix configuration (add bindings, assign formulas) and then reprice without re-uploading

---

## Verification Steps

1. **Diagnostic page:** Visit `/admin/diagnostic` (or the diagnostic section in Formula Tester). It should show stats like:
   - 2,363 total products, ~2,363 active, ~2,363 with SKU prefix
   - If `withPricingProxy` is 0, that's the first problem — formulas aren't assigned
   - If `withBindings` is 0, that's the second problem — bindings don't exist
   - The issues list should clearly show what's missing

2. **Auto-create bindings:** Click "Auto-Create Bindings" → dry run first → review the sample → confirm. Should create thousands of bindings automatically.

3. **Formula tester:** Select product `15DIVF`. The binding status panel should show ✅ divider_panels (MANU_CODE auto-resolved), and ✅ color (with dropdown). Select `TFL1W` from the color dropdown. Run test. Should get a non-zero price.

4. **Multi-file upload:** Go to Upload page. Drag 3 CSV files at once. All 3 should appear in the file list. Upload should create one project with 3 order files.

5. **Order details debug:** After import, order items should show ✅/❌ status. Click "Reprice Order" after fixing any configuration issues.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` | Add `GET /api/admin/pricing-diagnostic`, `POST /api/admin/auto-create-bindings` endpoints |
| `client/src/pages/admin/FormulaTester.tsx` | Add binding status panel, better error messages |
| `client/src/pages/UploadOrder.tsx` | Fix multi-file support (input multiple, drag-all, FormData loop) |
| `client/src/pages/OrderDetails.tsx` | Add pricingError column, Reprice button |
| Optionally: `client/src/pages/admin/PricingDiagnostic.tsx` | New page for diagnostic + auto-bind |

---

## Important Notes

- The `aliasToGridPatterns` map in the auto-create endpoint will need adjustment based on the actual grid names in the database. The grid names include date suffixes (e.g. `Divider_Panels_02202026`). The matching logic uses `includes()` so `divider_panel` will match `Divider_Panels_02202026`.
- The auto-create logic should be idempotent — running it twice should not create duplicate bindings (the `existingBindingSet` check handles this).
- The `lookupColumn` for color-type bindings MUST be `Material` (not `Color` or `COLOR`) — this is what the Allmoxy order CSV column is actually called for most orders. The column name fallback in the pipeline (added in r8) provides resilience, but the binding should be set to the most common name.
- Do NOT auto-assign pricingProxyId or exportProxyId — those must still be manually assigned through the Allmoxy Product Manager. The diagnostic will highlight which products are missing them.
