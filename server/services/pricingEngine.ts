import { create, all } from "mathjs";

const math = create(all);

/**
 * Removes block comments (/* ... * /) and line comments (// ...) from formula strings.
 */
export function stripComments(formula: string): string {
  // Remove block comments
  let result = formula.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments
  result = result.replace(/\/\/.*$/gm, "");
  return result.trim();
}

/**
 * Evaluates a pricing/export formula against item data and dynamic grids.
 * 
 * @param formula The raw formula string (may contain comments)
 * @param orderItem The base CSV item properties (width, height, depth, quantity, etc.)
 * @param dynamicGrids Object containing key-value pairs where key is grid name and value is the matched row data
 */
export function evaluatePrice(
  formula: string,
  orderItem: any,
  dynamicGrids: Record<string, any>
): number {
  const scope: Record<string, any> = {
    width: Number(orderItem?.width) || 0,
    height: Number(orderItem?.height) || 0,
    // Formulas use "length" for the third dimension (CSV column 5).
    // "depth" is kept as an alias for backward compatibility.
    length: Number(orderItem?.length ?? orderItem?.depth) || 0,
    depth: Number(orderItem?.depth ?? orderItem?.length) || 0,
    quantity: Number(orderItem?.quantity) || 1,
    ...dynamicGrids // Merges paths like mjdoors.PRICE or color.SQFT_PRICE
  };

  const cleanFormula = stripComments(formula);

  try {
    const result = math.evaluate(cleanFormula, scope);
    return typeof result === "number" ? result : Number(result) || 0;
  } catch (error: any) {
    const sku = orderItem?.sku || orderItem?.manuCode || "UNKNOWN";
    console.error(`[PricingEngine] Evaluation failed for SKU "${sku}"`);
    console.error(`[PricingEngine] Error:`, error.message);
    console.error(`[PricingEngine] Scope:`, JSON.stringify(scope, null, 2));
    console.error(`[PricingEngine] Cleaned Formula: ${cleanFormula}`);
    return 0;
  }
}
