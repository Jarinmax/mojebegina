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
import { SET_LAUNCHED } from "./tastingSet";
import { formatKc } from "@/lib/format";
import { cartWeight, coldShippingPrice, coldShippingPriceSk, COLD_SHIPPING_MAX_GRAMS } from "./shippingRates";

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
  description: `Jen pro sirupy v kapsičce 650 ml (nejvýše ${ZASILKOVNA_MAX_POUCHES} ks v objednávce)${SET_LAUNCHED ? " a ochutnávkový set sirupů" : ""}. Cena je včetně krabice.`,
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
/** Kam zásilka jede: Česko (výchozí) nebo Slovensko (jiný ceník CoolBalík). */
export type ShippingDestination = "cz" | "sk";

/**
 * Doručení na Slovensko je VYPNUTÉ (Lucie 18. 11. 2026 — slovenské povinnosti
 * k obalům; zapnuté bylo 16.–18. 11. 2026). Znovu zapnout jde jen úpravou
 * tady v kódu — proměnná ve Vercelu ho úmyslně nezapne, aby se neobešlo
 * rozhodnutí. Ceník, zóny a texty pro Slovensko zůstávají připravené.
 */
export const SLOVAKIA_DELIVERY_ALLOWED = false;
/**
 * Slovensko s vlastní dopravou zákazníka (Lucie 22. 11. 2026): slovenský zákon o obalech
 * (od 12. 8. 2026) nám bez registrace a zástupce nedovoluje balené zboží na Slovensko posílat.
 * Zákazník si proto chlazenou přepravu CoolBalík objedná a zaplatí sám; my zboží připravíme
 * a předáme jím objednanému dopravci. Doprava je v e-shopu 0 Kč.
 */
export const SLOVAKIA_SELF_TRANSPORT = true;
export const SLOVAKIA_SELF_TRANSPORT_NOTE =
  "Doručení na Slovensko: doprava není v ceně. Na Slovensko posíláme jen chlazenou přepravou CoolBalík, kterou si objednáte a zaplatíte sami. Až bude objednávka připravená, pošleme Vám e-mail s hmotností zásilky a místem vyzvednutí: Zahradní Bistro Begina, Vitice 119, 281 06 Vitice. Tam zásilku dopravci předáme.";
/** Cena dopravy na Slovensko v nabídce a souhrnu — NE „Zdarma“: dopravu platí zákazník dopravci. */
export const SLOVAKIA_SELF_TRANSPORT_PRICE_LABEL = "Platíte dopravci";
export const SLOVAKIA_SELF_TRANSPORT_SUMMARY = "platíte dopravci zvlášť";
export const SLOVAKIA_SELF_TRANSPORT_METHOD_LABEL = "Chlazená přeprava CoolBalík na Slovensko";
/** Popis způsobu doručení v pokladně pro slovenskou adresu. */
export const SLOVAKIA_SELF_TRANSPORT_METHOD_NOTE =
  "Doprava není v ceně. Až bude objednávka připravená, napíšeme Vám. Chlazenou přepravu CoolBalík si pak objednáte a zaplatíte sami, s vyzvednutím u nás ve Viticích.";
/** Slovenské PSČ (0xx, 8xx, 9xx) na konci doručovací adresy — česká PSČ začínají 1–7. */
export function isSlovakAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const zips = address.match(/\b\d{3} ?\d{2}\b/g);
  const last = zips?.[zips.length - 1];
  return !!last && /^[089]/.test(last);
}
export function slovakiaEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return (SLOVAKIA_DELIVERY_ALLOWED || SLOVAKIA_SELF_TRANSPORT) && env.ESHOP_SLOVAKIA !== "off";
}
/** Na Slovensko jede zákazníkova vlastní doprava (u nás 0 Kč). */
export function slovakiaSelfTransport(destination: ShippingDestination): boolean {
  return destination === "sk" && SLOVAKIA_SELF_TRANSPORT && !SLOVAKIA_DELIVERY_ALLOWED;
}

const SK_ZIP = /^[089]\d{2} ?\d{2}$/;

/** Slovensko se pozná podle země fakturace (doručení na fakturační adresu) nebo slovenského PSČ. */
export function shippingDestination(input: { enabled: boolean; sameAsBilling: boolean; billingCountry: string; zip: string }): ShippingDestination {
  if (!input.enabled) return "cz";
  if (input.sameAsBilling) return input.billingCountry.trim() === "Slovensko" ? "sk" : "cz";
  return SK_ZIP.test(input.zip.trim()) ? "sk" : "cz";
}

/**
 * Rozvozové zóny CoolBalíku na Slovensku (veřejný vyhledávač coolbalik.cz,
 * stav 16. 11. 2026, po trojčíslí PSČ): „daily“ = Bratislava, Trnava, Banská
 * Bystrica a okolí (úterý až pátek, doručení zpravidla druhý den); „twice“ =
 * ostatní zóny (2 dny v týdnu, přeprava může trvat až 6 dní). Neznámá nebo
 * smíšená trojčíslí se berou opatrně jako „twice“.
 */
const SK_DAILY_PREFIXES = new Set(["903", "917", "960", "974"]);
export type SlovakiaZone = "daily" | "twice";
export function slovakiaDeliveryZone(zip: string): SlovakiaZone {
  const digits = zip.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) return "twice";
  return digits.startsWith("8") || SK_DAILY_PREFIXES.has(digits.slice(0, 3)) ? "daily" : "twice";
}

export function quoteShipping(
  method: ShippingMethod,
  lines: readonly ShippingQuoteLine[],
  mode: ShippingMode,
  contact: ShippingContact,
  destination: ShippingDestination = "cz"
): ShippingQuote {
  if (method.id === "zasilkovna") {
    // Zásilkovna se počítá z balení v košíku (quoteZasilkovnaShipping), ne z hmotnostních řádků.
    return { available: false, reason: "not_eligible", message: "Cenu Zásilkovny pro tento košík nejde spočítat.", weightGrams: null };
  }
  if (method.id === "osobni-odber" || mode === "flat") {
    return { available: true, priceKc: method.priceKc, weightGrams: null };
  }
  // Slovensko: dopravu si zákazník zajistí sám (CoolBalík), u nás 0 Kč
  if (slovakiaSelfTransport(destination)) return { available: true, priceKc: 0, weightGrams: null };
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
  const price = destination === "sk" ? coldShippingPriceSk(weight.grams) : coldShippingPrice(weight.grams);
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
        ? `Zásilkovnou posíláme jen sirupy v kapsičce 650 ml${SET_LAUNCHED ? " a ochutnávkový set sirupů" : ""}. Ostatní zboží doručujeme chlazenou přepravou.`
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
/**
 * Zákazník ze Slovenska (slovenská fakturační adresa nebo doručení na
 * Slovensko) platí jen kartou — rozhodnutí Jarina 16. 11. 2026: peníze
 * předem a celé, bez kurzových rozdílů z převodu v eurech.
 */
export const SLOVAKIA_CARD_ONLY_NOTE = "Na Slovensko je možné platit pouze kartou.";

export function slovakPayer(input: { billingCountry: string; destination: ShippingDestination }): boolean {
  return input.destination === "sk" || input.billingCountry.trim() === "Slovensko";
}

export function paymentMethodsFor(cardAvailable: boolean, options: { slovakPayer?: boolean } = {}): PaymentMethod[] {
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
  // Slovensko: bankovní převod se vůbec nenabízí.
  return options.slovakPayer ? [card] : [transfer, card];
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

export function getPaymentMethod(id: string, cardAvailable = false, options: { slovakPayer?: boolean } = {}): PaymentMethod | undefined {
  return paymentMethodsFor(cardAvailable, options).find((method) => method.id === id);
}
