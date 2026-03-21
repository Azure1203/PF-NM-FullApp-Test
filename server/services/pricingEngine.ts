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
  // Collapse all internal newlines and extra whitespace to single spaces
  result = result.replace(/\s+/g, " ");
  return result.trim();
}

/**
 * Evaluates a pricing/export formula against item data and dynamic grids.
 *
 * @param formula        The raw formula string (may contain comments)
 * @param orderItem      The base CSV item properties (width, height, depth, quantity, etc.)
 * @param dynamicGrids   Grid alias objects, e.g. { parts: { base_price: "0", sq_ft_price: "5.35" } }
 * @param allProxyVars   All proxy variables — each is pre-evaluated in order and added to scope
 *                       so that the main formula can reference them by name (e.g. sq_ft, margin).
 */
export function evaluatePrice(
  formula: string,
  orderItem: any,
  dynamicGrids: Record<string, any>,
  allProxyVars?: Array<{ name: string; formula: string }>
): number {
  const scope: Record<string, any> = {
    width:    Number(orderItem?.width) || 0,
    height:   Number(orderItem?.height) || 0,
    // Formulas use "length" for the third dimension (CSV column 5).
    // "depth" is kept as an alias for backward compatibility.
    length:   Number(orderItem?.length ?? orderItem?.depth) || 0,
    depth:    Number(orderItem?.depth ?? orderItem?.length) || 0,
    quantity: Number(orderItem?.quantity) || 1,
    ...dynamicGrids,
  };

  // Pre-compute every proxy variable into scope so the main formula can reference them.
  // Evaluated in DB order; each result is available to subsequent proxy vars in the list.
  if (allProxyVars && allProxyVars.length > 0) {
    for (const pv of allProxyVars) {
      try {
        const pvClean = stripComments(pv.formula);
        const pvResult = math.evaluate(pvClean, { ...scope });
        scope[pv.name] = typeof pvResult === "number" ? pvResult : (Number(pvResult) || 0);
      } catch {
        // Skip silently — the main formula will surface an error if it needs this var
      }
    }
  }

  const cleanFormula = stripComments(formula);

  console.log(`[PricingEngine] Evaluating formula: ${cleanFormula}`);
  console.log(`[PricingEngine] Scope:`, JSON.stringify(scope, null, 2));

  try {
    const result = math.evaluate(cleanFormula, scope);
    return typeof result === "number" ? result : Number(result) || 0;
  } catch (error: any) {
    const sku = orderItem?.sku || orderItem?.MANU_CODE || orderItem?.manuCode || "UNKNOWN";
    console.error(`[PricingEngine] Evaluation FAILED for SKU "${sku}"`);
    console.error(`[PricingEngine] Error:`, error.message);
    console.error(`[PricingEngine] Formula was:`, cleanFormula);
    console.error(`[PricingEngine] Scope was:`, JSON.stringify(scope, null, 2));
    throw error; // Re-throw so callers can capture in pricingError
  }
}
