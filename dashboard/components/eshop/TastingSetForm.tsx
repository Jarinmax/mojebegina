"use client";

// Ochutnávkový set sirupů (17. 11. 2026): sedm zaškrtávacích políček, zákazník
// vybírá pět RŮZNÝCH sirupů (na začátku není zaškrtnuté nic, odkaz vybere
// pět nejoblíbenějších); množství a Do košíku. Výběr jde do
// košíku jako přípona SKU (lib/eshop/tastingSet.ts).
import { useState } from "react";
import { Check } from "lucide-react";
import { SET_DEFAULT_CHOICE, SET_PICK_FAVOURITES, SET_SIZE, SET_SYRUPS, orderedChoice, setCartSku, type SetSyrupCode } from "@/lib/eshop/tastingSet";
import { trackFunnel } from "@/lib/eshop/funnelClient";
import { trackMeta } from "@/lib/eshop/metaPixel";
import QuantityStepper from "./QuantityStepper";
import ShopLink from "./ShopLink";
import { useCart } from "./useCart";

export default function TastingSetForm({ name, sku, priceKc, maxQuantity }: { name: string; sku: string; priceKc: number; maxQuantity?: number }) {
  const { add } = useCart();
  const [choice, setChoice] = useState<SetSyrupCode[]>([]);
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
        <legend className="text-sm font-medium mb-2">
          Vyberte si pět různých sirupů <span className="font-normal text-neutral-600 tabular-nums">(vybráno {choice.length} z {SET_SIZE})</span>
        </legend>
        <div className="flex flex-col gap-2">
          {SET_SYRUPS.map((syrup) => {
            const checked = choice.includes(syrup.code);
            const full = !checked && choice.length >= SET_SIZE;
            return (
              <label
                key={syrup.code}
                className={`flex items-center gap-3 rounded-xl border px-3 h-11 text-[15px] ${checked ? "border-begina-primary-900" : "border-neutral-200"} ${full ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full}
                  onChange={() => {
                    setChoice(checked ? choice.filter((code) => code !== syrup.code) : [...choice, syrup.code]);
                    setAdded(false);
                  }}
                  className="w-4 h-4 accent-begina-primary-900"
                />
                {syrup.name}
              </label>
            );
          })}
        </div>
        {choice.length < SET_SIZE && (
          <p className="mt-2 text-sm text-begina-accent-900" role="status">
            Vyberte ještě {SET_SIZE - choice.length === 1 ? "jeden sirup" : SET_SIZE - choice.length >= 5 ? `${SET_SIZE - choice.length} sirupů` : `${SET_SIZE - choice.length} sirupy`}.
          </p>
        )}
        {choice.length === 0 && (
          <button
            type="button"
            onClick={() => {
              setChoice([...SET_DEFAULT_CHOICE]);
              setAdded(false);
            }}
            className="mt-2 text-sm font-medium underline underline-offset-2 text-begina-primary-900"
          >
            {SET_PICK_FAVOURITES}
          </button>
        )}
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
      {choice.length > 0 && (
      <p className="mt-3 text-sm text-neutral-600">
        Složení sirupů:{" "}
        {orderedChoice(choice).map((code, index) => {
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
      )}
    </div>
  );
}
