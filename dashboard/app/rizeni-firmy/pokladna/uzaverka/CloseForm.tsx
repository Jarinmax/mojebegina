"use client";

import { useActionState } from "react";
import { closeDayAction, type FormState } from "../actions";

export default function CloseForm({ expectedCash }: { expectedCash: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeDayAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="text-sm">
        Hotovost v kase (podle pokladny má být {expectedCash})
        <input name="cashCounted" inputMode="decimal" placeholder="spočítaná částka, nepovinné" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-lg" />
      </label>
      <input name="note" placeholder="Poznámka k dni (nepovinné)" className="px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      <button disabled={pending} className="self-start rounded-full bg-begina-primary-900 text-white px-5 py-2 text-sm font-medium disabled:opacity-50">
        {pending ? "Uzavírám…" : "Uzavřít den"}
      </button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}
    </form>
  );
}
