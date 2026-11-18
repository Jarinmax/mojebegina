"use client";

import { useActionState, useState } from "react";
import { updateOrderNoteAction, type ActionState } from "./actions";

const initialState: ActionState = null;

export default function NoteForm({ orderId, currentNote }: { orderId: string; currentNote: string | null }) {
  const [open, setOpen] = useState(false);
  const boundAction = updateOrderNoteAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div>
        {currentNote && <p className="text-sm text-neutral-600 whitespace-pre-wrap mb-1">{currentNote}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-begina-primary-900 hover:underline"
        >
          {currentNote ? "Upravit poznámku" : "Přidat poznámku"}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        name="body"
        rows={3}
        defaultValue={currentNote ?? ""}
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
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
