"use client";

import { useActionState } from "react";
import { markAcquisitionBonusPaidAction, type ActionState } from "../../actions";

const initialState: ActionState = null;

export default function MarkBonusPaidForm({ organizationId }: { organizationId: string }) {
  const bound = markAcquisitionBonusPaidAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(bound, initialState);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-1.5 disabled:opacity-50"
      >
        Vyplatit bonus
      </button>
      {state && "error" in state && <p className="text-xs text-begina-accent-700 mt-1">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-neutral-500 mt-1">{state.success}</p>}
    </form>
  );
}
