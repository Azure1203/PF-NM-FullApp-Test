# r18 — Fix Grid Name Map: Old Grids Shadowing Current Grids

## The Bug

If an old grid named `Shelves` (no date) exists in the database alongside the current `Shelves 02202026`, both produce the normalized key `'shelves'` in the gridNameMap. Since `Map.set()` overwrites, whichever grid is iterated LAST for that key wins. If the old empty grid overwrites the current one, `findGridForAlias('shelves')` returns the wrong (empty) grid and the binding is useless.

## Fix 1 — Prefer grids with more rows when keys collide

Replace the gridNameMap construction (~line 1096) with:

```ts
      const gridNameMap = new Map<string, typeof allGrids[0]>();
      // Sort grids so that grids with more rows (loaded grids) come last and overwrite empties
      // Also prefer grids with date suffixes (more recent) over plain names
      const sortedGrids = [...allGrids].sort((a, b) => {
        const aHasDate = /\d{8}$/.test(a.name);
        const bHasDate = /\d{8}$/.test(b.name);
        if (aHasDate && !bHasDate) return 1;  // a comes after b (overwrites)
        if (!aHasDate && bHasDate) return -1;
        return a.name.localeCompare(b.name);
      });
      for (const g of sortedGrids) {
        const lower = g.name.toLowerCase();
        const noDate = g.name.replace(/[\s_]?\d{8}$/, '').trim();
        const noDateLower = noDate.toLowerCase();
        gridNameMap.set(lower, g);
        gridNameMap.set(lower.replace(/\s+/g, '_'), g);
        gridNameMap.set(noDateLower, g);
        gridNameMap.set(noDateLower.replace(/\s+/g, '_'), g);
      }
```

This ensures grids with date suffixes (the current/active ones) are iterated LAST and overwrite any old grids that produce the same normalized key.

## Fix 2 — Add a cleanup endpoint to find and remove stale grids

Add a diagnostic endpoint to identify old/duplicate grids:

```ts
  app.get('/api/admin/duplicate-grids', isAuthenticated, async (req, res) => {
    const allGrids = await storage.getAttributeGrids();
    const byBaseName = new Map<string, typeof allGrids>();
    
    for (const g of allGrids) {
      const baseName = g.name.replace(/[\s_]?\d{8}$/, '').trim().toLowerCase();
      const list = byBaseName.get(baseName) ?? [];
      list.push(g);
      byBaseName.set(baseName, list);
    }
    
    const duplicates: Array<{ baseName: string; grids: Array<{ id: number; name: string; rowCount: number }> }> = [];
    
    for (const [baseName, grids] of byBaseName) {
      if (grids.length > 1) {
        const withCounts = await Promise.all(grids.map(async g => {
          const rows = await storage.getAttributeGridRows(g.id);
          return { id: g.id, name: g.name, rowCount: rows.length };
        }));
        duplicates.push({ baseName, grids: withCounts });
      }
    }
    
    res.json({ duplicates, totalGrids: allGrids.length });
  });
```

## After Deploying

1. Visit `/api/admin/duplicate-grids` in your browser — it will list all grids that share the same base name (e.g., `Shelves` and `Shelves 02202026`)
2. Delete the old/empty duplicates via the Grid Manager page
3. Run "Reset & Recreate Bindings" 
4. "Re-run Pricing" on the order

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` — gridNameMap construction (~line 1096) | Sort grids so dated ones overwrite old ones |
| `server/routes.ts` — new endpoint | `GET /api/admin/duplicate-grids` |
