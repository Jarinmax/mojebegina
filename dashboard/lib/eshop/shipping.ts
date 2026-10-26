// E-shop 1.0 — způsoby doručení a platby. Ceny se VŽDY počítají na
// serveru (pricing.ts → quoteShipping), nikdy se neberou z formuláře.
//
// Dva režimy chlazené přepravy (přepínač ESHOP_WEIGHT_SHIPPING):
//   "flat"   (výchozí, dosavadní stav) — orientační paušál 99 Kč
//   "weight" (ESHOP_WEIGHT_SHIPPING=on) — ceník WooCommerce podle hmotnosti
//            košíku (shippingRates.ts); nad 150 kg nebo bez známé hmotnosti
//            se chlazená přeprava automaticky nenabídne → individuální domluva.
// Osobní vyzvednutí ve Viticích je v obou režimech zdarma.
// Doprava zdarma od určité částky: NEOVĚŘENO, záměrně neimplementováno
// (docs/eshop-doprava/spusteni.md).

import { formatKc } from "@/lib/format";
import { cartWeight, coldShippingPrice, COLD_SHIPPING_MAX_GRAMS } from "./shippingRates";

export type ShippingMode = "flat" | "weight";

/** ESHOP_WEIGHT_SHIPPING=on → ceník podle hmotnosti; cokoli jiného = paušál (výchozí). */
export function shippingModeFromEnv(env: Record<string, string | undefined> = process.env): ShippingMode {
  return env.ESHOP_WEIGHT_SHIPPING === "on" ? "weight" : "flat";
}

export type ShippingMethod = {
  id: "osobni-odber" | "rozvoz";
  label: string;
  description: string;
  /** Pevná cena; u chlazené přepravy v režimu "weight" se nepoužije (cena = quoteShipping). */
  priceKc: number;
  requiresAddress: boolean;
};

const PICKUP: ShippingMethod = {
  id: "osobni-odber",
  // Podle skutečné objednávky z begina.cz (WooCommerce, 26. 9. 2026).
  label: "Osobní vyzvednutí — Zahradní Bistro Begina",
  description: "Areál Zahradnictví Jandl, Vitice 119, 281 06 Vitice (okr. Kolín).",
  priceKc: 0,
  requiresAddress: false,
};

const COLD_FLAT: ShippingMethod = {
  id: "rozvoz",
  label: "Chlazená přeprava",
  description: "Doručení v chladu na vaši adresu. Cena se bude počítat podle objemu objednávky, zatím orientačně.",
  priceKc: 99,
  requiresAddress: true,
};

const COLD_BY_WEIGHT: ShippingMethod = {
  id: "rozvoz",
  label: "Chlazená přeprava",
  description: `Doručení v chladu na adresu v České republice. Cena podle celkové hmotnosti objednávky do ${
    COLD_SHIPPING_MAX_GRAMS / 1000
  } kg.`,
  priceKc: 0,
  requiresAddress: true,
};

export function shippingMethodsFor(mode: ShippingMode): ShippingMethod[] {
  return [PICKUP, mode === "weight" ? COLD_BY_WEIGHT : COLD_FLAT];
}

/** Dosavadní nabídka (paušál) — výchozí stav. */
export const shippingMethods: ShippingMethod[] = shippingMethodsFor("flat");

/** Kontakt pro individuální domluvu dopravy (= provozovatel, infoPages.ts). */
export type ShippingContact = { email: string; phone: string };

export type ShippingQuote =
  | { available: true; priceKc: number; /** null = hmotnost se nepočítala (paušál, osobní odběr) */ weightGrams: number | null }
  | { available: false; reason: "over_limit" | "missing_weight"; message: string; weightGrams: number | null };

export type ShippingQuoteLine = { sku: string; name: string; quantity: number; weightGrams: number | null };

const kg = (grams: number) => (grams / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

/**
 * Cena doručení pro košík. Jediné místo s pravidly — volá ji server
 * (priceCart) i formuláře (jen pro zobrazení; server počítá znovu).
 */
export function quoteShipping(
  method: ShippingMethod,
  lines: readonly ShippingQuoteLine[],
  mode: ShippingMode,
  contact: ShippingContact
): ShippingQuote {
  if (method.id === "osobni-odber" || mode === "flat") {
    return { available: true, priceKc: method.priceKc, weightGrams: null };
  }
  const individually = `Dopravu takové objednávky domluvíme individuálně — napište nám na ${contact.email} nebo zavolejte na ${contact.phone}. Případně zvolte osobní vyzvednutí ve Viticích (zdarma).`;
  const weight = cartWeight(lines);
  if (!weight.ok) {
    const names = lines.filter((line) => weight.skus.includes(line.sku)).map((line) => line.name);
    return {
      available: false,
      reason: "missing_weight",
      message: `U položky ${names.join(", ")} zatím neznáme hmotnost, takže cenu chlazené přepravy nejde spočítat automaticky. ${individually}`,
      weightGrams: null,
    };
  }
  const price = coldShippingPrice(weight.grams);
  if (!price.ok) {
    return {
      available: false,
      reason: "over_limit",
      message: `Objednávka váží ${kg(weight.grams)} kg. Chlazenou přepravu nad ${kg(COLD_SHIPPING_MAX_GRAMS)} kg nelze objednat automaticky. ${individually}`,
      weightGrams: weight.grams,
    };
  }
  return { available: true, priceKc: price.priceKc, weightGrams: weight.grams };
}

/** Text ceny v nabídce způsobů doručení. */
export function quoteLabel(quote: ShippingQuote): string {
  if (!quote.available) return "Individuálně";
  return quote.priceKc === 0 ? "Zdarma" : formatKc(quote.priceKc);
}

export type PaymentMethod = {
  id: "prevod" | "karta";
  label: string;
  description: string;
  available: boolean;
};

// Platba kartou (Stripe) je dostupná, jen když to povolí server
// (lib/eshop/stripe/config.ts → isCardPaymentAvailable) — výchozí stav je
// nedostupná. Dostupná karta je první a předvybraná, převod zůstává jako
// druhá možnost; bez karty je převod jediná (a výchozí) volba.
export function paymentMethodsFor(cardAvailable: boolean): PaymentMethod[] {
  const transfer: PaymentMethod = {
    id: "prevod",
    label: "Bankovní převod — platba předem",
    description: "Po objednávce pošleme platební údaje a QR kód.",
    available: true,
  };
  const card: PaymentMethod = {
    id: "karta",
    label: "Kartou online",
    description: cardAvailable
      ? "Platební karta, Apple Pay nebo Google Pay — zabezpečeně přes Stripe."
      : "Platební brána zatím není napojená.",
    available: cardAvailable,
  };
  return cardAvailable ? [card, transfer] : [transfer, card];
}

export function defaultPaymentMethodId(cardAvailable: boolean): PaymentMethod["id"] {
  return cardAvailable ? "karta" : "prevod";
}

export const paymentMethods: PaymentMethod[] = paymentMethodsFor(false);

export function getShippingMethod(id: string, mode: ShippingMode = "flat"): ShippingMethod | undefined {
  return shippingMethodsFor(mode).find((method) => method.id === id);
}

export function getPaymentMethod(id: string, cardAvailable = false): PaymentMethod | undefined {
  return paymentMethodsFor(cardAvailable).find((method) => method.id === id);
}
