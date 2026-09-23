import Link from "next/link";
import StatusBadge, { STATUS_CARD_CLASSES } from "./StatusBadge";
import type { NodeCardData } from "@/lib/data/companyNodes";

// Security Phase 12 (Řízení firmy 2.0) — karta uzlu (Oblast/Podoblast/
// Téma), použitá jak na /rizeni-firmy (Oblasti), tak v detailu uzlu (děti).
// Vždy ukazuje konkrétní důvod stavu, ne jen barvu — schváleno explicitně
// v zadání ("Area cards must show a specific driving reason").
const PRIORITY_LABELS: Record<string, string> = {
  low: "Nízká priorita",
  medium: "Střední priorita",
  high: "Vysoká priorita",
  critical: "Kritická priorita",
};

type Props = {
  node: NodeCardData;
};

export default function NodeCard({ node }: Props) {
  return (
    <Link
      href={`/rizeni-firmy/uzel/${node.id}`}
      className={`block border rounded-xl p-4 hover:border-begina-primary-300 transition-colors ${STATUS_CARD_CLASSES[node.status]}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium text-begina-primary-900">{node.title}</p>
        <StatusBadge status={node.status} />
      </div>

      {node.status !== "green" && node.reasonTitle && (
        <p className="text-sm text-neutral-600 mb-1">
          {node.reasonTitle}
          {node.otherActiveCount > 0 && (
            <span className="text-neutral-400"> (+{node.otherActiveCount} další)</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        {node.priority !== "medium" && <span>{PRIORITY_LABELS[node.priority]}</span>}
        {node.statusMode === "manual" && <span>Ruční stav</span>}
        {!node.ownerUserId && <span>Bez odpovědné osoby</span>}
      </div>
    </Link>
  );
}
