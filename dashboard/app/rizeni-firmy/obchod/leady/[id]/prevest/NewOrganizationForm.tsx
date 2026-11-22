"use client";

import { useActionState } from "react";
import { convertLeadToNewOrganizationAction, type ActionState } from "../../../actions";
import AresCompanyFields from "../../../AresCompanyFields";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  defaultName: string;
  defaultIco: string;
  defaultAddress: string;
  defaultContactName: string;
  defaultContactEmail: string;
};

const inputClass = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900";

// Jarin 22. 11. 2026: název, IČO a sídlo se předvyplní z leadu (doplňuje je
// obchodník v detailu leadu) a z ARES. Kontakt a e-mail jsou z leadu — ARES
// je neobsahuje. Vše jde dál ručně upravit.
export default function NewOrganizationForm({
  leadId,
  defaultName,
  defaultIco,
  defaultAddress,
  defaultContactName,
  defaultContactEmail,
}: Props) {
  const boundAction = convertLeadToNewOrganizationAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
      <AresCompanyFields
        defaultName={defaultName}
        defaultIco={defaultIco}
        defaultAddress={defaultAddress}
        names={{ name: "name", ico: "ico", address: "registeredAddress" }}
        required
      />

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
          className={inputClass}
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
          className={inputClass}
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
