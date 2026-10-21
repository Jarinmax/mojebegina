"use client";

import { useActionState, useState } from "react";
import { updateLeadContactEmailAction } from "../actions";
import type { ActionState } from "../actions";

const initialState: ActionState = null;

// Jarda – volání a provize, část 1, bod 1 — e-mail přímo u kontaktu v
// Dnešním volání, bez nutnosti otevírat detail leadu. Stejný
// expand/collapse vzor jako CallOutcomeForm (dnes/CallOutcomeForm.tsx):
// collapsed stav je výchozí, "Přidat e-mail" ho rozbalí na formulář.
//
// Jakmile server akce uspěje, revalidatePath (viz ../actions.ts)
// přenačte stránku s NOVOU hodnotou `email` — tahle komponenta pak
// rovnou spadne do první (if email) větve, formulář tím zmizí automaticky
// (bez ručního resetu lokálního stavu), červené "Chybí e-mail" zmizí se
// stejnou aktualizací.
export default function LeadEmailField({ leadId, email }: { leadId: string; email: string | null }) {
  const boundAction = updateLeadContactEmailAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [expanded, setExpanded] = useState(false);

  if (email) {
    // break-all, aby i delší adresa zůstala čitelná a nerozbila layout na
    // mobilu (zadání: "zobraz celou adresu čitelně i na mobilu").
    return <p className="text-sm text-neutral-600 break-all">{email}</p>;
  }

  if (!expanded) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium text-red-600">Chybí e-mail</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-begina-primary-700 underline underline-offset-2"
        >
          Přidat e-mail
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input
        type="email"
        name="contactEmail"
        placeholder="jmeno@domena.cz"
        autoFocus
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? "Ukládám…" : "Uložit"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-medium text-neutral-500 px-3 py-1.5"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
