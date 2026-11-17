"use client";

// Ochutnávkový set sirupů (17. 11. 2026): pět rozbalovacích nabídek se všemi
// sirupy (stejný lze zvolit víckrát), množství a Do košíku. Výběr jde do
// košíku jako přípona SKU (lib/eshop/tastingSet.ts).
import { useState } from "react";
import { Check } from "lucide-react";
import { SET_DEFAULT_CHOICE, SET_SYRUPS, setCartSku, type SetSyrupCode } from "@/lib/eshop/tastingSet";
import { trackFunnel } from "@/lib/eshop/funnelClient";
import { trackMeta } from "@/lib/eshop/metaPixel";
import QuantityStepper from "./QuantityStepper";
import ShopLink from "./ShopLink";
import { useCart } from "./useCart";

export default function TastingSetForm({ name, sku, priceKc, maxQuantity }: { name: string; sku: string; priceKc: number; maxQuantity?: number }) {
  const { add } = useCart();
  const [choice, setChoice] = useState<SetSyrupCode[]>([...SET_DEFAULT_CHOICE]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cartSku = setCartSku(sku, choice);
  const count = maxQuantity !== undefined ? Math.min(quantity, Math.max(1, maxQuantity)) : quantity;

  function handleAdd() {
    if (!cartSku) return;
    add(cartSku, count);
    trackFunnel("add_to_cart");
    trackMeta("AddToCart", { content_type: "product", content_ids: [sku], content_name: name, contents: [{ id: sku, quantity: count, item_price: priceKc }], value: priceKc * count });
    setAdded(true);
  }

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="text-sm font-medium mb-2">Vyberte si pět sirupů (stejný můžete zvolit víckrát)</legend>
        <div className="flex flex-col gap-2.5">
          {choice.map((code, index) => (
            <label key={index} className="flex items-center gap-3 text-sm">
              <span className="w-14 shrink-0 text-neutral-600">Sirup {index + 1}</span>
              <select
                value={code}
                onChange={(event) => {
                  const next = [...choice];
                  next[index] = event.target.value as SetSyrupCode;
                  setChoice(next);
                  setAdded(false);
                }}
                className="flex-1 min-w-0 h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base"
              >
                {SET_SYRUPS.map((syrup) => (
                  <option key={syrup.code} value={syrup.code}>
                    {syrup.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <QuantityStepper value={count} onChange={setQuantity} label={`Množství – ${name}`} />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!cartSku}
          className="flex-1 flex items-center justify-center gap-1.5 bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg px-4 h-9 disabled:opacity-50"
        >
          Do košíku
        </button>
      </div>
      {added && (
        <p className="mt-3 text-sm text-begina-primary-800 flex items-center gap-1.5 flex-wrap" role="status">
          <Check className="w-4 h-4" />
          Přidáno do košíku.
          <ShopLink href="/kosik" className="font-medium underline underline-offset-2">
            Zobrazit košík
          </ShopLink>
        </p>
      )}
      <p className="mt-3 text-sm text-neutral-600">
        Složení sirupů:{" "}
        {[...new Set(choice)].map((code, index) => {
          const syrup = SET_SYRUPS.find((item) => item.code === code)!;
          return (
            <span key={code}>
              {index > 0 ? ", " : ""}
              <ShopLink href={`/produkt/${syrup.slug}`} className="underline underline-offset-2">
                {syrup.short}
              </ShopLink>
            </span>
          );
        })}
        . Stejné složení najdete na etiketě každého sáčku.
      </p>
    </div>
  );
}
