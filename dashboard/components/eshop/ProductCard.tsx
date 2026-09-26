import Link from "next/link";
import { lowestPriceKc, type Product } from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import ProductImage from "./ProductImage";
import AddToCartButton from "./AddToCartButton";

export default function ProductCard({ product }: { product: Product }) {
  const href = `/eshop/produkt/${product.slug}`;
  const hasChoice = product.variants.length > 1;
  return (
    <li className="flex flex-col border border-neutral-200 rounded-2xl p-3 bg-white">
      <Link href={href} className="group flex flex-col flex-1">
        <ProductImage name={product.name} src={product.image} />
        <div className="px-1 pt-3 flex-1">
          <h2 className="font-medium group-hover:underline underline-offset-2">{product.name}</h2>
          {product.shortDescription && (
            <p className="text-sm text-neutral-500 mt-0.5">{product.shortDescription}</p>
          )}
        </div>
      </Link>
      <div className="px-1 pt-3 flex items-center justify-between gap-3">
        <p className="font-semibold tabular-nums">
          {hasChoice ? `od ${formatKc(lowestPriceKc(product))}` : formatKc(product.variants[0].priceKc)}
        </p>
        <div className="w-36">
          {hasChoice ? (
            <Link
              href={href}
              className="flex items-center justify-center border border-begina-primary-900 text-sm font-medium rounded-lg px-3 h-9 hover:bg-begina-primary-50"
            >
              Vybrat balení
            </Link>
          ) : (
            <AddToCartButton name={product.name} variants={product.variants} compact />
          )}
        </div>
      </div>
    </li>
  );
}
