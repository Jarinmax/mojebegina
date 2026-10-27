// Práce 1.1 — sdílené popisky pro seznam i detail úkolu (čisté, bez I/O).
import { WORK_ASSIGNEES } from "@/lib/data/workTasksAuth";
import type { WorkTaskHistoryEntry } from "@/lib/data/workTasks";

const PRAGUE_TIME = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const fmtDateTime = (d: Date) => PRAGUE_TIME.format(d);
export const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
};

export const PRIORITY_LABEL: Record<string, string> = { normal: "běžná", urgent: "urgentní" };
const FIELD_LABEL: Record<string, string> = {
  title: "název",
  description: "popis",
  dueDate: "termín",
  photoRequirement: "fotografie",
  requiresApproval: "schválení",
};
export const PHOTO_REQUIREMENT_LABEL: Record<string, string> = { none: "nevyžadována", required: "povinná", optional: "volitelná" };

const personName = (userId: unknown) =>
  typeof userId === "string" ? (WORK_ASSIGNEES.find((a) => a.userId === userId)?.name ?? userId) : "—";

function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "dueDate" && typeof value === "string") return fmtDay(value);
  if (field === "photoRequirement" && typeof value === "string") return PHOTO_REQUIREMENT_LABEL[value] ?? value;
  if (field === "requiresApproval") return String(value);
  return `„${String(value)}“`;
}

export function historyText(h: WorkTaskHistoryEntry): string {
  const meta = (h.metadata ?? {}) as Record<string, unknown>;
  let what: string;
  switch (h.kind) {
    case "created":
      what = "zadáno";
      break;
    case "done":
      what = "splněno";
      break;
    case "reopened":
      what = "vráceno mezi nesplněné";
      break;
    case "priority_changed":
      what = `priorita: ${PRIORITY_LABEL[String(meta.from)] ?? meta.from} → ${PRIORITY_LABEL[String(meta.to)] ?? meta.to}`;
      break;
    case "reassigned":
      what = `přeřazeno: ${personName(meta.from)} → ${personName(meta.to)}`;
      break;
    case "cancelled":
      what = meta.reason ? `zrušeno (důvod: ${String(meta.reason)})` : "zrušeno";
      break;
    case "photo_added":
      what = "přidána fotografie";
      break;
    case "photo_removed":
      what = "odstraněna fotografie";
      break;
    case "submitted":
      what = `odesláno ke kontrole${typeof meta.photos === "number" && meta.photos > 0 ? ` (${meta.photos} fot.)` : ""}`;
      break;
    case "approved":
      what = "schváleno";
      break;
    case "returned":
      what = `vráceno k opravě (důvod: ${String(meta.reason ?? "—")})`;
      break;
    case "updated": {
      const changes = (meta.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      const parts = Object.entries(changes).map(([field, c]) =>
        field === "description" ? "popis změněn" : `${FIELD_LABEL[field] ?? field} ${fieldValue(field, c.from)} → ${fieldValue(field, c.to)}`
      );
      what = `upraveno: ${parts.join("; ") || "zadání"}`;
      break;
    }
    default:
      what = h.kind;
  }
  return `${fmtDateTime(h.createdAt)} — ${what} (${h.actorName ?? "—"})`;
}
