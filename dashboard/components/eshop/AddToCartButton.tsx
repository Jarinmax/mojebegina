"use client";

import ShopLink from "./ShopLink";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Variant } from "@/lib/eshop/types";
import { formatPrice } from "@/lib/format";
import QuantityStepper from "./QuantityStepper";
import { useCart } from "./useCart";
import { trackMeta } from "@/lib/eshop/metaPixel";
import { trackFunnel } from "@/lib/eshop/funnelClient";
import { packagingKind } from "@/lib/eshop/packaging";
import { VARIANT_EVENT } from "./ServingPriceLine";
import { SOLD_OUT_LABEL } from "@/lib/eshop/productRules";

/** Červený štítek „Vyprodáno“ (Lucie 22. 11. 2026 — má být vidět, že je vyprodáno). */
export function SoldOutBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-red-600 px-2.5 text-xs font-semibold uppercase tracking-wide text-white ${className}`}>
      {SOLD_OUT_LABEL}
    </span>
  );
}

/** Zelený štítek „skladem“ u balení, které jde koupit (Lucie 22. 11. 2026). */
export function InStockBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-[#3F7A2E] h-4 px-1 text-[9px] font-semibold uppercase tracking-wide text-white ${className}`}>
      Skladem
    </span>
  );
}

type AddToCartButtonProps = {
  name: string;
  variants: Variant[];
  /** Kompaktní varianta pro kartu v katalogu — jen pro produkt s jedním
   *  balením, bez výběru množství. */
  compact?: boolean;
};

export default function AddToCartButton({ name, variants, compact = false }: AddToCartButtonProps) {
  const { add } = useCart();
  // výchozí balení = první nevyprodané
  const firstAvailable = variants.find((variant) => variant.soldOut !== true);
  const [sku, setSku] = useState((firstAvailable ?? variants[0]).sku);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    const count = compact ? 1 : quantity;
    add(sku, count);
    const priceKc = variants.find((variant) => variant.sku === sku)?.priceKc ?? 0;
    trackFunnel("add_to_cart");
    trackMeta("AddToCart", {
      content_type: "product",
      content_ids: [sku],
      content_name: name,
      contents: [{ id: sku, quantity: count, item_price: priceKc }],
      value: priceKc * count,
    });
    setAdded(true);
  }

  const button = (
    <button
      type="button"
      onClick={handleAdd}
      className="flex-1 flex items-center justify-center gap-1.5 bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg px-4 h-11 sm:h-9"
    >
      {added && compact ? <Check className="w-4 h-4" /> : null}
      {added && compact ? "V košíku" : "Do košíku"}
    </button>
  );

  if (!firstAvailable) {
    // všechna balení vyprodaná — místo „Do košíku“ červené „Vyprodáno“
    return (
      <div className="flex">
        <SoldOutBadge className="flex-1 h-11 sm:h-9 text-sm" />
      </div>
    );
  }

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
                className={`flex items-center gap-3 border rounded-xl p-3 ${
                  variant.soldOut === true
                    ? "border-neutral-200 bg-neutral-50 cursor-not-allowed"
                    : sku === variant.sku
                      ? "border-begina-primary-900 cursor-pointer"
                      : "border-neutral-200 cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={variant.sku}
                  disabled={variant.soldOut === true}
                  checked={sku === variant.sku}
                  onChange={() => {
                    setSku(variant.sku);
                    setAdded(false);
                    // řádek „cena za porci“ pod cenou se přepne na zvolené balení
                    window.dispatchEvent(new CustomEvent(VARIANT_EVENT, { detail: variant.sku }));
                  }}
                  className="accent-begina-primary-900"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">
                    {variant.label}
                    {packagingKind(variant.label) && (
                      <span className="font-normal text-neutral-600"> · {packagingKind(variant.label)}</span>
                    )}
                  </span>
                  {variant.detail && <span className="block text-xs text-neutral-500">{variant.detail}</span>}
                </span>
                {variant.soldOut === true ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-neutral-500">{formatPrice(variant.priceKc)}</span>
                    <SoldOutBadge className="h-7" />
                  </span>
                ) : (
                  <span className="text-sm font-semibold tabular-nums">{formatPrice(variant.priceKc)}</span>
                )}
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
          <ShopLink href="/kosik" className="font-medium underline underline-offset-2">
            Zobrazit košík
          </ShopLink>
        </p>
      )}
    </div>
  );
}
