"use client";

import { useActionState, useState } from "react";
import { createNodeAction, type ActionState } from "./node-actions";

// Security Phase 12 (Řízení firmy 2.0) — formulář na vytvoření uzlu,
// stejný vzor jako CompanyNoteForm.tsx. Používá se jak na /rizeni-firmy
// (parentId = null, nová Oblast), tak v detailu uzlu (nový podřízený uzel).
const initialState: ActionState = null;

type Props = {
  parentId: string | null;
  label: string;
};

export default function CreateNodeForm({ parentId, label }: Props) {
  const [open, setOpen] = useState(false);
  const boundCreate = createNodeAction.bind(null, parentId);
  const [state, formAction, pending] = useActionState(boundCreate, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 mb-2"
    >
      <div>
        <label htmlFor="node-title" className="text-xs text-neutral-500 mb-1 block">
          Název
        </label>
        <input
          id="node-title"
          name="title"
          type="text"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="node-description" className="text-xs text-neutral-500 mb-1 block">
          Popis (nepovinné)
        </label>
        <textarea
          id="node-description"
          name="description"
          rows={3}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="node-priority" className="text-xs text-neutral-500 mb-1 block">
          Priorita
        </label>
        <select
          id="node-priority"
          name="priority"
          defaultValue="medium"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="low">Nízká</option>
          <option value="medium">Střední</option>
          <option value="high">Vysoká</option>
          <option value="critical">Kritická</option>
        </select>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-begina-accent-700">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Ukládám…" : "Uložit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm font-medium text-neutral-600 px-4 py-2"
        >
          Zavřít
        </button>
      </div>
    </form>
  );
}
