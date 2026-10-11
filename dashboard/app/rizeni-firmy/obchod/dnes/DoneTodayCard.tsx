"use client";

import { useEffect, useId, useRef, useState } from "react";
import ActivityList from "./ActivityList";
import { useDailyCallOutcomeContext } from "./DailyCallOutcomeContext";
import { CALL_RESULT_LABELS } from "./dailyCallLabels";
import { STAGE_LABELS } from "../leadLabels";
import { formatCzechDateTime } from "@/lib/format";
import type { DoneTodayItem } from "@/lib/data/dailyCalls";

// Security Phase 21 (Denní volání 1.1) — karta v sekci "Dnes vyřízeno".
// Výsledek/poznámka/změna fáze/další kontakt jsou SNAPSHOT z okamžiku
// vyřízení (viz DoneTodayItem v dailyCalls.ts — čteno z metadat té
// konkrétní resulting_activity_id), jméno a telefon jsou aktuální.
export default function DoneTodayCard({ item }: { item: DoneTodayItem }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const ctx = useDailyCallOutcomeContext();
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ctx?.registerRef(item.id, ref.current);
    return () => ctx?.registerRef(item.id, null);
  }, [ctx, item.id]);

  const highlighted = ctx?.highlightId === item.id;

  return (
    <article
      ref={ref as React.RefObject<HTMLElement>}
      className={`bg-white border rounded-xl p-4 flex flex-col gap-2 ${
        highlighted ? "border-begina-primary-700 ring-2 ring-begina-primary-200" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-begina-primary-900">{item.displayName}</p>
          {item.contactPhone && <p className="text-xs text-neutral-500">{item.contactPhone}</p>}
        </div>
        <p className="text-xs text-neutral-400 whitespace-nowrap">{formatCzechDateTime(item.doneAt)}</p>
      </div>

      {item.result && (
        <p className="text-sm text-begina-primary-900 font-medium">{CALL_RESULT_LABELS[item.result]}</p>
      )}
      {item.note && <p className="text-sm text-neutral-700 whitespace-pre-wrap">{item.note}</p>}
      {item.stageTo && (
        <p className="text-xs text-neutral-500">
          Posun fáze{item.stageFrom ? ` z „${STAGE_LABELS[item.stageFrom]}“` : ""} na „{STAGE_LABELS[item.stageTo]}“
        </p>
      )}
      {item.nextFollowUpAt && (
        <p className="text-xs font-medium text-begina-primary-700">
          Zavolat znovu {formatCzechDateTime(item.nextFollowUpAt)}
        </p>
      )}

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium text-begina-primary-700 self-start"
      >
        {expanded ? "Skrýt historii" : "Zobrazit historii"}
      </button>
      {expanded && (
        <div id={panelId}>
          <ActivityList entries={item.activity} />
        </div>
      )}
    </article>
  );
}
