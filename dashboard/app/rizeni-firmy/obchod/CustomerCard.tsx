import Link from "next/link";
import { formatCzechDate, formatKc } from "@/lib/format";
import type { CustomerCardData } from "@/lib/data/leads";
import { BONUS_STATUS_LABELS, BONUS_STATUS_CLASSES } from "./bonusLabels";

export default function CustomerCard({ customer }: { customer: CustomerCardData }) {
  const { commission } = customer;
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

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400 mb-2">
        <span>{customer.ownerName ?? "Bez obchodníka"}</span>
        {customer.acquiredByName && <span>Získal: {customer.acquiredByName}</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium text-begina-primary-800">Provize {formatKc(commission.commissionKc)}</span>
        {commission.bonusStatus !== "unknown" && (
          <span className={`rounded-full px-2 py-0.5 ${BONUS_STATUS_CLASSES[commission.bonusStatus]}`}>
            {BONUS_STATUS_LABELS[commission.bonusStatus]}
          </span>
        )}
      </div>
    </Link>
  );
}
