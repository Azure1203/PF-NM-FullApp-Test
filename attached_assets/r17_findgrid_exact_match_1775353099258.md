# r17 — Fix findGridForAlias: Exact Match Priority

## The Bug

`findGridForAlias('shelves')` returns the wrong grid (e.g. Corner Shelves or Outside Corner Shelves) because `normKey.includes('shelves')` matches any grid name containing "shelves". The actual Shelves grid gets skipped, so zero bindings are created for it.

## The Fix

In `server/routes.ts`, find the `findGridForAlias` function (~line 1149). Replace it entirely:

```ts
      function findGridForAlias(alias: string): typeof allGrids[0] | undefined {
        const patterns = aliasToGridPatterns[alias] ?? [alias];
        
        // Pass 1: Exact match
        for (const pattern of patterns) {
          const normPattern = pattern.replace(/\s+/g, '_').toLowerCase();
          for (const [key, grid] of gridNameMap) {
            const normKey = key.replace(/\s+/g, '_').toLowerCase();
            if (normKey === normPattern) return grid;
          }
        }
        
        // Pass 2: Starts-with (handles date suffixes like "shelves_02202026")
        for (const pattern of patterns) {
          const normPattern = pattern.replace(/\s+/g, '_').toLowerCase();
          for (const [key, grid] of gridNameMap) {
            const normKey = key.replace(/\s+/g, '_').toLowerCase();
            if (normKey.startsWith(normPattern + '_') || normKey.startsWith(normPattern + ' ')) return grid;
          }
        }
        
        // Pass 3: Contains (fallback)
        for (const pattern of patterns) {
          const normPattern = pattern.replace(/\s+/g, '_').toLowerCase();
          for (const [key, grid] of gridNameMap) {
            const normKey = key.replace(/\s+/g, '_').toLowerCase();
            if (normKey.includes(normPattern)) return grid;
          }
        }
        
        return undefined;
      }
```

## After Deploying

1. Go to `/admin/diagnostic` → "Reset & Recreate Bindings"
2. Go to `/admin/attribute-grids` → click Shelves grid → Bindings tab should now show products
3. Go to the order → "Re-run Pricing" → shelves errors should be gone
