// „Faktura poslána“ bez ručního zaškrtávání (Lucie 22. 11. 2026).
// Od 19. 11. 2026 odchází faktura e-mailem sama při „Odesláno“ (zaplacené
// e-shopové objednávky) a zaškrtne se sama. Starší objednávky, které už jsou
// odeslané nebo doručené, měly faktury poslané mimo MojeBegina (iDoklad,
// ručně) — systém o tom nemá záznam, ale nemají viset jako nedodělek.

export const AUTO_INVOICE_SINCE = new Date("2026-11-19T23:00:00Z");
const DISPATCHED = new Set(["handed_to_carrier", "delivered"]);

export type InvoiceSentSource = {
  invoiceSentAt: Date | null;
  invoiceSentMethod: string | null;
  orderedAt: Date;
  fulfillmentStatus: string;
};

export type InvoiceSentState =
  | { done: true; legacy: boolean }
  | { done: false; reason: "waits_for_shipping" | "not_sent_after_shipping" };

export function invoiceSentState(o: InvoiceSentSource & { shipped: boolean }): InvoiceSentState {
  if (o.invoiceSentAt) return { done: true, legacy: false };
  if (o.orderedAt < AUTO_INVOICE_SINCE && DISPATCHED.has(o.fulfillmentStatus)) return { done: true, legacy: true };
  return { done: false, reason: o.shipped ? "not_sent_after_shipping" : "waits_for_shipping" };
}
