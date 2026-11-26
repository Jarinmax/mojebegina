"use client";

import { useActionState } from "react";
import { saveItemAction, type FormState } from "../actions";

type Item = { id: string; name: string; category: string; price: string; sortOrder: number };

export default function ItemForm({ categories, item }: { categories: string[]; item?: Item }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveItemAction, null);
  const listId = `kategorie-${item?.id ?? "nova"}`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {item && <input type="hidden" name="id" value={item.id} />}
      <input name="name" required defaultValue={item?.name} placeholder="Název (např. Dýňová polévka)" className="flex-1 min-w-44 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <input name="category" required list={listId} defaultValue={item?.category ?? categories[0]} className="w-40 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <input name="price" required inputMode="decimal" defaultValue={item?.price} placeholder="Cena Kč" className="w-24 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <input name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} title="Pořadí v kategorii" className="w-16 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <button disabled={pending} className="rounded-full bg-begina-primary-900 text-white text-sm px-4 py-1.5 disabled:opacity-50">
        {pending ? "Ukládám…" : item ? "Uložit" : "Přidat"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-green-700">{state.success}</p>}
    </form>
  );
}
