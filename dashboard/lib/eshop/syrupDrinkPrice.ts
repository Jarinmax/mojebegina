// Cena nápoje ze sirupu v úvodu kategorie Sirupy (zadání 22. 11. 2026 večer):
// počítá se z aktuální ceny nejlevnější nevyprodané třílitrové beginy sirupu
// (cena / počet nápojů po 200 ml), na haléře, bez dopravy.
import type { Product } from "./types";
import { formatServingKc } from "./productFacts";

const DRINKS_PER_3L = 150;

export function cheapestSyrupDrinkKc(products: readonly Product[]): number | null {
  const prices = products
    .filter((p) => p.category === "sirupy")
    .flatMap((p) => p.variants)
    .filter((v) => v.volumeMl === 3000 && v.soldOut !== true)
    .map((v) => v.priceKc / (v.servings ?? DRINKS_PER_3L));
  return prices.length ? Math.min(...prices) : null;
}

/** „nápoj už od 3,30 Kč“ (text z DB) → „nápoj od 3,33 Kč za 200 ml bez dopravy“ */
export function withSyrupDrinkPrice(paragraph: string, drinkKc: number | null): string {
  if (drinkKc === null) return paragraph;
  return paragraph.replace(/nápoj(?: už)? od [\d\s ]+,\d{1,2}\s?Kč(?: za 200 ml)?(?: bez dopravy)?/g, `nápoj od ${formatServingKc(drinkKc)} za 200 ml bez dopravy`);
}
