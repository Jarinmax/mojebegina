import Link from "next/link";
import { formatCzechDate, formatKc } from "@/lib/format";
import { FulfillmentBadge, PaymentBadge } from "./OrderStatusBadges";
import type { OrderCardData } from "@/lib/data/orders";

export default function OrderCard({ order }: { order: OrderCardData }) {
  return (
    <Link
      href={`/rizeni-firmy/objednavky/${order.id}`}
      className="block bg-white border border-neutral-200 rounded-xl p-4 hover:border-begina-primary-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-begina-primary-900">{order.buyerOrganizationName}</p>
        <p className="text-sm font-medium text-begina-primary-900 whitespace-nowrap">
          {formatKc(order.totalKc)}
        </p>
      </div>

      {order.contactName && <p className="text-xs text-neutral-500 mb-1">{order.contactName}</p>}
      {order.itemsSummary && (
        <p className="text-sm text-neutral-600 mb-2 line-clamp-2">{order.itemsSummary}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <FulfillmentBadge status={order.fulfillmentStatus} />
        <PaymentBadge status={order.paymentStatus} overdue={order.paymentOverdue} />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>
          Objednáno {formatCzechDate(order.orderedAt)}
          {order.plannedDeliveryAt && ` · doručení ${formatCzechDate(order.plannedDeliveryAt)}`}
        </span>
        <span>{order.responsibleName ?? "Bez odpovědné osoby"}</span>
      </div>
    </Link>
  );
}
