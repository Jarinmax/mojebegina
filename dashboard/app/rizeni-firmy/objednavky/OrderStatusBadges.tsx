import type { FulfillmentStatus, PaymentStatus } from "@/lib/data/orderValidation";
import type { OrderCardData } from "@/lib/data/orders";
import { shortPragueDate } from "./dispatchText";
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

// Odesláno / Faktura poslána (Lucie 18. 11. 2026)
export function DispatchBadges({ order }: { order: Pick<OrderCardData, "shippedAt" | "invoiceSentAt"> }) {
  return (
    <>
      {order.shippedAt && (
        <span className="inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 border-violet-200">
          📦 Odesláno {shortPragueDate(order.shippedAt)}
        </span>
      )}
      {order.invoiceSentAt && (
        <span className="inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
          ✉️ Faktura poslána
        </span>
      )}
    </>
  );
}
