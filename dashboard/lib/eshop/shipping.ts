// E-shop 1.0 — způsoby doručení a platby. Ceny se VŽDY počítají na
// serveru (pricing.ts → quoteShipping), nikdy se neberou z formuláře.
//
// Dva režimy chlazené přepravy (přepínač ESHOP_WEIGHT_SHIPPING):
//   "flat"   (výchozí, dosavadní stav) — orientační paušál 99 Kč
//   "weight" (ESHOP_WEIGHT_SHIPPING=on) — ceník WooCommerce podle hmotnosti
//            košíku (shippingRates.ts); nad 400 kg nebo bez známé hmotnosti
//            se chlazená přeprava automaticky nenabídne → individuální domluva.
// Osobní vyzvednutí ve Viticích je v obou režimech zdarma.
// Doprava zdarma od určité částky: NEOVĚŘENO, záměrně neimplementováno
// (docs/eshop-doprava/spusteni.md).

import { ZASILKOVNA_MAX_POUCHES, quoteZasilkovna } from "./zasilkovna";
import { formatKc } from "@/lib/format";
import { cartWeight, coldShippingPrice, COLD_SHIPPING_MAX_GRAMS } from "./shippingRates";

export type ShippingMode = "flat" | "weight";

/** ESHOP_WEIGHT_SHIPPING=on → ceník podle hmotnosti; cokoli jiného = paušál (výchozí). */
export function shippingModeFromEnv(env: Record<string, string | undefined> = process.env): ShippingMode {
  return env.ESHOP_WEIGHT_SHIPPING === "on" ? "weight" : "flat";
}

export type ShippingMethod = {
  id: "osobni-odber" | "rozvoz" | "zasilkovna";
  label: string;
  description: string;
  /** Pevná cena; u chlazené přepravy v režimu "weight" se nepoužije (cena = quoteShipping). */
  priceKc: number;
  requiresAddress: boolean;
  /** Zásilkovna: zákazník vybírá výdejní místo nebo Z-BOX na mapě (adresu nezadává). */
  requiresPickupPoint?: boolean;
};

// Znění podle zadání Lucie (6. 11. 2026). Celá věta (PICKUP_NOTICE) se ukáže
// při výběru dopravy, v potvrzení objednávky a v potvrzovacím e-mailu —
// na úvodní stránce záměrně ne.
const PICKUP_LABEL = "Osobní odběr – Zahradní Bistro Begina, Vitice 119";
const PICKUP_DESCRIPTION = "Vyzvednutí je možné po předchozí domluvě.";
export const PICKUP_NOTICE = `${PICKUP_LABEL}. ${PICKUP_DESCRIPTION}`;
export const PICKUP_METHOD_ID = "osobni-odber";

const PICKUP: ShippingMethod = {
  id: "osobni-odber",
  label: PICKUP_LABEL,
  description: PICKUP_DESCRIPTION,
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

// Zásilkovna (13. 11. 2026) — jen pro kapsičky sirupu 650 ml, pravidla a cena
// v zasilkovna.ts. Zapíná se proměnnou ESHOP_ZASILKOVNA=on.
export const ZASILKOVNA_METHOD_ID = "zasilkovna";
const ZASILKOVNA: ShippingMethod = {
  id: "zasilkovna",
  label: "Zásilkovna – výdejní místo nebo Z-BOX",
  description: `Jen pro sirupy v kapsičce 650 ml (nejvýše ${ZASILKOVNA_MAX_POUCHES} ks v objednávce). Cena je včetně krabice.`,
  priceKc: 0,
  requiresAddress: false,
  requiresPickupPoint: true,
};

export type ShippingOptions = { /** nabízet Zásilkovnu (ESHOP_ZASILKOVNA=on) */ zasilkovna?: boolean };

export function zasilkovnaEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.ESHOP_ZASILKOVNA === "on";
}

export function shippingMethodsFor(mode: ShippingMode, options: ShippingOptions = {}): ShippingMethod[] {
  // Pořadí podle zadání Lucie (12. 11. 2026): chlazená přeprava první
  // a předvybraná (většina zákazníků si nechává zboží poslat), osobní odběr druhý.
  const methods = [mode === "weight" ? COLD_BY_WEIGHT : COLD_FLAT, PICKUP];
  // Zásilkovna až za nimi v seznamu typů; pokladna ji u košíku jen s kapsičkami
  // ukáže první a předvybere (je nejlevnější).
  return options.zasilkovna ? [...methods, ZASILKOVNA] : methods;
}

/** Dosavadní nabídka (paušál) — výchozí stav. */
export const shippingMethods: ShippingMethod[] = shippingMethodsFor("flat");

/** Kontakt pro individuální domluvu dopravy (= provozovatel, infoPages.ts). */
export type ShippingContact = { email: string; phone: string };

export type ShippingQuote =
  | { available: true; priceKc: number; /** null = hmotnost se nepočítala (paušál, osobní odběr) */ weightGrams: number | null }
  | { available: false; reason: "over_limit" | "missing_weight" | "not_eligible"; message: string; weightGrams: number | null };

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
  if (method.id === "zasilkovna") {
    // Zásilkovna se počítá z balení v košíku (quoteZasilkovnaShipping), ne z hmotnostních řádků.
    return { available: false, reason: "not_eligible", message: "Cenu Zásilkovny pro tento košík nejde spočítat.", weightGrams: null };
  }
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

/** Cena Zásilkovny pro košík, nebo srozumitelný důvod, proč ji nabídnout nejde. */
export function quoteZasilkovnaShipping(lines: Parameters<typeof quoteZasilkovna>[0]): ShippingQuote {
  const quote = quoteZasilkovna(lines);
  if (quote.available) return { available: true, priceKc: quote.priceKc, weightGrams: quote.weightGrams };
  const message =
    quote.reason === "too_many"
      ? `Zásilkovnou posíláme nejvýše ${ZASILKOVNA_MAX_POUCHES} ks sirupu v kapsičce v jedné objednávce. Zvolte prosím chlazenou přepravu, nebo objednávku rozdělte.`
      : quote.reason === "other_goods"
        ? "Zásilkovnou posíláme jen sirupy v kapsičce 650 ml. Ostatní zboží doručujeme chlazenou přepravou."
        : "Cenu Zásilkovny pro tento košík nejde spočítat. Zvolte prosím jiný způsob doručení.";
  return { available: false, reason: quote.reason === "missing_weight" ? "missing_weight" : quote.reason === "over_limit" ? "over_limit" : "not_eligible", message, weightGrams: null };
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
// nedostupná. Pořadí podle zadání Lucie (6. 11. 2026): bankovní převod je
// vždy první a předvybraný, karta (je-li dostupná) až za ním. Volbu, kterou
// zákazník sám změní, pokladna drží ve stavu formuláře.
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
  return [transfer, card];
}

/** Výchozí platba = bankovní převod (i když je karta dostupná). */
export function defaultPaymentMethodId(_cardAvailable?: boolean): PaymentMethod["id"] {
  return "prevod";
}

/** Výchozí doručení v pokladně = chlazená přeprava. */
export const DEFAULT_SHIPPING_METHOD_ID: ShippingMethod["id"] = "rozvoz";

export const paymentMethods: PaymentMethod[] = paymentMethodsFor(false);

export function getShippingMethod(id: string, mode: ShippingMode = "flat", options: ShippingOptions = {}): ShippingMethod | undefined {
  return shippingMethodsFor(mode, options).find((method) => method.id === id);
}

export function getPaymentMethod(id: string, cardAvailable = false): PaymentMethod | undefined {
  return paymentMethodsFor(cardAvailable).find((method) => method.id === id);
}
