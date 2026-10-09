"use client";

// Náhradní objednávka ze stornované (zákazník souhlasil s jiným produktem).
// Údaje zákazníka se převezmou z původní objednávky; vybírají se produkty
// a doprava. Server ověří ceny, dopravu, adresu a 18+ stejně jako pokladna
// a v JEDNÉ transakci vytvoří objednávku (vlastní číslo a VS) a převede
// platbu. Token = id nové objednávky → dvojklik nevytvoří druhou.
import { useActionState, useState } from "react";
import { createReplacementAction, type ActionState } from "./actions";
import FormMessage from "./FormMessage";
import type { ReplacementProductOption, ReplacementShippingOption } from "@/lib/data/orders";

const initialState: ActionState = null;
const INPUT = "px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white";
const ROWS = 4;

function kc(hal: number): string {
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(hal / 100)} Kč`;
}

export type ReplacementFormData = {
  token: string;
  heldHal: number;
  customer: { name: string | null; email: string | null; phone: string | null };
  address: { street: string; city: string; zip: string };
  products: ReplacementProductOption[];
  shipping: ReplacementShippingOption[];
};

export default function ReplacementOrderForm({ orderId, data }: { orderId: string; data: ReplacementFormData }) {
  const [state, formAction, pending] = useActionState(createReplacementAction.bind(null, orderId), initialState);
  const [lines, setLines] = useState(() => Array.from({ length: ROWS }, () => ({ sku: "", quantity: 1 })));
  const [shippingId, setShippingId] = useState(data.shipping[0]?.id ?? "");

  const bySku = new Map(data.products.map((p) => [p.sku, p]));
  const shipping = data.shipping.find((s) => s.id === shippingId);
  const itemsKc = lines.reduce((sum, l) => sum + (bySku.get(l.sku)?.priceKc ?? 0) * (l.quantity > 0 ? l.quantity : 0), 0);
  const totalHal = (itemsKc + (shipping?.priceKc ?? 0)) * 100;
  const diffHal = totalHal - data.heldHal;
  const alcohol = lines.some((l) => bySku.get(l.sku)?.ageRestricted);

  return (
    <form action={formAction} className="flex flex-col gap-2 border border-neutral-200 bg-white rounded-lg p-3">
      <p className="text-sm font-medium text-begina-primary-900">Vytvořit náhradní objednávku</p>
      <p className="text-xs text-neutral-500">
        Zákazník: {data.customer.name ?? "—"} · {data.customer.email ?? "—"} · {data.customer.phone ?? "—"} (z původní objednávky).
        Nová objednávka dostane vlastní číslo a VS a převede se na ni celá platba {kc(data.heldHal)}.
      </p>
      <input type="hidden" name="token" value={data.token} />
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-[1fr_5rem] gap-2">
          <select
            name="sku"
            value={line.sku}
            onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, sku: e.target.value } : l)))}
            className={INPUT}
            aria-label={`Produkt ${i + 1}`}
          >
            <option value="">{i === 0 ? "Vyberte produkt…" : "—"}</option>
            {data.products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.label} · {p.priceKc} Kč{p.ageRestricted ? " · 18+" : ""}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min={1}
            max={99}
            value={line.quantity}
            onChange={(e) =>
              setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: Number.parseInt(e.target.value, 10) || 0 } : l)))
            }
            className={INPUT}
            aria-label={`Počet ${i + 1}`}
          />
        </div>
      ))}
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Doprava
        <select name="shippingMethodId" value={shippingId} onChange={(e) => setShippingId(e.target.value)} className={INPUT}>
          {data.shipping.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.priceKc > 0 ? `${s.priceKc} Kč` : "zdarma"}
            </option>
          ))}
        </select>
      </label>
      {shipping?.requiresAddress && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input name="street" required defaultValue={data.address.street} placeholder="Ulice a číslo" className={INPUT} />
          <input name="city" required defaultValue={data.address.city} placeholder="Město" className={INPUT} />
          <input name="zip" required defaultValue={data.address.zip} placeholder="PSČ" className={INPUT} />
        </div>
      )}
      <p className="text-sm text-begina-primary-900">
        Cena náhradní objednávky {kc(totalHal)} ·{" "}
        {diffHal > 0
          ? `zákazník doplatí ${kc(diffHal)}`
          : diffHal < 0
            ? `přeplatek ${kc(-diffHal)} bude k vrácení`
            : "platba pokryje celou cenu"}
      </p>
      {alcohol && (
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input type="checkbox" name="ageConfirmed" required />
          Zákazník znovu potvrdil, že je starší 18 let (objednávka obsahuje alkohol)
        </label>
      )}
      <label className="flex items-center gap-2 text-xs text-neutral-700">
        <input type="checkbox" name="consent" required />
        Zákazník s náhradní objednávkou souhlasil
      </label>
      <input name="note" required minLength={3} maxLength={500} placeholder="Jak a kdy souhlasil (např. telefon 9. 10.)" className={INPUT} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap self-start"
      >
        {pending ? "Vytvářím…" : "Vytvořit náhradní objednávku"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
