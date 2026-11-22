"use client";

import { useMemo, useState } from "react";
import { applyFuelSurcharge, coldShippingPrice, coldShippingPriceSk } from "@/lib/eshop/shippingRates";

export type CalcVariant = { sku: string; name: string; priceKc: number | null; weightG: number | null };

const kc = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;

export default function Calculator({ variants, fuelPercent }: { variants: CalcVariant[]; fuelPercent?: number }) {
  if (fuelPercent !== undefined) applyFuelSurcharge(fuelPercent);
  const [country, setCountry] = useState<"cz" | "sk">("cz");
  const [filter, setFilter] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const chosen = variants.filter((variant) => (quantities[variant.sku] ?? 0) > 0);
  const missingWeight = chosen.filter((variant) => variant.weightG === null);
  const grams = chosen.reduce((sum, variant) => sum + (variant.weightG ?? 0) * (quantities[variant.sku] ?? 0), 0);
  const goodsKc = chosen.reduce((sum, variant) => sum + (variant.priceKc ?? 0) * (quantities[variant.sku] ?? 0), 0);
  const shipping = country === "cz" ? coldShippingPrice(grams) : coldShippingPriceSk(grams);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return variants.filter((variant) => !needle || variant.name.toLowerCase().includes(needle) || (quantities[variant.sku] ?? 0) > 0);
  }, [variants, filter, quantities]);
  const setQuantity = (sku: string, value: number) => setQuantities((current) => ({ ...current, [sku]: Math.max(0, Math.min(999, Math.floor(value) || 0)) }));
  const tab = (value: "cz" | "sk", text: string) => (
    <button type="button" onClick={() => setCountry(value)} aria-pressed={country === value} className={`rounded-lg px-4 py-2 text-sm font-medium ${country === value ? "bg-begina-primary-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
      {text}
    </button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 items-start">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          {tab("cz", "Česká republika")}
          {tab("sk", "Slovensko")}
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Hledat produkt (např. sirup 3 l)" className="flex-1 min-w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white text-neutral-900" />
        </div>
        <div className="max-h-[28rem] overflow-y-auto divide-y divide-neutral-100">
          {visible.map((variant) => (
            <label key={variant.sku} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>
                {variant.name}
                <span className="text-neutral-500"> · {variant.weightG === null ? "váha chybí" : `${(variant.weightG / 1000).toLocaleString("cs-CZ")} kg`}{variant.priceKc === null ? "" : ` · ${kc(variant.priceKc)}`}</span>
              </span>
              <input type="number" min={0} max={999} inputMode="numeric" value={quantities[variant.sku] ?? ""} onChange={(event) => setQuantity(variant.sku, Number(event.target.value))} placeholder="0" aria-label={`Počet kusů ${variant.name}`} className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-right bg-white text-neutral-900" />
            </label>
          ))}
        </div>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2 text-sm lg:sticky lg:top-4">
        <h2 className="font-semibold">{country === "cz" ? "Česká republika" : "Slovensko"}</h2>
        <p className="flex justify-between"><span>Váha zásilky</span><strong>{(grams / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} kg</strong></p>
        <p className="flex justify-between"><span>Zboží</span><strong>{kc(goodsKc)}</strong></p>
        <p className="flex justify-between">
          <span>Chlazená přeprava</span>
          <strong>{chosen.length === 0 ? "—" : missingWeight.length > 0 ? "nelze určit" : shipping.ok ? kc(shipping.priceKc) : "nad 400 kg, individuálně"}</strong>
        </p>
        {chosen.length > 0 && missingWeight.length === 0 && shipping.ok && (
          <p className="flex justify-between border-t border-neutral-200 pt-2 text-base"><span>Celkem</span><strong>{kc(goodsKc + shipping.priceKc)}</strong></p>
        )}
        {missingWeight.length > 0 && <p className="text-red-700">Chybí váha u: {missingWeight.map((variant) => variant.name).join(", ")}.</p>}
        <p className="text-xs text-neutral-500">Ceny zboží jsou běžné ceny e-shopu bez slev. Krabice za příplatek a alkohol na Slovensko kalkulačka neřeší.</p>
        <button type="button" onClick={() => setQuantities({})} className="self-start text-xs underline text-neutral-600">vynulovat</button>
      </div>
    </div>
  );
}
