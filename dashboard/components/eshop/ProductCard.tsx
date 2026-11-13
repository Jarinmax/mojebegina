import ShopLink from "./ShopLink";
import { isOrderable, NOT_ORDERABLE_LABEL, NOT_ORDERABLE_NOTICE } from "@/lib/eshop/productRules";
import type { Product } from "@/lib/eshop/types";
import { formatKc } from "@/lib/format";
import ProductImage from "./ProductImage";
import AddToCartButton from "./AddToCartButton";

export default function ProductCard({ product }: { product: Product }) {
  const href = `/produkt/${product.slug}`;
  const hasChoice = product.variants.length > 1;
  return (
    <li className="flex flex-col border border-neutral-200 rounded-2xl p-3 bg-white">
      <ShopLink href={href} className="group flex flex-col flex-1">
        <ProductImage name={product.name} src={product.image} />
        <div className="px-1 pt-3 flex-1">
          <h2 className="font-medium group-hover:underline underline-offset-2">{product.name}</h2>
          {product.shortDescription && (
            <p className="text-sm text-neutral-500 mt-0.5">{product.shortDescription}</p>
          )}
        </div>
      </ShopLink>
      <div className="px-1 pt-3 flex items-center justify-between gap-3">
        {hasChoice ? (
          // Cena každého balení zvlášť (11. 11. 2026) — „od 199 Kč“ vedle
          // „až 150 nápojů“ (platí pro 3 l) mohlo zákazníka uvést v omyl.
          <ul className="font-semibold tabular-nums text-sm leading-snug" aria-label="Ceny podle balení">
            {[...product.variants]
              .sort((a, b) => a.priceKc - b.priceKc)
              .map((v) => (
                <li key={v.sku ?? v.label ?? v.priceKc}>
                  {formatKc(v.priceKc)}
                  {v.label ? <span className="font-normal text-neutral-500"> / {v.label}</span> : null}
                </li>
              ))}
          </ul>
        ) : (
          <p className="font-semibold tabular-nums">{formatKc(product.variants[0].priceKc)}</p>
        )}
        <div className="w-36">
          {!isOrderable(product) ? (
            <span
              title={NOT_ORDERABLE_NOTICE}
              className="flex items-center justify-center border border-neutral-200 text-neutral-500 text-sm font-medium rounded-lg px-3 h-9"
            >
              {NOT_ORDERABLE_LABEL}
            </span>
          ) : hasChoice ? (
            <ShopLink
              href={href}
              className="flex items-center justify-center border border-begina-primary-900 text-sm font-medium rounded-lg px-3 h-9 hover:bg-begina-primary-50"
            >
              Vybrat balení
            </ShopLink>
          ) : (
            <AddToCartButton name={product.name} variants={product.variants} compact />
          )}
        </div>
      </div>
    </li>
  );
}
