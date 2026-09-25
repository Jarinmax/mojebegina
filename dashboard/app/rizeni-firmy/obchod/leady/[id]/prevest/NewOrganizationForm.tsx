"use client";

import { useActionState } from "react";
import { convertLeadToNewOrganizationAction, type ActionState } from "../../../actions";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  defaultName: string;
  defaultIco: string;
  defaultContactName: string;
  defaultContactEmail: string;
};

export default function NewOrganizationForm({
  leadId,
  defaultName,
  defaultIco,
  defaultContactName,
  defaultContactEmail,
}: Props) {
  const boundAction = convertLeadToNewOrganizationAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-xs text-neutral-500 mb-1 block">
          Název firmy
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          required
          defaultValue={defaultName}
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
          autoComplete="off"
          required
          defaultValue={defaultIco}
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
          autoComplete="off"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div>
        <label htmlFor="contactName" className="text-xs text-neutral-500 mb-1 block">
          Jméno kontaktní osoby
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          autoComplete="off"
          required
          defaultValue={defaultContactName}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div>
        <label htmlFor="contactEmail" className="text-xs text-neutral-500 mb-1 block">
          E-mail kontaktní osoby
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          autoComplete="off"
          required
          defaultValue={defaultContactEmail}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
        <p className="text-xs text-neutral-400 mt-1">
          Založí organizaci a uživatele bez odeslání e-mailu — pozvánku pošlete později v Adminu.
        </p>
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Zakládám…" : "Založit jako novou organizaci a převést lead"}
      </button>
    </form>
  );
}
