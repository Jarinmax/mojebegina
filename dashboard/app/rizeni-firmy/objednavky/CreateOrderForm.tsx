"use client";

import { useActionState, useState } from "react";
import { createOrderAction, type ActionState } from "./actions";
import type { OrganizationOption } from "@/lib/data/orders";

const initialState: ActionState = null;

type ItemRow = { key: number; name: string; quantity: string; unitPriceKc: string };

function emptyRow(key: number): ItemRow {
  return { key, name: "", quantity: "1", unitPriceKc: "" };
}

export default function CreateOrderForm({ organizations }: { organizations: OrganizationOption[] }) {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);
  const [items, setItems] = useState<ItemRow[]>([emptyRow(0)]);
  const [nextKey, setNextKey] = useState(1);

  function updateItem(key: number, field: keyof Omit<ItemRow, "key">, value: string) {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyRow(nextKey)]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  return (
    <form action={formAction} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4">
      <div>
        <label htmlFor="buyerOrganizationId" className="text-xs text-neutral-500 mb-1 block">
          Zákaznická organizace
        </label>
        <select
          id="buyerOrganizationId"
          name="buyerOrganizationId"
          required
          defaultValue=""
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte organizaci…
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="contactName" className="text-xs text-neutral-500 mb-1 block">
            Kdo objednal (jméno)
          </label>
          <input
            id="contactName"
            name="contactName"
            type="text"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="contactPhone" className="text-xs text-neutral-500 mb-1 block">
            Telefon
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="text"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className="text-xs text-neutral-500 mb-1 block">
            E-mail
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-neutral-500 mb-1">Položky</p>
        <div className="flex flex-col gap-2">
          {items.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                name="itemName"
                type="text"
                placeholder="Název"
                required
                value={row.name}
                onChange={(e) => updateItem(row.key, "name", e.target.value)}
                className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
              />
              <input
                name="itemQuantity"
                type="number"
                min={1}
                placeholder="Ks"
                required
                value={row.quantity}
                onChange={(e) => updateItem(row.key, "quantity", e.target.value)}
                className="w-16 px-2 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
              />
              <input
                name="itemUnitPriceKc"
                type="number"
                min={0}
                placeholder="Kč/ks"
                required
                value={row.unitPriceKc}
                onChange={(e) => updateItem(row.key, "unitPriceKc", e.target.value)}
                className="w-24 px-2 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
              />
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={items.length === 1}
                className="text-xs text-neutral-400 hover:text-begina-accent-700 disabled:opacity-30 px-1"
                aria-label="Odebrat položku"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="text-sm font-medium text-begina-primary-900 hover:underline mt-2"
        >
          + Přidat položku
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="plannedDeliveryAt" className="text-xs text-neutral-500 mb-1 block">
            Plánované doručení
          </label>
          <input
            id="plannedDeliveryAt"
            name="plannedDeliveryAt"
            type="date"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="shippingKc" className="text-xs text-neutral-500 mb-1 block">
            Doprava (Kč, nepovinné)
          </label>
          <input
            id="shippingKc"
            name="shippingKc"
            type="number"
            min={0}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="note" className="text-xs text-neutral-500 mb-1 block">
          Poznámka (nepovinné)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Založit objednávku"}
      </button>
    </form>
  );
}
