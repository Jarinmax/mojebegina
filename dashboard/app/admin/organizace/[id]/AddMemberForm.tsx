"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addMemberAction, type ActionState } from "./actions";

type Props = {
  organizationId: string;
};

const initialState: ActionState = null;

export default function AddMemberForm({ organizationId }: Props) {
  const [open, setOpen] = useState(false);
  const boundAction = addMemberAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2"
      >
        Přidat uživatele
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      autoComplete="off"
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 mb-4"
    >
      <div>
        <label htmlFor="member-name" className="text-xs text-neutral-500 mb-1 block">
          Jméno
        </label>
        <input
          id="member-name"
          name="name"
          type="text"
          autoComplete="off"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
      <div>
        <label htmlFor="member-email" className="text-xs text-neutral-500 mb-1 block">
          E-mail
        </label>
        <input
          id="member-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
        <p className="text-xs text-neutral-400 mt-1">
          Pokud tenhle e-mail už v systému existuje, jen se přidá k téhle organizaci — bez nového
          účtu a bez aktivačního e-mailu. Jinak dostane e-mail s odkazem na nastavení hesla.
        </p>
      </div>
      <div>
        <label htmlFor="member-role" className="text-xs text-neutral-500 mb-1 block">
          Role
        </label>
        <select
          id="member-role"
          name="role"
          defaultValue="member"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="member">Člen</option>
          <option value="owner">Vlastník</option>
        </select>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-begina-accent-700">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-begina-primary-900">{state.success}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Přidávám…" : "Přidat"}
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
