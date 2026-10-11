// Ceník chlazené přepravy podle hmotnosti objednávky — PŘESNĚ podle
// WooCommerce begina.cz (Flexible Shipping, zóna „ČR“, způsob „Chlazená
// přeprava“, instance_id=25; screenshoty nastavení od vedení 11. 10. 2026).
// Návrh: zatím NENÍ zapojené do pokladny (lib/eshop/shipping.ts má dál
// orientační paušál) — viz docs/eshop-doprava/navrh-2026-10-11.md.
//
// Hmotnosti se počítají v gramech (celá čísla, bez chyb zaokrouhlení).
// WooCommerce má pásma „od–do 14,99 kg“; tady jsou pásma bez mezer:
// pravidlo platí od své spodní hranice do spodní hranice dalšího pravidla
// (ne včetně). Pro skutečné hmotnosti balení (3 kg, 0,75 kg, 0,5 kg —
// násobky 0,25 kg) dává totéž co WooCommerce.

export type ColdShippingRule = {
  /** číslo pravidla ve WooCommerce */
  rule: number;
  fromKg: number;
  /** horní hranice, jak je zapsaná ve WooCommerce (informativní) */
  toKg: number;
  priceKc: number;
};

export const COLD_SHIPPING_RULES: readonly ColdShippingRule[] = [
  { rule: 1, fromKg: 0, toKg: 14.99, priceKc: 267 },
  { rule: 2, fromKg: 15, toKg: 19.99, priceKc: 379 },
  { rule: 3, fromKg: 20, toKg: 29.99, priceKc: 491 },
  { rule: 4, fromKg: 30, toKg: 39.99, priceKc: 604 },
  { rule: 5, fromKg: 40, toKg: 49.99, priceKc: 716 },
  { rule: 6, fromKg: 50, toKg: 59.99, priceKc: 828 },
  { rule: 7, fromKg: 60, toKg: 69.99, priceKc: 940 },
  { rule: 8, fromKg: 70, toKg: 79.99, priceKc: 1053 },
  { rule: 9, fromKg: 80, toKg: 89.99, priceKc: 1165 },
  { rule: 10, fromKg: 90, toKg: 99.99, priceKc: 1277 },
  // Zapsáno ve WooCommerce takto (1 839 Kč). Řada stoupá o ~112 Kč, takže
  // může jít o překlep 1 389 Kč — NEPŘEPISOVAT bez potvrzení vedení.
  { rule: 11, fromKg: 100, toKg: 150, priceKc: 1839 },
];

/** Nad touto hmotností žádné pravidlo neplatí (WooCommerce pravidlo 11 končí na 150 kg). */
export const COLD_SHIPPING_MAX_GRAMS = 150_000;

const toGrams = (kg: number) => Math.round(kg * 1000);

export type CartWeight =
  | { ok: true; grams: number }
  /** některá položka nemá hmotnost → cenu dopravy nejde určit (nehádá se) */
  | { ok: false; reason: "missing_weight"; skus: string[] };

/** Celková hmotnost košíku = součet (hmotnost balení × počet kusů). */
export function cartWeight(lines: readonly { sku: string; quantity: number; weightGrams: number | null }[]): CartWeight {
  const missing = lines.filter((line) => line.weightGrams === null || !(line.weightGrams > 0)).map((line) => line.sku);
  if (missing.length > 0) return { ok: false, reason: "missing_weight", skus: missing };
  return { ok: true, grams: lines.reduce((sum, line) => sum + line.weightGrams! * line.quantity, 0) };
}

export type ColdShippingPrice =
  | { ok: true; priceKc: number; rule: ColdShippingRule }
  /** nad 150 kg — chlazenou přepravu nelze nabídnout automaticky */
  | { ok: false; reason: "over_limit"; grams: number };

export function coldShippingPrice(grams: number): ColdShippingPrice {
  if (!Number.isInteger(grams) || grams < 0) throw new Error(`Neplatná hmotnost: ${grams} g`);
  if (grams > COLD_SHIPPING_MAX_GRAMS) return { ok: false, reason: "over_limit", grams };
  const rule = [...COLD_SHIPPING_RULES].reverse().find((r) => grams >= toGrams(r.fromKg))!;
  return { ok: true, priceKc: rule.priceKc, rule };
}
