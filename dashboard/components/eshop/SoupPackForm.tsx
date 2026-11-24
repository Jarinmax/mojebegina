"use client";

// Ochutnávka polévek 3 × 450 ml (24. 11. 2026): šest zaškrtávacích políček, zákazník
// vybírá tři RŮZNÉ polévky, pak Do košíku. Výběr jde do košíku jako přípona SKU
// (lib/eshop/soupPack.ts). Bez IČO, bez limitu.
import { useState } from "react";
import { Check } from "lucide-react";
import { SOUP_PACK_ADD, SOUP_PACK_SIZE, SOUP_PACK_SOUPS, soupPackCartSku, type SoupPackCode } from "@/lib/eshop/soupPack";
import { trackFunnel } from "@/lib/eshop/funnelClient";
import { trackMeta } from "@/lib/eshop/metaPixel";
import QuantityStepper from "./QuantityStepper";
import ShopLink from "./ShopLink";
import { useCart } from "./useCart";

export default function SoupPackForm({ name, sku, priceKc }: { name: string; sku: string; priceKc: number }) {
  const { add } = useCart();
  const [choice, setChoice] = useState<SoupPackCode[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cartSku = soupPackCartSku(choice);
  const left = SOUP_PACK_SIZE - choice.length;

  function handleAdd() {
    if (!cartSku) return;
    add(cartSku, quantity);
    trackFunnel("add_to_cart");
    trackMeta("AddToCart", { content_type: "product", content_ids: [sku], content_name: name, contents: [{ id: sku, quantity, item_price: priceKc }], value: priceKc * quantity });
    setAdded(true);
  }

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="text-sm font-medium mb-2">
          Vyberte si tři různé polévky <span className="font-normal text-neutral-600 tabular-nums">(vybráno {choice.length} z {SOUP_PACK_SIZE})</span>
        </legend>
        <div className="flex flex-col gap-2">
          {SOUP_PACK_SOUPS.map((soup) => {
            const checked = choice.includes(soup.code);
            const full = !checked && choice.length >= SOUP_PACK_SIZE;
            return (
              <label
                key={soup.code}
                className={`flex items-center gap-3 rounded-xl border px-3 min-h-11 py-2 text-[15px] ${checked ? "border-begina-primary-900" : "border-neutral-200"} ${full ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full}
                  onChange={() => {
                    setChoice(checked ? choice.filter((code) => code !== soup.code) : [...choice, soup.code]);
                    setAdded(false);
                  }}
                  className="w-4 h-4 accent-begina-primary-900"
                />
                {soup.name}
              </label>
            );
          })}
        </div>
        {left > 0 && (
          <p className="mt-2 text-sm text-begina-accent-900" role="status">
            Vyberte ještě {left === 1 ? "jednu polévku" : `${left} polévky`}.
          </p>
        )}
      </fieldset>
      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} label={`Množství – ${name}`} />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!cartSku}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg bg-begina-primary-900 disabled:opacity-50 text-white font-medium px-5 h-11 text-base"
        >
          {added ? <Check className="w-4 h-4" aria-hidden="true" /> : null}
          {added ? "Přidáno do košíku" : SOUP_PACK_ADD}
        </button>
      </div>
      {added && (
        <ShopLink href="/kosik" className="mt-3 inline-block text-sm font-medium underline underline-offset-2">
          Přejít do košíku
        </ShopLink>
      )}
    </div>
  );
}
