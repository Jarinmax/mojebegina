// Práce 2.0 — převod úkolu na data karty (sdílené seznamem i detailem).
import type { WorkTaskView } from "@/lib/data/workTasks";
import { workTaskTone, type WorkTaskTone } from "@/lib/data/workTasksValidation";
import type { TaskCardAction, TaskCardData } from "./TaskCard";
import { fmtDateTime, fmtDay, historyText, PHOTO_REQUIREMENT_LABEL } from "./workTaskLabels";

function shift(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  if (due === today) return "termín dnes";
  if (due === shift(today, 1)) return "termín zítra";
  if (due < today) return `termín byl ${fmtDay(due)}`;
  return `termín ${fmtDay(due)}`;
}

export function toneLabel(tone: WorkTaskTone, t: WorkTaskView): string {
  switch (tone) {
    case "grey":
      return "Zrušeno";
    case "waiting":
      return "Čeká na schválení";
    case "green":
      return t.approvedAt ? "Schváleno" : "Splněno";
    case "red":
      return t.status === "returned" ? "Vráceno k opravě" : t.priority === "urgent" ? "Urgentní" : "Po termínu";
    case "orange":
      return "Blíží se termín";
    default:
      return "Běžný úkol";
  }
}

function cardAction(t: WorkTaskView, isManager: boolean, place: "list" | "detail"): TaskCardAction {
  if (t.status === "cancelled" || t.status === "submitted") return "none";
  if (t.status === "done") return isManager || !t.requiresApproval ? "reopen" : "none";
  if (place === "detail") return "none"; // na detailu má dokončení vlastní tlačítko s fotkami
  if (t.photoRequirement !== "none") return "photos";
  return t.requiresApproval ? "submit" : "done";
}

export function toCard(t: WorkTaskView, today: string, isManager: boolean, place: "list" | "detail" = "list"): TaskCardData {
  const tone = workTaskTone(t, today);
  const notes: string[] = [];
  if (t.photoRequirement !== "none") {
    notes.push(`Fotografie ${PHOTO_REQUIREMENT_LABEL[t.photoRequirement]} · ${t.photos.length} fot.`);
  }
  if (t.requiresApproval) notes.push("Vyžaduje schválení");
  let doneLabel: string | null = null;
  if (t.doneAt) {
    doneLabel = `Splnil(a) ${t.doneByName ?? "—"} · ${fmtDateTime(t.doneAt)}`;
    if (t.approvedAt) doneLabel += ` · schválil(a) ${t.approvedByName ?? "—"}`;
  } else if (t.cancelledAt) {
    doneLabel = `Zrušil(a) ${t.cancelledByName ?? "—"} · ${fmtDateTime(t.cancelledAt)}`;
  } else if (t.status === "submitted" && t.submittedAt) {
    doneLabel = `Odeslal(a) ${t.submittedByName ?? "—"} · ${fmtDateTime(t.submittedAt)}`;
  }
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeName: t.assigneeName,
    dueLabel: dueLabel(t.dueDate, today),
    urgent: t.priority === "urgent",
    done: t.status === "done",
    cancelled: t.status === "cancelled",
    doneLabel,
    tone,
    toneLabel: toneLabel(tone, t),
    history: place === "list" ? t.history.map(historyText) : [],
    action: cardAction(t, isManager, place),
    alert: t.status === "returned" && t.returnReason ? `Vráceno k opravě: ${t.returnReason}` : null,
    note: notes.length ? notes.join(" · ") : null,
  };
}
