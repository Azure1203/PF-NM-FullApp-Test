# r10 — Fix Formula Tester UX, Multi-File Upload, and Pricing Pipeline

## Pre-Read (REQUIRED)

Read these files first:
- `shared/schema.ts` — all table definitions
- `server/routes.ts` — the formula-test endpoint (~line 700), the upload endpoint (~line 2496), the auto-create-bindings endpoint (~line 987)
- `server/services/pricingEngine.ts` — evaluatePrice function
- `client/src/pages/admin/FormulaTester.tsx` — current formula tester UI
- `client/src/pages/UploadOrder.tsx` — current upload UI
- `client/src/pages/OrderDetails.tsx` — order detail page

---

## Context — Why Pricing Still Fails

The backend code is correct. The `evaluatePrice` function, `gridRowToScope`, `findGridRowInCache`, column-name fallback, and batch insert are all properly implemented. The endpoints `GET /api/admin/pricing-diagnostic`, `POST /api/admin/auto-create-bindings`, and `GET /api/admin/attribute-grids/:id/row-keys` all exist and work.

**The remaining problems are all in the frontend:**

1. **Formula Tester** — The color binding shows a free-text input instead of a dropdown populated from the grid's actual row keys. Users don't know what valid color codes are (e.g. `TFL1W`). The `row-keys` endpoint exists but the frontend doesn't use it.

2. **Multi-File Upload** — The backend accepts `upload.array('files')` but the frontend `UploadOrder.tsx` likely sends files as `upload.single('file')` or lacks the `multiple` attribute on the file input.

3. **Data Configuration** — The `auto-create-bindings` endpoint and diagnostic page exist but may not have been used yet. Products may still be missing grid bindings and/or pricing formula assignments.

---

## Part 1 — Fix Formula Tester Page (CRITICAL)

The Formula Tester at `/admin/formula-tester` needs to work like this:

1. **Select a product** from a dropdown (already works)
2. **See binding status** — immediately after selecting a product, show what grid bindings exist and whether they're resolved
3. **Select a color** from a dropdown populated from the Main Color Attribute grid (NOT a free-text input)
4. **Enter dimensions** (width, height, length, quantity) — already works
5. **Click "Run Pricing Test"** — shows the computed price, full scope, and export block

### Changes needed in `FormulaTester.tsx`:

**A) Replace free-text grid lookup inputs with dropdowns**

Currently, non-MANU bindings (like `color` with `lookupColumn = "Material"`) render as a free-text `<Input>`. The user has to guess valid values.

Replace this with a searchable dropdown:

1. When a product is selected, fetch its bindings via `GET /api/admin/product-grid-bindings/:productId`
2. For each non-MANU binding, fetch the available lookup keys via `GET /api/admin/attribute-grids/:gridId/row-keys`
3. Render a `<Select>` (or shadcn/ui Combobox) populated with these keys
4. Each option should show the `displayLabel` from the row-keys response (e.g. `"TFL1W — TFL1W"`)
5. When the user selects a value, store it in `gridLookups[binding.alias]`

The `row-keys` endpoint already exists (line 238 in routes.ts) and returns:
```json
[
  { "lookupKey": "TFL1W", "displayLabel": "TFL1W — TFL1W" },
  { "lookupKey": "TFL2F", "displayLabel": "TFL2F — TFL2F" },
  ...
]
```

It filters out header rows (SELECTABLE=Header) and unavailable options (AVAILABLE=No).

**B) Show binding status panel**

After selecting a product but BEFORE clicking "Run Pricing Test", show a status section:

- If the product has NO pricingProxyId: show a red warning "⚠ No pricing formula assigned to this product"
- For each grid binding the product has:
  - MANU_CODE bindings: show "✅ {alias} — auto-resolved via SKU prefix ({skuPrefix})"
  - Non-MANU bindings: show "🎨 {alias} — select a value below" with the dropdown
  - If binding has no matching grid: show "❌ {alias} — grid not found"
- If the pricing formula references aliases that have no binding: show "❌ Missing binding for '{alias}' — formula will fail"

To detect missing bindings, extract `word.` patterns from the pricing formula:
```ts
const formulaText = pricingProxy?.formula ?? '';
const aliasRefs = [...formulaText.toLowerCase().matchAll(/([a-z_][a-z0-9_]*)\./g)].map(m => m[1]);
const uniqueAliases = [...new Set(aliasRefs)].filter(a => !['math','number','string','object','array','json','console'].includes(a));
const boundAliases = new Set(bindings.map(b => b.alias.toLowerCase()));
const missingAliases = uniqueAliases.filter(a => !boundAliases.has(a));
```

If `missingAliases.length > 0`, show them with a link to the Diagnostic page.

**C) Improve error messages**

When `pricingError` is returned, parse the error message and show a helpful explanation:

- If error contains "Undefined symbol": Extract the symbol name. Check if it matches a known grid alias pattern. Show: "The formula references '{symbol}' but no grid binding with that alias exists for this product. Go to Diagnostic page → Auto-Create Bindings."
- If error contains "Cannot read properties of undefined": Show: "A grid lookup returned no data. Check that the lookup value matches a row in the grid."

**D) Auto-select first available color**

When a product is selected and it has a `color` binding, and the row-keys are loaded, auto-select the first available color value. This way the user immediately gets a working test without having to manually pick a value.

---

## Part 2 — Fix Multi-File CSV Upload (CRITICAL)

The backend at `app.post(api.orders.upload.path, ..., upload.array('files'), ...)` already accepts multiple files and processes them all into one project. The frontend needs to match.

### Changes needed in `UploadOrder.tsx`:

**A) File input must accept multiple files**

Find the `<input type="file">` element. Ensure it has the `multiple` attribute:
```tsx
<input type="file" multiple accept=".csv" onChange={handleFileChange} />
```

**B) Drag-and-drop must accept all dropped files**

In the drop handler, iterate ALL files from `e.dataTransfer.files`:
```tsx
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const droppedFiles = Array.from(e.dataTransfer.files).filter(
    f => f.name.endsWith('.csv')
  );
  setSelectedFiles(prev => [...prev, ...droppedFiles]);
};
```

**C) Store an array of files, not a single file**

Change state from `const [file, setFile] = useState<File | null>(null)` to:
```tsx
const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
```

**D) Show file list with remove buttons**

After files are selected/dropped, show a list:
```tsx
{selectedFiles.map((f, i) => (
  <div key={i} className="flex items-center justify-between p-2 border rounded">
    <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
    <Button variant="ghost" size="sm" onClick={() => {
      setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
    }}>✕</Button>
  </div>
))}
```

**E) FormData must append ALL files**

In the upload mutation, append every file:
```tsx
const formData = new FormData();
for (const file of selectedFiles) {
  formData.append('files', file);
}
if (projectName?.trim()) {
  formData.append('projectName', projectName.trim());
}
```

The field name MUST be `'files'` (plural) — that's what the multer `upload.array('files')` expects.

**F) Show results per file**

After a successful upload, the response includes project info. Show:
- "Project created: {projectName}"
- "{N} files uploaded"
- Total price across all files
- Link to the order details page

---

## Part 3 — Ensure Data Configuration Works

The diagnostic page and auto-create-bindings endpoint already exist. But the user needs to be guided through the setup flow. Add a **setup wizard banner** that appears on the Formula Tester page and Order Details page when issues are detected.

### Setup check on Formula Tester page load

When the Formula Tester page loads, make a lightweight check:
```tsx
const { data: diagnostic } = useQuery({
  queryKey: ['pricing-diagnostic'],
  queryFn: () => fetch('/api/admin/pricing-diagnostic').then(r => r.json()),
  staleTime: 60000, // Cache for 1 minute
});
```

If `diagnostic?.stats?.withPricingProxy === 0` or `diagnostic?.stats?.withBindings === 0`, show a banner:

```
⚠ Pricing is not configured yet.
{stats.withPricingProxy} of {stats.activeProducts} products have pricing formulas assigned.
{stats.withBindings} of {stats.activeProducts} products have grid bindings.

[Go to Diagnostic Page] to auto-create missing bindings.
```

### Reprice button on Order Details page

The reprice endpoint already exists at `POST /api/orders/:id/reprice`. Add a "Reprice Order" button on the Order Details page that:
1. Calls the reprice endpoint
2. Shows a loading spinner
3. Refreshes the line item table on completion
4. Shows a toast: "Repriced: {totalPrice} across {itemCount} items ({errorCount} errors)"

Also add a "Status" column to the line items table showing ✅ or ❌ based on whether `pricingError` is null. Clicking ❌ should show the error in a tooltip.

---

## Part 4 — Ad-hoc Grid Lookup UX Improvement

The ad-hoc grid lookup section also needs the same dropdown treatment. When a grid is selected in the ad-hoc row, the "Lookup Value" input should become a dropdown populated from that grid's row keys (same `GET /api/admin/attribute-grids/:gridId/row-keys` endpoint).

---

## Verification Steps

After implementing, test this exact flow:

1. **Go to `/admin/diagnostic`** — run the diagnostic. Note the stats. If `withPricingProxy` is 0, proxy variables need to be imported first via the Proxy Variable Manager. If `withBindings` is 0, click "Auto-Create Bindings" (dry run first, then confirm).

2. **Go to `/admin/formula-tester`** — select product `15DIVF`:
   - Should see binding status: ✅ divider_panels (MANU_CODE auto-resolved), 🎨 color (dropdown)
   - The color dropdown should show options like TFL1W, TFL2F, HGFU, etc.
   - Select `TFL1W`, enter width=300, height=600, length=19, quantity=1
   - Click "Run Pricing Test"
   - Should see a non-zero price and full scope with both `divider_panels: { base_price: 0, sq_ft_price: 8.75, margin: 0, pricing_id: 1 }` and `color: { level_percent_upcharge: 0, sqft_price: 24.64, ... }`

3. **Go to `/upload`** — drag 3 CSV files at once:
   - All 3 should appear in the file list
   - Upload should create one project with 3 order files
   - Navigate to the order details — line items from all 3 files should appear

4. **On Order Details** — line items should show ✅/❌ status. If errors exist, click "Reprice Order" after fixing configuration. Prices should update.

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/pages/admin/FormulaTester.tsx` | Replace free-text inputs with grid row-key dropdowns, add binding status panel, better error messages, auto-select first color, diagnostic banner |
| `client/src/pages/UploadOrder.tsx` | Add `multiple` to file input, handle multi-file drag-drop, store File[] array, append all files to FormData as 'files', show file list with remove buttons |
| `client/src/pages/OrderDetails.tsx` | Add pricingError status column (✅/❌), add "Reprice Order" button |

---

## Important Implementation Notes

- The `row-keys` endpoint at `GET /api/admin/attribute-grids/:id/row-keys` already filters out header rows and unavailable options. Use it as-is.
- The response format is `[{ lookupKey: string, displayLabel: string }]`. Use `lookupKey` as the select value and `displayLabel` as the display text.
- For the color dropdown, use a searchable select (shadcn Combobox or a Select with a search filter) since there can be 30+ color options.
- The FormData field name for files MUST be `'files'` (not `'file'`) — multer on the backend expects `upload.array('files')`.
- When fetching row-keys for a binding's grid, cache the results per gridId (use TanStack Query with `queryKey: ['grid-row-keys', gridId]`).
- The diagnostic check on page load should use `staleTime` to avoid hammering the endpoint on every render.
- Do NOT modify any backend code — all endpoints are working correctly. This prompt is frontend-only.
