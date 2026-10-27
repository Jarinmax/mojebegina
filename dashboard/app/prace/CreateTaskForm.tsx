"use client";

import { useActionState } from "react";
import { createWorkTaskAction, type PraceActionState } from "./actions";

export default function CreateTaskForm({ assignees, today }: { assignees: ReadonlyArray<{ userId: string; name: string }>; today: string }) {
  const [state, formAction, pending] = useActionState<PraceActionState, FormData>(createWorkTaskAction, null);
  const input = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-base text-begina-primary-900 bg-white";
  return (
    <details className="rounded-xl border border-neutral-200 bg-white px-4 py-3" open={false}>
      <summary className="text-sm font-medium text-begina-primary-900 cursor-pointer">+ Zadat úkol</summary>
      <form action={formAction} className="flex flex-col gap-3 mt-3">
        <input name="title" required maxLength={200} placeholder="Název úkolu" className={input} aria-label="Název úkolu" />
        <textarea name="description" rows={2} maxLength={2000} placeholder="Popis (nepovinné)" className={input} aria-label="Popis" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-neutral-500">
            Komu
            <select name="assigneeUserId" defaultValue={assignees[0]?.userId} className={`${input} mt-1`}>
              {assignees.map((a) => (
                <option key={a.userId} value={a.userId}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-500">
            Termín (den)
            <input type="date" name="dueDate" defaultValue={today} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="text-xs text-neutral-500">
          Priorita
          <select name="priority" defaultValue="normal" className={`${input} mt-1`}>
            <option value="normal">Běžná</option>
            <option value="urgent">Urgentní</option>
          </select>
        </label>
        {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
        {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
          {pending ? "Ukládám…" : "Zadat úkol"}
        </button>
      </form>
    </details>
  );
}
