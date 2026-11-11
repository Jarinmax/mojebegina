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
  id: "osobni-odber" | "rozvoz" | "zasilkovna";
  label: string;
  description: string;
  /** Pevná cena; u chlazené přepravy v režimu "weight" se nepoužije (cena = quoteShipping). */
  priceKc: number;
  requiresAddress: boolean;
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

// Zásilkovna (11. 11. 2026, zadání Lucie) — jen pro samotný Ochutnávkový
// set sirupů (sirupy nepotřebují chlazení). Výdejní místo / Z-BOX zákazník
// napíše do poznámky; zásilku pak zadáme v Zásilkovně ručně.
export const ZASILKOVNA_METHOD_ID = "zasilkovna";
// Zaváděcí kampaň (11. 11. 2026): poštovné zdarma pro prvních 100 setů.
// Po skončení kampaně vrátit na 89 (spolu se SQL 97_konec_kampane_set_MAIN.sql).
export const ZASILKOVNA_PRICE_KC = 0;
/** SKU, která smějí jet Zásilkovnou (košík musí obsahovat jen je). */
export const ZASILKOVNA_SKUS: readonly string[] = ["ochutnavkovy-set-sirupu-5x100ml"];
export const ZASILKOVNA_NOTE_REQUIRED =
  "U Zásilkovny napište do poznámky k objednávce adresu výdejního místa nebo Z-BOXu, kam vám máme set poslat.";

const ZASILKOVNA: ShippingMethod = {
  id: "zasilkovna",
  label: "Zásilkovna – výdejní místo nebo Z-BOX",
  description:
    "Jen pro Ochutnávkový set sirupů. Do poznámky k objednávce napište adresu výdejního místa nebo Z-BOXu.",
  priceKc: ZASILKOVNA_PRICE_KC,
  requiresAddress: false,
};

export function shippingMethodsFor(mode: ShippingMode): ShippingMethod[] {
  return [PICKUP, mode === "weight" ? COLD_BY_WEIGHT : COLD_FLAT, ZASILKOVNA];
}

/** Smí košík jet Zásilkovnou? Jen když obsahuje výhradně povolená SKU. */
export function isZasilkovnaEligible(lines: readonly { sku: string }[]): boolean {
  return lines.length > 0 && lines.every((line) => ZASILKOVNA_SKUS.includes(line.sku));
}

/** Dosavadní nabídka (paušál) — výchozí stav. */
export const shippingMethods: ShippingMethod[] = shippingMethodsFor("flat");

/** Kontakt pro individuální domluvu dopravy (= provozovatel, infoPages.ts). */
export type ShippingContact = { email: string; phone: string };

export type ShippingQuote =
  | { available: true; priceKc: number; /** null = hmotnost se nepočítala (paušál, osobní odběr) */ weightGrams: number | null }
  | { available: false; reason: "over_limit" | "missing_weight" | "set_only"; message: string; weightGrams: number | null };

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
    if (!isZasilkovnaEligible(lines)) {
      return {
        available: false,
        reason: "set_only",
        message:
          "Zásilkovnou posíláme jen samotný Ochutnávkový set sirupů. Pro ostatní zboží zvolte chlazenou přepravu nebo osobní odběr.",
        weightGrams: null,
      };
    }
    return { available: true, priceKc: method.priceKc, weightGrams: null };
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

export const paymentMethods: PaymentMethod[] = paymentMethodsFor(false);

export function getShippingMethod(id: string, mode: ShippingMode = "flat"): ShippingMethod | undefined {
  return shippingMethodsFor(mode).find((method) => method.id === id);
}

export function getPaymentMethod(id: string, cardAvailable = false): PaymentMethod | undefined {
  return paymentMethodsFor(cardAvailable).find((method) => method.id === id);
}
