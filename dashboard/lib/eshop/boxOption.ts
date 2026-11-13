// Volitelné balení do kartonové krabice v pokladně (zadání Lucie 12. 11. 2026).
// Třílitrová balení se běžně posílají bez vnější krabice — kromě sirupů,
// které jdou v krabici vždy (krabice je už v jejich hmotnosti, skript 101).
// Zákazník si může u ostatních balení 3 l krabici připlatit: počet krabic
// si volí sám (nejvýš jedna na balení), cena i hmotnost krabic se připočtou.
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

/**
 * Kolik krabic se započte: zákazník si počet volí sám (0 až počet balení,
 * ke kterým jde krabici přikoupit). Neplatná hodnota = 0, vyšší se ořízne.
 */
export function clampBoxes(requested: unknown, eligible: number): number {
  const n = typeof requested === "string" ? Number(requested.trim() || "0") : requested;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, eligible);
}

/** Krabice jako řádek pro výpočet hmotnosti zásilky (126 g za kus); bez krabic nic. */
export function boxWeightLines(boxes: number): { sku: string; name: string; quantity: number; weightGrams: number }[] {
  return boxes > 0 ? [{ sku: BOX_SKU, name: BOX_NAME, quantity: boxes, weightGrams: BOX_WEIGHT_GRAMS }] : [];
}
