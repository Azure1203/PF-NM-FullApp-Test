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

/**
 * Converts a grid row's rowData into a scope-friendly object:
 * - All keys lowercased
 * - Keys that start with a digit are prefixed with `_` so mathjs dot-accessors
 *   work (mathjs identifiers cannot start with a digit). Both the prefixed
 *   and the non-prefixed key are written so older formulas that try the
 *   bare name still resolve to the same value.
 * - Numeric strings coerced to numbers for mathjs
 */
export function gridRowToScope(rowData: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rowData)) {
    const lower = k.toLowerCase();
    const coerced =
      typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))
        ? Number(v)
        : v;
    out[lower] = coerced;
    if (/^[0-9]/.test(lower)) {
      out['_' + lower] = coerced;
    }
  }
  return out;
}

/**
 * mathjs cannot parse property accessors whose name starts with a digit
 * (e.g. `doors.45_and_90_pricing_id`). It tokenizes `.45` as the decimal
 * literal 0.45 and then `_and_90_pricing_id` as a separate identifier,
 * yielding `doors * 0.45 * _and_90_pricing_id` — which throws
 * `multiplyScalar (... actual: Object)` because `doors` is an object.
 *
 * This helper rewrites `<identifier>.<digit-starting-prop>` to
 * `<identifier>._<digit-starting-prop>` so the prefixed scope key (added
 * by gridRowToScope) can be reached. Plain decimal literals like 1.5 or
 * 92900) are left alone because they aren't preceded by an identifier.
 */
export function sanitizeDigitAccessors(formula: string): string {
  return formula.replace(/([A-Za-z_]\w*)\.(\d[A-Za-z0-9_]*)/g, '$1._$2');
}

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
        const pvClean = sanitizeDigitAccessors(stripComments(pv.formula));
        const pvResult = math.evaluate(pvClean, { ...scope });
        scope[pv.name] = typeof pvResult === "number" ? pvResult : (Number(pvResult) || 0);
      } catch {
        // Skip silently — the main formula will surface an error if it needs this var
      }
    }
  }

  const cleanFormula = sanitizeDigitAccessors(stripComments(formula));

  try {
    const result = math.evaluate(cleanFormula, scope);
    return typeof result === "number" ? result : Number(result) || 0;
  } catch (error: any) {
    const sku = orderItem?.sku || orderItem?.MANU_CODE || orderItem?.manuCode || "UNKNOWN";
    console.error(`[PricingEngine] FAILED SKU="${sku}": ${error.message}`);
    throw error;
  }
}
