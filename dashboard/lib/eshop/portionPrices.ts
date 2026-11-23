// Ceny porcí a nápojů včetně dopravy (polévky a sirupy pro kavárny).
// Samostatný modul bez dalších závislostí (kromě ceníku dopravy), aby ho mohly
// používat cafePage, faq i homeContent bez kruhových importů (23. 11. 2026).
import { COLD_SHIPPING_RULES, coldShippingPrice } from "./shippingRates";

export type PortionPriceRow = { order: string; portions: number; totalKc: number; perPortionKc: number };

/** Cena polévky 3 l a porce (stejné jako v katalogu: 379 Kč, 12 × 250 ml). */
export const SOUP_PRICE_KC = 379;
export const SOUP_PORTIONS = 12;
/** Nejnižší pásmo chlazené dopravy (do 14,99 kg) — ze stejného ceníku jako košík. */
/** Nejnižší pásmo dopravy — počítá se vždy znovu (palivový příplatek z MojeBegina). */
export function soupShippingFromKc(): number {
  return COLD_SHIPPING_RULES[0].priceKc;
}

/**
 * Sirupy (Lucie 22. 11. 2026): kavárna má vidět, kolik vyjde jeden nápoj i s dopravou.
 * Nejlevnější begina 3 l sirupu 499 Kč (zázvorový, ibiškový, šípkový), 150 nápojů po 200 ml
 * (20 ml sirupu + voda), hmotnost 3 826 g vč. krabice; doprava podle hmotnosti ze stejného ceníku jako košík.
 */
export const SYRUP_PRICE_KC = 499;
export const SYRUP_DRINKS = 150;
const SYRUP_WEIGHT_G = 3826;

export function syrupDrinkRows(counts: readonly number[] = [1, 3, 5]): PortionPriceRow[] {
  return counts.map((count) => {
    const portions = count * SYRUP_DRINKS;
    const quote = coldShippingPrice(count * SYRUP_WEIGHT_G);
    const shipping = quote.ok ? quote.priceKc : soupShippingFromKc();
    const totalKc = count * SYRUP_PRICE_KC + shipping;
    return { order: `${count} × 3 l`, portions, totalKc, perPortionKc: Math.round((totalKc / portions) * 100) / 100 };
  });
}

/** Modelová cena nápoje ze sirupu pro kavárny – vždy z výpočtu tabulky (3 × 3 l s dopravou),
 *  takže se při změně ceny sirupu nebo dopravy změní všude najednou (23. 11. 2026). */
export function syrupModelKc(): string {
  return syrupDrinkRows([3])[0].perPortionKc.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u00a0Kč";
}
/** „Od 3,92 Kč za nápoj (200 ml) včetně dopravy při objednávce 3 × 3 l sirupu.“ */
export function syrupModelLine(lower = false): string {
  return `${lower ? "od" : "Od"} ${syrupModelKc()} za nápoj (200 ml) včetně dopravy při objednávce 3\u00a0×\u00a03\u00a0l sirupu.`;
}

/** „Tři balení po 499 Kč a chlazená doprava za 267 Kč vyjdou celkem na 1 764 Kč. Při přípravě 450 nápojů je to 3,92 Kč za porci.“ */
export function syrupExampleLine(): string {
  const row = syrupDrinkRows([3])[0];
  const shipping = row.totalKc - 3 * SYRUP_PRICE_KC;
  const fmt = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Tři balení po ${kc(SYRUP_PRICE_KC)} a chlazená doprava za ${kc(shipping)} vyjdou celkem na ${kc(row.totalKc)}. Při přípravě ${row.portions} nápojů je to ${fmt(row.perPortionKc)} Kč za porci.`;
}

export function soupPortionRows(counts: readonly number[] = [1, 3, 5]): PortionPriceRow[] {
  return counts.map((count) => {
    const portions = count * SOUP_PORTIONS;
    const totalKc = count * SOUP_PRICE_KC + soupShippingFromKc();
    return { order: `${count} × 3 l`, portions, totalKc, perPortionKc: Math.round((totalKc / portions) * 100) / 100 };
  });
}

export const kc = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
