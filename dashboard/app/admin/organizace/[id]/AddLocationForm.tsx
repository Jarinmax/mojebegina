"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addLocationAction, type ActionState } from "./actions";

type Props = { organizationId: string };

export default function AddLocationForm({ organizationId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    addLocationAction.bind(null, organizationId),
    null as ActionState
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) setOpen(false);
  }

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
        Přidat provozovnu
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 mb-4"
    >
      <div>
        <label htmlFor="location-label" className="text-xs text-neutral-500 mb-1 block">Název provozovny</label>
        <input id="location-label" name="label" required className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
      </div>
      <div>
        <label htmlFor="location-street" className="text-xs text-neutral-500 mb-1 block">Ulice a číslo</label>
        <input id="location-street" name="street" required className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <div>
          <label htmlFor="location-city" className="text-xs text-neutral-500 mb-1 block">Město</label>
          <input id="location-city" name="city" required className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
        </div>
        <div>
          <label htmlFor="location-zip" className="text-xs text-neutral-500 mb-1 block">PSČ</label>
          <input id="location-zip" name="zip" inputMode="numeric" placeholder="123 45" required className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
        </div>
      </div>
      <div>
        <label htmlFor="location-contact-name" className="text-xs text-neutral-500 mb-1 block">Kontaktní osoba</label>
        <input id="location-contact-name" name="contactName" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
      </div>
      <div>
        <label htmlFor="location-contact-phone" className="text-xs text-neutral-500 mb-1 block">Telefon</label>
        <input id="location-contact-phone" name="contactPhone" type="tel" className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm" />
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50">
          {pending ? "Ukládám…" : "Uložit provozovnu"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-sm font-medium text-neutral-600 px-4 py-2">Zrušit</button>
      </div>
    </form>
  );
}
