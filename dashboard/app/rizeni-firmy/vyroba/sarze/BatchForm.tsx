"use client";

import { useActionState, useMemo, useState } from "react";
import { VOLUME_LABELS, bestBefore, formatCzDate, shelfLifeLabel, type BatchVolume } from "@/lib/vyroba/batches";
import { createBatchAction, type BatchFormState } from "./actions";

type Product = { id: string; name: string; categorySlug: string; categoryName: string; volumes: number[] };

export default function BatchForm({ products, today }: { products: Product[]; today: string }) {
  const [state, action, pending] = useActionState<BatchFormState, FormData>(createBatchAction, null);
  const [productId, setProductId] = useState("");
  const [producedOn, setProducedOn] = useState(today);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const product = products.find((p) => p.id === productId);
  const volumes = useMemo(() => {
    if (!product) return [] as number[];
    const base = product.volumes.length > 0 ? [...product.volumes] : [3000];
    if (product.categorySlug === "polevky" && !base.includes(200)) base.push(200);
    if (product.categorySlug === "sirupy" && !base.includes(100)) base.push(100);
    return base.sort((a, b) => b - a);
  }, [product]);
  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) map.set(p.categoryName, [...(map.get(p.categoryName) ?? []), p]);
    return [...map.entries()];
  }, [products]);

  if (state?.created) {
    return (
      <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-sm text-emerald-900">
        <p className="font-medium">✓ Šarže zapsaná: {state.created.productName}</p>
        <p className="mt-1">
          Číslo šarže: <strong className="text-base">{state.created.code}</strong> — etikety s ním vytisknete níž v seznamu („Etiketa k tisku“).
        </p>
        <p className="mt-1 text-xs">{state.created.notified ? "Upozornění odešlo na info@begina.cz." : "Upozornění na info@begina.cz se nepodařilo odeslat."}</p>
        <a href="/rizeni-firmy/vyroba/sarze" className="inline-block mt-3 rounded-full bg-begina-primary-900 text-white px-4 py-2">
          Zapsat další šarži
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
      <label className="text-sm">
        <span className="block text-neutral-600 mb-1">Co jste uvařil/a</span>
        <select
          name="productId"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setQuantities({});
          }}
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-base"
          required
        >
          <option value="">Vyberte produkt…</option>
          {groups.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-neutral-600 mb-1">Datum výroby</span>
        <input type="date" name="producedOn" value={producedOn} max={today} onChange={(e) => setProducedOn(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-base" />
      </label>

      {product && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-neutral-600">Kolik kusů jste naplnil/a</span>
          {volumes.map((v) => {
            const auto = bestBefore(producedOn, product.categorySlug, v);
            return (
              <div key={v} className="flex flex-wrap items-center gap-2 border border-neutral-200 rounded-lg p-2">
                <span className="text-sm w-40">{VOLUME_LABELS[v as BatchVolume]}</span>
                <input
                  type="number"
                  name={`qty_${v}`}
                  min={0}
                  max={500}
                  inputMode="numeric"
                  placeholder="0"
                  value={quantities[v] ?? ""}
                  onChange={(e) => setQuantities({ ...quantities, [v]: e.target.value })}
                  className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-base"
                />
                <span className="text-xs text-neutral-500">ks</span>
                {auto ? (
                  <span className="text-xs text-neutral-600">
                    spotřebujte do {formatCzDate(auto)} ({shelfLifeLabel(product.categorySlug, v)})
                  </span>
                ) : (
                  <label className="text-xs text-neutral-600">
                    spotřebujte do <input type="date" name={`bb_${v}`} className="rounded border border-neutral-300 px-2 py-1" />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-600">Etiketa už je vytištěná s vlastním číslem šarže?</summary>
        <label className="block mt-2">
          <span className="block text-neutral-600 mb-1">Číslo šarže z etikety (jinak ho systém vytvoří sám)</span>
          <input name="code" placeholder="L-20261117-MEL-01" className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono uppercase" />
        </label>
      </details>

      <label className="text-sm">
        <span className="block text-neutral-600 mb-1">Poznámka (nepovinné)</span>
        <input name="note" maxLength={500} className="w-full rounded-lg border border-neutral-300 px-3 py-2" placeholder="např. dýně od Jandla" />
      </label>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending || !product} className="rounded-full bg-begina-primary-900 text-white px-5 py-3 text-base disabled:opacity-50">
        {pending ? "Ukládám…" : "Zapsat šarži"}
      </button>
    </form>
  );
}
