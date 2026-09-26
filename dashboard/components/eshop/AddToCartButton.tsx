"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { Variant } from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import QuantityStepper from "./QuantityStepper";
import { useCart } from "./useCart";

type AddToCartButtonProps = {
  name: string;
  variants: Variant[];
  /** Kompaktní varianta pro kartu v katalogu — jen pro produkt s jedním
   *  balením, bez výběru množství. */
  compact?: boolean;
};

export default function AddToCartButton({ name, variants, compact = false }: AddToCartButtonProps) {
  const { add } = useCart();
  const [sku, setSku] = useState(variants[0].sku);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(sku, compact ? 1 : quantity);
    setAdded(true);
  }

  const button = (
    <button
      type="button"
      onClick={handleAdd}
      className="flex-1 flex items-center justify-center gap-1.5 bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg px-4 h-9"
    >
      {added && compact ? <Check className="w-4 h-4" /> : null}
      {added && compact ? "V košíku" : "Do košíku"}
    </button>
  );

  if (compact) {
    return <div className="flex">{button}</div>;
  }

  const selected = variants.find((variant) => variant.sku === sku) ?? variants[0];

  return (
    <div>
      {variants.length > 1 && (
        <fieldset className="mb-4">
          <legend className="text-sm font-medium mb-2">Balení</legend>
          <div className="flex flex-col gap-2">
            {variants.map((variant) => (
              <label
                key={variant.sku}
                className={`flex items-center gap-3 border rounded-xl p-3 cursor-pointer ${
                  sku === variant.sku ? "border-begina-primary-900" : "border-neutral-200"
                }`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={variant.sku}
                  checked={sku === variant.sku}
                  onChange={() => {
                    setSku(variant.sku);
                    setAdded(false);
                  }}
                  className="accent-begina-primary-900"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{variant.label}</span>
                  {variant.detail && <span className="block text-xs text-neutral-500">{variant.detail}</span>}
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatKc(variant.priceKc)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} label={`Množství – ${name}`} />
        {button}
      </div>
      {added && (
        <p className="mt-3 text-sm text-begina-primary-800 flex items-center gap-1.5 flex-wrap" role="status">
          <Check className="w-4 h-4" />
          Přidáno do košíku{variants.length > 1 && selected.label ? ` (${selected.label})` : ""}.
          <Link href="/eshop/kosik" className="font-medium underline underline-offset-2">
            Zobrazit košík
          </Link>
        </p>
      )}
    </div>
  );
}
