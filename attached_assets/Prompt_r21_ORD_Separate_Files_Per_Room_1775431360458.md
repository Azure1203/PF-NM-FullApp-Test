# Prompt r21 — Fix ORD File Generation: Separate Files Per Room + Standard 8-Field Format

Paste this entire prompt into Replit.

---

## Problem Analysis

The current ORD generator has two critical issues:

### Issue 1: Rooms don't work in a single ORD file

The r16 implementation tried to put all CSV files (rooms) into a single ORD file using an 18-field "Extended ORD Format" with a `[Walls]` section and room numbers in field 14. **This is the wrong approach.** 

The Extended ORD Format's `[Walls]` section is for defining physical wall geometry (X/Y coordinates, heights, wall types) so Cabinet Vision can place cabinets on walls in a layout view. It is NOT a "room grouping" mechanism. The room number in field 14 refers to which wall a cabinet is placed on, not which logical room it belongs to.

**The ORD file format has no concept of multiple rooms in a single file.** Cabinet Vision's internal architecture (Job → Room → Assembly hierarchy) means each Room is a separate workspace. An ORD file imports into ONE room.

### Issue 2: Field format doesn't match working Allmoxy reference templates

All 8 reference ORD templates from Allmoxy (the known-working originals) use the **Standard 8-field format**:

```
entry_num,"nomenclature",width,height,depth,"hinge","fixture_type",quantity
```

Example from reference:
```
1,"34MDRWB1",752,231,340,"*","N",2
```

But the current generator outputs 18 fields:
```
1,"DRWEURO",778,285,19,"*","N",2,"",0.0,0.0,0.0,1,0,"","","S"
```

Those extra 9 fields are the Extended Format positional fields (wall reference, X/Y/Z position, etc.) which only apply when a `[Walls]` section with physical geometry is defined. Without valid wall definitions, these extra fields are either ignored or cause import errors in Cabinet Vision.

### Issue 3: Entry numbering

The reference templates all use entry number `1` for every cabinet line. The current generator uses sequential entry numbers (1, 2, 3, ..., 118). Allmoxy uses `1` for all entries, which means Cabinet Vision auto-assigns entry numbers on import. Both approaches technically work, but using `1` matches the Allmoxy reference behavior.

---

## The Fix: Generate One ORD File Per CSV File (Room)

This matches exactly how Allmoxy works: each CSV file represents one closet/room, and each gets its own separate `.ord` file. When a project has 5 CSV files, it produces 5 `.ord` files. The user downloads them as a ZIP.

### Step 1: Rewrite `GET /api/orders/:id/download/ord`

Replace the current single-file ORD generator with a multi-file ZIP generator.

```typescript
// GET /api/orders/:id/download/ord
app.get('/api/orders/:id/download/ord', isAuthenticated, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Load header template from app_settings
    const headerTemplateSetting = await storage.getAppSetting('ord_header_template');
    const headerTemplate = headerTemplateSetting?.value || DEFAULT_ORD_HEADER_TEMPLATE;

    // Load all order files for this project
    const orderFiles = await storage.getOrderFilesByProject(projectId);
    if (!orderFiles || orderFiles.length === 0) {
      return res.status(404).json({ message: 'No order files found' });
    }

    // Load order items grouped by fileId
    const allItems = await storage.getOrderItemsByProject(projectId);
    const ordItems = allItems.filter(item => item.exportType === 'ORD');

    // Group items by fileId
    const itemsByFile = new Map<number, typeof ordItems>();
    for (const item of ordItems) {
      const fileItems = itemsByFile.get(item.fileId) || [];
      fileItems.push(item);
      itemsByFile.set(item.fileId, fileItems);
    }

    // If only one file, return a single .ord file directly (no ZIP)
    if (orderFiles.length === 1) {
      const file = orderFiles[0];
      const items = itemsByFile.get(file.id) || [];
      const ordContent = buildOrdFile(headerTemplate, file, project, items);
      
      const safeName = (file.filename || project.projectName || 'order')
        .replace(/\.csv$/i, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim();
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ord"`);
      return res.send(ordContent);
    }

    // Multiple files → ZIP
    // Use archiver or build a simple concatenation with markers
    // For simplicity, use the 'archiver' package
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    const safeProjName = (project.projectName || 'order')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeProjName}_ORD_Files.zip"`);
    archive.pipe(res);

    for (const file of orderFiles) {
      const items = itemsByFile.get(file.id) || [];
      if (items.length === 0) continue; // Skip files with no ORD items
      
      const ordContent = buildOrdFile(headerTemplate, file, project, items);
      
      const safeName = (file.filename || `Room_${file.id}`)
        .replace(/\.csv$/i, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim();
      
      archive.append(ordContent, { name: `${safeName}.ord` });
    }

    await archive.finalize();
  } catch (err: any) {
    console.error('[ORD Download] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});
```

### Step 2: Create the `buildOrdFile` helper function

Add this function above the route handler (or in a separate utility file):

```typescript
function buildOrdFile(
  headerTemplate: string,
  orderFile: any,
  project: any,
  items: any[]
): string {
  // Build header from template
  // The template has placeholders like {{name}}, {{purchaseOrder}}, etc.
  const designName = orderFile.poNumber || orderFile.filename?.replace(/\.csv$/i, '') || project.projectName || '';
  
  let header = headerTemplate
    .replace(/\{\{name\}\}/gi, designName)
    .replace(/\{\{description\}\}/gi, designName)
    .replace(/\{\{purchaseOrder\}\}/gi, String(project.id || ''))
    .replace(/\{\{customer\}\}/gi, 'Perfect Fit Closets')
    .replace(/\{\{address1?\}\}/gi, '100-111 5 Avenue Southwest');

  // If the template doesn't start with [Header], prepend it
  if (!header.trim().startsWith('[Header]')) {
    header = '[Header]\n' + header;
  }

  // Build item blocks — Standard 8-field ORD format
  const lines: string[] = [header.trim(), ''];

  for (const item of items) {
    // Resolve catalog/parameters/cabinets from the item's export data
    const catalogBlock = buildCatalogBlock(item);
    const parametersBlock = buildParametersBlock(item);
    const cabinetLine = buildCabinetLine(item);

    lines.push(catalogBlock);
    lines.push('');
    lines.push(parametersBlock);
    lines.push('');
    lines.push('[Cabinets]');
    lines.push(cabinetLine);
    lines.push('');
  }

  return lines.join('\n');
}

function buildCatalogBlock(item: any): string {
  // Use the item's resolved export data to build the [Catalog] section
  // The catalog block varies per product type (doors need BaseDoors, drawers need GuideMaterials, etc.)
  const lines = ['[Catalog]'];
  lines.push('Name="Perfect Fit"');
  lines.push('CabinetConstruction="X-Perfect Fit"');
  lines.push('DrawerBoxConstruction="X-Perfect Fit Drawer 19"');
  lines.push('RollOutConstruction="X-Perfect Fit Roll Out 19"');
  
  // Materials — from the color grid resolution
  const materials = item.rawRowData?.materials || item.rawRowData?.panel_export || '';
  if (materials) {
    lines.push(`Materials="${materials}"`);
  }
  
  // DrawerBoxMaterials — for drawer box items (34MDRWB*, 8MDRWB*)
  const dbMaterials = item.rawRowData?.drawer_box_materials || '';
  if (dbMaterials) {
    lines.push(`DrawerBoxMaterials="${dbMaterials}"`);
  }
  
  // GuideMaterials — for items with slides (doors with drawers, etc.)
  const guideMaterials = item.rawRowData?.guide_materials || '';
  if (guideMaterials) {
    lines.push(`GuideMaterials="${guideMaterials}"`);
  }
  
  // BaseDoors — for door products  
  const baseDoors = item.rawRowData?.base_doors || '';
  if (baseDoors) {
    lines.push(`BaseDoors=${baseDoors}`);
  }
  
  return lines.join('\n');
}

function buildParametersBlock(item: any): string {
  // Banding from edge data
  const el = item.edgeLeft === 1 || item.edgeLeft === '1' ? 'E' : 'N';
  const er = item.edgeRight === 1 || item.edgeRight === '1' ? 'E' : 'N';
  const et = item.edgeTop === 1 || item.edgeTop === '1' ? 'E' : 'N';
  const eb = item.edgeBottom === 1 || item.edgeBottom === '1' ? 'E' : 'N';
  const banding = `${el}${er}${et}${eb}`;
  
  // Use Note= format (matches current working output) instead of Attribute=
  return `[Parameters]\nNote="Banding","xPFC_BAND","text","${banding}"`;
}

function buildCabinetLine(item: any): string {
  // Standard 8-field format matching Allmoxy reference templates:
  // entry_num,"nomenclature",width,height,depth,"hinge","fixture_type",quantity
  const sku = item.sku || item.description || '';
  const width = Number(item.width) || 0;
  const height = Number(item.height) || 0;
  const depth = Number(item.depth || item.length) || 0;
  const qty = Number(item.quantity) || 1;
  
  // Use entry number 1 for all items (matches Allmoxy behavior)
  return `1,"${sku}",${width},${height},${depth},"*","N",${qty}`;
}
```

### Step 3: Install archiver (if not already available)

```bash
npm install archiver @types/archiver
```

### Step 4: Update the `/data/ord` JSON endpoint

Update `GET /api/orders/:id/data/ord` to reflect the per-file structure:

```typescript
// Return room-grouped data for the Cabinet Vision tab UI
app.get('/api/orders/:id/data/ord', isAuthenticated, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const orderFiles = await storage.getOrderFilesByProject(projectId);
    const allItems = await storage.getOrderItemsByProject(projectId);
    const ordItems = allItems.filter(i => i.exportType === 'ORD');

    const rooms = orderFiles.map((file, index) => {
      const fileItems = ordItems.filter(i => i.fileId === file.id);
      return {
        roomNumber: index + 1,
        fileName: file.filename,
        poNumber: file.poNumber,
        itemCount: fileItems.length,
        items: fileItems.map(item => ({
          sku: item.sku,
          description: item.description,
          width: item.width,
          height: item.height,
          depth: item.depth,
          quantity: item.quantity,
          edgeBanding: `${item.edgeLeft === 1 ? 'E' : 'N'}${item.edgeRight === 1 ? 'E' : 'N'}${item.edgeTop === 1 ? 'E' : 'N'}${item.edgeBottom === 1 ? 'E' : 'N'}`,
        }))
      };
    }).filter(room => room.itemCount > 0);

    res.json({
      projectName: project.projectName,
      fileCount: rooms.length,
      rooms,
      totalItems: ordItems.length,
      // When multiple files, download produces a ZIP
      downloadFormat: rooms.length > 1 ? 'zip' : 'ord',
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
```

### Step 5: Update the Cabinet Vision tab UI

In `client/src/pages/order-tabs/CabinetVisionTab.tsx`:

1. Update the download button text: when `downloadFormat === 'zip'`, show "Download ORD Files (ZIP)" instead of "Download .ORD"
2. The download URL stays the same (`/api/orders/${id}/download/ord`) — the backend handles the format switch
3. Show room sections in the tab: for each room, display the filename/PO number and item count
4. If only 1 file, show "Download .ORD" (singular)

### Step 6: Remove the `[Walls]` section from the output

The current generator inserts an empty `[Walls]` section. Remove it entirely. The Standard ORD format does not use `[Walls]`. Only the Extended Format uses it, and only when you have actual wall geometry coordinates to provide.

### Step 7: Fix line endings

The current output has mixed line endings (`\r\n` in some places, `\n` in others). Use consistent `\r\n` (Windows-style) throughout, since Cabinet Vision runs on Windows.

Replace all `\n` joins with `\r\n`:
```typescript
return lines.join('\r\n');
```

---

## Summary of Changes

| What | Before (broken) | After (correct) |
|---|---|---|
| File count | 1 combined ORD | 1 ORD per CSV file (ZIP when multiple) |
| `[Walls]` section | Empty `[Walls]` present | Removed entirely |
| Cabinet fields | 18-field Extended Format | 8-field Standard Format |
| Entry numbers | Sequential (1, 2, 3, ...) | All use `1` (Allmoxy-matching) |
| Room grouping | Room number in field 14 | Separate files |
| Line endings | Mixed `\n` and `\r\n` | Consistent `\r\n` |

---

## Verification

1. Upload a project with 3+ CSV files
2. Click "Download .ORD" on the Cabinet Vision tab
3. Should download a `.zip` file containing one `.ord` per CSV file
4. Each `.ord` file should have:
   - `[Header]` with the CSV file's PO number as the Name
   - Repeating `[Catalog]` / `[Parameters]` / `[Cabinets]` blocks
   - NO `[Walls]` section
   - 8-field cabinet lines: `1,"SKU",W,H,D,"*","N",QTY`
   - `\r\n` line endings throughout
5. Compare against the 8 reference templates in the project — structure should match
6. For a single-file project, should download a single `.ord` file (not ZIP)
7. Open in Cabinet Vision to verify import works

## Important Notes

- The `buildCatalogBlock` function above is a simplified skeleton. The actual implementation should use the same export proxy variable / grid resolution logic already in the pipeline to resolve `Materials`, `GuideMaterials`, `BaseDoors`, `DrawerBoxMaterials` values from the product's grid bindings. Look at how the existing code resolves `color.panel_export` etc. and use those resolved values.
- The `Note=` format for `[Parameters]` banding is correct — this is what both the current output and Allmoxy produce. The `Attribute=` format (used in some reference templates) also works but `Note=` is the safer choice.
