/**
 * Formats edgebanding from 1/0 columns to Cabinet Vision 'E'/'N' notation.
 */
export function formatEdgebanding(item: any): string {
  const left = item.Left === '1' || item.Left === 1 ? 'E' : 'N';
  const right = item.Right === '1' || item.Right === 1 ? 'E' : 'N';
  const top = item.Top === '1' || item.Top === 1 ? 'E' : 'N';
  const bottom = item.Bottom === '1' || item.Bottom === 1 ? 'E' : 'N';
  return `${left}${right}${top}${bottom}`;
}

/**
 * Generates an .ORD item block by replacing {{path.to.key}} placeholders.
 */
export function generateOrdItemBlock(
  itemData: any,
  contextScope: any,
  templateString: string
): string {
  const edgebanding = formatEdgebanding(itemData);
  
  // Create a flattened scope for easy regex replacement
  const scope = {
    ...contextScope,
    item: itemData,
    edgebanding
  };

  return templateString.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let current = scope;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return ''; // Or keep match if preferred
      }
    }
    return String(current ?? '');
  });
}
