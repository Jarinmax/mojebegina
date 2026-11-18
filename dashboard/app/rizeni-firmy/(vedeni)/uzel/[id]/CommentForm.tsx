"use client";

import { useActionState, useState } from "react";
import { addActivityCommentAction, type ActionState } from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — přidání komentáře do timeline.
// Po úspěchu se má vyčistit textarea, ale formulář zůstat otevřený (na
// rozdíl od CreateNodeForm/ClaimButton) — proto se needsmountuje celý
// formulář, jen se přes `key` remountuje samotná textarea (resetKey trik),
// viz react-hooks/set-state-in-effect poznámka v souhrnu.
const initialState: ActionState = null;

type Props = {
  nodeId: string;
};

export default function CommentForm({ nodeId }: Props) {
  const boundComment = addActivityCommentAction.bind(null, nodeId);
  const [state, formAction, pending] = useActionState(boundComment, initialState);
  const [resetKey, setResetKey] = useState(0);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setResetKey((k) => k + 1);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        key={resetKey}
        name="body"
        required
        rows={2}
        placeholder="Napsat komentář…"
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />
      {state && "error" in state && (
        <p className="text-sm text-begina-accent-700">{state.error}</p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Odesílám…" : "Přidat komentář"}
        </button>
      </div>
    </form>
  );
}
