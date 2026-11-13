// Zásilkovna pro kapsičky sirupů 650 ml (zadání Lucie 13. 11. 2026).
// Sirupy se skladují do 20 °C, chlazenou přepravu nepotřebují. Zásilkovna
// se nabídne jen tehdy, když je v košíku POUZE sirup v kapsičce 650 ml
// a kapsičky se vejdou do krabice, kterou Begina má. Krabice je povinná
// a je v ceně dopravy.
// Čisté funkce bez I/O. V pokladně ZATÍM NEZAPOJENO — čeká na účet
// u Zásilkovny (výběr výdejního místa potřebuje klíč z účtu).

/** Cena Zásilkovny podle její aplikace 13. 11. 2026 (smluvní ceník může být jiný). */
export const ZASILKOVNA_STANDARD_KC = 89; // do 5 kg
export const ZASILKOVNA_OVERSIZE_KC = 149; // do 15 kg
export const ZASILKOVNA_STANDARD_MAX_GRAMS = 5_000;
export const ZASILKOVNA_OVERSIZE_MAX_GRAMS = 15_000;
/** Krabice — vždy, v ceně dopravy. */
export const ZASILKOVNA_BOX_KC = 15;

/**
 * Krabice, které Begina má: malá na 1–4 kapsičky váží 73 g (878 g s jednou
 * kapsičkou − 805 g, zváženo 13. 11. 2026). Větší krabice na 5–6 kapsiček
 * ještě není koupená ani zvážená — až bude, přidá se sem další řádek
 * a nabídka se sama rozšíří. Hmotnost se nehádá.
 */
export const ZASILKOVNA_BOXES: readonly { maxPouches: number; weightGrams: number }[] = [{ maxPouches: 4, weightGrams: 73 }];

export const ZASILKOVNA_MAX_POUCHES = Math.max(...ZASILKOVNA_BOXES.map((box) => box.maxPouches));

const POUCH_CATEGORY = "sirupy";
const POUCH_VOLUME_ML = 650;

export function isSyrupPouch(product: { category: string }, variant: { volumeMl: number | null }): boolean {
  return product.category === POUCH_CATEGORY && variant.volumeMl === POUCH_VOLUME_ML;
}

type Line = { quantity: number; product: { category: string }; variant: { volumeMl: number | null; weightGrams: number | null } };

export type ZasilkovnaQuote =
  | { available: true; priceKc: number; weightGrams: number; pouches: number }
  | { available: false; reason: "empty" | "other_goods" | "too_many" | "missing_weight" | "over_limit" };

/** Nabídka Zásilkovny pro košík: cena včetně krabice, nebo důvod, proč ji nabídnout nejde. */
export function quoteZasilkovna(lines: readonly Line[]): ZasilkovnaQuote {
  if (lines.length === 0) return { available: false, reason: "empty" };
  if (lines.some((line) => !isSyrupPouch(line.product, line.variant))) return { available: false, reason: "other_goods" };
  const pouches = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (pouches <= 0) return { available: false, reason: "empty" };
  const box = ZASILKOVNA_BOXES.find((candidate) => pouches <= candidate.maxPouches);
  if (!box) return { available: false, reason: "too_many" };
  let goods = 0;
  for (const line of lines) {
    if (line.variant.weightGrams === null || line.variant.weightGrams <= 0) return { available: false, reason: "missing_weight" };
    goods += line.variant.weightGrams * line.quantity;
  }
  const weightGrams = goods + box.weightGrams;
  if (weightGrams > ZASILKOVNA_OVERSIZE_MAX_GRAMS) return { available: false, reason: "over_limit" };
  const carrierKc = weightGrams <= ZASILKOVNA_STANDARD_MAX_GRAMS ? ZASILKOVNA_STANDARD_KC : ZASILKOVNA_OVERSIZE_KC;
  return { available: true, priceKc: carrierKc + ZASILKOVNA_BOX_KC, weightGrams, pouches };
}
