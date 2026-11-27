// Náklad objednávek ve výrobní tabulce (Jarin 27. 11. 2026): suroviny + obal
// podle Nákladů a marží. Jen pro Lucii a Jarina — volající ověří isInvoiceIssuer.
import { ESHOP_SLUG_ALIASES, calcVariant, type Recipe } from "./recipes";

export type CostItem = { name: string; quantity: number; productSlug?: string | null; volumeMl?: number | null };
export type OrderCost = { costKc: number; unknown: string[] };

/** e-shopový slug výrobku → receptura (opačný směr k ESHOP_SLUG_ALIASES). */
export function recipeByProductSlug(recipes: Recipe[]): Map<string, Recipe> {
  const map = new Map<string, Recipe>();
  for (const recipe of recipes) map.set(ESHOP_SLUG_ALIASES[recipe.slug] ?? recipe.slug, recipe);
  return map;
}

export function orderCost(items: CostItem[], recipes: Map<string, Recipe>, packaging: ReadonlyMap<string, number>): OrderCost {
  let costKc = 0;
  const unknown: string[] = [];
  for (const item of items) {
    const recipe = item.productSlug ? recipes.get(item.productSlug) : undefined;
    const variant = recipe?.variants.find((v) => v.volumeMl === item.volumeMl);
    if (!recipe || !variant) {
      unknown.push(item.name);
      continue;
    }
    costKc += calcVariant(recipe, variant, packaging).totalKc * item.quantity;
  }
  return { costKc, unknown };
}
