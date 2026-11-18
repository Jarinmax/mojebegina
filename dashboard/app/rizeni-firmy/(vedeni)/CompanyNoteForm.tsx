"use client";

import { useActionState, useState } from "react";
import { addCompanyNoteAction, type ActionState } from "./actions";

const initialState: ActionState = null;

export default function CompanyNoteForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addCompanyNoteAction, initialState);

  // Zavření formuláře po úspěšném uložení — úprava stavu při změně `state`
  // (ne v useEffect, viz react-hooks/set-state-in-effect), stejný vzor
  // jako OrganizationEditForm.tsx. Formulář se tím odmountuje, takže není
  // potřeba ho zvlášť resetovat — příště se otevře prázdný.
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
        Přidat zápis
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 mb-2"
    >
      <div>
        <label htmlFor="note-title" className="text-xs text-neutral-500 mb-1 block">
          Název
        </label>
        <input
          id="note-title"
          name="title"
          type="text"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="note-body" className="text-xs text-neutral-500 mb-1 block">
          Text
        </label>
        <textarea
          id="note-body"
          name="body"
          required
          rows={4}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
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
