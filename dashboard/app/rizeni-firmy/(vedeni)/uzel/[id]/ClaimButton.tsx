"use client";

import { useActionState, useState } from "react";
import { offerClaimAction, type ActionState } from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — "Nabídnout se k převzetí", vždy
// vázané na skutečnou přihlášenou identitu (viz offerClaim v
// companyNodes.ts). ADMIN/EXECUTIVE nabídku pak potvrdí v ActivityTimeline.
const initialState: ActionState = null;

type Props = {
  nodeId: string;
};

export default function ClaimButton({ nodeId }: Props) {
  const [open, setOpen] = useState(false);
  const boundOffer = offerClaimAction.bind(null, nodeId);
  const [state, formAction, pending] = useActionState(boundOffer, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-begina-primary-900 hover:underline"
      >
        Nabídnout se k převzetí
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3"
    >
      <div>
        <label htmlFor="claim-body" className="text-xs text-neutral-500 mb-1 block">
          Poznámka (nepovinné)
        </label>
        <textarea
          id="claim-body"
          name="body"
          rows={2}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-begina-accent-700">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Odesílám…" : "Nabídnout se"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm font-medium text-neutral-600 px-4 py-2"
        >
          Zavřít
        </button>
      </div>
    </form>
  );
}
