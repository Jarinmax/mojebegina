// DOPRAVA DŘÍV (21. 11. 2026, Lucie) — cena dopravy vidět už na produktu a
// v košíku, ne až v pokladně. Ceny se nemění: počítá se stejným ceníkem
// jako pokladna (shippingRates.ts, zasilkovna.ts). Čisté funkce.
import { formatPrice as formatKc } from "@/lib/format";
import { COLD_SHIPPING_RULES, cartWeight, coldShippingPrice } from "./shippingRates";
import { isTastingSet } from "./tastingSet";
import { quoteZasilkovna } from "./zasilkovna";

/** Begina 3 l: polévky, čaje a nápoje 3 kg; sirupy jsou těžší (3 826 g
 *  i s krabicí, vážila Lucie) — proto se bere skutečná hmotnost z katalogu. */
const BEGINA_GRAMS = 3000;
const isBegina = (variant: { volumeMl: number | null }) => (variant.volumeMl ?? 0) >= 2900;
/** Nejtěžší begina v katalogu (sirup i s krabicí) — když v košíku žádná begina není, slib musí platit pro každou. */
const HEAVIEST_BEGINA_GRAMS = 3826;

function beginyText(count: number): string {
  if (count === 1) return "1 begina 3 l";
  if (count >= 2 && count <= 4) return `${count} beginy 3 l`;
  return `${count} begin 3 l`;
}

/** Nejlevnější pásmo chlazené dopravy, např. „od 267 Kč (do 15 kg, to jsou 4 beginy 3 l)“. */
export function productShippingNote(beginaGrams: number | null = null): string {
  const first = COLD_SHIPPING_RULES[0];
  const nextFromKg = COLD_SHIPPING_RULES[1].fromKg;
  const fits = Math.floor(((nextFromKg * 1000) - 1) / (beginaGrams && beginaGrams > 0 ? beginaGrams : BEGINA_GRAMS));
  return `Chlazená doprava po celé ČR od ${formatKc(first.priceKc)} (pod ${nextFromKg} kg, to jsou až ${beginyText(fits)}). Osobní odběr ve Viticích zdarma.`;
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
    return { main: "Objednávka je nad limit chlazené přepravy — dopravu domluvíme individuálně.", extra: "Osobní odběr ve Viticích zdarma." };
  }
  if (options.zasilkovna) {
    const zas = quoteZasilkovna(lines);
    if (zas.available) {
      return { main: `Doprava pro váš košík: Zásilkovnou ${formatKc(zas.priceKc)}, nebo chlazeně ${formatKc(cold.priceKc)}.`, extra: "Osobní odběr ve Viticích zdarma." };
    }
  }
  // Bez hmotnosti v závorce (Lucie 24. 11. 2026): skutečná váha se může o pár gramů lišit.
  const main = `Chlazená doprava pro váš košík: ${formatKc(cold.priceKc)}.`;
  const index = COLD_SHIPPING_RULES.indexOf(cold.rule);
  const next = COLD_SHIPPING_RULES[index + 1];
  if (!next) return { main, extra: "Osobní odběr ve Viticích zdarma." };
  // Další pásmo začíná PŘESNĚ na své hranici (15 kg = už 379 Kč), proto −1 g.
  const room = next.fromKg * 1000 - weight.grams - 1;
  // Počítá se se skutečnou hmotností nejtěžší beginy v košíku (polévka 2 950 g, sirup 3 826 g) —
  // stejná čísla jako v pokladně. Bez beginy v košíku nejtěžší begina vůbec, ať slib platí vždy.
  const beginaWeights = lines.filter((line) => isBegina(line.variant)).map((line) => line.variant.weightGrams ?? 0).filter((grams) => grams > 0);
  const unit = beginaWeights.length > 0 ? Math.max(...beginaWeights) : HEAVIEST_BEGINA_GRAMS;
  const fits = room > 0 ? Math.floor(room / unit) : 0;
  const upTo = `${next.fromKg.toLocaleString("cs-CZ")} kg`;
  const extra =
    fits >= 1
      ? `Pod ${upTo} platíte pořád ${formatKc(cold.priceKc)} — ${fits === 1 ? "vejde se" : "vejdou se"} ještě ${beginyText(fits)}. Osobní odběr ve Viticích zdarma.`
      : "Osobní odběr ve Viticích zdarma.";
  return { main, extra };
}
