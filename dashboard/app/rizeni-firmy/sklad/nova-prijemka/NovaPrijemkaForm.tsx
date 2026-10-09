"use client";

import { useActionState } from "react";
import { createDraftGoodsReceiptAction, type ActionState } from "../actions";
import type { SupplierSummary, StockLocationSummary } from "@/lib/data/sklad";

const initialState: ActionState = null;

export default function NovaPrijemkaForm({
  suppliers,
  stockLocations,
}: {
  suppliers: SupplierSummary[];
  stockLocations: StockLocationSummary[];
}) {
  const [state, formAction, pending] = useActionState(createDraftGoodsReceiptAction, initialState);

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4"
    >
      <div>
        <label htmlFor="supplierId" className="text-xs text-neutral-500 mb-1 block">
          Dodavatel
        </label>
        <select
          id="supplierId"
          name="supplierId"
          required
          defaultValue=""
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte dodavatele…
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        {suppliers.length === 0 && (
          <p className="text-xs text-begina-accent-700 mt-1">
            Zatím žádný dodavatel není založen.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="stockLocationId" className="text-xs text-neutral-500 mb-1 block">
          Skladová lokace
        </label>
        <select
          id="stockLocationId"
          name="stockLocationId"
          required
          defaultValue={stockLocations[0]?.id ?? ""}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          {stockLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="documentNumber" className="text-xs text-neutral-500 mb-1 block">
            Číslo dokladu (nepovinné)
          </label>
          <input
            id="documentNumber"
            name="documentNumber"
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="documentDate" className="text-xs text-neutral-500 mb-1 block">
            Datum dokladu (nepovinné)
          </label>
          <input
            id="documentDate"
            name="documentDate"
            type="date"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="dueDate" className="text-xs text-neutral-500 mb-1 block">
            Splatnost (nepovinné)
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="paymentMethod" className="text-xs text-neutral-500 mb-1 block">
            Způsob platby (nepovinné)
          </label>
          <input
            id="paymentMethod"
            name="paymentMethod"
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Založit příjemku"}
      </button>
    </form>
  );
}
