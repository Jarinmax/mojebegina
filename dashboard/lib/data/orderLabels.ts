// Popisky obou stavů objednávky — sdílené UI (app/rizeni-firmy/objednavky/
// orderLabels.ts) i datovou vrstvou (hlášky při souběžné změně).
import type { FulfillmentStatus, PaymentStatus } from "./orderValidation";

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  new: "Nová",
  confirmed: "Potvrzená",
  preparing: "V přípravě/výrobě",
  ready: "Připravená",
  out_for_delivery: "Na rozvozu",
  delivered: "Doručená",
  cancelled: "Stornovaná",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Nezaplaceno",
  invoiced: "Fakturováno",
  paid: "Zaplaceno",
};
