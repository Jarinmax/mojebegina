"use client";

import { useActionState } from "react";
import { unassignOwnerAction, type ActionState } from "../../node-actions";

const initialState: ActionState = null;

type Props = {
  nodeId: string;
  ownerName: string;
};

export default function UnassignOwnerButton({ nodeId, ownerName }: Props) {
  const boundUnassign = unassignOwnerAction.bind(null, nodeId);
  const [state, formAction, pending] = useActionState(boundUnassign, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Odebrat odpovědnou osobu (${ownerName}) u tohoto uzlu?`)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-begina-accent-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Odebírám…" : "Odebrat"}
      </button>
      {state && "error" in state && (
        <p className="text-xs text-begina-accent-700 mt-1">{state.error}</p>
      )}
    </form>
  );
}
