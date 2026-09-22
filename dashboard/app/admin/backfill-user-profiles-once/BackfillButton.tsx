"use client";

import { useActionState } from "react";
import { runBackfillAction, type BackfillActionState } from "./actions";

const initialState: BackfillActionState = null;

export default function BackfillButton() {
  const [state, formAction, pending] = useActionState(runBackfillAction, initialState);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
        >
          {pending ? "Spouštím…" : "Spustit backfill"}
        </button>
      </form>

      {state && "error" in state && (
        <p className="text-sm text-begina-accent-700">{state.error}</p>
      )}

      {state && "summary" in state && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-begina-primary-900">
          <p>Nalezeno Auth uživatelů: {state.summary.authUsersScanned}</p>
          <p>Kandidátů (userId z memberships/owner): {state.summary.candidateUserIds}</p>
          <p>Vytvořeno/aktualizováno profilů: {state.summary.upserted}</p>
          <p>Nedohledáno v Auth: {state.summary.notFoundInAuth.length}</p>
          {state.summary.notFoundInAuth.length > 0 && (
            <ul className="text-xs text-neutral-500 list-disc list-inside mt-1">
              {state.summary.notFoundInAuth.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
