"use client";

import { useActionState, useRef, useState } from "react";
import OrganizationSummaryView from "@/components/organization/OrganizationSummaryView";
import { updateOrganizationAction, type ActionState } from "./actions";

type Props = {
  organizationId: string;
  name: string;
  ico: string;
  registeredAddress: string;
  status: string | null;
};

const initialState: ActionState = null;

export default function OrganizationEditForm({
  organizationId,
  name,
  ico,
  registeredAddress,
  status,
}: Props) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateOrganizationAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Zavření formuláře po úspěšném uložení — úprava stavu při změně
  // `state` (ne v useEffect, viz react-hooks/set-state-in-effect) podle
  // doporučeného Reactího vzoru "Adjusting state when a prop changes".
  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-5">
        {state && "success" in state && (
          <p className="text-sm text-begina-primary-900 mb-3">{state.success}</p>
        )}
        <OrganizationSummaryView
          ico={ico}
          registeredAddress={registeredAddress}
          status={status}
          editAction={
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-begina-primary-900 hover:underline shrink-0 ml-4"
            >
              Upravit
            </button>
          }
        />
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 mb-5 flex flex-col gap-3"
    >
      <div>
        <label htmlFor="name" className="text-xs text-neutral-500 mb-1 block">
          Název firmy
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          autoComplete="off"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="ico" className="text-xs text-neutral-500 mb-1 block">
          IČO
        </label>
        <input
          id="ico"
          name="ico"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{8}"
          maxLength={8}
          defaultValue={ico}
          required
          autoComplete="off"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="registeredAddress" className="text-xs text-neutral-500 mb-1 block">
          Adresa sídla
        </label>
        <input
          id="registeredAddress"
          name="registeredAddress"
          type="text"
          defaultValue={registeredAddress}
          required
          autoComplete="off"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="status" className="text-xs text-neutral-500 mb-1 block">
          Status
        </label>
        <input
          id="status"
          name="status"
          type="text"
          defaultValue={status ?? ""}
          autoComplete="off"
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
          {pending ? "Ukládám…" : "Uložit"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-sm font-medium text-neutral-600 px-4 py-2"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
