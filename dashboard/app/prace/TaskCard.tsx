"use client";

import { useActionState } from "react";
import { setWorkTaskDoneAction, type PraceActionState } from "./actions";
import type { WorkTaskTone } from "@/lib/data/workTasksValidation";

// Schválené barvy: červená urgentní / po termínu, oranžová blížící se
// termín, modrá běžné, zelená splněné.
const TONE: Record<WorkTaskTone, { bar: string; bg: string; label: string }> = {
  red: { bar: "bg-red-600", bg: "bg-red-50 border-red-200", label: "text-red-700" },
  orange: { bar: "bg-orange-500", bg: "bg-orange-50 border-orange-200", label: "text-orange-700" },
  blue: { bar: "bg-blue-600", bg: "bg-white border-blue-200", label: "text-blue-700" },
  green: { bar: "bg-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "text-emerald-700" },
};

export type TaskCardData = {
  id: string;
  title: string;
  description: string | null;
  assigneeName: string;
  dueLabel: string | null;
  urgent: boolean;
  done: boolean;
  doneLabel: string | null;
  tone: WorkTaskTone;
  toneLabel: string;
  history: string[];
};

export default function TaskCard({ task, showAssignee }: { task: TaskCardData; showAssignee: boolean }) {
  const action = setWorkTaskDoneAction.bind(null, task.id, !task.done);
  const [state, formAction, pending] = useActionState<PraceActionState, FormData>(action, null);
  const tone = TONE[task.tone];

  return (
    <article className={`relative overflow-hidden rounded-xl border ${tone.bg} pl-4 pr-3 py-3`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-medium ${tone.label}`}>
            {task.toneLabel}
            {task.dueLabel ? ` · ${task.dueLabel}` : ""}
            {showAssignee ? ` · ${task.assigneeName}` : ""}
          </p>
          <h3 className={`text-base font-medium text-begina-primary-900 ${task.done ? "line-through opacity-70" : ""}`}>{task.title}</h3>
          {task.description && <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{task.description}</p>}
          {task.doneLabel && <p className="text-xs text-emerald-700 mt-1">{task.doneLabel}</p>}
        </div>
        <form action={formAction} className="shrink-0">
          <button
            type="submit"
            disabled={pending}
            className={
              task.done
                ? "text-xs font-medium text-neutral-500 underline px-1 py-2"
                : "min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            }
          >
            {pending ? "Ukládám…" : task.done ? "Vrátit" : "Splněno"}
          </button>
        </form>
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
