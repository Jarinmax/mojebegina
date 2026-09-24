import { formatCzechDate } from "@/lib/format";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "./orderLabels";
import type { FulfillmentStatus, PaymentStatus } from "@/lib/data/orderValidation";
import type { OrderActivityEntry } from "@/lib/data/orders";

// Security Phase 15 (Objednávky 1.0) — sjednocená timeline, stejný vzor
// jako ActivityTimeline.tsx u company_nodes.
function describeEntry(entry: OrderActivityEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "created":
      return "založil(a) objednávku";
    case "note_added":
      return "upravil(a) poznámku";
    case "fulfillment_status_changed": {
      const to = String(meta.to ?? "") as FulfillmentStatus;
      return `nastavil(a) stav objednávky na „${FULFILLMENT_LABELS[to] ?? to}“`;
    }
    case "payment_status_changed": {
      const to = String(meta.to ?? "") as PaymentStatus;
      return `nastavil(a) stav platby na „${PAYMENT_LABELS[to] ?? to}“`;
    }
    case "responsible_assigned":
      return meta.responsibleUserId
        ? `přiřadil(a) odpovědnou osobu: ${String(meta.responsibleName ?? meta.responsibleUserId)}`
        : "odebral(a) odpovědnou osobu";
    default:
      return "";
  }
}

export default function OrderActivityTimeline({ activity }: { activity: OrderActivityEntry[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-neutral-500">Zatím žádná aktivita.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {activity.map((entry) => (
        <div key={entry.id} className="border-l-2 border-neutral-200 pl-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-begina-primary-900">
              <span className="font-medium">{entry.authorName ?? "Neznámý uživatel"}</span>{" "}
              {describeEntry(entry)}
            </p>
            <p className="text-xs text-neutral-400 whitespace-nowrap">
              {formatCzechDate(entry.createdAt)}
            </p>
          </div>
          {entry.kind === "note_added" && entry.body && (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
