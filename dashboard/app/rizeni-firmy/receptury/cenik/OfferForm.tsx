"use client";

import { useActionState } from "react";
import { saveOfferAction, type PriceActionState } from "../actions";

export type OfferFormValues = {
  id?: string;
  ingredientId: string | null;
  itemName: string;
  url: string | null;
  packLabel: string;
  packQty: string;
  priceKc: string;
  shippingKc: string;
  isPromo: boolean;
  note: string | null;
};

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900";

// Přidání / úprava nabídky dodavatele (rozbalovací formulář).
export default function OfferForm({ values, label, unitHint }: { values: OfferFormValues; label: string; unitHint?: string }) {
  const [state, action, pending] = useActionState<PriceActionState, FormData>(saveOfferAction, null);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-begina-primary-900 underline">{label}</summary>
      <form action={action} className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        {values.id && <input type="hidden" name="offerId" value={values.id} />}
        <input type="hidden" name="ingredientId" value={values.ingredientId ?? ""} />
        <label className="flex flex-col gap-0.5">Název nabídky<input name="itemName" defaultValue={values.itemName} required className={input} /></label>
        <label className="flex flex-col gap-0.5">Odkaz (https://…)<input name="url" defaultValue={values.url ?? ""} inputMode="url" className={input} /></label>
        <label className="flex flex-col gap-0.5">Balení (text, např. 5 kg / 30 ml)<input name="packLabel" defaultValue={values.packLabel} required className={input} /></label>
        <label className="flex flex-col gap-0.5">Množství v balení{unitHint ? ` (${unitHint})` : ""}<input name="packQty" defaultValue={values.packQty} inputMode="decimal" required className={input} /></label>
        <label className="flex flex-col gap-0.5">Cena balení (Kč)<input name="priceKc" defaultValue={values.priceKc} inputMode="decimal" required className={input} /></label>
        <label className="flex flex-col gap-0.5">Doprava (Kč)<input name="shippingKc" defaultValue={values.shippingKc} inputMode="decimal" className={input} /></label>
        <label className="flex flex-col gap-0.5 sm:col-span-2">Poznámka<input name="note" defaultValue={values.note ?? ""} className={input} /></label>
        <label className="flex items-center gap-1"><input type="checkbox" name="isPromo" defaultChecked={values.isPromo} /> nepočítat do nákladů (akce nebo balení, které nebereme)</label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-md bg-begina-primary-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{pending ? "Ukládám…" : "Uložit nabídku"}</button>
          {state && "error" in state && <span className="text-red-700">{state.error}</span>}
          {state && "success" in state && <span className="text-green-700">{state.success}</span>}
        </div>
      </form>
    </details>
  );
}
