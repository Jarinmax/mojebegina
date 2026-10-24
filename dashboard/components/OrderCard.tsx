import Link from "next/link";
import { CreditCard, RefreshCw } from "lucide-react";
import { formatKc } from "@/lib/format";
import type { Order } from "@/mock/customer";

type OrderCardProps = {
  order: Order;
  showPaymentAction?: boolean;
};

const STATUS_STYLE: Record<Order["status"], string> = {
  Uhrazeno: "bg-begina-primary-100 text-begina-primary-800",
  "Čeká na platbu": "bg-amber-50 text-amber-800",
  Fakturováno: "bg-neutral-100 text-neutral-700",
  Stornováno: "bg-neutral-100 text-neutral-500 line-through",
  Neuhrazeno: "bg-amber-100 text-amber-800",
  "Částečně uhrazeno": "bg-sky-100 text-sky-800",
  Přeplaceno: "bg-violet-100 text-violet-800",
};

export default function OrderCard({ order, showPaymentAction = false }: OrderCardProps) {
  const canPay = showPaymentAction && order.paymentHref && (order.status === "Neuhrazeno" || order.status === "Částečně uhrazeno");
  return (
    <div
      id={order.id}
      className="bg-white border border-neutral-200 rounded-xl p-3.5 mb-3 scroll-mt-4"
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-sm font-medium text-begina-primary-900">
            {order.orderNumber}
          </p>
          <p className="text-xs text-neutral-500">{order.date}</p>
        </div>
        <span
          className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${STATUS_STYLE[order.status]}`}
        >
          {order.status}
        </span>
      </div>

      <p className="text-sm text-neutral-600 mb-2">{order.products}</p>
      {order.shipping ? (
        <p className="text-xs text-neutral-500">
          Doprava{order.shipping.label ? ` (${order.shipping.label})` : ""}: {formatKc(order.shipping.priceKc)}
        </p>
      ) : null}
      {order.paymentMethod ? <p className="text-xs text-neutral-500">Platba: {order.paymentMethod}</p> : null}
      {order.invoiceNumber === null && order.status !== "Stornováno" && !order.orderNumber.startsWith("Faktura") ? (
        <p className="text-xs text-neutral-500">Faktura: zatím nevystavena</p>
      ) : order.invoiceNumber && !order.orderNumber.startsWith("Faktura") ? (
        <p className="text-xs text-neutral-500">Faktura č. {order.invoiceNumber}</p>
      ) : null}
      {order.customerNote ? <p className="text-xs text-neutral-500 italic mt-1">Vaše poznámka: „{order.customerNote}“</p> : null}
      <p className="text-sm font-medium text-begina-primary-900 mb-3 mt-2">
        {formatKc(order.totalKc)}
      </p>

      {canPay && (
        <Link
          href={order.paymentHref!}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-begina-primary-900 rounded-lg py-2.5 mb-2"
        >
          <CreditCard className="w-4 h-4" />
          Zaplatit
        </Link>
      )}
      <button
        type="button"
        className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2"
      >
        <RefreshCw className="w-4 h-4" />
        Objednat znovu
      </button>
    </div>
  );
}
