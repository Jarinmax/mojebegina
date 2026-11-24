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

import { isCampaignSetSku, isTastingSet } from "./tastingSet";

const POUCH_CATEGORY = "sirupy";
// 22. 11. 2026 (Lucie): sáček sirupu nově 500 ml; 650 ml do spuštění SQL vyprodano-650-500.
const POUCH_VOLUMES_ML: readonly number[] = [500, 650];

// 24. 11. 2026 (Lucie): Zásilkovnou jde i JEDNA třílitrová begina sirupu —
// sirupy 3 l posíláme vždy v jejich kartonové krabici (je v hmotnosti 3 826 g),
// takže se krabice Zásilkovny nepřičítá: cena = jen přeprava (89 Kč do 5 kg).
// Dvě a víc begin sirupu nebo begina s čímkoli dalším = jen chlazená přeprava.
const SYRUP_3L_ML = 3000;
export function isSyrup3l(product: { category: string }, variant: { volumeMl: number | null }): boolean {
  return product.category === POUCH_CATEGORY && variant.volumeMl === SYRUP_3L_ML;
}

export function isSyrupPouch(product: { category: string }, variant: { volumeMl: number | null }): boolean {
  return product.category === POUCH_CATEGORY && variant.volumeMl !== null && POUCH_VOLUMES_ML.includes(variant.volumeMl);
}

type Line = { quantity: number; product: { category: string; slug?: string }; variant: { sku?: string; volumeMl: number | null; weightGrams: number | null } };

const isSetLine = (line: Line) => line.product.slug !== undefined && isTastingSet({ slug: line.product.slug });

export type ZasilkovnaQuote =
  | { available: true; priceKc: number; weightGrams: number; pouches: number }
  | { available: false; reason: "empty" | "other_goods" | "too_many" | "syrup_3l_single" | "missing_weight" | "over_limit" };

/** Nabídka Zásilkovny pro košík: cena včetně krabice, nebo důvod, proč ji nabídnout nejde. */
export function quoteZasilkovna(lines: readonly Line[]): ZasilkovnaQuote {
  if (lines.length === 0) return { available: false, reason: "empty" };
  // Begina sirupu 3 l: jen jedna a sama (vlastní krabice, bez příplatku za krabici).
  const syrup3l = lines.filter((line) => isSyrup3l(line.product, line.variant));
  if (syrup3l.length > 0) {
    const count = syrup3l.reduce((sum, line) => sum + line.quantity, 0);
    if (count !== 1 || lines.length !== 1) return { available: false, reason: "syrup_3l_single" };
    const grams = syrup3l[0].variant.weightGrams;
    if (grams === null || grams <= 0) return { available: false, reason: "missing_weight" };
    if (grams > ZASILKOVNA_OVERSIZE_MAX_GRAMS) return { available: false, reason: "over_limit" };
    return { available: true, priceKc: grams <= ZASILKOVNA_STANDARD_MAX_GRAMS ? ZASILKOVNA_STANDARD_KC : ZASILKOVNA_OVERSIZE_KC, weightGrams: grams, pouches: 0 };
  }
  // Ochutnávkový set sirupů (17. 11. 2026): jde Zásilkovnou sám i se sáčky
  // 650 ml. Set dopravu nezdražuje: se sáčky platí cena sáčků, set za
  // úvodní cenu má dopravu v ceně (0 Kč), set za běžnou cenu standardní cenu.
  const sets = lines.filter(isSetLine);
  const pouchLines = lines.filter((line) => !isSetLine(line));
  if (pouchLines.some((line) => !isSyrupPouch(line.product, line.variant))) return { available: false, reason: "other_goods" };
  const pouches = pouchLines.reduce((sum, line) => sum + line.quantity, 0);
  const setCount = sets.reduce((sum, line) => sum + line.quantity, 0);
  if (pouches <= 0 && setCount <= 0) return { available: false, reason: "empty" };
  const box = pouches > 0 ? ZASILKOVNA_BOXES.find((candidate) => pouches <= candidate.maxPouches) : { maxPouches: 0, weightGrams: 0 };
  if (!box) return { available: false, reason: "too_many" };
  let goods = 0;
  for (const line of lines) {
    if (line.variant.weightGrams === null || line.variant.weightGrams <= 0) return { available: false, reason: "missing_weight" };
    goods += line.variant.weightGrams * line.quantity;
  }
  const weightGrams = goods + box.weightGrams;
  if (weightGrams > ZASILKOVNA_OVERSIZE_MAX_GRAMS) return { available: false, reason: "over_limit" };
  const carrierKc = weightGrams <= ZASILKOVNA_STANDARD_MAX_GRAMS ? ZASILKOVNA_STANDARD_KC : ZASILKOVNA_OVERSIZE_KC;
  const onlyCampaignSets = pouches === 0 && sets.every((line) => line.variant.sku !== undefined && isCampaignSetSku(line.variant.sku));
  return { available: true, priceKc: onlyCampaignSets ? 0 : carrierKc + ZASILKOVNA_BOX_KC, weightGrams, pouches };
}

/** Věta o doručení na stránce produktu (14. 11. 2026, Lucie): sirupy jdou i Zásilkovnou. */
export const DELIVERY_NOTE_COLD = "Tento produkt posíláme chlazeně po celé ČR.";
export function productDeliveryNote(
  product: { category: string; variants: readonly { volumeMl: number | null; soldOut?: boolean }[] },
  zasilkovna: boolean
): string {
  // vyprodané balení Zásilkovnou nenabízíme
  const available = product.variants.filter((variant) => variant.soldOut !== true);
  const pouch = available.some((variant) => isSyrupPouch(product, variant));
  const big = available.some((variant) => isSyrup3l(product, variant));
  if (!zasilkovna || (!pouch && !big)) return DELIVERY_NOTE_COLD;
  const parts = [
    ...(pouch ? [`sáčky se sirupem (až ${ZASILKOVNA_MAX_POUCHES} ${ZASILKOVNA_MAX_POUCHES >= 5 ? "kusů" : "kusy"})`] : []),
    ...(big ? ["jednu beginu 3 l"] : []),
  ];
  return `Posíláme chlazeně po celé ČR. ${parts.join(" nebo ").replace(/^./, (c) => c.toUpperCase())} můžeme poslat i Zásilkovnou na výdejní místo.`;
}

/** Věta u sirupu 3 l v košíku a pokladně (24. 11. 2026, Lucie): krabice je vždy v ceně. */
export const SYRUP_BOX_INCLUDED_NOTE = "Sirup posíláme vždy v kartonové krabici — krabice je už v ceně.";

/**
 * Popis Zásilkovny v pokladně podle košíku (24. 11. 2026, Lucie): zákazník
 * vidí jen to, co platí pro jeho objednávku; celé pravidlo je na stránce Doprava.
 * null = Zásilkovnu pro košík nabídnout nejde (pokladna ukáže obecný popis a důvod).
 */
export function zasilkovnaCartNote(lines: readonly Line[]): string | null {
  const quote = quoteZasilkovna(lines);
  if (!quote.available) return null;
  if (lines.some((line) => isSyrup3l(line.product, line.variant))) return "Sirup posíláme v jeho kartonové krabici.";
  if (quote.pouches > 0) return "Cena je včetně krabice.";
  return "Set posíláme v jeho krabičce.";
}
