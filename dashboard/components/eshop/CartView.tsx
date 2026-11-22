"use client";

import { couponDisplayName } from "@/lib/eshop/coupons";
import ShopLink from "./ShopLink";
import { Trash } from "lucide-react";
import { resolveCartLines } from "@/lib/eshop/cart";
import { isOrderable, NOT_ORDERABLE_NOTICE } from "@/lib/eshop/productRules";
import { useCatalog } from "./CatalogProvider";
import { formatKc } from "@/lib/format";
import ProductImage from "./ProductImage";
import QuantityStepper from "./QuantityStepper";
import { useCart, useHydrated } from "./useCart";
import PendingOrderNotice from "./PendingOrderNotice";
import CouponBox from "./CouponBox";
import { useCoupons } from "./useCoupons";
import { cartShippingHint } from "@/lib/eshop/shippingHint";
import { useState } from "react";
import { BOX_PRICE_KC, boxesFromSelection, isBoxEligible } from "@/lib/eshop/boxOption";
import { useCartBoxes } from "./useCartBoxes";

export default function CartView({ weightShipping = false, zasilkovna = false }: { weightShipping?: boolean; zasilkovna?: boolean }) {
  const { cart, setQuantity, clear } = useCart();
  const boxes = useCartBoxes();
  const [confirmClear, setConfirmClear] = useState(false);
  const catalog = useCatalog();
  const hydrated = useHydrated();
  const coupons = useCoupons(cart);

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Načítám košík…</p>;
  }

  const lines = resolveCartLines(cart, catalog);

  if (lines.length === 0) {
    return (
      <>
      <PendingOrderNotice />
      <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
        <p className="text-neutral-600 mb-4">Košík je prázdný.</p>
        <ShopLink
          href="/"
          className="inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
        >
          Prohlédnout nabídku
        </ShopLink>
      </div>
      </>
    );
  }

  const goodsKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);
  const boxesCount = boxesFromSelection(lines, boxes.boxed);
  const boxesKc = boxesCount * BOX_PRICE_KC;
  const subtotalKc = goodsKc + boxesKc;
  // Produkt mohl do košíku přijít dřív, než se zablokoval (neověřené alergeny).
  const blocked = lines.some((line) => !isOrderable(line.product));
  const shippingHint = coupons.preview.freeShipping ? null : cartShippingHint(lines, { weightMode: weightShipping, zasilkovna });

  return (
    <>
    <PendingOrderNotice />
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 lg:gap-10 items-start">
      <div>
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {lines.map((line) => (
          <li key={line.sku} className="py-4 flex gap-3 sm:gap-4">
            <ProductImage name={line.product.name} src={line.product.image} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <ShopLink
                    href={`/produkt/${line.product.slug}`}
                    className="font-medium hover:underline underline-offset-2"
                  >
                    {line.product.name}
                  </ShopLink>
                  {line.variant.label && <p className="text-xs text-neutral-500">{line.variant.label}</p>}
                </div>
                <p className="font-medium tabular-nums shrink-0">{formatKc(line.lineTotalKc)}</p>
              </div>
              {line.lineTotalKc === 0 && line.variant.priceKc > 0 ? (
                <p className="text-xs font-semibold text-[#2F6322] mt-0.5">Zdarma k první begině</p>
              ) : (
                <p className="text-xs text-neutral-500 mt-0.5">{formatKc(line.variant.priceKc)} / ks</p>
              )}
              {!isOrderable(line.product) && (
                <p className="text-xs text-begina-accent-900 mt-1" role="alert">
                  {NOT_ORDERABLE_NOTICE} Odeberte ho prosím z košíku.
                </p>
              )}
              {isBoxEligible(line.product, line.variant) && (
                <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boxes.boxed.includes(line.sku)}
                    onChange={(e) => boxes.toggle(line.sku, e.target.checked)}
                    className="w-4 h-4 accent-[#5E6B34]"
                  />
                  <span>
                    Zabalit do kartonové krabice{" "}
                    <span className="text-neutral-500">
                      +{formatKc(BOX_PRICE_KC)}{line.quantity > 1 ? ` / ks (${formatKc(BOX_PRICE_KC * line.quantity)})` : ""}
                    </span>
                  </span>
                </label>
              )}
              <div className="mt-2 flex items-center gap-3">
                <QuantityStepper
                  value={line.quantity}
                  onChange={(value) => setQuantity(line.sku, value)}
                  label={`Množství – ${line.name}`}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(line.sku, 0)}
                  className="text-neutral-400 hover:text-begina-accent-700 p-1"
                  aria-label={`Odebrat ${line.name}`}
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {/* 22. 11. 2026 (Lucie): vysypat košík a začít znovu */}
      <div className="mt-3 flex items-center gap-3 text-sm">
        {confirmClear ? (
          <>
            <span className="text-neutral-700">Opravdu odebrat vše z košíku?</span>
            <button
              type="button"
              onClick={() => { clear(); boxes.clear(); setConfirmClear(false); }}
              className="rounded-lg bg-[#A51C1C] text-white font-medium px-3 h-9"
            >
              Ano, vyprázdnit
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="text-neutral-600 underline underline-offset-2">
              Ne
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-[#A51C1C] underline underline-offset-2"
          >
            <Trash className="w-4 h-4" /> Vyprázdnit košík
          </button>
        )}
      </div>
      </div>

      <aside className="bg-begina-primary-50 border border-neutral-200 rounded-2xl p-5">
        {boxesCount > 0 && (
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-neutral-600">Krabice ({boxesCount}×)</span>
            <span className="tabular-nums">{formatKc(boxesKc)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-neutral-600">Mezisoučet</span>
          <span className="font-medium tabular-nums">{formatKc(subtotalKc)}</span>
        </div>
        {coupons.preview.discountKc > 0 && (
          <>
            <div className="flex justify-between text-sm mt-1.5">
              <span className="text-neutral-600">
                Sleva ({coupons.preview.applied.filter((a) => a.discountKc > 0).map((a) => couponDisplayName(a)).join(", ")})
              </span>
              <span className="font-medium tabular-nums">−{formatKc(coupons.preview.discountKc)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-neutral-200 font-semibold">
              <span>Celkem za zboží</span>
              <span className="tabular-nums">{formatKc(subtotalKc - coupons.preview.discountKc)}</span>
            </div>
          </>
        )}
        {shippingHint ? (
          <div className="mt-2 text-sm">
            <p className="font-medium text-begina-primary-900">{shippingHint.main}</p>
            {shippingHint.extra && <p className="text-xs text-neutral-600 mt-0.5">{shippingHint.extra}</p>}
            <p className="text-xs text-neutral-500 mt-0.5">
              Způsob dopravy vyberete v dalším kroku.{" "}
              <ShopLink href="/doprava" className="underline underline-offset-2">Ceník dopravy</ShopLink>
            </p>
          </div>
        ) : (
          <p className="text-xs text-neutral-500 mt-1">
            Doprava se vybírá v dalším kroku{coupons.preview.freeShipping ? " — slevový kód vám dává dopravu zdarma" : ""}.
          </p>
        )}
        <CouponBox coupons={coupons} partnerHint className="mt-4 pt-4 border-t border-neutral-200" />
        {blocked ? (
          <p className="mt-5 text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2">
            Košík obsahuje produkt, který zatím nelze objednat. Odeberte ho prosím.
          </p>
        ) : (
          <ShopLink
            href="/pokladna"
            className="mt-5 w-full flex items-center justify-center bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg h-11"
          >
            Pokračovat k objednávce
          </ShopLink>
        )}
        <ShopLink href="/" className="mt-3 block text-center text-sm text-neutral-600 hover:underline">
          Pokračovat v nákupu
        </ShopLink>
      </aside>
    </div>
    </>
  );
}
