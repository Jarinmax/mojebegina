"use client";

import { useActionState } from "react";
import { publishDraftAction, type ActionState } from "./actions";

const initialState: ActionState = null;

// Security Phase 19 — stejná oprava jako CuratorItemControls/
// GenerateCandidatesButton: viditelná odezva + ochrana proti dvojkliku.
export default function PublishDraftButton() {
  const [state, formAction, pending] = useActionState(publishDraftAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Zveřejňuji…" : "Zveřejnit návrh"}
        </button>
      </form>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-700">{state.success}</p>}
    </div>
  );
}
