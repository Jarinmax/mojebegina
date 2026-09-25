"use client";

import { useActionState } from "react";
import { linkLeadToExistingOrganizationAction, type ActionState } from "../../../actions";
import type { OrganizationMatch } from "@/lib/data/leads";

const initialState: ActionState = null;

export default function LinkOrganizationButton({
  leadId,
  organization,
}: {
  leadId: string;
  organization: OrganizationMatch;
}) {
  const boundAction = linkLeadToExistingOrganizationAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 last:border-0">
      <input type="hidden" name="organizationId" value={organization.id} />
      <div>
        <p className="text-sm text-begina-primary-900">{organization.name}</p>
        <p className="text-xs text-neutral-500">IČO {organization.ico}</p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-900 bg-white border border-begina-primary-300 rounded-lg px-3 py-1.5 disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "Propojuji…" : "Je to ono, propojit"}
      </button>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </form>
  );
}
