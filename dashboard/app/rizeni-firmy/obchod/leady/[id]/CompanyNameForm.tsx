"use client";

import { useActionState } from "react";
import { updateLeadCompanyNameAction, type ActionState } from "../../actions";

const initialState: ActionState = null;

// Security Phase 16.1 — companyName je nullable (viz schema.ts), tenhle
// formulář ho doplní, jakmile Jarda při hovoru zjistí skutečný název
// firmy/provozovny. Jedno pole, jeden submit.
export default function CompanyNameForm({
  leadId,
  companyName,
}: {
  leadId: string;
  companyName: string | null;
}) {
  const boundAction = updateLeadCompanyNameAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="companyName"
        type="text"
        defaultValue={companyName ?? ""}
        placeholder="Název firmy/provozovny…"
        className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "Ukládám…" : "Uložit"}
      </button>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </form>
  );
}
