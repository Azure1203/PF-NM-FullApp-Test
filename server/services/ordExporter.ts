/**
 * Formats edgebanding from 1/0 columns to Cabinet Vision 'E'/'N' notation.
 * Handles both title-case (Left) and lowercase (left) column names.
 */
export function formatEdgebanding(item: any): string {
  const left   = (item.Left   ?? item.left)   === '1' || (item.Left   ?? item.left)   === 1 ? 'E' : 'N';
  const right  = (item.Right  ?? item.right)  === '1' || (item.Right  ?? item.right)  === 1 ? 'E' : 'N';
  const top    = (item.Top    ?? item.top)     === '1' || (item.Top    ?? item.top)    === 1 ? 'E' : 'N';
  const bottom = (item.Bottom ?? item.bottom) === '1' || (item.Bottom ?? item.bottom) === 1 ? 'E' : 'N';
  return `${left}${right}${top}${bottom}`;
}

/**
 * Generates an .ORD header block by replacing {{design_name}} and {{po_number}} placeholders.
 */
export function generateOrdHeader(
  headerTemplate: string,
  { designName, poNumber }: { designName: string; poNumber: string }
): string {
  return headerTemplate
    .replace(/\{\{design_name\}\}/g, designName)
    .replace(/\{\{po_number\}\}/g, poNumber);
}

/**
 * Generates an .ORD item block (or any export template) by replacing {{path.to.key}} placeholders.
 *
 * Scope resolution order:
 * 1. Top-level item properties: product_name, width, height, length, thickness, quantity
 * 2. Edge banding objects: edge_left.export, edge_right.export, edge_top.export, edge_bottom.export
 * 3. Context scope (grid alias namespaces): color.panel_export, shelves.base_price, etc.
 * 4. Computed helpers: edgebanding (concatenated EENN string)
 */
export function generateOrdItemBlock(
  itemData: any,
  contextScope: any,
  templateString: string,
  itemNumber: number = 1
): string {
  // Resolve the SKU / product name from the raw CSV item.
  const productName: string = (
    itemData['Manuf code'] || itemData.MANU_CODE || itemData.SKU ||
    itemData.product_name || itemData.sku || ''
  ).toString().trim();

  // Compute individual edge banding values as E/N
  const edgeLeft   = (itemData.Left   === '1' || itemData.Left   === 1) ? 'E' : 'N';
  const edgeRight  = (itemData.Right  === '1' || itemData.Right  === 1) ? 'E' : 'N';
  const edgeTop    = (itemData.Top    === '1' || itemData.Top    === 1) ? 'E' : 'N';
  const edgeBottom = (itemData.Bottom === '1' || itemData.Bottom === 1) ? 'E' : 'N';

  // Build a flat scope with all values templates might reference.
  const scope: Record<string, any> = {
    // --- Item dimensions (top-level, matching template placeholders) ---
    product_name: productName,
    width:        Number(itemData.width    || itemData.Width    || itemData['Width(R)'] || 0),
    height:       Number(itemData.height   || itemData.Height   || 0),
    length:       Number(itemData.length   || itemData.Length   || itemData['Length(L)'] || itemData.depth || 0),
    thickness:    Number(itemData.thickness || itemData.Thickness || 0),
    quantity:     Number(itemData.quantity  || itemData.Quantity || itemData.Qty || 1),

    // --- Edge banding as individual objects with .export property ---
    edge_left:   { export: edgeLeft },
    edge_right:  { export: edgeRight },
    edge_top:    { export: edgeTop },
    edge_bottom: { export: edgeBottom },

    // --- Concatenated banding string ---
    edgebanding: `${edgeLeft}${edgeRight}${edgeTop}${edgeBottom}`,

    // --- Grid context namespaces (color.panel_export, shelves.base_price, etc.) ---
    ...contextScope,

    // --- Raw item data accessible via {{item.COLUMN_NAME}} if needed ---
    item: itemData,

    // --- Additional aliases some templates may use ---
    this_part: itemData,
  };

  // Replace all {{path.to.key}} placeholders by walking the scope object
  return templateString.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let current: any = scope;
    for (const part of parts) {
      if (current != null && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return '';
      }
    }
    return String(current ?? '');
  });
}
