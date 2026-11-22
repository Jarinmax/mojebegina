// ESHOP 1.0 — čistá pravidla nad produktem (bez DB, bez Reactu).

import { PACKAGE_SEPARATOR, simplePackageLabel } from "./packageLabel";
import type { Product, Variant } from "./types";

export const AGE_RESTRICTION_NOTICE = "Prodej alkoholických nápojů osobám mladším 18 let je zakázán.";

export function lowestPriceKc(product: Product): number {
  // „od … Kč“ jen z balení, která jdou koupit (vyprodaná se nepočítají)
  const available = product.variants.filter((variant) => variant.soldOut !== true);
  return Math.min(...(available.length > 0 ? available : product.variants).map((variant) => variant.priceKc));
}

/** Název řádku do košíku/objednávky — snapshot jako order_items.name. */
export function lineName(product: Product, variant: Variant): string {
  return variant.label ? `${product.name}${PACKAGE_SEPARATOR}${simplePackageLabel(variant.label)}` : product.name;
}

/**
 * Smí se produkt objednat? Rozhodují ověřené alergeny (products.allergens):
 *   - [kódy] = ověřeno, obsahuje uvedené alergeny  → objednatelný,
 *   - []     = ověřeno, žádný povinně deklarovaný   → objednatelný,
 *   - null   = neověřeno                             → NEobjednatelný.
 * Prázdný seznam tedy NENÍ chyba; chybou je jen null. Produkt zůstává
 * vidět, jen nejde do košíku ani objednat (kontroluje i priceCart na
 * serveru). Po zapsání alergenů do DB se odemkne sám, bez nasazení.
 */
export function isOrderable(product: Product): boolean {
  return product.foodInfo.allergens !== null;
}

/** Červený štítek místo „Do košíku“ u vyprodaného balení (Lucie 22. 11. 2026). */
export const SOLD_OUT_LABEL = "Vyprodáno";

/** Jsou vyprodaná všechna balení produktu? Pak karta ukáže jen „Vyprodáno“. */
export function isSoldOut(product: Pick<Product, "variants">): boolean {
  return product.variants.length > 0 && product.variants.every((variant) => variant.soldOut === true);
}

/** Balení, která jdou koupit (nevyprodaná). */
export function availableVariants(product: Pick<Product, "variants">): Variant[] {
  return product.variants.filter((variant) => variant.soldOut !== true);
}

/** Text tlačítka místo „Do košíku“ u neobjednatelného produktu. */
export const NOT_ORDERABLE_LABEL = "Připravujeme";
export const NOT_ORDERABLE_NOTICE = "Tento produkt zatím nelze objednat — doplňujeme u něj povinné údaje o potravině.";

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

/**
 * Výživové údaje nejsou povinné u nápojů s obsahem alkoholu nad 1,2 % obj.
 * (čl. 16 odst. 4 nař. 1169/2011). Jen pro zobrazení: chybějící výživa se
 * u nich neoznačuje „Doplníme“. Hodnoty se nedopočítávají.
 */
export function nutritionNotRequired(product: Pick<Product, "alcoholPercent">): boolean {
  return product.alcoholPercent !== null && product.alcoholPercent > 1.2;
}
