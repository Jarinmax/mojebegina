"use client";

import { useActionState, useState } from "react";
import { setCustomerDeliveryAddressAction, type ActionState } from "../../actions";

const initialState: ActionState = null;

/** Adresy zákazníka: sídlo (na faktuře, jen čtení) a doručovací adresa (úprava). */
export default function CustomerAddressForm({
  organizationId,
  registeredAddress,
  deliveryAddress,
}: {
  organizationId: string;
  registeredAddress: string;
  deliveryAddress: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const bound = setCustomerDeliveryAddressAction.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const next = await bound(prev, formData);
    if (next && "success" in next && next.success) setEditing(false);
    return next;
  }, initialState);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-neutral-500 mb-1">Sídlo (jde na fakturu)</p>
        <p className="text-sm text-begina-primary-900">{registeredAddress}</p>
      </div>
      <div>
        <p className="text-xs text-neutral-500 mb-1">Doručovací adresa (kam vozíme)</p>
        {editing ? (
          <form action={formAction} className="flex flex-col gap-2">
            <textarea
              name="deliveryAddress"
              defaultValue={deliveryAddress ?? ""}
              rows={2}
              placeholder="Ulice a číslo, PSČ Město"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
            />
            {state && "error" in state && state.error && <p className="text-xs text-red-700">{state.error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                {pending ? "Ukládám…" : "Uložit"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm border border-neutral-200 rounded-lg px-3 py-2 text-neutral-700">
                Zrušit
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-begina-primary-900">
            {deliveryAddress ?? <span className="text-neutral-500">Stejná jako sídlo</span>}{" "}
            <button type="button" onClick={() => setEditing(true)} className="ml-1 text-xs underline text-neutral-600">
              {deliveryAddress ? "Upravit" : "Doplnit"}
            </button>
          </p>
        )}
        <p className="text-xs text-neutral-500 mt-1">Nové objednávky tohoto zákazníka ji převezmou samy.</p>
      </div>
    </div>
  );
}
