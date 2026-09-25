import Link from "next/link";
import { formatCzechDate, formatKc } from "@/lib/format";
import type { CustomerCardData } from "@/lib/data/leads";

export default function CustomerCard({ customer }: { customer: CustomerCardData }) {
  return (
    <Link
      href={`/rizeni-firmy/obchod/zakaznici/${customer.id}`}
      className="block bg-white border border-neutral-200 rounded-xl p-4 hover:border-begina-primary-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-begina-primary-900">{customer.name}</p>
        <p className="text-sm font-medium text-begina-primary-900 whitespace-nowrap">
          {formatKc(customer.totalRevenueKc)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 mb-2">
        <span>
          {customer.orderCount} {customer.orderCount === 1 ? "objednávka" : customer.orderCount < 5 ? "objednávky" : "objednávek"}
        </span>
        {customer.lastOrderAt && <span>· poslední {formatCzechDate(customer.lastOrderAt)}</span>}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>{customer.ownerName ?? "Bez obchodníka"}</span>
        {customer.acquiredByName && <span>Získal: {customer.acquiredByName}</span>}
      </div>
    </Link>
  );
}
