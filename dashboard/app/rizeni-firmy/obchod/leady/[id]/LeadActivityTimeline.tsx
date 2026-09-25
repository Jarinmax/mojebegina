import { formatCzechDate } from "@/lib/format";
import { STAGE_LABELS } from "../../leadLabels";
import type { LeadStage } from "@/lib/data/leadValidation";
import type { LeadActivityEntry } from "@/lib/data/leads";

function describeEntry(entry: LeadActivityEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "created":
      return "založil(a) lead";
    case "stage_changed": {
      const to = String(meta.to ?? "") as LeadStage;
      return `posunul(a) fázi na „${STAGE_LABELS[to] ?? to}“`;
    }
    case "owner_assigned":
      return `přiřadil(a) obchodníka: ${String(meta.ownerName ?? meta.ownerUserId)}`;
    case "acquired_by_set":
      return `nastavil(a) původ akvizice: ${String(meta.acquiredByName ?? meta.acquiredByUserId)}`;
    case "call_logged": {
      const parts: string[] = ["zapsal(a) výsledek hovoru"];
      if (meta.stageChangedTo) {
        parts.push(`(posun na „${STAGE_LABELS[meta.stageChangedTo as LeadStage] ?? meta.stageChangedTo}“)`);
      }
      return parts.join(" ");
    }
    case "converted":
      return meta.linkedExisting
        ? "propojil(a) lead s existující organizací"
        : "založil(a) novou organizaci a převedl(a) lead na zákazníka";
    case "company_name_set":
      return meta.to ? `doplnil(a) název firmy: ${String(meta.to)}` : "smazal(a) název firmy";
    default:
      return "";
  }
}

export default function LeadActivityTimeline({ activity }: { activity: LeadActivityEntry[] }) {
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
          {entry.kind === "call_logged" && entry.body && (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
