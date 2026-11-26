"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cartTotal, changeDue, changeQuantity, formatKc, parsePriceToHal, PAYMENT_LABELS, type CartLine, type PosPaymentMethod } from "@/lib/pokladna/pos";
import { createReceiptAction } from "./actions";

type Item = { id: string; category: string; name: string; priceHal: number };

export default function PosTerminal({ items, categories }: { items: Item[]; categories: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PosPaymentMethod | null>(null);
  const [given, setGiven] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = cartTotal(lines);
  const givenHal = given ? parsePriceToHal(given) : null;
  const change = method === "cash" && givenHal !== null ? changeDue(total, givenHal) : null;
  const visible = useMemo(() => items.filter((i) => i.category === category), [items, category]);

  const add = (item: Item, delta: number) => setLines((prev) => changeQuantity(prev, { itemId: item.id, name: item.name, unitPriceHal: item.priceHal }, delta));

  const pay = () => {
    if (!method) return setError("Vyberte způsob platby.");
    if (method === "cash" && givenHal !== null && givenHal < total) return setError("Zákazník dal méně, než je k zaplacení.");
    setError(null);
    startTransition(async () => {
      const result = await createReceiptAction({ lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })), paymentMethod: method, cashGivenHal: givenHal, note });
      if (!result.ok) return setError(result.error);
      router.push(`/rizeni-firmy/pokladna/uctenka/${result.id}?nova=1`);
    });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium border ${c === category ? "bg-begina-primary-900 text-white border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-200"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {visible.map((item) => {
            const inCart = lines.find((l) => l.itemId === item.id)?.quantity ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => add(item, 1)}
                className={`relative text-left rounded-xl border p-3 min-h-20 active:scale-95 transition ${inCart ? "bg-begina-primary-50 border-begina-primary-900" : "bg-white border-neutral-200"}`}
              >
                <span className="block text-sm font-medium text-begina-primary-900 leading-tight">{item.name}</span>
                <span className="block text-sm text-neutral-600 mt-1">{formatKc(item.priceHal)}</span>
                {inCart > 0 && <span className="absolute top-2 right-2 rounded-full bg-begina-primary-900 text-white text-xs px-2 py-0.5">{inCart}×</span>}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="bg-white border border-neutral-200 rounded-xl p-3 h-fit lg:sticky lg:top-3">
        <h2 className="text-sm font-medium text-neutral-700 mb-2">Účet</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500 mb-3">Klepněte na položku v menu.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 mb-3">
            {lines.map((l) => (
              <li key={l.itemId} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm">{l.name}</span>
                <button type="button" aria-label="Ubrat" onClick={() => setLines((p) => changeQuantity(p, l, -1))} className="w-8 h-8 rounded-full border border-neutral-200 text-lg leading-none">−</button>
                <span className="w-6 text-center text-sm">{l.quantity}</span>
                <button type="button" aria-label="Přidat" onClick={() => setLines((p) => changeQuantity(p, l, 1))} className="w-8 h-8 rounded-full border border-neutral-200 text-lg leading-none">+</button>
                <span className="w-20 text-right text-sm">{formatKc(l.unitPriceHal * l.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between text-lg font-semibold text-begina-primary-900 mb-3">
          <span>Celkem</span>
          <span>{formatKc(total)}</span>
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {(Object.keys(PAYMENT_LABELS) as PosPaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-lg border py-3 text-sm font-medium ${method === m ? "bg-begina-primary-900 text-white border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-200"}`}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <label className="block text-sm mb-3">
            Zákazník dal (Kč)
            <input inputMode="decimal" value={given} onChange={(e) => setGiven(e.target.value)} placeholder="nepovinné" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-lg" />
            {change !== null && <span className="block mt-1 font-semibold text-green-700">Vrátit: {formatKc(change)}</span>}
          </label>
        )}
        {method === "card" && <p className="text-sm text-neutral-600 mb-3">V aplikaci SumUp v mobilu naťukejte {formatKc(total)}, po zaplacení klepněte na Zaplaceno.</p>}
        {method === "qr" && <p className="text-sm text-neutral-600 mb-3">Po klepnutí na Zaplaceno se ukáže QR kód pro zákazníka.</p>}

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poznámka (stůl, s sebou…)" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm mb-3" />
        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setLines([]); setMethod(null); setGiven(""); setNote(""); setError(null); }} className="rounded-full border border-neutral-200 px-4 py-3 text-sm">
            Zrušit
          </button>
          <button type="button" disabled={pending || lines.length === 0} onClick={pay} className="flex-1 rounded-full bg-begina-primary-900 text-white py-3 text-base font-medium disabled:opacity-50">
            {pending ? "Ukládám…" : method === "qr" ? "Ukázat QR" : "Zaplaceno"}
          </button>
        </div>
      </aside>
    </div>
  );
}
