// Zákaznické recenze Google (Google Customer Reviews) — nabídka dotazníku
// po dokončení objednávky. Skript Googlu se NEnačte sám: až zákazník klikne
// na „Ano, chci ohodnotit“ (components/eshop/GoogleReviewsOptIn.tsx), teprve
// pak se Googlu pošle číslo objednávky, e-mail, země a odhad doručení
// a Google zobrazí vlastní okno se souhlasem. Bez kliknutí Google nic nedostane.
// Nápověda Googlu: https://support.google.com/merchants/answer/14629205
import type { BillingCountry } from "./orderParties";

/** ID účtu Merchant Center (veřejné, je i v kódu na stránce). */
export const GCR_MERCHANT_ID = 5903679961;
export const GCR_SCRIPT_URL = "https://apis.google.com/js/platform.js?onload=renderOptIn";
/** Expedice do 5 pracovních dní + doručení → dotazník chodí ~týden po objednávce. */
export const GCR_DELIVERY_DAYS = 7;

export type GoogleReviewsPayload = {
  merchant_id: number;
  order_id: string;
  email: string;
  delivery_country: "CZ" | "SK";
  estimated_delivery_date: string;
};

export function countryCode(country: BillingCountry | string | null | undefined): "CZ" | "SK" {
  return country === "Slovensko" ? "SK" : "CZ";
}

/** Datum ve tvaru YYYY-MM-DD (Praha) za `days` dní od `from`. */
export function estimatedDeliveryDate(from: Date, days = GCR_DELIVERY_DAYS): string {
  const target = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(target);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function googleReviewsPayload(input: {
  orderNumber: number | null;
  email: string | null | undefined;
  country: BillingCountry | string | null | undefined;
  orderedAt: Date;
}): GoogleReviewsPayload | null {
  const email = (input.email ?? "").trim();
  if (input.orderNumber === null || !EMAIL.test(email)) return null;
  return {
    merchant_id: GCR_MERCHANT_ID,
    order_id: String(input.orderNumber),
    email,
    delivery_country: countryCode(input.country),
    estimated_delivery_date: estimatedDeliveryDate(input.orderedAt),
  };
}
