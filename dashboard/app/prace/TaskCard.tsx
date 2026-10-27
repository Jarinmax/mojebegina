"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setWorkTaskDoneAction, type PraceActionState } from "./actions";
import type { WorkTaskTone } from "@/lib/data/workTasksValidation";

// Schválené barvy: červená urgentní / po termínu / vráceno k opravě,
// oranžová blížící se termín, modrá běžné, zelená splněné a schválené.
// „Čeká na schválení“ má vlastní sekci a neutrální tón, šedá = zrušené.
const TONE: Record<WorkTaskTone, { bar: string; bg: string; label: string }> = {
  red: { bar: "bg-red-600", bg: "bg-red-50 border-red-200", label: "text-red-700" },
  orange: { bar: "bg-orange-500", bg: "bg-orange-50 border-orange-200", label: "text-orange-700" },
  blue: { bar: "bg-blue-600", bg: "bg-white border-blue-200", label: "text-blue-700" },
  green: { bar: "bg-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "text-emerald-700" },
  grey: { bar: "bg-neutral-400", bg: "bg-neutral-50 border-neutral-200", label: "text-neutral-500" },
  waiting: { bar: "bg-slate-500", bg: "bg-slate-50 border-slate-300", label: "text-slate-700" },
};

/**
 * Co dělá tlačítko na kartě:
 *  "done"   — rovnou splnit (úkol bez fotky a bez schválení)
 *  "submit" — odeslat ke kontrole (úkol se schválením, bez fotky)
 *  "photos" — otevřít detail a přiložit fotky (úkol s fotografií)
 *  "reopen" — vrátit splněný úkol mezi nesplněné
 *  "none"   — žádné tlačítko (čeká na schválení, zrušeno)
 */
export type TaskCardAction = "done" | "submit" | "photos" | "reopen" | "none";

export type TaskCardData = {
  id: string;
  title: string;
  description: string | null;
  assigneeName: string;
  dueLabel: string | null;
  urgent: boolean;
  done: boolean;
  cancelled: boolean;
  doneLabel: string | null;
  tone: WorkTaskTone;
  toneLabel: string;
  history: string[];
  action?: TaskCardAction;
  /** Červený důvod vrácení k opravě. */
  alert?: string | null;
  /** Drobná poznámka (např. „Fotografie povinná · 2 fotky“). */
  note?: string | null;
};

const BUTTON_LABEL: Record<TaskCardAction, string> = {
  done: "Splněno",
  submit: "Odeslat ke kontrole",
  photos: "Přiložit fotky",
  reopen: "Vrátit",
  none: "",
};

export default function TaskCard({ task, showAssignee }: { task: TaskCardData; showAssignee: boolean }) {
  const action: TaskCardAction = task.action ?? (task.cancelled ? "none" : task.done ? "reopen" : "done");
  const formAction = setWorkTaskDoneAction.bind(null, task.id, action !== "reopen");
  const [state, dispatch, pending] = useActionState<PraceActionState, FormData>(formAction, null);
  const tone = TONE[task.tone];
  const primary = "min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

  return (
    <article className={`relative overflow-hidden rounded-xl border ${tone.bg} pl-4 pr-3 py-3`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        {/* Klepnutí na úkol otevře detail (běžný odkaz, žádné podržení prstu). */}
        <Link href={`/prace/ukol/${task.id}`} className="min-w-0 flex-1 block -my-1 py-1">
          <p className={`text-xs font-medium ${tone.label}`}>
            {task.toneLabel}
            {task.dueLabel ? ` · ${task.dueLabel}` : ""}
            {showAssignee ? ` · ${task.assigneeName}` : ""}
          </p>
          <h3 className={`text-base font-medium text-begina-primary-900 ${task.done || task.cancelled ? "line-through opacity-70" : ""}`}>
            {task.title}
          </h3>
          {task.alert && <p className="text-sm font-medium text-red-700 mt-0.5">{task.alert}</p>}
          {task.description && <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5 line-clamp-3">{task.description}</p>}
          {task.note && <p className="text-xs text-neutral-500 mt-1">{task.note}</p>}
          {task.doneLabel && <p className="text-xs text-emerald-700 mt-1">{task.doneLabel}</p>}
          <span className="text-xs text-blue-700 mt-1 inline-block">Detail ›</span>
        </Link>
        {action === "photos" && (
          <Link href={`/prace/ukol/${task.id}`} className={`${primary} shrink-0 bg-blue-600 inline-flex items-center`}>
            {BUTTON_LABEL.photos}
          </Link>
        )}
        {(action === "done" || action === "submit" || action === "reopen") && (
          <form action={dispatch} className="shrink-0">
            <button
              type="submit"
              disabled={pending}
              className={
                action === "reopen"
                  ? "text-xs font-medium text-neutral-500 underline px-1 py-2"
                  : `${primary} ${action === "submit" ? "bg-slate-700" : "bg-emerald-600"}`
              }
            >
              {pending ? "Ukládám…" : BUTTON_LABEL[action]}
            </button>
          </form>
        )}
      </div>
      {state && "error" in state && <p className="text-sm text-red-700 mt-1">{state.error}</p>}
      {task.history.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-neutral-500 cursor-pointer">Historie</summary>
          <ul className="mt-1 space-y-0.5">
            {task.history.map((h, i) => (
              <li key={i} className="text-xs text-neutral-500">{h}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
