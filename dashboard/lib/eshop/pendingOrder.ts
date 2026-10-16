// Rozpracovaná platba kartou v prohlížeči zákazníka. Po uložení objednávky
// a otevření platební stránky Stripe si prohlížeč pamatuje id a číslo
// objednávky (localStorage) a teprve pak vyprázdní košík. Návrat ze Stripe
// (Zpět, obnovení stránky, nová návštěva) tak nevede k nové objednávce:
// košík i pokladna nabídnou „Zaplatit objednávku“ s původním číslem.
// Stav objednávky (zaplacená / zrušená) vždy rozhoduje server, záznam
// v prohlížeči je jen odkaz na ni.

export const PENDING_ORDER_KEY = "begina-eshop-pending-order-v1";
/** Po týdnu se odkaz zapomene (objednávku řeší Begina ručně). */
export const PENDING_ORDER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingOrder = { orderId: string; orderNumber: number | null; savedAt: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function serializePendingOrder(order: PendingOrder): string {
  return JSON.stringify(order);
}

/** Uložený záznam → rozpracovaná objednávka; poškozený, cizí nebo starý = null. */
export function parsePendingOrder(raw: string | null, now: number): PendingOrder | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { orderId, orderNumber, savedAt } = value as Record<string, unknown>;
  if (typeof orderId !== "string" || !UUID.test(orderId)) return null;
  if (orderNumber !== null && !(typeof orderNumber === "number" && Number.isSafeInteger(orderNumber) && orderNumber > 0)) {
    return null;
  }
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > PENDING_ORDER_MAX_AGE_MS || savedAt - now > 60_000) return null;
  return { orderId, orderNumber, savedAt };
}
