"use client";

import { useActionState } from "react";
import { deleteOfferAction, applyOfferPriceAction, type PriceActionState } from "../actions";
import OfferForm, { type OfferFormValues } from "./OfferForm";

export type OfferView = OfferFormValues & { id: string; unitPrice: string; inUse: boolean; isLowest: boolean };

export default function OfferRow({ offer, unitLabel, canUse }: { offer: OfferView; unitLabel: string; canUse: boolean }) {
  const [applyState, applyAction, applyPending] = useActionState<PriceActionState, FormData>(applyOfferPriceAction, null);
  const [delState, delAction, delPending] = useActionState<PriceActionState, FormData>(deleteOfferAction, null);
  const state = applyState ?? delState;
  return (
    <li className={`px-3 py-2 text-sm ${offer.inUse ? "bg-green-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {offer.url ? (
          <a href={offer.url} target="_blank" rel="noopener noreferrer" className="font-medium text-begina-primary-900 underline underline-offset-2">
            {offer.itemName} ↗
          </a>
        ) : (
          <span className="font-medium text-neutral-800">{offer.itemName}</span>
        )}
        <span className="text-neutral-600">{offer.packLabel}</span>
        <span className="text-neutral-600">
          {offer.priceKc} Kč{offer.shippingKc && offer.shippingKc !== "0" ? ` + doprava ${offer.shippingKc} Kč` : ""}
        </span>
        <span className="font-medium text-neutral-900">
          = {offer.unitPrice} {unitLabel}
        </span>
        {offer.isPromo && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">nepočítá se</span>}
        {offer.isLowest && !offer.isPromo && <span className="rounded bg-neutral-100 px-1.5 text-xs text-neutral-700">nejnižší</span>}
        {offer.inUse && <span className="rounded bg-green-100 px-1.5 text-xs text-green-800">✓ počítá se v nákladech</span>}
      </div>
      {offer.note && <div className="mt-0.5 text-xs text-neutral-500">{offer.note}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {canUse && !offer.inUse && (
          <form action={applyAction}>
            <input type="hidden" name="offerId" value={offer.id} />
            <button type="submit" disabled={applyPending} className="rounded-md border border-begina-primary-900 px-2 py-0.5 text-xs text-begina-primary-900 disabled:opacity-50">
              {applyPending ? "Počítám…" : "Počítat touto cenou"}
            </button>
          </form>
        )}
        <OfferForm values={offer} label="Upravit" />
        <form action={delAction} onSubmit={(event) => { if (!window.confirm("Smazat tuto nabídku?")) event.preventDefault(); }}>
          <input type="hidden" name="offerId" value={offer.id} />
          <button type="submit" disabled={delPending} className="text-xs text-neutral-500 underline disabled:opacity-50">Smazat</button>
        </form>
        {state && "error" in state && <span className="text-xs text-red-700">{state.error}</span>}
        {state && "success" in state && <span className="text-xs text-green-700">{state.success}</span>}
      </div>
    </li>
  );
}
