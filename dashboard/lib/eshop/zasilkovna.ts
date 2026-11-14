// Zásilkovna pro kapsičky sirupů 650 ml (zadání Lucie 13. 11. 2026).
// Sirupy se skladují do 20 °C, chlazenou přepravu nepotřebují. Zásilkovna
// se nabídne jen tehdy, když je v košíku POUZE sirup v kapsičce 650 ml
// a kapsičky se vejdou do krabice, kterou Begina má. Krabice je povinná
// a je v ceně dopravy.
// Čisté funkce bez I/O. V pokladně se zapíná proměnnou ESHOP_ZASILKOVNA=on
// (shipping.ts → zasilkovnaEnabledFromEnv).

/**
 * Klíč API účtu Begina u Zásilkovny (13. 11. 2026) pro mapu výdejních míst.
 * Je veřejný z principu — widget ho posílá z prohlížeče zákazníka. Heslo API
 * (tajné, pro podávání zásilek) sem NEPATŘÍ.
 */
export const ZASILKOVNA_WIDGET_KEY = "3eb3f37454ec3081";
export const ZASILKOVNA_WIDGET_SCRIPT = "https://widget.packeta.com/v6/www/js/library.js";

/** Výdejní místo, jak ho vrací widget Zásilkovny (jen pole, která ukládáme). */
export type ZasilkovnaPoint = { id: string; name: string; street: string; city: string; zip: string };

/** Odpověď widgetu → výdejní místo; null = zákazník okno zavřel nebo místo není v ČR / nemá ID. */
export function pointFromWidget(raw: unknown): ZasilkovnaPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const point = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
  const id = text(point.id);
  const name = text(point.name) || text(point.place);
  const city = text(point.city);
  const zip = text(point.zip);
  if (!/^\d{1,12}$/.test(id) || !name || !city || !zip) return null;
  if (text(point.country) && text(point.country).toLowerCase() !== "cz") return null;
  return { id, name, street: text(point.street), city, zip };
}

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

/** Věta o doručení na stránce produktu (14. 11. 2026, Lucie): sirupy se sáčkem 650 ml jdou i Zásilkovnou. */
export const DELIVERY_NOTE_COLD = "Tento produkt vám doručíme chlazenou přepravou.";
export function productDeliveryNote(
  product: { category: string; variants: readonly { volumeMl: number | null }[] },
  zasilkovna: boolean
): string {
  if (!zasilkovna || !product.variants.some((variant) => isSyrupPouch(product, variant))) return DELIVERY_NOTE_COLD;
  return `Doručíme chlazenou přepravou. Sáčky 650 ml (až ${ZASILKOVNA_MAX_POUCHES} ${ZASILKOVNA_MAX_POUCHES >= 5 ? "kusů" : "kusy"}) můžeme poslat i Zásilkovnou.`;
}
