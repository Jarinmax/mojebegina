"use client";

import { useActionState } from "react";
import { updateWorkTaskAction, type PraceActionState } from "../../actions";

type Props = {
  taskId: string;
  assignees: ReadonlyArray<{ userId: string; name: string }>;
  initial: { title: string; description: string | null; assigneeUserId: string; dueDate: string | null; priority: string };
};

// Práce 1.1 — úprava zadání (jen vedoucí; server to ověřuje znovu).
export default function EditTaskForm({ taskId, assignees, initial }: Props) {
  const [state, formAction, pending] = useActionState<PraceActionState, FormData>(updateWorkTaskAction.bind(null, taskId), null);
  const input = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-base text-begina-primary-900 bg-white";
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="text-xs text-neutral-500">
        Název
        <input name="title" required maxLength={200} defaultValue={initial.title} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-neutral-500">
        Popis
        <textarea name="description" rows={3} maxLength={2000} defaultValue={initial.description ?? ""} className={`${input} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">
          Komu
          <select name="assigneeUserId" defaultValue={initial.assigneeUserId} className={`${input} mt-1`}>
            {assignees.map((a) => (
              <option key={a.userId} value={a.userId}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          Termín (den)
          <input type="date" name="dueDate" defaultValue={initial.dueDate ?? ""} className={`${input} mt-1`} />
        </label>
      </div>
      <label className="text-xs text-neutral-500">
        Priorita
        <select name="priority" defaultValue={initial.priority} className={`${input} mt-1`}>
          <option value="normal">Běžná</option>
          <option value="urgent">Urgentní</option>
        </select>
      </label>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit změny"}
      </button>
    </form>
  );
}
