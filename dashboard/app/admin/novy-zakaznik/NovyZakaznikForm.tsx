"use client";

import { useActionState } from "react";
import { createCustomerAction, type NovyZakaznikState } from "./actions";

const initialState: NovyZakaznikState = null;

export default function NovyZakaznikForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);

  return (
    <form action={formAction} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-xs text-neutral-500 mb-1 block">
          Název firmy
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
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
          required
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
          required
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
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
        <p className="text-xs text-neutral-400 mt-1">
          Na tenhle e-mail přijde odkaz na nastavení hesla. Heslo tady nezadáváte.
        </p>
      </div>

      {state?.error && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg py-2.5 disabled:opacity-50"
      >
        {pending ? "Zakládám…" : "Založit zákazníka"}
      </button>
    </form>
  );
}
