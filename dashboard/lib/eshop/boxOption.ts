// Volitelné balení do kartonové krabice v pokladně (zadání Lucie 12. 11. 2026).
// Třílitrová balení se běžně posílají bez vnější krabice — kromě sirupů,
// které jdou v krabici vždy (krabice je už v jejich hmotnosti, skript 101).
// Zákazník si může u ostatních balení 3 l krabici připlatit: jedna krabice
// na každé balení, cena i hmotnost krabice se připočtou k objednávce.
// Čisté funkce bez I/O — počítá je server (pricing.ts) i pokladna (zobrazení).

/** Cena jedné krabice (Kč, konečná). */
export const BOX_PRICE_KC = 19;
/** Hmotnost jedné krabice v gramech (zvážila Lucie 12. 11. 2026). */
export const BOX_WEIGHT_GRAMS = 126;
/** Řádek objednávky a faktury — není to balení z katalogu (bez vazby na produkt). */
export const BOX_SKU = "KRABICE-3L";
export const BOX_NAME = "Kartonová krabice na balení 3 l";

const BOXED_ALWAYS_CATEGORY = "sirupy";
const BOX_VOLUME_ML = 3000;

/** Balení, ke kterému jde krabici přikoupit: 3 l mimo sirupy. */
export function isBoxEligible(product: { category: string }, variant: { volumeMl: number | null }): boolean {
  return variant.volumeMl === BOX_VOLUME_ML && product.category !== BOXED_ALWAYS_CATEGORY;
}

type BoxLine = { quantity: number; product: { category: string }; variant: { volumeMl: number | null } };

/** Počet krabic = počet kusů balení, ke kterým jde krabici přikoupit. */
export function boxCount(lines: readonly BoxLine[]): number {
  return lines.reduce((sum, line) => sum + (isBoxEligible(line.product, line.variant) ? line.quantity : 0), 0);
}

/** Hmotnost balení pro dopravu: s krabicí o 126 g víc; neznámá hmotnost zůstává neznámá. */
export function weightWithBox(weightGrams: number | null, boxed: boolean): number | null {
  return weightGrams === null || !boxed ? weightGrams : weightGrams + BOX_WEIGHT_GRAMS;
}
