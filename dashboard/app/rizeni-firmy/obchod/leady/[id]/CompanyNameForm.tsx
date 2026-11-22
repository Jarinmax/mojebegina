"use client";

import { useActionState, useState } from "react";
import { updateLeadCompanyNameAction, type ActionState } from "../../actions";

const initialState: ActionState = null;

// Security Phase 16.1 — companyName je nullable (viz schema.ts), tenhle
// formulář ho doplní, jakmile Jarda při hovoru zjistí skutečný název
// firmy/provozovny.
//
// 22. 11. 2026 (Lucie, chyba u LumoKids): Jarin si spletl tmavé „Uložit“
// u názvu firmy s „Uložit zápis“ a zápis hovoru se ztratil. Název se proto
// ukazuje jen jako text s tlačítkem „Upravit“; pole s uložením se otevře až
// po kliknutí, a tlačítko se jmenuje „Uložit název“ (světlé, ne tmavé).
export default function CompanyNameForm({ leadId, companyName }: { leadId: string; companyName: string | null }) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateLeadCompanyNameAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await boundAction(prev, formData);
    if (result && "success" in result) setEditing(false);
    return result;
  }, initialState);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm ${companyName ? "text-begina-primary-900 font-medium" : "text-amber-800"}`}>
          {companyName ?? "Zatím neznámá"}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-begina-primary-900 underline underline-offset-2 whitespace-nowrap"
        >
          {companyName ? "Upravit" : "Doplnit název"}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        name="companyName"
        type="text"
        autoFocus
        defaultValue={companyName ?? ""}
        placeholder="Název firmy/provozovny…"
        className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-900 bg-white border border-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "Ukládám…" : "Uložit název"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500 px-2">
          Zrušit
        </button>
      </div>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </form>
  );
}
