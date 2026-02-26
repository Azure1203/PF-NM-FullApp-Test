import { create, all } from "mathjs";

const math = create(all);

export function stripComments(formula: string): string {
  let result = formula.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/\/\/.*$/gm, "");
  return result.trim();
}

export function evaluatePrice(
  formula: string,
  orderItem: any,
  itemAttribute: any,
  groupAttribute: any
): number {
  const scope: Record<string, any> = {
    width: Number(orderItem?.width) || 0,
    height: Number(orderItem?.height) || 0,
    depth: Number(orderItem?.depth) || 0,
    quantity: Number(orderItem?.quantity) || 1,
  };

  if (itemAttribute) {
    scope.mjdoors = {
      pricing_id: Number(itemAttribute.pricingId) || 0,
      hinge_hole_cost: Number(itemAttribute.hingeHoleCost) || 0,
      base_price: Number(itemAttribute.basePrice) || 0,
      sq_ft_price: Number(itemAttribute.sqFtPrice) || 0,
      margin: Number(itemAttribute.margin) || 0,
    };

    scope.wallpanels = {
      base_price: Number(itemAttribute.basePrice) || 0,
      sq_ft_price: Number(itemAttribute.sqFtPrice) || 0,
      margin: Number(itemAttribute.margin) || 0,
      pricing_id: Number(itemAttribute.pricingId) || 0,
    };
  }

  if (groupAttribute) {
    scope.mjcolors = {
      mj_slimline_pricing: Number(groupAttribute.mjSlimlinePricing) || 0,
      sqft_price: Number(groupAttribute.sqftPrice) || 0,
      level_percent_upcharge: Number(groupAttribute.levelPercentUpcharge) || 0,
      tfl90_door_sqft_cost: Number(groupAttribute.tfl90DoorSqftCost) || 0,
      poly45_door_sqft_cost: Number(groupAttribute.poly45DoorSqftCost) || 0,
    };

    scope.colors = {
      sqft_price: Number(groupAttribute.sqftPrice) || 0,
      level_percent_upcharge: Number(groupAttribute.levelPercentUpcharge) || 0,
    };
  }

  const cleanFormula = stripComments(formula);

  try {
    const result = math.evaluate(cleanFormula, scope);
    return typeof result === "number" ? result : Number(result) || 0;
  } catch (error: any) {
    const sku = orderItem?.sku || orderItem?.manuCode || "UNKNOWN";
    console.error(
      `[PricingEngine] Failed to evaluate formula for SKU "${sku}":`,
      error.message
    );
    console.error(`[PricingEngine] Cleaned formula: ${cleanFormula}`);
    return 0;
  }
}
