import Link from "next/link";
import { products } from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import ProductImage from "@/components/eshop/ProductImage";
import AddToCartButton from "@/components/eshop/AddToCartButton";

export default function EshopPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <section className="mb-8 sm:mb-10 max-w-xl">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">Polévky Begina</h1>
        <p className="text-neutral-600">
          Vyberte si polévky, zvolte doručení a zbytek zařídíme my.
        </p>
      </section>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {products.map((product) => (
          <li key={product.slug} className="flex flex-col border border-neutral-200 rounded-2xl p-3 bg-white">
            <Link href={`/eshop/produkt/${product.slug}`} className="group flex flex-col flex-1">
              <ProductImage name={product.name} />
              <div className="px-1 pt-3 flex-1">
                <h2 className="font-medium group-hover:underline underline-offset-2">{product.name}</h2>
                <p className="text-sm text-neutral-500 mt-0.5">{product.shortDescription}</p>
              </div>
            </Link>
            <div className="px-1 pt-3 flex items-center justify-between gap-3">
              <p className="font-semibold tabular-nums">{formatKc(product.priceKc)}</p>
              <div className="w-32">
                <AddToCartButton slug={product.slug} name={product.name} compact />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
