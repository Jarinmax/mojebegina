// E-shop 1.0 (náhled) — čistá validace pokladny. Bez "server-only",
// testovatelné stejně jako lib/data/orderValidation.ts. Volá se ze server
// action (app/eshop/pokladna/actions.ts), klientská validace ve formuláři
// je jen pohodlí navíc.

import { parseStoredCart } from "./cart";
import type { CatalogIndex } from "./catalogIndex";
import { evaluateCoupons, parseCouponCodes, type Coupon, type CouponUsage } from "./coupons";
import { priceCart, withCoupons, type PricedCart } from "./pricing";
import { getPaymentMethod, type PaymentMethod, type ShippingMode } from "./shipping";
import { clampBoxes } from "./boxOption";
import { SLOVAKIA_ORDER_NOTE } from "./infoPages";
import { BILLING_COUNTRIES, DELIVERY_COUNTRY, type BillingCountry } from "./orderParties";

const MAX_TEXT_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;

export type CheckoutInput = {
  cart: string; // JSON [{sku, quantity}] z localStorage
  name: string;
  email: string;
  phone: string;
  shippingMethodId: string;
  paymentMethodId: string;
  /** Fakturační adresa (vždy povinná) — zadání Lucie 8. 11. 2026. */
  billingStreet: string;
  billingCity: string;
  billingZip: string;
  billingCountry: string;
  /** Nákup na firmu: název firmy a IČO povinné, DIČ nepovinné. */
  companyPurchase: boolean;
  billingCompany: string;
  billingIco: string;
  billingDic: string;
  /** Zasílání: doručit na fakturační údaje (výchozí), nebo jinému příjemci. */
  deliverySameAsBilling: boolean;
  recipientName: string;
  recipientCompany: string;
  street: string;
  city: string;
  zip: string;
  recipientPhone: string;
  note: string;
  termsAccepted: boolean;
  /** Potvrzení 18+; vyžaduje se jen, když košík obsahuje alkohol. */
  ageConfirmed: boolean;
  /** Počet krabic na balení 3 l (příplatek, boxOption.ts); nepovinné, text z formuláře. */
  boxes?: string | number;
  /** JSON ["kod", …] — uplatněné slevové kódy (z košíku / pokladny); nepovinné. */
  couponCodes?: string;
};

/** Kupóny k ověření — načte je server (couponsServer.ts), checkout zůstává čistý. */
export type CouponContext = { coupons: Map<string, Coupon>; usage: Map<string, CouponUsage>; now: Date };

export type CheckoutValue = {
  pricedCart: PricedCart;
  payment: PaymentMethod;
  /** jméno a příjmení objednávajícího (= fakturační jméno) */
  name: string;
  email: string;
  phone: string;
  /** komu vystavit fakturu */
  billing: {
    name: string;
    company: { name: string; ico: string; dic: string | null } | null;
    street: string;
    city: string;
    zip: string;
    country: BillingCountry;
  };
  /** null u osobního odběru */
  delivery: {
    sameAsBilling: boolean;
    name: string;
    company: string | null;
    street: string;
    city: string;
    zip: string;
    country: typeof DELIVERY_COUNTRY;
    phone: string;
  } | null;
  /** karta zákazníka z ověřeného pasu MojeBegina (nikdy z formuláře) */
  buyerOrganizationId?: string | null;
  /** náhradní objednávka ke starší objednávce bez fakturačních údajů — neukládat je */
  billingUnknown?: boolean;
  /** doručovací adresa (= delivery bez příjemce); null u osobního odběru */
  address: { street: string; city: string; zip: string } | null;
  note: string | null;
};

type Result = { ok: true; value: CheckoutValue } | { ok: false; error: string };

// Záměrně jednoduché — plnou kontrolu doručitelnosti udělá až potvrzovací
// e-mail. Cílem je chytit překlepy typu chybějící zavináč nebo tečka.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;
const ZIP_PATTERN = /^\d{3} ?\d{2}$/;
// Doručujeme jen v České republice (WooCommerce: zóna „ČR“, PSČ 10000–99999).
// Česká PSČ začínají 1–7; 8xx/9xx a 0xx jsou slovenská.
const CZ_ZIP_PATTERN = /^[1-7]\d{2} ?\d{2}$/;
const SK_ZIP_PATTERN = /^[089]\d{2} ?\d{2}$/;

/** „14900“ / „149 00“ → „149 00“. */
function normalizeZip(zip: string): string {
  return zip.replace(/\s/g, "").replace(/^(\d{3})/, "$1 ");
}

/** IČO: 8 číslic (mezery se ignorují); u české firmy i kontrolní číslice (mod 11). */
export function normalizeIco(raw: string, country: BillingCountry): string | null {
  const ico = raw.replace(/\s/g, "");
  if (!/^\d{8}$/.test(ico)) return null;
  if (country !== "Česká republika") return ico;
  const sum = [...ico.slice(0, 7)].reduce((acc, digit, i) => acc + Number(digit) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]) ? ico : null;
}

/** DIČ: „CZ12345678“ (CZ/SK + 8–10 číslic), mezery a malá písmena se srovnají. */
export function normalizeDic(raw: string): string | null {
  const dic = raw.replace(/\s/g, "").toUpperCase();
  return /^(CZ|SK)\d{8,10}$/.test(dic) ? dic : null;
}

function tooLong(value: string, max = MAX_TEXT_LENGTH): boolean {
  return value.length > max;
}

export function validateCheckoutInput(
  input: CheckoutInput,
  index: CatalogIndex,
  options: { cardPaymentAvailable?: boolean; shippingMode?: ShippingMode; coupons?: CouponContext } = {}
): Result {
  const cartLines = parseStoredCart(input.cart);
  const priced = priceCart(cartLines, input.shippingMethodId, index, { shippingMode: options.shippingMode, boxes: clampBoxes(input.boxes, Number.MAX_SAFE_INTEGER) });
  if (!priced.ok) {
    return priced;
  }

  const payment = getPaymentMethod(input.paymentMethodId, options.cardPaymentAvailable ?? false);
  if (!payment || !payment.available) {
    return { ok: false, error: "Vyberte dostupný způsob platby." };
  }

  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  if (!name) {
    return { ok: false, error: "Vyplňte jméno a příjmení." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Zadejte platný e-mail." };
  }
  if (!PHONE_PATTERN.test(phone)) {
    return { ok: false, error: "Zadejte platné telefonní číslo." };
  }
  if (tooLong(name) || tooLong(email) || tooLong(phone)) {
    return { ok: false, error: `Kontaktní údaje mohou mít nejvýše ${MAX_TEXT_LENGTH} znaků.` };
  }

  // Fakturační údaje — vždy úplné (i u osobního odběru).
  const country = BILLING_COUNTRIES.find((c) => c === input.billingCountry.trim());
  if (!country) {
    return { ok: false, error: "Vyberte zemi fakturační adresy." };
  }
  const billingStreet = input.billingStreet.trim();
  const billingCity = input.billingCity.trim();
  const billingZip = input.billingZip.trim();
  if (!billingStreet || !billingCity) {
    return { ok: false, error: "Vyplňte fakturační adresu — ulici a číslo domu a město." };
  }
  if (!/\p{L}/u.test(billingStreet) || !/\d/.test(billingStreet)) {
    return { ok: false, error: "Ve fakturační adrese uveďte ulici (nebo obec) i číslo domu." };
  }
  if (!ZIP_PATTERN.test(billingZip)) {
    return { ok: false, error: "Zadejte fakturační PSČ ve tvaru 123 45." };
  }
  if ((country === "Česká republika" ? CZ_ZIP_PATTERN : SK_ZIP_PATTERN).test(billingZip) === false) {
    return { ok: false, error: `Fakturační PSČ neodpovídá zemi ${country}.` };
  }
  if (tooLong(billingStreet) || tooLong(billingCity)) {
    return { ok: false, error: `Adresa může mít nejvýše ${MAX_TEXT_LENGTH} znaků.` };
  }
  let company: CheckoutValue["billing"]["company"] = null;
  if (input.companyPurchase) {
    const companyName = input.billingCompany.trim();
    if (!companyName) {
      return { ok: false, error: "Při nákupu na firmu vyplňte název firmy." };
    }
    const ico = normalizeIco(input.billingIco, country);
    if (!ico) {
      return { ok: false, error: "Zadejte platné IČO firmy (8 číslic)." };
    }
    const rawDic = input.billingDic.trim();
    const dic = rawDic ? normalizeDic(rawDic) : null;
    if (rawDic && !dic) {
      return { ok: false, error: "DIČ zadejte ve tvaru CZ12345678 (nebo ho nechte prázdné)." };
    }
    if (tooLong(companyName)) {
      return { ok: false, error: `Název firmy může mít nejvýše ${MAX_TEXT_LENGTH} znaků.` };
    }
    company = { name: companyName, ico, dic };
  }
  const billing: CheckoutValue["billing"] = {
    name,
    company,
    street: billingStreet,
    city: billingCity,
    zip: normalizeZip(billingZip),
    country,
  };

  // Doručovací údaje — jen u zasílání. Stejné jako fakturační se převezmou,
  // jiný příjemce musí vyplnit vlastní jméno, adresu a telefon.
  let delivery: CheckoutValue["delivery"] = null;
  if (priced.value.shipping.requiresAddress) {
    if (input.deliverySameAsBilling) {
      if (country !== DELIVERY_COUNTRY) {
        return { ok: false, error: `Doručujeme jen v České republice — zvolte prosím jinou doručovací adresu v ČR. ${SLOVAKIA_ORDER_NOTE}` };
      }
      delivery = {
        sameAsBilling: true,
        name,
        company: company?.name ?? null,
        street: billing.street,
        city: billing.city,
        zip: billing.zip,
        country: DELIVERY_COUNTRY,
        phone,
      };
    } else {
      const recipientName = input.recipientName.trim();
      const recipientCompany = input.recipientCompany.trim();
      const street = input.street.trim();
      const city = input.city.trim();
      const zip = input.zip.trim();
      const recipientPhone = input.recipientPhone.trim();
      if (!recipientName) {
        return { ok: false, error: "Vyplňte jméno a příjmení příjemce zásilky." };
      }
      if (!street || !city) {
        return { ok: false, error: "Vyplňte ulici a město pro doručení." };
      }
      if (!/\p{L}/u.test(street) || !/\d/.test(street)) {
        return { ok: false, error: "V doručovací adrese uveďte ulici (nebo obec) i číslo domu." };
      }
      if (!ZIP_PATTERN.test(zip)) {
        return { ok: false, error: "Zadejte PSČ ve tvaru 123 45." };
      }
      if (!CZ_ZIP_PATTERN.test(zip)) {
        return { ok: false, error: `Doručujeme jen v České republice — zadejte prosím české PSČ. ${SLOVAKIA_ORDER_NOTE}` };
      }
      if (!PHONE_PATTERN.test(recipientPhone)) {
        return { ok: false, error: "Zadejte platný telefon příjemce pro doručení." };
      }
      if ([recipientName, recipientCompany, street, city, recipientPhone].some((v) => tooLong(v))) {
        return { ok: false, error: `Doručovací údaje mohou mít nejvýše ${MAX_TEXT_LENGTH} znaků.` };
      }
      delivery = {
        sameAsBilling: false,
        name: recipientName,
        company: recipientCompany || null,
        street,
        city,
        zip: normalizeZip(zip),
        country: DELIVERY_COUNTRY,
        phone: recipientPhone,
      };
    }
  }
  const address: CheckoutValue["address"] = delivery ? { street: delivery.street, city: delivery.city, zip: delivery.zip } : null;

  const note = input.note.trim();
  if (tooLong(note, MAX_NOTE_LENGTH)) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_NOTE_LENGTH} znaků.` };
  }

  if (priced.value.containsAgeRestricted && !input.ageConfirmed) {
    return {
      ok: false,
      error: "Košík obsahuje alkoholické nápoje — potvrďte prosím, že je vám alespoň 18 let.",
    };
  }

  // Slevové kódy až s e-mailem (omezení na e-mail a limit na zákazníka).
  let pricedCart = priced.value;
  const codes = parseCouponCodes(input.couponCodes);
  if (codes.length > 0) {
    const ctx = options.coupons ?? { coupons: new Map(), usage: new Map(), now: new Date() };
    const coupons = evaluateCoupons(codes, {
      lines: pricedCart.lines,
      subtotalKc: pricedCart.subtotalKc,
      index,
      coupons: ctx.coupons,
      usage: ctx.usage,
      email,
      now: ctx.now,
    });
    if (!coupons.ok) {
      return { ok: false, error: `${coupons.error} Kód můžete odebrat a objednávku odeslat bez něj.` };
    }
    pricedCart = withCoupons(pricedCart, coupons);
  }

  if (!input.termsAccepted) {
    return { ok: false, error: "Pro odeslání objednávky je potřeba souhlasit s obchodními podmínkami." };
  }

  return {
    ok: true,
    value: {
      pricedCart,
      payment,
      name,
      email,
      phone,
      billing,
      delivery,
      address,
      note: note || null,
    },
  };
}
