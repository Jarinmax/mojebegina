// Ceník chlazené přepravy podle hmotnosti objednávky — PŘESNĚ podle
// WooCommerce begina.cz (Flexible Shipping, zóna „ČR“, způsob „Chlazená
// přeprava“, instance_id=25; screenshoty nastavení od vedení 11. 10. 2026).
// Zapojené přes lib/eshop/shipping.ts (quoteShipping) jen s přepínačem
// ESHOP_WEIGHT_SHIPPING=on; jinak dál orientační paušál.
// Postup a otevřené otázky: docs/eshop-doprava/spusteni.md.
//
// Rozhodnutí majitele 11. 10. 2026: pásmo 100–150 kg = 1 839 Kč zachovat.
// Od 12. 11. 2026 (zadání Lucie): ceník pokračuje do 400 kg podle tabulky
// CoolBalík; individuální domluva až nad 400 kg.
// OTEVŘENÁ OTÁZKA: doprava zdarma od určité částky — NEOVĚŘENO, proto tu
// záměrně žádné takové pravidlo není.
//
// Hmotnosti se počítají v gramech (celá čísla, bez chyb zaokrouhlení).
// WooCommerce má pásma „od–do 14,99 kg“; tady jsou pásma bez mezer:
// pravidlo platí od své spodní hranice do spodní hranice dalšího pravidla
// (ne včetně). Pro skutečné hmotnosti balení (3 kg, 0,75 kg, 0,5 kg —
// násobky 0,25 kg) dává totéž co WooCommerce.

export type ColdShippingRule = {
  /** číslo pravidla (1–11 = původní pravidla WooCommerce) */
  rule: number;
  fromKg: number;
  /** horní hranice pásma, jak se vypisuje v ceníku (informativní) */
  toKg: number;
  /** základ dopravce bez DPH (smluvní ceník CoolBalík, zóna 1 a 2) */
  baseKc: number;
  priceKc: number;
  /** text pásma v ceníku na stránce Doprava, když se liší od „od–do“ */
  label?: string;
};

// Cena pro zákazníka = základ dopravce × (1 + DPH dopravce) × (1 + palivový
// příplatek), zaokrouhleno na celé Kč — přesně jako tabulka Lucie
// „coolbalik_vypocty“ (list Česká republika, 12. 11. 2026).
// PALIVOVÝ PŘÍPLATEK se mění každý měsíc: stačí změnit toto jedno číslo
// (procenta) a ceny všech pásem se přepočítají.
export const FUEL_SURCHARGE_PERCENT = 16;
export const CARRIER_VAT_PERCENT = 21;

export function carrierPriceKc(baseKc: number, fuelPercent: number = FUEL_SURCHARGE_PERCENT): number {
  // celočíselně (bez chyb zaokrouhlení): základ × 121 × 116 / 10 000
  return Math.round((baseKc * (100 + CARRIER_VAT_PERCENT) * (100 + fuelPercent)) / 10_000);
}

const band = (rule: number, fromKg: number, toKg: number, baseKc: number, label?: string): ColdShippingRule => ({
  rule,
  fromKg,
  toKg,
  baseKc,
  priceKc: carrierPriceKc(baseKc),
  ...(label ? { label } : {}),
});

export const COLD_SHIPPING_RULES: readonly ColdShippingRule[] = [
  // Pásma 1–11 beze změny proti WooCommerce (při 16 % paliva vycházejí
  // stejné ceny jako dosud: 267, 379, 491 … 1 839 Kč).
  band(1, 0, 14.99, 190),
  band(2, 15, 19.99, 270),
  band(3, 20, 29.99, 350),
  band(4, 30, 39.99, 430),
  band(5, 40, 49.99, 510),
  band(6, 50, 59.99, 590),
  band(7, 60, 69.99, 670),
  band(8, 70, 79.99, 750),
  band(9, 80, 89.99, 830),
  band(10, 90, 99.99, 910),
  // 100–150 kg: majitel 11. 10. 2026 potvrdil zachovat (1 839 Kč při 16 %).
  band(11, 100, 150, 1310),
  // Nad 150 kg podle tabulky Lucie („váha do“ včetně), zadání 12. 11. 2026 —
  // dříve individuální domluva.
  band(12, 150.001, 200, 1710, "nad 150 do 200 kg"),
  band(13, 200.001, 250, 2110, "nad 200 do 250 kg"),
  band(14, 250.001, 300, 2510, "nad 250 do 300 kg"),
  band(15, 300.001, 350, 2910, "nad 300 do 350 kg"),
  band(16, 350.001, 400, 3310, "nad 350 do 400 kg"),
];

/** Nad touto hmotností žádné pravidlo neplatí (tabulka CoolBalík končí na 400 kg). */
export const COLD_SHIPPING_MAX_GRAMS = 400_000;

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
  /** nad 400 kg — chlazenou přepravu nelze nabídnout automaticky */
  | { ok: false; reason: "over_limit"; grams: number };

export function coldShippingPrice(grams: number): ColdShippingPrice {
  if (!Number.isInteger(grams) || grams < 0) throw new Error(`Neplatná hmotnost: ${grams} g`);
  if (grams > COLD_SHIPPING_MAX_GRAMS) return { ok: false, reason: "over_limit", grams };
  const rule = [...COLD_SHIPPING_RULES].reverse().find((r) => grams >= toGrams(r.fromKg))!;
  return { ok: true, priceKc: rule.priceKc, rule };
}
