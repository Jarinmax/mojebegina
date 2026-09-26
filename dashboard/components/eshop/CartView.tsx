"use client";

import Link from "next/link";
import { Trash } from "lucide-react";
import { getProduct } from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import ProductImage from "./ProductImage";
import QuantityStepper from "./QuantityStepper";
import { useCart, useHydrated } from "./useCart";

export default function CartView() {
  const { cart, setQuantity } = useCart();
  const hydrated = useHydrated();

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Načítám košík…</p>;
  }

  // parseStoredCart už neznámé produkty zahodil, filtr je jen pro TypeScript.
  const lines = cart.flatMap((line) => {
    const product = getProduct(line.slug);
    return product ? [{ ...line, product, lineTotalKc: product.priceKc * line.quantity }] : [];
  });

  if (lines.length === 0) {
    return (
      <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
        <p className="text-neutral-600 mb-4">Košík je prázdný.</p>
        <Link
          href="/eshop"
          className="inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
        >
          Vybrat polévky
        </Link>
      </div>
    );
  }

  const subtotalKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 lg:gap-10 items-start">
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {lines.map((line) => (
          <li key={line.slug} className="py-4 flex gap-3 sm:gap-4">
            <ProductImage name={line.product.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/eshop/produkt/${line.slug}`} className="font-medium hover:underline underline-offset-2">
                  {line.product.name}
                </Link>
                <p className="font-medium tabular-nums shrink-0">{formatKc(line.lineTotalKc)}</p>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{formatKc(line.product.priceKc)} / ks</p>
              <div className="mt-2 flex items-center gap-3">
                <QuantityStepper
                  value={line.quantity}
                  onChange={(value) => setQuantity(line.slug, value)}
                  label={`Množství – ${line.product.name}`}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(line.slug, 0)}
                  className="text-neutral-400 hover:text-begina-accent-700 p-1"
                  aria-label={`Odebrat ${line.product.name}`}
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <aside className="bg-begina-primary-50 border border-neutral-200 rounded-2xl p-5">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-600">Mezisoučet</span>
          <span className="font-medium tabular-nums">{formatKc(subtotalKc)}</span>
        </div>
        <p className="text-xs text-neutral-500 mt-1">Doprava se vybírá v dalším kroku.</p>
        <Link
          href="/eshop/pokladna"
          className="mt-5 w-full flex items-center justify-center bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg h-11"
        >
          Pokračovat k objednávce
        </Link>
        <Link href="/eshop" className="mt-3 block text-center text-sm text-neutral-600 hover:underline">
          Pokračovat v nákupu
        </Link>
      </aside>
    </div>
  );
}
