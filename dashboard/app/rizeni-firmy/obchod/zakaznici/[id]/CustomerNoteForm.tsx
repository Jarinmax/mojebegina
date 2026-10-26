"use client";

import { useActionState } from "react";
import { addCustomerNoteAction, type ActionState } from "../../actions";

const initialState: ActionState = null;

// GPT/MCP pilot — poznámka u zákazníka (organization_activity). Stejnou
// poznámku může zapsat i asistent v ChatGPT; v historii ho pozná podle
// jména autora s příponou „(přes ChatGPT)“.
export default function CustomerNoteForm({ organizationId }: { organizationId: string }) {
  const boundAction = addCustomerNoteAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        name="body"
        rows={2}
        maxLength={2000}
        placeholder="Poznámka k zákazníkovi…"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "Ukládám…" : "Uložit poznámku"}
        </button>
        {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
        {state && "success" in state && <p className="text-xs text-neutral-500">{state.success}</p>}
      </div>
    </form>
  );
}
