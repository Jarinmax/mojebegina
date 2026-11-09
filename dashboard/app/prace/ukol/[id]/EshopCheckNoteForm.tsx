"use client";

import { useActionState, useEffect, useRef } from "react";
import { addEshopCheckNoteAction, type PraceActionState } from "../../actions";

// Registr „Kontrola e-shopu – Lucie“: poznámka BEZ rozhodnutí — odpověď na
// otázku, upřesnění, připomínka. Stav kontroly se nemění.
export default function EshopCheckNoteForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState<PraceActionState, FormData>(addEshopCheckNoteAction.bind(null, taskId), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "success" in state) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <label htmlFor={`note-${taskId}`} className="text-sm font-medium text-begina-primary-900">
        Poznámka bez schválení
      </label>
      <textarea
        id={`note-${taskId}`}
        name="note"
        rows={2}
        maxLength={2000}
        required
        placeholder="Odpověď, upřesnění nebo připomínka — kartu neschvaluje ani nevrací"
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-base"
      />
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit poznámku"}
      </button>
    </form>
  );
}
