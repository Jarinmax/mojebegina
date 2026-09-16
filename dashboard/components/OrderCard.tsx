import { RefreshCw } from "lucide-react";
import { formatKc } from "@/lib/format";
import type { Order } from "@/mock/customer";

type OrderCardProps = {
  order: Order;
};

const STATUS_STYLE: Record<Order["status"], string> = {
  Uhrazeno: "bg-begina-primary-100 text-begina-primary-800",
};

export default function OrderCard({ order }: OrderCardProps) {
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
      <p className="text-sm font-medium text-begina-primary-900 mb-3">
        {formatKc(order.totalKc)}
      </p>

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
