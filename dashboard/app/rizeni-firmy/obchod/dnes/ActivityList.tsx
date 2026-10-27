import { formatCzechDateTime } from "@/lib/format";
import { CALL_RESULT_LABELS } from "./dailyCallLabels";
import type { ActivityPreviewEntry } from "@/lib/data/dailyCalls";
import type { CallResult } from "@/lib/data/dailyCallsValidation";

// Security Phase 21 (Denní volání 1.1) — čistě zobrazovací, bez vlastního
// stavu (žádné "use client" potřeba — rozbalování/rozsah, co se předává,
// řeší volající karta). Používá se jak na pending kartě (QueueItemCard),
// tak na "Dnes vyřízeno" kartě (DoneTodayCard) — stejné pravidlo
// "relevantní aktivita" (RELEVANT_ACTIVITY_KINDS) se čte na obou místech
// stejně, protože obě dostávají `entries` ze stejné datové funkce
// (fetchRelevantActivityByLead v dailyCalls.ts).
export default function ActivityList({ entries }: { entries: ActivityPreviewEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-neutral-400">Zatím žádná historie hovorů.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry) => {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>;
        const resultLabel =
          entry.kind === "call_logged" && typeof meta.callResult === "string"
            ? CALL_RESULT_LABELS[meta.callResult as CallResult]
            : null;
        return (
          <li key={entry.id} className="text-xs border-l-2 border-neutral-200 pl-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-500">
                {entry.authorName ?? "Neznámý uživatel"}
                {resultLabel ? ` · ${resultLabel}` : ""}
              </span>
              <span className="text-neutral-400 whitespace-nowrap">{formatCzechDateTime(entry.createdAt)}</span>
            </div>
            {entry.body && <p className="text-neutral-700 whitespace-pre-wrap mt-0.5">{entry.body}</p>}
          </li>
        );
      })}
    </ul>
  );
}
