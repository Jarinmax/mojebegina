import ShopLink from "./ShopLink";
import { isOrderable, isSoldOut, NOT_ORDERABLE_LABEL, NOT_ORDERABLE_NOTICE } from "@/lib/eshop/productRules";
import type { Product } from "@/lib/eshop/types";
import { formatPrice } from "@/lib/format";
import ProductImage from "./ProductImage";
import AddToCartButton, { InStockBadge, SoldOutBadge } from "./AddToCartButton";
import { afterOpeningBadge } from "@/lib/eshop/productFacts";
import { splitLastSentence } from "@/lib/eshop/typography";
import { countLabel, formatAverage } from "@/lib/eshop/reviewsFormat";
import Stars from "./Stars";
import { isTastingSet } from "@/lib/eshop/tastingSet";
import { isSoupPack } from "@/lib/eshop/soupPack";

export default function ProductCard({ product }: { product: Product }) {
  const href = `/produkt/${product.slug}`;
  const hasChoice = product.variants.length > 1;
  // štítek s trvanlivostí po otevření (16. 11. 2026) — z textu trvanlivosti produktu
  const opened = afterOpeningBadge(product);
  // ochutnávkový set: štítek Novinka, cena vč. dopravy a výběr sirupů až na stránce produktu
  const isSet = isTastingSet(product);
  const isPack = isSoupPack(product);
  return (
    <li className="flex flex-col border border-neutral-200 rounded-2xl p-3 bg-white">
      <ShopLink href={href} className="group flex flex-col flex-1">
        <ProductImage name={product.name} src={product.image} />
        <div className="px-1 pt-3 flex-1">
          <h2 className="font-medium group-hover:underline underline-offset-2">{product.name}</h2>
          {product.isAgeRestricted && (
            // alkohol: označení i na kartě (14. 11. 2026 — Svařák Deluxe mezi Nejoblíbenějšími na úvodní stránce)
            <p className="mt-0.5 text-xs font-medium text-neutral-600">18+ · obsahuje alkohol</p>
          )}
          {product.rating && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600 tabular-nums">
              <Stars value={product.rating.average} size={14} label={`Hodnocení ${formatAverage(product.rating.average)} z 5`} />
              <span className="font-medium">{formatAverage(product.rating.average)}</span>
              <span>({countLabel(product.rating.count)})</span>
            </p>
          )}
          {product.shortDescription && (
            <p className="text-sm text-neutral-500 mt-0.5">
              {isSet ? <SentencesOnLines text={product.shortDescription} /> : product.shortDescription}
            </p>
          )}
          {isSet && <p className="mt-1.5 inline-block rounded-full border border-[#B5762A] bg-[#FBF3E6] px-2.5 py-0.5 text-xs font-semibold text-[#8A5A1E]">Novinka</p>}
          {opened && (
            <p className="mt-1.5 inline-block rounded-full bg-[#F1EFE3] px-2 py-0.5 text-xs font-medium text-[#4A5527]">{opened}</p>
          )}
        </div>
      </ShopLink>
      <div className={`px-1 pt-3 flex items-center justify-between gap-3 ${hasChoice ? "flex-wrap" : ""}`}>
        {hasChoice ? (
          // Cena každého balení zvlášť (11. 11. 2026) — „od 199 Kč“ vedle
          // „až 150 nápojů“ (platí pro 3 l) mohlo zákazníka uvést v omyl.
          <ul className="grid grid-cols-[max-content_max-content] items-center gap-x-1.5 font-semibold tabular-nums text-sm leading-snug" aria-label="Ceny podle balení">
            {[...product.variants]
              // 22. 11. 2026 (Lucie): nahoře balení „skladem“, pod nimi „vyprodáno“;
              // ve skupině menší balení nahoře, 3 l pod ním. Štítky zarovnané do sloupce (subgrid).
              .sort(
                (a, b) =>
                  Number(a.soldOut === true) - Number(b.soldOut === true) ||
                  (a.volumeMl ?? 0) - (b.volumeMl ?? 0) ||
                  a.priceKc - b.priceKc,
              )
              .map((v) => (
                <li key={v.sku ?? v.label ?? v.priceKc} className="col-span-2 grid grid-cols-subgrid items-center justify-items-start whitespace-nowrap">
                  <span className={v.soldOut === true ? "text-neutral-500 font-normal" : ""}>
                    {formatPrice(v.priceKc)}
                    {v.label ? <span className="font-normal text-neutral-500"> / {v.label}</span> : null}
                  </span>
                  {v.soldOut === true ? <SoldOutBadge className="h-4 px-1 text-[9px]" /> : <InStockBadge />}
                </li>
              ))}
          </ul>
        ) : (
          <p className="font-semibold tabular-nums leading-snug">
            {isSet && product.tastingCampaign && <s className="mr-1.5 font-normal text-neutral-500">{formatPrice(product.tastingCampaign.regularPriceKc)}</s>}
            {formatPrice(product.variants[0].priceKc)}
            {isSet && product.tastingCampaign && <span className="block text-[13px] font-normal text-neutral-500">vč. dopravy</span>}
          </p>
        )}
        <div className={hasChoice ? "w-full" : "w-36"}>
          {!isOrderable(product) ? (
            <span
              title={NOT_ORDERABLE_NOTICE}
              className="flex items-center justify-center border border-neutral-200 text-neutral-500 text-sm font-medium rounded-lg px-3 h-9"
            >
              {NOT_ORDERABLE_LABEL}
            </span>
          ) : isSoldOut(product) ? (
            <SoldOutBadge className="w-full h-9 text-sm" />
          ) : hasChoice || isSet || isPack ? (
            <ShopLink
              href={href}
              className="flex items-center justify-center border border-begina-primary-900 text-sm font-medium rounded-lg px-3 h-9 hover:bg-begina-primary-50"
            >
              {isSet ? "Vybrat sirupy" : isPack ? "Vybrat polévky" : "Vybrat balení"}
            </ShopLink>
          ) : (
            <AddToCartButton name={product.name} variants={product.variants} compact />
          )}
        </div>
      </div>
    </li>
  );
}

/** Ochutnávkový set: poslední věta popisku na vlastním řádku (Lucie 18. 11. 2026). */
function SentencesOnLines({ text }: { text: string }) {
  const [head, last] = splitLastSentence(text);
  return (
    <>
      {head}
      {last && (
        <>
          {" "}
          <span className="block">{last}</span>
        </>
      )}
    </>
  );
}
