import type { FulfillmentStatus, PaymentStatus } from "@/lib/data/orderValidation";
import { FULFILLMENT_LABELS, FULFILLMENT_CLASSES, PAYMENT_LABELS, PAYMENT_CLASSES } from "./orderLabels";

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${FULFILLMENT_CLASSES[status]}`}
    >
      {FULFILLMENT_LABELS[status]}
    </span>
  );
}

export function PaymentBadge({ status, overdue }: { status: PaymentStatus; overdue?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 ${
        overdue ? "bg-red-50 text-red-700 border-red-200" : PAYMENT_CLASSES[status]
      }`}
    >
      {overdue ? "Po splatnosti" : PAYMENT_LABELS[status]}
    </span>
  );
}
