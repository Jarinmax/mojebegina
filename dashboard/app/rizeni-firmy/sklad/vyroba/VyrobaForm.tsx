"use client";

import { useActionState, useMemo, useState } from "react";
import { recordProductionBatchAction, type ActionState } from "./actions";
import type { StockItemSummary, StockLocationSummary } from "@/lib/data/sklad";
import type { ResponsiblePersonOption } from "@/lib/data/skladFinishedGoods";

const initialState: ActionState = null;

// Sklad 1.1 — "Dokončit výrobu / Přijmout výrobky" (zadání, bod 1). Všech
// 9 povinných polí z bodu 2 je tu: výrobek, počet kusů, skladová jednotka
// (zobrazená podle vybraného výrobku — appka ji nevymýšlí, jen ukazuje tu,
// co má karta), datum výroby, šarže, datum trvanlivosti/spotřeby,
// skladová lokace, odpovědná osoba, poznámka.
export default function VyrobaForm({
  stockItems,
  stockLocations,
  responsiblePeople,
}: {
  stockItems: StockItemSummary[];
  stockLocations: StockLocationSummary[];
  responsiblePeople: ResponsiblePersonOption[];
}) {
  const [state, formAction, pending] = useActionState(recordProductionBatchAction, initialState);
  const [selectedItemId, setSelectedItemId] = useState(stockItems[0]?.id ?? "");

  const selectedItem = useMemo(() => stockItems.find((i) => i.id === selectedItemId) ?? null, [stockItems, selectedItemId]);

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4"
    >
      <div>
        <label htmlFor="stockItemId" className="text-xs text-neutral-500 mb-1 block">
          Výrobek
        </label>
        <select
          id="stockItemId"
          name="stockItemId"
          required
          value={selectedItemId}
          onChange={(event) => setSelectedItemId(event.target.value)}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte výrobek…
          </option>
          {stockItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {stockItems.length === 0 && (
          <p className="text-xs text-begina-accent-700 mt-1">
            Zatím není založená žádná skladová karta hotového výrobku — založte ji nejdřív v kontrole příjemky.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="quantity" className="text-xs text-neutral-500 mb-1 block">
            Počet kusů
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <span className="text-xs text-neutral-500 mb-1 block">Skladová jednotka</span>
          <p className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-neutral-600 bg-neutral-50">
            {selectedItem ? selectedItem.canonicalUnit : "—"}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="batchCode" className="text-xs text-neutral-500 mb-1 block">
          Šarže
        </label>
        <input
          id="batchCode"
          name="batchCode"
          type="text"
          autoComplete="off"
          placeholder="např. L-20261106-DYN-01"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="producedAt" className="text-xs text-neutral-500 mb-1 block">
            Datum výroby
          </label>
          <input
            id="producedAt"
            name="producedAt"
            type="date"
            required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="bestBeforeAt" className="text-xs text-neutral-500 mb-1 block">
            Min. trvanlivost / spotřeba
          </label>
          <input
            id="bestBeforeAt"
            name="bestBeforeAt"
            type="date"
            required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
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

      <div>
        <label htmlFor="responsibleUserId" className="text-xs text-neutral-500 mb-1 block">
          Odpovědná osoba
        </label>
        <select
          id="responsibleUserId"
          name="responsibleUserId"
          required
          defaultValue=""
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte odpovědnou osobu…
          </option>
          {responsiblePeople.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name ?? person.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="note" className="text-xs text-neutral-500 mb-1 block">
          Poznámka
        </label>
        <textarea
          id="note"
          name="note"
          required
          rows={3}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || stockItems.length === 0}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Zapsat příjem výroby"}
      </button>
    </form>
  );
}
