"use client";

import { useActionState } from "react";
import { importMetaLeadsNowAction, type ActionState } from "./actions";

// Ruční načtení leadů z formuláře Meta (jinak automaticky několikrát denně).
export default function MetaImportButton() {
  const [state, action, pending] = useActionState<ActionState>(importMetaLeadsNowAction, null);
  return (
    <form action={action} className="mt-3 flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-lg border border-begina-primary-200 bg-white px-4 text-sm font-medium text-begina-primary-900 disabled:opacity-50"
      >
        {pending ? "Načítám…" : "Načíst leady z Mety teď"}
      </button>
      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
