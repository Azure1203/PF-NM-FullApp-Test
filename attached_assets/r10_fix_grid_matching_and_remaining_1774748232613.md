# r10 — Fix Grid Name Matching Bug + Formula Tester + Multi-File Upload

## Pre-Read (REQUIRED)

Read these files before starting:
- `server/routes.ts` — especially the auto-create-bindings endpoint (~line 987) and the formula-test endpoint (~line 700)
- `client/src/pages/admin/FormulaTester.tsx`
- `client/src/pages/UploadOrder.tsx`

---

## ROOT CAUSE — Why 1,790 Binding Errors Exist

The `POST /api/admin/auto-create-bindings` endpoint matches formula aliases to grids using pattern matching on grid names. The `aliasToGridPatterns` map uses patterns with **underscores** (e.g. `'main_color_attribute'`), but the actual grid names stored in the database likely have **spaces** (e.g. `'Main Color Attribute 02202026'`).

When the pattern `'main_color_attribute'` is tested against grid name `'main color attribute 02202026'` (lowercased), it fails because underscores ≠ spaces. The fallback pattern `'color'` then matches `'mj colors 02202026'` (because `'mj colors 02202026'.includes('color')` is true) — binding products to the **wrong grid** (MJ Colors instead of Main Color Attribute).

This means every product that needs `color.level_percent_upcharge`, `color.sqft_price`, `color.panel_export`, etc. is bound to the MJ Colors grid, which has completely different columns (`MJ_COLOR`, `MJ_SLIMLINE_PRICING`, etc.). The formula evaluates against wrong data and fails.

### Fix — Normalize grid name matching

In the `findGridForAlias` function (~line 1043), normalize BOTH the pattern and the grid name keys by replacing spaces with underscores (or vice versa) before comparing:

```ts
function findGridForAlias(alias: string): typeof allGrids[0] | undefined {
  const patterns = aliasToGridPatterns[alias] ?? [alias];
  for (const pattern of patterns) {
    // Normalize: replace spaces with underscores for matching
    const normalizedPattern = pattern.replace(/\s+/g, '_').toLowerCase();
    for (const [key, grid] of gridNameMap) {
      const normalizedKey = key.replace(/\s+/g, '_').toLowerCase();
      if (normalizedKey.includes(normalizedPattern)) return grid;
    }
  }
  return undefined;
}
```

Also rebuild the `gridNameMap` with normalized keys:

```ts
const gridNameMap = new Map<string, typeof allGrids[0]>();
for (const g of allGrids) {
  // Store with both original lowercased name AND underscore-normalized version
  gridNameMap.set(g.name.toLowerCase(), g);
  gridNameMap.set(g.name.toLowerCase().replace(/\s+/g, '_'), g);
  // Also store without date suffix (both space and underscore variants)
  const noDate = g.name.replace(/_?\d{8}$/, '').trim();
  gridNameMap.set(noDate.toLowerCase(), g);
  gridNameMap.set(noDate.toLowerCase().replace(/\s+/g, '_'), g);
}
```

**Also fix the date suffix regex**: The current regex `/_\d{8}$/` only strips `_02202026` (with underscore prefix). But if the grid name has a space before the date (e.g. `Main Color Attribute 02202026`), the date suffix is ` 02202026` (with space). Change to `/_?\s?\d{8}$/` or just `/ ?\d{8}$|_\d{8}$/`.

**Better approach** — strip any trailing 8-digit number with optional preceding separator:

```ts
const noDate = g.name.replace(/[\s_]?\d{8}$/, '').trim();
```

### Also fix — Delete wrong bindings before recreating

Since the auto-create-bindings was already run and created ~1,790 wrong bindings, add a **"Delete All Auto-Created Bindings"** option or a **"Reset and Recreate"** mode.

Add to the auto-create-bindings endpoint a `reset` parameter:

```ts
const { dryRun = true, reset = false } = req.body;

// If reset mode, delete ALL existing bindings first
if (reset && !dryRun) {
  // Delete all product_grid_bindings
  await db.delete(productGridBindings);
  console.log('[auto-create-bindings] Reset: deleted all existing bindings');
}
```

Or more conservatively, only delete bindings that were auto-created (those matching alias patterns from the map):

```ts
if (reset && !dryRun) {
  // Delete only bindings where alias matches known auto-create patterns
  const knownAliases = Object.keys(aliasToGridPatterns);
  const allCurrentBindings = await storage.getAllProductGridBindings();
  const toDelete = allCurrentBindings.filter(b => 
    knownAliases.includes(b.alias.toLowerCase())
  );
  for (const b of toDelete) {
    await db.delete(productGridBindings).where(eq(productGridBindings.id, b.id));
  }
  console.log(`[auto-create-bindings] Reset: deleted ${toDelete.length} auto-created bindings`);
}
```

---

## Part 2 — Fix the Pricing Diagnostic to Show Which Grid Each Binding Points To

The diagnostic endpoint currently reports "Formula references X but no binding exists." But it doesn't tell you WHICH grid a binding points to when one exists. Enhance the diagnostic to also report wrong-grid bindings:

In the diagnostic loop (~line 944), after checking that a binding exists for each formula alias, ALSO check that the binding points to a sensible grid:

```ts
// After checking boundAliases has the ref
if (boundAliases.has(ref)) {
  // Check if the binding points to the right grid
  const binding = bindings.find(b => b.alias.toLowerCase() === ref);
  if (binding) {
    const grid = gridMap.get(binding.gridId);
    if (grid) {
      const gridNameLower = grid.name.toLowerCase().replace(/\s+/g, '_');
      // 'color' alias should point to main_color_attribute, not mj_colors
      if (ref === 'color' && gridNameLower.includes('mj_color')) {
        issues.push({
          productId: product.id,
          productName: product.name,
          skuPrefix: product.skuPrefix ?? null,
          issue: `Binding "color" points to "${grid.name}" — should be "Main Color Attribute". MJ Colors is only for MJ door products.`,
          severity: 'error',
        });
      }
    }
  }
}
```

---

## Part 3 — Fix Formula Tester Frontend

### 3a. Replace free-text color input with dropdown

The `GET /api/admin/attribute-grids/:id/row-keys` endpoint already exists and returns filtered, sorted lookup keys. Use it.

In `FormulaTester.tsx`, when a product is selected and bindings are loaded:

1. For each non-MANU binding (like `color` with `lookupColumn = "Material"`), fetch the row keys:
```tsx
const { data: colorKeys } = useQuery({
  queryKey: ['grid-row-keys', binding.gridId],
  queryFn: () => fetch(`/api/admin/attribute-grids/${binding.gridId}/row-keys`).then(r => r.json()),
  enabled: !!binding.gridId,
});
```

2. Render a searchable `<Select>` instead of a free-text `<Input>`:
```tsx
<Select value={gridLookups[binding.alias] || ''} onValueChange={(val) => setGridLookups(prev => ({...prev, [binding.alias]: val}))}>
  <SelectTrigger>
    <SelectValue placeholder="Select color..." />
  </SelectTrigger>
  <SelectContent>
    {colorKeys?.map((k: any) => (
      <SelectItem key={k.lookupKey} value={k.lookupKey}>
        {k.displayLabel || k.lookupKey}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

3. Auto-select the first available color when the product changes and color keys load. This way the user gets a working test immediately.

### 3b. Show binding status

After selecting a product, show a status panel before "Run Pricing Test":

- Check if `pricingProxyId` is assigned → show ⚠ if not
- For each binding: show alias, grid name, and whether it's MANU_CODE (auto) or needs user selection
- Extract alias references from the formula and flag any that have no binding

### 3c. Better error messages

When `pricingError` contains "Undefined symbol X", parse it and show:
- What alias is missing
- Whether a binding exists for it
- If the binding points to the wrong grid (e.g. MJ Colors instead of Main Color Attribute)

---

## Part 4 — Fix Multi-File CSV Upload

The backend route `app.post(api.orders.upload.path, ..., upload.array('files'), ...)` already accepts multiple files. The frontend needs these changes in `UploadOrder.tsx`:

### 4a. File input must accept multiple
```tsx
<input type="file" multiple accept=".csv" onChange={handleFileChange} />
```

### 4b. State must be an array
```tsx
const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
```

### 4c. Drag handler must accept all files
```tsx
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
  setSelectedFiles(prev => [...prev, ...dropped]);
};
```

### 4d. File change handler must accumulate
```tsx
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
    const newFiles = Array.from(e.target.files).filter(f => f.name.endsWith('.csv'));
    setSelectedFiles(prev => [...prev, ...newFiles]);
  }
};
```

### 4e. Show file list with remove buttons
```tsx
{selectedFiles.map((f, i) => (
  <div key={i} className="flex items-center justify-between p-2 border rounded mb-1">
    <span className="text-sm">{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
    <Button variant="ghost" size="sm" onClick={() => 
      setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))
    }>✕</Button>
  </div>
))}
```

### 4f. FormData must append ALL files with field name 'files'
```tsx
const formData = new FormData();
for (const file of selectedFiles) {
  formData.append('files', file);  // MUST be 'files' plural — multer expects upload.array('files')
}
if (projectName?.trim()) {
  formData.append('projectName', projectName.trim());
}
```

---

## Part 5 — Reprice Button on Order Details

Add a "Reprice Order" button to the Order Details page that calls `POST /api/orders/:id/reprice`. The endpoint already exists. After repricing, refresh the items list and show a toast with the new total.

Also add a ✅/❌ status indicator per line item based on whether `pricingError` is null or not. Show the error in a tooltip when clicking ❌.

---

## Implementation Order

1. **FIRST** — Fix the `findGridForAlias` function in the auto-create-bindings endpoint (Part 1). This is the critical bug causing 1,790 wrong bindings.

2. **SECOND** — Add the `reset` parameter to auto-create-bindings. Then run it: first `{ dryRun: true }` to verify the correct grid is now matched for `color` alias (should show `Main_Color_Attribute_02202026` not `MJ_Colors_02202026`). Then `{ dryRun: false, reset: true }` to delete wrong bindings and recreate correct ones.

3. **THIRD** — Fix the Formula Tester frontend (Part 3).

4. **FOURTH** — Fix the multi-file upload frontend (Part 4).

5. **FIFTH** — Add reprice button and status indicators to Order Details (Part 5).

---

## Verification Steps

1. **After Part 1+2**: Call `POST /api/admin/auto-create-bindings` with `{ "dryRun": true }`. In the sample output, every entry with `alias: "color"` should show `gridName: "Main Color Attribute 02202026"` (NOT `MJ Colors 02202026`). Then run with `{ "dryRun": false, "reset": true }`.

2. **Check diagnostic**: Call `GET /api/admin/pricing-diagnostic`. The error count should drop dramatically from 1,790. Remaining errors should only be products missing pricing formula assignments (pricingProxyId = null).

3. **Formula Tester**: Select product `15DIVF`. Color dropdown should show TFL1W, TFL2F, HGFU, etc. from the Main Color Attribute grid (these have `SQFT_PRICE`, `LEVEL_PERCENT_UPCHARGE` columns — NOT `MJ_COLOR`, `MJ_SLIMLINE_PRICING`). Select TFL1W, enter width=300, height=600, length=19. Run test. Should get a non-zero price.

4. **Multi-file upload**: Drag 3 CSV files. All 3 appear in file list. Upload creates one project with 3 files.

5. **Order Details**: After import, items show ✅/❌. Click "Reprice" after fixing any remaining config. Prices update.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` — auto-create-bindings endpoint | Fix `findGridForAlias` to normalize spaces/underscores, fix date suffix regex, add `reset` parameter |
| `server/routes.ts` — pricing-diagnostic endpoint | Add wrong-grid detection for `color` alias |
| `client/src/pages/admin/FormulaTester.tsx` | Replace free-text with dropdown using row-keys endpoint, binding status panel, better error messages |
| `client/src/pages/UploadOrder.tsx` | Multi-file: `multiple` attr, File[] state, multi-drop handler, FormData loop with field name `'files'` |
| `client/src/pages/OrderDetails.tsx` | Reprice button, ✅/❌ status column with pricingError tooltip |
| `client/src/pages/admin/PricingDiagnostic.tsx` | Add "Reset & Recreate Bindings" button |

---

## Critical Notes

- The field name in FormData MUST be `'files'` (plural) — the backend uses `upload.array('files')`.
- After resetting bindings, you MUST reprice any existing orders for the new bindings to take effect.
- The Main Color Attribute grid has these critical columns used by formulas: `SQFT_PRICE`, `LEVEL_PERCENT_UPCHARGE`, `PANEL_EXPORT`, `DOOR_EXPORT`, `TFL90_DOOR_SQFT_COST`, `POLY45_DOOR_SQFT_COST`, `PREMOULE_COLOR_NAME`, `DRAWER_BOX_EXPORT`, `1_IN_EXPORT`.
- The MJ Colors grid has completely different columns: `MJ_COLOR`, `MJ_SLIMLINE_PRICING`, `MJ_VENICE_PRICING`, etc. These are ONLY for M&J Woodcraft door products.
- Grid names in the DB may have either spaces OR underscores depending on how they were uploaded. The fix normalizes both sides of the comparison.
