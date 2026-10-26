// Security Phase 15 (Objednávky 1.0) — sdílené popisky/barvy pro oba
// nezávislé stavy, použité napříč kartami, formuláři i timeline.
import type { FulfillmentStatus, PaymentStatus } from "@/lib/data/orderValidation";

export { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/data/orderLabels";

export const FULFILLMENT_CLASSES: Record<FulfillmentStatus, string> = {
  new: "bg-neutral-100 text-neutral-700 border-neutral-200",
  confirmed: "bg-sky-50 text-sky-700 border-sky-200",
  preparing: "bg-sky-50 text-sky-700 border-sky-200",
  ready: "bg-begina-primary-50 text-begina-primary-800 border-begina-primary-200",
  out_for_delivery: "bg-begina-primary-50 text-begina-primary-800 border-begina-primary-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-neutral-100 text-neutral-500 border-neutral-200 line-through",
};

export const PAYMENT_CLASSES: Record<PaymentStatus, string> = {
  unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  invoiced: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
