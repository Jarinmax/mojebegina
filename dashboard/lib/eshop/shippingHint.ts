// DOPRAVA DŘÍV (21. 11. 2026, Lucie) — cena dopravy vidět už na produktu a
// v košíku, ne až v pokladně. Ceny se nemění: počítá se stejným ceníkem
// jako pokladna (shippingRates.ts, zasilkovna.ts). Čisté funkce.
import { formatKc } from "@/lib/format";
import { COLD_SHIPPING_RULES, cartWeight, coldShippingPrice } from "./shippingRates";
import { isTastingSet } from "./tastingSet";
import { quoteZasilkovna } from "./zasilkovna";

/** Begina 3 l počítáme jako 3 kg (litry = kilogramy, zadání Lucie). */
const BEGINA_GRAMS = 3000;
const kgText = (grams: number) => (grams / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

function beginyText(count: number): string {
  if (count === 1) return "1 begina 3 l";
  if (count >= 2 && count <= 4) return `${count} beginy 3 l`;
  return `${count} begin 3 l`;
}

/** Nejlevnější pásmo chlazené dopravy, např. „od 267 Kč (do 15 kg, to jsou 4 beginy 3 l)“. */
export function productShippingNote(): string {
  const first = COLD_SHIPPING_RULES[0];
  const nextFromKg = COLD_SHIPPING_RULES[1].fromKg;
  const fits = Math.floor(((nextFromKg * 1000) - 1) / BEGINA_GRAMS);
  return `Chlazená doprava po celé ČR od ${formatKc(first.priceKc)} (do ${nextFromKg} kg, to jsou ${beginyText(fits)}). Osobní odběr ve Viticích zdarma.`;
}

type HintLine = {
  sku: string;
  quantity: number;
  product: { category: string; slug: string };
  variant: { sku?: string; volumeMl: number | null; weightGrams: number | null };
};

export type CartShippingHint = { main: string; extra: string | null };

/**
 * Věta o dopravě pro košík. null = nejde spočítat spolehlivě (paušální režim,
 * set sirupů, chybí hmotnost) → košík ukáže původní větu.
 */
export function cartShippingHint(lines: readonly HintLine[], options: { weightMode: boolean; zasilkovna: boolean }): CartShippingHint | null {
  if (!options.weightMode || lines.length === 0) return null;
  if (lines.some((line) => isTastingSet({ slug: line.product.slug }))) return null;
  const weight = cartWeight(lines.map((line) => ({ sku: line.sku, quantity: line.quantity, weightGrams: line.variant.weightGrams })));
  if (!weight.ok) return null;
  const cold = coldShippingPrice(weight.grams);
  if (!cold.ok) {
    return { main: `Objednávka váží ${kgText(weight.grams)} kg — dopravu domluvíme individuálně.`, extra: "Osobní odběr ve Viticích zdarma." };
  }
  if (options.zasilkovna) {
    const zas = quoteZasilkovna(lines);
    if (zas.available) {
      return { main: `Doprava pro váš košík: Zásilkovnou ${formatKc(zas.priceKc)}, nebo chlazeně ${formatKc(cold.priceKc)}.`, extra: "Osobní odběr ve Viticích zdarma." };
    }
  }
  const main = `Chlazená doprava pro váš košík: ${formatKc(cold.priceKc)} (${kgText(weight.grams)} kg).`;
  const index = COLD_SHIPPING_RULES.indexOf(cold.rule);
  const next = COLD_SHIPPING_RULES[index + 1];
  if (!next) return { main, extra: "Osobní odběr ve Viticích zdarma." };
  const room = next.fromKg * 1000 - weight.grams;
  const fits = Math.floor(room / BEGINA_GRAMS);
  const upTo = `${next.fromKg.toLocaleString("cs-CZ")} kg`;
  const extra =
    fits >= 1
      ? `Do ${upTo} platíte pořád ${formatKc(cold.priceKc)} — ${fits === 1 ? "vejde se" : "vejdou se"} ještě ${beginyText(fits)}. Osobní odběr ve Viticích zdarma.`
      : "Osobní odběr ve Viticích zdarma.";
  return { main, extra };
}
