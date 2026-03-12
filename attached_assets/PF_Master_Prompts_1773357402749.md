# PF-NM-FullApp-Test — Master Prompt Series
*Consolidated: 2026-03-12 — all prompts in run order*

---

## CONFIRMED SCHEMA STATE (no migrations needed)

The following tables are **fully defined in schema.ts and already exist in the DB**:
- `allmoxyProducts` — has `skuPrefix`, `description`, `notes` ✅
- `productGridBindings` — has `productId`, `gridId`, `alias`, `lookupColumn` ✅
- `orderItems` — fully defined with all pricing/export fields ✅
- `appSettings` ✅

**None of the prompts below require any schema changes.**

---

## RUN ORDER

| # | Prompt | Files touched |
|---|--------|---------------|
| 1 | Brand theme — sidebar, header, slate→warm colours | `AppLayout.tsx`, `index.css`, `pages/**` |
| 2 | Remove redundant Color Grid page | `AppLayout.tsx`, `App.tsx`, `ColorGrid.tsx`, `routes.ts`, `storage.ts` |
| 3 | Fix product CSV import (column name mismatch) | `server/routes.ts` |
| 4 | Add skuPrefix + description + notes to product UI | `AllmoxyProductManager.tsx`, `routes.ts`, `storage.ts` |
| 5 | Grid bindings: storage methods + API routes | `storage.ts`, `routes.ts` |
| 6 | Grid bindings UI panel in product manager | `AllmoxyProductManager.tsx` |
| 7 | Fix pricingEngine `length` scope + rewrite upload pipeline | `pricingEngine.ts`, `routes.ts` |
| 8 | Formula Tester page | new `FormulaTester.tsx`, `routes.ts`, `App.tsx`, `AppLayout.tsx` |
| 9 | Order Items pricing breakdown in Order Details | `OrderDetails.tsx` |
| 10 | Rebuild Attribute Grid Manager (full replace) | `DynamicGridManager.tsx`, `routes.ts`, `storage.ts` |

---

---

## PROMPT 1 — Apply Brand Colour Theme

**Files:** `client/src/components/AppLayout.tsx`, `client/src/index.css`, all files under `client/src/pages/`

The CSS variables in `client/src/index.css` already map to the correct brand colours. The problem is that the sidebar and header ignore them and use hardcoded white/slate classes. This prompt fixes the app shell and replaces cold slate tones with the warm brand palette throughout admin pages.

**Brand palette:**
- Gold `#CDAB4A` → already `--primary`
- Charcoal `#2E2E2E` → already `--foreground`
- Brown `#807161` → already `--muted-foreground`
- Off-white `#F7F4F2` → already `--background`

### 1A — Sidebar container

Find:
```tsx
<aside className="w-64 border-r bg-card hidden md:flex flex-col">
```
Replace with:
```tsx
<aside className="w-64 hidden md:flex flex-col bg-[#2E2E2E] border-r border-[#807161]/20">
```

### 1B — App title in sidebar

Find:
```tsx
<div className="p-6">
  <h1 className="text-xl font-bold tracking-tight text-primary">Order Manager</h1>
</div>
```
Replace with:
```tsx
<div className="px-6 py-5 border-b border-[#CDAB4A]/20">
  <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#807161] mb-0.5">Netley Millwork</p>
  <h1 className="text-base font-bold tracking-tight text-[#F7F4F2]">Order Manager</h1>
</div>
```

### 1C — Sidebar section labels

Find:
```tsx
<h2 className="text-xs font-semibold text-muted-foreground tracking-wider px-2">
```
Replace with:
```tsx
<h2 className="text-[10px] font-semibold tracking-[0.15em] uppercase px-2 text-[#807161]">
```

### 1D — Sidebar nav link items

Find the `<a className={cn(...` block inside the nav items map. Replace the entire `className` expression and its contents:
```tsx
<a className={cn(
  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
  isActive
    ? "bg-[#CDAB4A]/15 text-[#CDAB4A]"
    : "text-[#F7F4F2]/70 hover:bg-[#F7F4F2]/8 hover:text-[#F7F4F2]"
)}>
  <item.icon className={cn(
    "h-4 w-4 shrink-0",
    isActive ? "text-[#CDAB4A]" : "text-[#F7F4F2]/50"
  )} />
  <span>{item.name}</span>
  {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#CDAB4A]" />}
</a>
```

### 1E — Bottom user area

Find:
```tsx
<div className="p-4 border-t mt-auto">
```
Replace with:
```tsx
<div className="p-4 mt-auto border-t border-[#CDAB4A]/20">
```

Find the `AvatarFallback` inside the sidebar dropdown trigger:
```tsx
<AvatarFallback className="bg-primary/10 text-primary">
```
Replace with:
```tsx
<AvatarFallback className="bg-[#CDAB4A]/20 text-[#CDAB4A]">
```

Find the username/role text in the sidebar:
```tsx
<span className="text-sm font-medium truncate w-full">{user?.username}</span>
<span className="text-xs text-muted-foreground">Admin</span>
```
Replace with:
```tsx
<span className="text-sm font-medium truncate w-full text-[#F7F4F2]">{user?.username}</span>
<span className="text-xs text-[#807161]">Admin</span>
```

### 1F — Top header bar

Find:
```tsx
<header className="h-16 border-b bg-background flex items-center justify-between px-8 sticky top-0 z-10 shadow-sm">
```
Replace with:
```tsx
<header className="h-14 border-b border-border bg-background flex items-center justify-between px-8 sticky top-0 z-10">
```

Find the page title:
```tsx
<h2 className="text-lg font-semibold tracking-tight">{getPageTitle()}</h2>
```
Replace with:
```tsx
<h2 className="text-sm font-semibold tracking-tight text-foreground">{getPageTitle()}</h2>
```

Find the header avatar fallback:
```tsx
<AvatarFallback className="bg-primary/5 text-primary">
```
Replace with:
```tsx
<AvatarFallback className="bg-primary/15 text-primary">
```

### 1G — Main content background

Find:
```tsx
<main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
```
Replace with:
```tsx
<main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
```

### 1H — Replace hardcoded slate colours in admin pages

Search across all files under `client/src/pages/` and swap these Tailwind classes. Do **not** touch files under `client/src/components/ui/`.

| Find | Replace |
|------|---------|
| `bg-slate-50` | `bg-muted/40` |
| `bg-slate-50/50` | `bg-muted/30` |
| `bg-slate-100` | `bg-muted` |
| `border-slate-200` | `border-border` |
| `text-slate-900` | `text-foreground` |
| `text-slate-700` | `text-foreground/80` |
| `text-slate-600` | `text-muted-foreground` |
| `text-slate-500` | `text-muted-foreground` |
| `text-slate-400` | `text-muted-foreground/70` |
| `hover:bg-slate-50` | `hover:bg-muted/40` |
| `bg-slate-50/20` | `bg-muted/20` |

### 1I — Scrollbar colour in `client/src/index.css`

Find the scrollbar thumb rules and ensure they read:
```css
::-webkit-scrollbar-thumb {
  @apply bg-[#807161]/25 rounded-full;
}
::-webkit-scrollbar-thumb:hover {
  @apply bg-[#807161]/45;
}
```

---

---

## PROMPT 2 — Remove Redundant Color Grid Page

**Files:** `client/src/components/AppLayout.tsx`, `client/src/App.tsx`, `client/src/pages/ColorGrid.tsx` (delete), `server/routes.ts`, `server/storage.ts`

The `color_grid` table is a primitive two-column (`code`, `description`) leftover from before the attribute grid system was built. The pricing pipeline never reads from it. The real colour data is `Main_Color_Attribute` in the `attribute_grids` system. Remove everything related to the Color Grid page. The DB table itself can stay — no migration needed.

### 2A — Remove sidebar link from `AppLayout.tsx`

In the `navItems` array, remove this entry entirely:
```ts
{ name: "Settings", href: "/admin/color-grid", icon: Settings },
```

Then check if `Settings` is used anywhere else in `AppLayout.tsx`. If not, remove it from the lucide import:
```ts
// Remove Settings from:
import { ShoppingCart, Package, Grid3X3, Code, Settings, User, LogOut, ChevronRight } from "lucide-react";
```

### 2B — Remove route from `App.tsx`

Remove the route:
```tsx
<Route path="/admin/color-grid" component={ColorGrid} />
```

Remove the import:
```ts
import ColorGrid from "@/pages/ColorGrid";
```

### 2C — Delete `client/src/pages/ColorGrid.tsx`

Delete this file entirely.

### 2D — Remove API routes from `server/routes.ts`

Find and remove the entire `// ===== Color Grid Endpoints =====` block, including both routes beneath it (`GET /api/color-grid` and `POST /api/color-grid/import`).

### 2E — Remove storage methods from `server/storage.ts`

Remove from the `IStorage` interface:
```ts
getColorGrid(): Promise<ColorGridEntry[]>;
replaceColorGrid(entries: InsertColorGridEntry[]): Promise<ColorGridEntry[]>;
```

Remove the implementations from `DatabaseStorage`:
```ts
async getColorGrid(): Promise<ColorGridEntry[]> { ... }
async replaceColorGrid(entries: InsertColorGridEntry[]): Promise<ColorGridEntry[]> { ... }
```

Remove `colorGrid`, `ColorGridEntry`, `InsertColorGridEntry` from the `@shared/schema` import in `storage.ts` if they're no longer used.

### 2F — Clean up remaining references

Search the codebase for `color-grid`, `ColorGrid`, `colorGrid`, `/api/color-grid`, `getColorGrid`, `replaceColorGrid`. In particular, `HowItWorks.tsx` has a "Color Grid Management" documentation section — find it and rewrite it to say colour data is managed via the Attribute Grids page.

**Do not remove `colorGrid` from `shared/schema.ts`** — leave the table definition. No migration needed.

---

---

## PROMPT 3 — Fix Product CSV Import (Column Name Mismatch)

**File:** `server/routes.ts`

**Problem:** The `POST /api/admin/upload-allmoxy-products` handler reads `record.NAME || record.name` but all PF product CSV files use the column header `PRODUCT NAME`. Every import silently succeeds with 0 products inserted.

Find:
```ts
const productsToInsert = records.map(record => ({
  name: record.NAME || record.name || '',
  status: 'active',
  pricingProxyId: null,
  exportProxyId: null,
})).filter(p => p.name);
```

Replace with:
```ts
const productsToInsert = records.map(record => ({
  name: record['PRODUCT NAME'] || record.NAME || record.name || record['Product Name'] || '',
  status: 'active' as const,
  pricingProxyId: null,
  exportProxyId: null,
  skuPrefix: null,
  description: null,
  notes: null,
})).filter(p => p.name);
```

---

---

## PROMPT 4 — Add skuPrefix, Description, Notes to Product UI + API

**Files:** `client/src/pages/admin/AllmoxyProductManager.tsx`, `server/routes.ts`, `server/storage.ts`

The `allmoxyProducts` table already has `skuPrefix`, `description`, and `notes` columns but none are exposed in the UI form, save route, or upsert.

### 4A — Update Zod schema in `AllmoxyProductManager.tsx`

Find:
```ts
const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  status: z.enum(["active", "inactive"]),
  pricingProxyId: z.number().nullable(),
  exportProxyId: z.number().nullable(),
});
```
Replace with:
```ts
const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  skuPrefix: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
  pricingProxyId: z.number().nullable(),
  exportProxyId: z.number().nullable(),
});
```

### 4B — Update `form.reset()` in `handleEdit`

Find:
```ts
form.reset({
  id: product.id,
  name: product.name,
  status: (product.status as "active" | "inactive") ?? "active",
  pricingProxyId: product.pricingProxyId ?? null,
  exportProxyId: product.exportProxyId ?? null,
});
```
Replace with:
```ts
form.reset({
  id: product.id,
  name: product.name,
  skuPrefix: product.skuPrefix ?? null,
  description: product.description ?? null,
  notes: product.notes ?? null,
  status: (product.status as "active" | "inactive") ?? "active",
  pricingProxyId: product.pricingProxyId ?? null,
  exportProxyId: product.exportProxyId ?? null,
});
```

### 4C — Update `form.reset()` in `handleNew`

Find:
```ts
form.reset({
  name: "",
  status: "active",
  pricingProxyId: null,
  exportProxyId: null,
});
```
Replace with:
```ts
form.reset({
  name: "",
  skuPrefix: null,
  description: null,
  notes: null,
  status: "active",
  pricingProxyId: null,
  exportProxyId: null,
});
```

### 4D — Add three form fields to "Basic Information" section

After the existing `name` and `status` fields, add:

```tsx
<FormField
  control={form.control}
  name="skuPrefix"
  render={({ field }) => (
    <FormItem>
      <FormLabel>SKU Prefix</FormLabel>
      <FormControl>
        <Input
          {...field}
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.target.value || null)}
          placeholder="e.g. 34SHFF, 34MDRWB, MJDOOR"
        />
      </FormControl>
      <p className="text-xs text-muted-foreground">
        CSV rows whose SKU starts with this prefix will use this product's pricing formula.
        Must match the start of the actual SKU exactly (case-insensitive).
      </p>
      <FormMessage />
    </FormItem>
  )}
/>

<FormField
  control={form.control}
  name="description"
  render={({ field }) => (
    <FormItem className="col-span-2">
      <FormLabel>Description</FormLabel>
      <FormControl>
        <Input
          {...field}
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.target.value || null)}
          placeholder="Short description of this product type"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

<FormField
  control={form.control}
  name="notes"
  render={({ field }) => (
    <FormItem className="col-span-2">
      <FormLabel>Notes</FormLabel>
      <FormControl>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...field}
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.target.value || null)}
          placeholder="Internal notes about pricing logic, special cases, formula variable names used, etc."
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### 4E — Update save route in `server/routes.ts`

Find:
```ts
const { name, status, pricingProxyId, exportProxyId } = req.body;
if (!name) {
  return res.status(400).json({ message: 'name is required' });
}
const product = await storage.upsertAllmoxyProduct({
  name,
  status: status ?? 'active',
  pricingProxyId: pricingProxyId ?? null,
  exportProxyId: exportProxyId ?? null,
});
```
Replace with:
```ts
const { name, status, pricingProxyId, exportProxyId, skuPrefix, description, notes } = req.body;
if (!name) {
  return res.status(400).json({ message: 'name is required' });
}
const product = await storage.upsertAllmoxyProduct({
  name,
  status: status ?? 'active',
  pricingProxyId: pricingProxyId ?? null,
  exportProxyId: exportProxyId ?? null,
  skuPrefix: skuPrefix ?? null,
  description: description ?? null,
  notes: notes ?? null,
});
```

### 4F — Update `upsertAllmoxyProduct` in `server/storage.ts`

Find the `onConflictDoUpdate` set block:
```ts
set: {
  status: product.status,
  pricingProxyId: product.pricingProxyId,
  exportProxyId: product.exportProxyId,
},
```
Replace with:
```ts
set: {
  status: product.status,
  pricingProxyId: product.pricingProxyId,
  exportProxyId: product.exportProxyId,
  skuPrefix: product.skuPrefix,
  description: product.description,
  notes: product.notes,
},
```

**Note:** `upsertAllmoxyProduct` conflicts on `name` — this is intentional. Do not change the conflict target.

---

---

## PROMPT 5 — Grid Bindings: Storage Methods + API Routes

**Files:** `server/storage.ts`, `server/routes.ts`

### 5A — Add to `IStorage` interface

```ts
getProductGridBindings(productId: number): Promise<ProductGridBinding[]>;
replaceProductGridBindings(productId: number, bindings: InsertProductGridBinding[]): Promise<ProductGridBinding[]>;
getProductBySkuPrefix(sku: string): Promise<AllmoxyProduct | undefined>;
getProxyVariableById(id: number): Promise<ProxyVariable | undefined>;
createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
getOrderItemsByProject(projectId: number): Promise<OrderItem[]>;
deleteOrderItemsByFile(fileId: number): Promise<void>;
```

Ensure `ProductGridBinding`, `InsertProductGridBinding`, `OrderItem`, `InsertOrderItem` are imported from `@shared/schema`.

### 5B — Implement in `DatabaseStorage` (add after `replaceProxyVariables`)

```ts
async getProductGridBindings(productId: number): Promise<ProductGridBinding[]> {
  return await db.select().from(productGridBindings)
    .where(eq(productGridBindings.productId, productId));
}

async replaceProductGridBindings(productId: number, bindings: InsertProductGridBinding[]): Promise<ProductGridBinding[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(productGridBindings).where(eq(productGridBindings.productId, productId));
    if (bindings.length === 0) return [];
    return await tx.insert(productGridBindings).values(bindings).returning();
  });
}

async getProductBySkuPrefix(sku: string): Promise<AllmoxyProduct | undefined> {
  const all = await db.select().from(allmoxyProducts)
    .where(eq(allmoxyProducts.status, 'active'));
  return all.find(p =>
    p.skuPrefix && sku.toUpperCase().startsWith(p.skuPrefix.toUpperCase())
  );
}

async getProxyVariableById(id: number): Promise<ProxyVariable | undefined> {
  const [v] = await db.select().from(proxyVariables).where(eq(proxyVariables.id, id));
  return v;
}

async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
  const [created] = await db.insert(orderItems).values(item).returning();
  return created;
}

async getOrderItemsByProject(projectId: number): Promise<OrderItem[]> {
  return await db.select().from(orderItems)
    .where(eq(orderItems.projectId, projectId))
    .orderBy(orderItems.id);
}

async deleteOrderItemsByFile(fileId: number): Promise<void> {
  await db.delete(orderItems).where(eq(orderItems.fileId, fileId));
}
```

Ensure `productGridBindings`, `orderItems` are imported from `@shared/schema`.

### 5C — Add API routes in `server/routes.ts` (after existing product DELETE route)

```ts
// GET grid bindings for a product
app.get('/api/admin/allmoxy-products/:id/bindings', isAuthenticated, async (req, res) => {
  try {
    const bindings = await storage.getProductGridBindings(Number(req.params.id));
    res.json(bindings);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// PUT (replace all) grid bindings for a product
app.put('/api/admin/allmoxy-products/:id/bindings', isAuthenticated, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { bindings } = req.body;
    if (!Array.isArray(bindings)) {
      return res.status(400).json({ message: 'bindings must be an array' });
    }
    const toInsert = bindings.map((b: any) => ({
      productId,
      gridId: Number(b.gridId),
      alias: String(b.alias),
      lookupColumn: String(b.lookupColumn),
    }));
    const saved = await storage.replaceProductGridBindings(productId, toInsert);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// GET order items for a project
app.get('/api/orders/:id/items', isAuthenticated, async (req, res) => {
  try {
    const items = await storage.getOrderItemsByProject(Number(req.params.id));
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

---

---

## PROMPT 6 — Grid Bindings UI Panel in Product Manager

**File:** `client/src/pages/admin/AllmoxyProductManager.tsx`

**How bindings work:** Each binding has three parts — **Grid** (which attribute grid), **Alias** (the variable prefix used in the formula, e.g. `color` → `color.level_percent_upcharge`), and **Lookup Column** (the order CSV column name whose value selects the grid row, e.g. `Color`).

### 6A — Add imports

```ts
import type { AttributeGrid, ProductGridBinding } from "@shared/schema";
import { useEffect } from "react";
```
(Add `useEffect` to the existing React import if not already present.)

### 6B — Add state and queries (after existing `proxyVars` query)

```ts
const { data: allGrids = [] } = useQuery<AttributeGrid[]>({
  queryKey: ["/api/admin/attribute-grids"],
});

const { data: savedBindings = [], refetch: refetchBindings } = useQuery<ProductGridBinding[]>({
  queryKey: ["/api/admin/allmoxy-products", editingId, "bindings"],
  enabled: editingId !== null,
  queryFn: () =>
    fetch(`/api/admin/allmoxy-products/${editingId}/bindings`)
      .then(r => r.json()),
});

const [editingBindings, setEditingBindings] = useState<
  Array<{ gridId: number | null; alias: string; lookupColumn: string }>
>([]);

useEffect(() => {
  setEditingBindings(
    savedBindings.map(b => ({
      gridId: b.gridId,
      alias: b.alias,
      lookupColumn: b.lookupColumn,
    }))
  );
}, [savedBindings]);

const saveBindingsMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`/api/admin/allmoxy-products/${editingId}/bindings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bindings: editingBindings.filter(b => b.gridId !== null && b.alias.trim() !== ''),
      }),
    });
    if (!res.ok) throw new Error('Failed to save bindings');
    return res.json();
  },
  onSuccess: () => {
    refetchBindings();
    toast({ title: "Grid bindings saved" });
  },
  onError: (e: Error) => {
    toast({ title: "Error saving bindings", description: e.message, variant: "destructive" });
  },
});
```

### 6C — Add Grid Bindings section to form (after "Logic Binding" section)

```tsx
{editingId && (
  <div className="space-y-4">
    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">
      Grid Bindings
    </h3>
    <p className="text-xs text-muted-foreground">
      Declare which attribute grids this product's formula reads from.{" "}
      <strong>Alias</strong> = the variable prefix used in the formula (e.g. <code>color</code> → <code>color.level_percent_upcharge</code>).{" "}
      <strong>Lookup Column</strong> = the order CSV column name whose value selects the row (e.g. <code>Color</code>).
    </p>
    <div className="space-y-2">
      {editingBindings.map((binding, index) => (
        <div key={index} className="flex gap-2 items-center">
          <div className="flex-1">
            <Select
              value={binding.gridId !== null ? String(binding.gridId) : "none"}
              onValueChange={(val) => {
                const updated = [...editingBindings];
                updated[index] = { ...updated[index], gridId: val === "none" ? null : Number(val) };
                setEditingBindings(updated);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select grid..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select grid —</SelectItem>
                {allGrids.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="flex-1 h-8 text-xs"
            placeholder="Alias (e.g. color)"
            value={binding.alias}
            onChange={(e) => {
              const updated = [...editingBindings];
              updated[index] = { ...updated[index], alias: e.target.value };
              setEditingBindings(updated);
            }}
          />
          <Input
            className="flex-1 h-8 text-xs"
            placeholder="CSV Column (e.g. Color)"
            value={binding.lookupColumn}
            onChange={(e) => {
              const updated = [...editingBindings];
              updated[index] = { ...updated[index], lookupColumn: e.target.value };
              setEditingBindings(updated);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => setEditingBindings(editingBindings.filter((_, i) => i !== index))}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setEditingBindings([...editingBindings, { gridId: null, alias: "", lookupColumn: "" }])}
      >
        <Plus className="h-3 w-3 mr-1" /> Add Binding
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => saveBindingsMutation.mutate()}
        disabled={saveBindingsMutation.isPending}
      >
        {saveBindingsMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Save Bindings
      </Button>
    </div>
  </div>
)}
```

Add `X` and `Plus` to the lucide-react import if not already present.

---

---

## PROMPT 7 — Fix pricingEngine `length` Scope + Rewrite Upload Pipeline

**Files:** `server/services/pricingEngine.ts`, `server/routes.ts`

Both parts must be applied together.

### 7A — Fix `pricingEngine.ts` scope

**Problem:** Formulas use `length` (the third dimension, CSV column 5) but the engine only exposes `depth`. All drawer box prices silently evaluate to $0.

Find:
```ts
const scope: Record<string, any> = {
  width: Number(orderItem?.width) || 0,
  height: Number(orderItem?.height) || 0,
  depth: Number(orderItem?.depth) || 0,
  quantity: Number(orderItem?.quantity) || 1,
  ...dynamicGrids
};
```
Replace with:
```ts
const scope: Record<string, any> = {
  width: Number(orderItem?.width) || 0,
  height: Number(orderItem?.height) || 0,
  // Formulas use "length" for the third dimension (CSV column 5).
  // "depth" is kept as an alias for backward compatibility.
  length: Number(orderItem?.length ?? orderItem?.depth) || 0,
  depth: Number(orderItem?.depth ?? orderItem?.length) || 0,
  quantity: Number(orderItem?.quantity) || 1,
  ...dynamicGrids
};
```

### 7B — Rewrite upload pipeline in `server/routes.ts`

In the `POST /api/orders/upload` handler, find the section starting with:
```ts
// Pipeline: Calculate Price and Generate ORD
```
or the block starting with:
```ts
if (pricingProxy || exportProxy) {
```

**Replace that entire inner pricing/export loop** with the following. Do not touch anything outside it — pallet logic, CTS extraction, hardware checklist, and Asana sync stay exactly as-is.

```ts
// Pipeline: per-item product matching via skuPrefix
const allActiveProducts = await storage.getAllmoxyProducts();
const productsWithPrefix = allActiveProducts.filter(
  p => p.skuPrefix && p.status === 'active'
);

const itemObjects: any[] = parseSync(pf.content, { columns: true, skip_empty_lines: true });

// Clear any existing order items for this file (safe for re-uploads)
await storage.deleteOrderItemsByFile(orderFile.id);

// Prepend ORD header for this file.
// designName = the full PO string from CSV (e.g. "H Holtermann (Her Holtermann V2)")
// poNumber   = the short numeric order ID (e.g. "1918") stored on the project
const designName = pf.poNumber || pf.filename.replace(/\.csv$/i, '');
combinedOrdText += generateOrdHeader(
  `[Header]\nVersion=4\nUnit=1\nName="{{design_name}}"\nDescription="{{design_name}}"\nPurchaseOrder="{{po_number}}"\nComment=""\nCustomer="Perfect Fit Closets"\nAddress1="100-111 5 Avenue Southwest"\n`,
  { designName, poNumber: project.orderId || '' }
) + '\n';

for (const item of itemObjects) {
  const itemSku: string = (item.SKU || item.MANU_CODE || item['Manuf code'] || '').trim();

  // 1. Match product by SKU prefix (case-insensitive)
  const matchedProduct = productsWithPrefix.find(p =>
    itemSku.toUpperCase().startsWith(p.skuPrefix!.toUpperCase())
  ) ?? null;

  let unitPrice = 0;
  let exportText = '';
  let pricingError: string | null = null;

  if (matchedProduct) {
    // 2. Load this product's declared grid bindings
    const bindings = await storage.getProductGridBindings(matchedProduct.id);

    // 3. Build context scope from bindings
    const contextScope: Record<string, any> = {};
    for (const binding of bindings) {
      const lookupValue = String(item[binding.lookupColumn] || '');
      const row = await storage.getAttributeGridRowByKey(binding.gridId, lookupValue);
      if (row) {
        contextScope[binding.alias] = row.rowData;
      }
    }

    // 4. Build the item object — pass "length" explicitly (formulas use length, not depth)
    const pricingItem = {
      ...item,
      width: Number(item.Width || item.width || 0),
      height: Number(item.Height || item.height || 0),
      length: Number(item.Length || item.length || 0),
      depth: Number(item.Length || item.length || 0),
      quantity: Number(item.Qty || item.quantity || item.QUANTITY || 1),
    };

    // 5. Evaluate pricing formula
    if (matchedProduct.pricingProxyId) {
      const pricingProxy = await storage.getProxyVariableById(matchedProduct.pricingProxyId);
      if (pricingProxy) {
        try {
          unitPrice = evaluatePrice(pricingProxy.formula, pricingItem, contextScope);
        } catch (e: any) {
          pricingError = `Pricing error: ${e.message}`;
        }
      }
    }

    // 6. Evaluate export formula
    if (matchedProduct.exportProxyId) {
      const exportProxy = await storage.getProxyVariableById(matchedProduct.exportProxyId);
      if (exportProxy) {
        try {
          exportText = generateOrdItemBlock(pricingItem, contextScope, exportProxy.formula);
        } catch (e: any) {
          pricingError = (pricingError ? pricingError + '; ' : '') + `Export error: ${e.message}`;
        }
      }
    }
  } else if (itemSku) {
    pricingError = `No product matched SKU prefix: ${itemSku}`;
  }

  const qty = Number(item.Qty || item.quantity || item.QUANTITY || 1);
  const lineTotal = unitPrice * qty;
  totalProjectPrice += lineTotal;
  if (exportText) combinedOrdText += exportText + '\n';

  // 7. Persist result to order_items
  await storage.createOrderItem({
    projectId: project.id,
    fileId: orderFile.id,
    productId: matchedProduct?.id ?? null,
    sku: itemSku || null,
    description: item.NAME || item.name || item.DESCRIPTION || null,
    width: Number(item.Width || item.width) || null,
    height: Number(item.Height || item.height) || null,
    depth: Number(item.Length || item.length) || null,
    quantity: qty,
    unitPrice,
    totalPrice: lineTotal,
    exportText: exportText || null,
    pricingError,
    rawRowData: item,
  });

  allItems.push({ ...item, price: unitPrice, error: pricingError });
}
```

Also remove these now-unused lines from above the old loop (if no longer referenced elsewhere):
```ts
const allProxyVars = await storage.getProxyVariables();
const pricingProxy = allProxyVars.find(v => v.type === 'pricing');
const exportProxy = allProxyVars.find(v => v.type === 'export');
const grids = await storage.getAttributeGrids();
```

Update the import at the top of `server/routes.ts`:
```ts
// Find:
import { generateOrdItemBlock } from "./services/ordExporter";
// Replace with:
import { generateOrdHeader, generateOrdItemBlock } from "./services/ordExporter";
```

---

---

## PROMPT 8 — Formula Tester Page

**Files:** new `client/src/pages/admin/FormulaTester.tsx`, `server/routes.ts`, `client/src/App.tsx`, `client/src/components/AppLayout.tsx`

### 8A — Add API route in `server/routes.ts`

```ts
app.post('/api/admin/formula-test', isAuthenticated, async (req, res) => {
  try {
    const { productId, width, height, length, quantity, gridLookups } = req.body;
    // gridLookups: { [alias]: lookupValue }

    const allProds = await storage.getAllmoxyProducts();
    const product = allProds.find(p => p.id === Number(productId));
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const bindings = await storage.getProductGridBindings(product.id);
    const contextScope: Record<string, any> = {};

    for (const binding of bindings) {
      const lookupValue = String((gridLookups || {})[binding.alias] || '');
      const row = await storage.getAttributeGridRowByKey(binding.gridId, lookupValue);
      if (row) contextScope[binding.alias] = row.rowData;
    }

    const fakeItem = {
      width: Number(width) || 0,
      height: Number(height) || 0,
      length: Number(length) || 0,
      depth: Number(length) || 0,
      quantity: Number(quantity) || 1,
      SKU: 'TEST',
    };

    let price = 0;
    let priceError: string | null = null;
    let exportBlock = '';
    let exportError: string | null = null;

    if (product.pricingProxyId) {
      const pv = await storage.getProxyVariableById(product.pricingProxyId);
      if (pv) {
        try { price = evaluatePrice(pv.formula, fakeItem, contextScope); }
        catch (e: any) { priceError = e.message; }
      }
    }

    if (product.exportProxyId) {
      const ev = await storage.getProxyVariableById(product.exportProxyId);
      if (ev) {
        try { exportBlock = generateOrdItemBlock(fakeItem, contextScope, ev.formula); }
        catch (e: any) { exportError = e.message; }
      }
    }

    res.json({ price, priceError, exportBlock, exportError, contextScope });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

### 8B — Create `client/src/pages/admin/FormulaTester.tsx`

Create a new file with this component. It should:

1. Product selector dropdown — fetches from `/api/admin/allmoxy-products`
2. When a product is selected, fetch its bindings from `/api/admin/allmoxy-products/:id/bindings`
3. Dimension inputs: **Width**, **Height**, **Length**, **Quantity** (number inputs — third dimension is "Length" not "Depth")
4. For each binding, a text input labelled `[alias] lookup (column: [lookupColumn])` — e.g. "color lookup (column: Color)"
5. A "Test Formula" button that POSTs to `/api/admin/formula-test`
6. Results section:
   - **Price:** `$XX.XX` in green, or error in red
   - **Export Block:** `<pre>` monospace block, or error in red
   - **Context Scope:** collapsible `<pre>` JSON showing what grid data was loaded for each alias

### 8C — Register route in `client/src/App.tsx`

```tsx
<Route path="/admin/formula-tester" component={FormulaTester} />
```
Import `FormulaTester` at the top with the other admin imports.

### 8D — Add to sidebar in `AppLayout.tsx`

In `navItems`, under `SYSTEM ADMINISTRATION`, add:
```ts
{ name: "Formula Tester", href: "/admin/formula-tester", icon: FlaskConical },
```
Add `FlaskConical` to the lucide-react import.

---

---

## PROMPT 9 — Order Items Pricing Breakdown in Order Details

**File:** `client/src/pages/OrderDetails.tsx`

Add a collapsible card section after the existing file list.

1. Fetch `GET /api/orders/:id/items` with query key `["/api/orders", projectId, "items"]`

2. Table columns:
   - **SKU** — raw SKU from CSV
   - **Description** — item name
   - **Dimensions** — `W × H × L`
   - **Qty**
   - **Unit Price** — `$X.XX`
   - **Total** — `$X.XX`
   - **Status** — green check (matched + priced), yellow warning (matched but $0), red X (`pricingError` set)

3. Footer row: total items count, grand total, count of unmatched items (where `productId` is null)

4. Row colours:
   - **Green tint:** `productId` set and `unitPrice > 0`
   - **Yellow tint:** `productId` set but `unitPrice === 0`
   - **Red tint:** `pricingError` not null

5. Show `pricingError` text inline under the SKU on red rows

6. If items array is empty: show muted note — *"No pricing data available. Re-upload the order CSV to generate pricing breakdown."*

---

---

## PROMPT 10 — Rebuild Attribute Grid Manager

**Files:** `client/src/pages/admin/DynamicGridManager.tsx` (full replace), `server/routes.ts`, `server/storage.ts`

### 10A — Add storage methods to `server/storage.ts`

Add to `IStorage` interface:
```ts
updateAttributeGridRow(id: number, rowData: Record<string, any>): Promise<AttributeGridRow>;
deleteAttributeGridRow(id: number): Promise<void>;
deleteAttributeGrid(id: number): Promise<boolean>;
addAttributeGridRow(gridId: number, lookupKey: string, rowData: Record<string, any>): Promise<AttributeGridRow>;
updateAttributeGrid(id: number, updates: { name?: string; keyColumn?: string }): Promise<AttributeGrid>;
```

Implement in `DatabaseStorage`:
```ts
async updateAttributeGridRow(id: number, rowData: Record<string, any>): Promise<AttributeGridRow> {
  const [existingRow] = await db.select().from(attributeGridRows).where(eq(attributeGridRows.id, id));
  const [grid] = await db.select().from(attributeGrids).where(eq(attributeGrids.id, existingRow.gridId));
  const newLookupKey = String(rowData[grid.keyColumn] || existingRow.lookupKey);
  const [updated] = await db.update(attributeGridRows)
    .set({ rowData, lookupKey: newLookupKey })
    .where(eq(attributeGridRows.id, id))
    .returning();
  return updated;
}

async deleteAttributeGridRow(id: number): Promise<void> {
  await db.delete(attributeGridRows).where(eq(attributeGridRows.id, id));
}

async deleteAttributeGrid(id: number): Promise<boolean> {
  const [deleted] = await db.delete(attributeGrids).where(eq(attributeGrids.id, id)).returning();
  return !!deleted;
}

async addAttributeGridRow(gridId: number, lookupKey: string, rowData: Record<string, any>): Promise<AttributeGridRow> {
  const [created] = await db.insert(attributeGridRows)
    .values({ gridId, lookupKey, rowData })
    .returning();
  return created;
}

async updateAttributeGrid(id: number, updates: { name?: string; keyColumn?: string }): Promise<AttributeGrid> {
  const [updated] = await db.update(attributeGrids)
    .set(updates)
    .where(eq(attributeGrids.id, id))
    .returning();
  return updated;
}
```

### 10B — Add API routes to `server/routes.ts` (after existing grid routes)

```ts
// Update a single grid row
app.put('/api/admin/attribute-grids/rows/:rowId', isAuthenticated, async (req, res) => {
  try {
    const { rowData } = req.body;
    if (!rowData || typeof rowData !== 'object') {
      return res.status(400).json({ message: 'rowData is required' });
    }
    const updated = await storage.updateAttributeGridRow(Number(req.params.rowId), rowData);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Delete a single grid row
app.delete('/api/admin/attribute-grids/rows/:rowId', isAuthenticated, async (req, res) => {
  try {
    await storage.deleteAttributeGridRow(Number(req.params.rowId));
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Add a new row to a grid
app.post('/api/admin/attribute-grids/:id/rows', isAuthenticated, async (req, res) => {
  try {
    const gridId = Number(req.params.id);
    const { rowData } = req.body;
    if (!rowData || typeof rowData !== 'object') {
      return res.status(400).json({ message: 'rowData is required' });
    }
    const grids = await storage.getAttributeGrids();
    const grid = grids.find(g => g.id === gridId);
    if (!grid) return res.status(404).json({ message: 'Grid not found' });
    const lookupKey = String(rowData[grid.keyColumn] || '');
    const created = await storage.addAttributeGridRow(gridId, lookupKey, rowData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Delete an entire grid
app.delete('/api/admin/attribute-grids/:id', isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteAttributeGrid(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: 'Grid not found' });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Update grid metadata
app.patch('/api/admin/attribute-grids/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, keyColumn } = req.body;
    const updated = await storage.updateAttributeGrid(Number(req.params.id), { name, keyColumn });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// Export a grid as CSV
app.get('/api/admin/attribute-grids/:id/export', isAuthenticated, async (req, res) => {
  try {
    const gridId = Number(req.params.id);
    const grids = await storage.getAttributeGrids();
    const grid = grids.find(g => g.id === gridId);
    if (!grid) return res.status(404).json({ message: 'Grid not found' });
    const rows = await storage.getAttributeGridRows(gridId);
    const headers = grid.columns;
    const csvLines = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const val = String((r.rowData as any)[h] ?? '');
          return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(',')
      )
    ];
    const safeName = grid.name.replace(/[^a-z0-9_-]/gi, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
```

### 10C — Replace `DynamicGridManager.tsx` completely

Replace the entire file contents with a new component. Required imports:

```ts
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Database, Search, Trash2, Plus, Download,
  ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle,
} from "lucide-react";
import type { AttributeGrid, AttributeGridRow } from "@shared/schema";
import { cn } from "@/lib/utils";
```

**Layout — three panels:**

```
┌──────────────────────────────────────────────────────────────────┐
│  LEFT PANEL            │  RIGHT PANEL                            │
│  Scrollable grid list  │  Toolbar: name, key col, search,        │
│  Each card: name,      │  Add Row, Export, Delete Grid           │
│  row count, key col,   ├─────────────────────────────────────────│
│  column count          │  Data table: horizontally + vertically  │
│                        │  scrollable, sticky header, inline      │
│  [Upload New Grid]     │  editable cells, delete row buttons,    │
│  collapsible at bottom │  add-row input row at bottom            │
└────────────────────────┴─────────────────────────────────────────┘
```

**State:**
```ts
const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
const [editingCell, setEditingCell] = useState<{ rowId: number; col: string } | null>(null);
const [editingValue, setEditingValue] = useState<string>('');
const [searchQuery, setSearchQuery] = useState('');
const [newRowData, setNewRowData] = useState<Record<string, string>>({});
const [uploadOpen, setUploadOpen] = useState(false);
const [uploadFile, setUploadFile] = useState<File | null>(null);
const [uploadName, setUploadName] = useState('');
const [confirmDeleteGrid, setConfirmDeleteGrid] = useState(false);
```

**Queries:**
```ts
const { data: grids = [] } = useQuery<AttributeGrid[]>({
  queryKey: ['/api/admin/attribute-grids'],
});

const { data: rows = [], isLoading: isLoadingRows } = useQuery<AttributeGridRow[]>({
  queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'],
  enabled: selectedGridId !== null,
  queryFn: () => fetch(`/api/admin/attribute-grids/${selectedGridId}/rows`).then(r => r.json()),
});

const selectedGrid = grids.find(g => g.id === selectedGridId) ?? null;

const filteredRows = useMemo(() => {
  if (!searchQuery.trim()) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter(row =>
    Object.values(row.rowData as Record<string, any>).some(v =>
      String(v).toLowerCase().includes(q)
    )
  );
}, [rows, searchQuery]);
```

**Mutations** — updateRow, deleteRow, addRow, deleteGrid, uploadGrid (see full mutation patterns in the mutations section below).

**Inline edit helpers:**
```ts
function startEdit(rowId: number, col: string, currentValue: string) {
  setEditingCell({ rowId, col });
  setEditingValue(currentValue);
}

function commitEdit(row: AttributeGridRow) {
  if (!editingCell) return;
  const updatedRowData = { ...(row.rowData as Record<string, any>), [editingCell.col]: editingValue };
  updateRowMutation.mutate({ rowId: row.id, rowData: updatedRowData });
  setEditingCell(null);
}

function cancelEdit() {
  setEditingCell(null);
  setEditingValue('');
}
```

**Left panel — grid list cards:** One card per grid showing name, row count badge, key column badge, column count. Click to set `selectedGridId`. Selected card has a gold left border. Upload section at the bottom is a collapsible toggle. Uploading to an existing grid name replaces all rows.

**Right panel toolbar:** Grid name (inline editable — blur calls `PATCH /api/admin/attribute-grids/:id`), key column badge (dropdown of column names), search input, `[Add Row]`, `[Export CSV]` (`window.open('/api/admin/attribute-grids/${selectedGridId}/export')`), `[Delete Grid]` (shows inline confirmation before firing).

**Right panel data table:**
- Wrapper div: `overflow-x-auto`, inner div: `min-w-max`, max-height `calc(100vh-280px)` with `overflow-y-auto`. **No `ScrollArea` from shadcn — it clips horizontal content.**
- Sticky `<thead>` (`position: sticky; top: 0`)
- Key column header highlighted with a small `key` badge
- View mode cells: click to enter edit mode. Edit mode: `autoFocus` input, blur/Enter commits, Escape cancels
- Row colours: alternate white/muted, header rows (`SELECTABLE === 'Header'`) styled muted+italic, empty key column rows get yellow tint
- Actions column: delete row button (confirm with `window.confirm`)
- Add-row section: green-tinted row at the bottom with blank inputs for every column, `[+ Add]` button disabled until key column is filled

**Footer bar:** "Showing X of Y rows · key: MANU_CODE · Grid ID: 4"

**Empty states:** No grid selected → Database icon + "Select a grid from the left". Loading → spinner. Zero rows → "No rows. Add a row or re-upload a CSV."

---

---

## REFERENCE — Formula Variable Names by Product Type

| Product type | Grid aliases | Example variables |
|---|---|---|
| Shelves | `shelves`, `color` | `shelves.base_price`, `shelves.sq_ft_price`, `shelves.margin`, `color.level_percent_upcharge`, `color.sqft_price` |
| Drawer Boxes | `drawer_boxes`, `color` | `drawer_boxes.base_price`, `drawer_boxes.sq_ft_price`, `drawer_boxes.margin`, `drawer_boxes.color_upcharge_id`, `color.level_percent_upcharge`, `color.sqft_price` |
| Doors | `doors`, `color` | `doors.base_price`, `doors.sq_ft_price`, `doors.margin`, `doors.pricing_id`, `color.level_percent_upcharge`, `color.poly45_door_sqft_cost`, `color.tfl90_door_sqft_cost` |
| Product Parts | `product_parts`, `color` | `product_parts.base_price`, `product_parts.sq_ft_price`, `product_parts.margin`, `color.level_percent_upcharge` |
| MJ Doors | `mjdoors` | see `MJ_Export_Formula.txt` |

The `color` binding lookup column is always `Color`. Product grid binding lookup columns are typically `MANU_CODE`.
