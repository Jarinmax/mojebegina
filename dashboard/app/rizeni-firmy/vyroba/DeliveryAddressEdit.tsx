"use client";

import { useActionState, useState } from "react";
import { setDeliveryAddressAction, type AddressState } from "./actions";

/** Doručovací adresa na kartě výroby — kliknutím „Upravit“ jde doplnit / opravit. */
export function DeliveryAddressEdit({ orderId, address }: { orderId: string; address: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<AddressState, FormData>(
    async (prev, formData) => {
      const next = await setDeliveryAddressAction(orderId, prev, formData);
      if (next?.saved) setEditing(false);
      return next;
    },
    null
  );

  if (!editing) {
    return (
      <p className="text-[15px] font-semibold text-begina-primary-900 break-words">
        {address ?? <span className="text-red-700">Adresa chybí</span>}{" "}
        <button type="button" onClick={() => setEditing(true)} className="ml-1 text-xs font-normal underline text-neutral-600">
          {address ? "Upravit" : "Doplnit adresu"}
        </button>
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 mt-1">
      <textarea
        name="address"
        defaultValue={address ?? ""}
        rows={2}
        required
        placeholder="Ulice a číslo, PSČ Město"
        className="w-full rounded-lg border border-neutral-300 p-2 text-[15px] text-neutral-900"
      />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-begina-primary-900 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-60">
          {pending ? "Ukládám…" : "Uložit adresu"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-neutral-300 text-sm px-3 py-1.5 text-neutral-800">
          Zrušit
        </button>
      </div>
    </form>
  );
}
