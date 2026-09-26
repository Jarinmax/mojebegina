// E-shop 1.0 (náhled) — čistá validace pokladny. Bez "server-only",
// testovatelné stejně jako lib/data/orderValidation.ts. Volá se ze server
// action (app/eshop/pokladna/actions.ts), klientská validace ve formuláři
// je jen pohodlí navíc.

import { parseStoredCart } from "./cart";
import { priceCart, type PricedCart } from "./pricing";
import { getPaymentMethod, type PaymentMethod } from "./shipping";

const MAX_TEXT_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;

export type CheckoutInput = {
  cart: string; // JSON [{slug, quantity}] z localStorage
  name: string;
  email: string;
  phone: string;
  shippingMethodId: string;
  paymentMethodId: string;
  street: string;
  city: string;
  zip: string;
  note: string;
  termsAccepted: boolean;
};

export type CheckoutValue = {
  pricedCart: PricedCart;
  payment: PaymentMethod;
  name: string;
  email: string;
  phone: string;
  /** null u osobního odběru */
  address: { street: string; city: string; zip: string } | null;
  note: string | null;
};

type Result = { ok: true; value: CheckoutValue } | { ok: false; error: string };

// Záměrně jednoduché — plnou kontrolu doručitelnosti udělá až potvrzovací
// e-mail. Cílem je chytit překlepy typu chybějící zavináč nebo tečka.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;
const ZIP_PATTERN = /^\d{3} ?\d{2}$/;

function tooLong(value: string, max = MAX_TEXT_LENGTH): boolean {
  return value.length > max;
}

export function validateCheckoutInput(input: CheckoutInput): Result {
  const cartLines = parseStoredCart(input.cart);
  const priced = priceCart(cartLines, input.shippingMethodId);
  if (!priced.ok) {
    return priced;
  }

  const payment = getPaymentMethod(input.paymentMethodId);
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

  let address: CheckoutValue["address"] = null;
  if (priced.value.shipping.requiresAddress) {
    const street = input.street.trim();
    const city = input.city.trim();
    const zip = input.zip.trim();
    if (!street || !city) {
      return { ok: false, error: "Vyplňte ulici a město pro doručení." };
    }
    if (!ZIP_PATTERN.test(zip)) {
      return { ok: false, error: "Zadejte PSČ ve tvaru 123 45." };
    }
    if (tooLong(street) || tooLong(city)) {
      return { ok: false, error: `Adresa může mít nejvýše ${MAX_TEXT_LENGTH} znaků.` };
    }
    address = { street, city, zip: zip.replace(" ", "").replace(/^(\d{3})/, "$1 ") };
  }

  const note = input.note.trim();
  if (tooLong(note, MAX_NOTE_LENGTH)) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_NOTE_LENGTH} znaků.` };
  }

  if (!input.termsAccepted) {
    return { ok: false, error: "Pro odeslání objednávky je potřeba souhlasit s obchodními podmínkami." };
  }

  return {
    ok: true,
    value: {
      pricedCart: priced.value,
      payment,
      name,
      email,
      phone,
      address,
      note: note || null,
    },
  };
}
