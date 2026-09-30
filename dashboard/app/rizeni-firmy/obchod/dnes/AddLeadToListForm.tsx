"use client";

import { useActionState } from "react";
import { addManualCandidateAction, type ActionState } from "./actions";
import type { LeadOption } from "@/lib/data/dailyCalls";

const initialState: ActionState = null;

// Security Phase 19 (Denní volání 1.0) — ruční přidání kurátorem. Přidaný
// lead vznikne jako DRAFT (published_at NULL) — schváleno explicitně,
// oprava zveřejněné fronty je "odebrat → přidat náhradu do draftu →
// zveřejnit", ne okamžité zviditelnění.
//
// `isFull` jen skrývá/blokuje ovládání v UI — skutečná ochrana proti
// překročení limitu je v datové vrstvě (dailyCalls.ts:addManualCandidate
// volá canAddManualCandidate PŘED zápisem), tohle je jen lepší UX, aby
// uživatel neklikal na akci, která stejně skončí chybou.
export default function AddLeadToListForm({ options, isFull }: { options: LeadOption[]; isFull: boolean }) {
  const [state, formAction, pending] = useActionState(addManualCandidateAction, initialState);

  if (isFull) {
    return (
      <p className="text-sm text-neutral-500">
        Fronta už obsahuje maximálních 10 kontaktů. Nejdřív některý odeberte.
      </p>
    );
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
      <div className="w-full sm:w-auto sm:flex-1">
        <label htmlFor="leadId" className="text-xs text-neutral-500 mb-1 block">
          Ručně přidat kontakt do návrhu
        </label>
        <select
          id="leadId"
          name="leadId"
          defaultValue=""
          disabled={pending}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white disabled:opacity-50"
        >
          <option value="" disabled>
            Vyberte lead…
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.displayName}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {pending ? "Přidávám…" : "Přidat"}
      </button>
      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}
    </form>
  );
}
