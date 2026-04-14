# Prompt r24 — Fix LDRTFL90SHA / RDRTFL90SHA Door Pricing Errors

Paste this entire prompt into Replit.

---

## Problem

`LDRTFL90SHA` and `RDRTFL90SHA` items show `$0.00` with a red "Error" badge after CSV import. These are TFL 90° 5-Piece Shaker doors (non-glass-door variants). They should price identically to the `LDRTFL90SHAGD` and `RDRTFL90SHAGD` products, using the doors pricing formula.

## Root Cause

The SKU prefix matching function (`matchProductToSku`) already does longest-prefix-first matching correctly. The issue is that these two products are likely missing their **pricing proxy assignment** and/or **grid bindings** in the database. They were imported from the product CSV but never had formulas and bindings auto-assigned.

## Diagnosis — Run These Steps

### Step 1: Check if the products exist and have formulas assigned

Open the Replit shell and run:

```bash
# Check LDRTFL90SHA product
curl -s localhost:5000/api/admin/allmoxy-products | python3 -c "
import json, sys
products = json.load(sys.stdin)
for p in products:
    if p.get('skuPrefix','') in ['LDRTFL90SHA','RDRTFL90SHA']:
        print(f\"ID={p['id']} SKU={p['skuPrefix']} name={p['name']} status={p.get('status')} pricingProxy={p.get('pricingProxyId')} exportProxy={p.get('exportProxyId')} exportType={p.get('exportType')}\")
"
```

If `pricingProxyId` is `null` for either product → that's the problem. Proceed to Step 2.

If the products don't appear at all → they weren't imported. Proceed to Step 3.

### Step 2: Check if grid bindings exist

For each product ID found in Step 1, check bindings:

```bash
curl -s localhost:5000/api/admin/allmoxy-products/PRODUCT_ID/grid-bindings
```

Expected bindings for door products:
- `doors` grid (lookupColumn: `MANU_CODE`)
- `color` grid (lookupColumn: `Color` or `Material`)

If bindings are missing → proceed to Fix Option A.

### Step 3: Check the actual pricing error

```bash
curl -s "localhost:5000/api/orders/ORDER_ID/items" | python3 -c "
import json, sys
items = json.load(sys.stdin)
for i in items:
    if i.get('sku','').startswith('LDRTFL90SHA') or i.get('sku','').startswith('RDRTFL90SHA'):
        print(f\"SKU={i['sku']} price={i['unitPrice']} error={i.get('pricingError')}\")
"
```

The `pricingError` field will tell you exactly what went wrong (e.g., "Undefined symbol doors" means no grid binding, "No product match" means no product in DB).

---

## Fix Option A: Auto-Fix via Diagnostic Page (Recommended)

1. Go to `/admin/diagnostic` (Pricing Diagnostic page)
2. Click **"Reset & Recreate Bindings"** — this will recreate all grid bindings for all products, including the missing ones for LDRTFL90SHA and RDRTFL90SHA
3. Then go to `/admin/allmoxy-products`, find LDRTFL90SHA and RDRTFL90SHA
4. For each product, verify:
   - **Export Type** = `ORD` (these are door panels that go to Cabinet Vision)
   - **Pricing Proxy** = the same doors pricing proxy used by `LDRTFL90SHAGD`
   - **Export Proxy** = the same doors export proxy used by `LDRTFL90SHAGD`
5. Go to the affected order and click **"Re-run Pricing"**
6. The LDRTFL90SHA and RDRTFL90SHA items should now price correctly

## Fix Option B: Manual Assignment

If the auto-fix doesn't catch these products (e.g., the auto-assign formula matching doesn't recognize the SKU prefix pattern), manually assign them:

1. Go to `/admin/allmoxy-products`
2. Search for `LDRTFL90SHA`
3. Click to edit
4. Set:
   - **Pricing Proxy** → select the same proxy as `LDRTFL90SHAGD` (should be named something like `doors_pricing` or `door_pricing`)
   - **Export Proxy** → select the same proxy as `LDRTFL90SHAGD` (should be named something like `doors_export`)
   - **Export Type** → `ORD`
5. Save
6. Repeat for `RDRTFL90SHA`
7. Go to the Diagnostic page → Reset & Recreate Bindings (to ensure the `doors` and `color` grid bindings are created)
8. Go to the order → Re-run Pricing

## Fix Option C: Improve Auto-Assign to Catch These SKUs

If the `POST /api/admin/products/auto-assign-formulas` endpoint doesn't recognize these SKU patterns, add them to the matching rules. In the auto-assign endpoint in `routes.ts`, find the SKU prefix → proxy mapping rules and ensure these patterns are included:

```typescript
// Door products — all variants should use the same doors pricing proxy
// LDRTFL90SHA, RDRTFL90SHA (non-GD)
// LDRTFL90SHAGD, RDRTFL90SHAGD (glass door)
// HDRTFL90SHA (hamper door)
// KLDRTFL90SHA, KRDRTFL90SHA (knee-wall doors)
// GLDRTFL90SHA, GRDRTFL90SHA (garage doors)
// MT*, HG* prefixed variants (matte, high gloss)
```

The rule should be: any SKU containing `TFL90SHA` (case-insensitive) → doors pricing proxy + doors export proxy + ORD export type.

---

## Verification

1. After fixing, navigate to the order with the errored items
2. Click "Re-run Pricing"
3. LDRTFL90SHA and RDRTFL90SHA items should show non-zero prices with green ✓ OK badges
4. The price should be based on `color.tfl90_door_sqft_cost` (typically $15-18 per sq ft depending on color)
5. For a 489.1×2269mm door at $18/sqft: area ≈ 1,109,408 mm² → ~11.94 sqft → ~$214.92 (before margin)
