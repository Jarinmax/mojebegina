"use client";

import { useId } from "react";
import DoneTodayCard from "./DoneTodayCard";
import type { DoneTodayItem } from "@/lib/data/dailyCalls";

// Security Phase 21 (Denní volání 1.1) — bod 4/5 schváleného zadání:
// sbalená/kompaktní ve výchozím stavu, jedno kliknutí ji rozbalí. Otevřený
// stav je ŘÍZENÝ (open/onToggle) z nadřazeného DailyCallsWorkArea, aby se
// po uložení výsledku nebo po deep-linku na dnes vyřízenou položku mohla
// otevřít automaticky.
export default function DoneTodaySection({
  items,
  open,
  onToggle,
}: {
  items: DoneTodayItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex items-center justify-between w-full text-sm font-medium text-begina-primary-900 mb-2"
      >
        <span>Dnes vyřízeno ({items.length})</span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2">
          {items.map((item) => (
            <DoneTodayCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
