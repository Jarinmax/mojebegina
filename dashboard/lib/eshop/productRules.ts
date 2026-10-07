// ESHOP 1.0 — čistá pravidla nad produktem (bez DB, bez Reactu).

import type { Product, Variant } from "./types";

export const AGE_RESTRICTION_NOTICE = "Prodej alkoholických nápojů osobám mladším 18 let je zakázán.";

export function lowestPriceKc(product: Product): number {
  return Math.min(...product.variants.map((variant) => variant.priceKc));
}

/** Název řádku do košíku/objednávky — snapshot jako order_items.name. */
export function lineName(product: Product, variant: Variant): string {
  return variant.label ? `${product.name} — ${variant.label}` : product.name;
}

/** Jsou vyplněné všechny údaje povinné před nákupem (nařízení 1169/2011)? */
export function isFoodInfoComplete(product: Product): boolean {
  const info = product.foodInfo;
  return (
    product.variants.every((variant) => variant.label !== null) &&
    (!product.isAgeRestricted || product.alcoholPercent !== null) &&
    info.ingredients !== null &&
    info.allergens !== null &&
    info.nutritionPer100g !== null &&
    info.storage !== null &&
    info.shelfLife !== null
  );
}
