import { formatCzechDate } from "@/lib/format";
import { PRIORITY_LABELS, STATUS_LABELS } from "../focusLabels";
import type { FocusPriority, FocusStatus } from "@/lib/data/ceoFocusValidation";
import type { FocusActivityEntry } from "@/lib/data/ceoFocus";

// Security Phase 17 (CEO přehled 1.0) — stejný vzor jako
// LeadActivityTimeline.tsx: přesně tenhle timeline je mechanismus pro
// "okamžitě obnovit kontext bez hledání ve starých chatech" ze zadání.
function describeEntry(entry: FocusActivityEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "created":
      return "založil(a) projekt";
    case "owner_assigned":
      return `přiřadil(a): ${String(meta.ownerName ?? meta.ownerUserId)}`;
    case "activated":
      return "nastavil(a) jako aktivní projekt TEĎ";
    case "updated": {
      const parts: string[] = [];
      if (meta.status) {
        const to = String(meta.status) as FocusStatus;
        parts.push(`stav → ${STATUS_LABELS[to] ?? to}`);
      }
      if (meta.priority) {
        const to = String(meta.priority) as FocusPriority;
        parts.push(`priorita → ${PRIORITY_LABELS[to] ?? to}`);
      }
      if (meta.nextStep) {
        parts.push("nový další krok");
      }
      if (meta.description) {
        parts.push("aktualizoval(a) popis");
      }
      return parts.length > 0 ? `aktualizoval(a) projekt (${parts.join(", ")})` : "aktualizoval(a) projekt";
    }
    default:
      return "";
  }
}

export default function FocusActivityTimeline({ activity }: { activity: FocusActivityEntry[] }) {
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
            <p className="text-xs text-neutral-400 whitespace-nowrap">{formatCzechDate(entry.createdAt)}</p>
          </div>
          {entry.kind === "updated" && entry.body && (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
