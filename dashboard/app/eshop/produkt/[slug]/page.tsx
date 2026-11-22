import type { Metadata } from "next";
import ShopLink from "@/components/eshop/ShopLink";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronLeft, Clock, Package, Snowflake } from "lucide-react";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { legacyProductFallback } from "@/lib/eshop/legacyProducts";
import { eshopHref } from "@/lib/eshop/paths";
import { eshopBase } from "@/lib/eshop/siteServer";
import {
  AGE_RESTRICTION_NOTICE,
  nutritionNotRequired,
  isOrderable,
  lowestPriceKc,
  NOT_ORDERABLE_LABEL,
  NOT_ORDERABLE_NOTICE,
} from "@/lib/eshop/productRules";
import type { Product } from "@/lib/eshop/types";
import { formatKc } from "@/lib/format";
import ProductGallery from "@/components/eshop/ProductGallery";
import ProductReviews from "@/components/eshop/ProductReviews";
import Stars from "@/components/eshop/Stars";
import { countLabel, formatAverage } from "@/lib/eshop/reviewsFormat";
import { loadProductReviews } from "@/lib/eshop/reviewsServer";
import TastingSetForm from "@/components/eshop/TastingSetForm";
import { SET_CAMPAIGN_PRICE_NOTE, SET_DELIVERY_NOTE, SET_DELIVERY_NOTE_CAMPAIGN, SET_LINK_LABEL, SET_LINK_QUESTION, SET_PHOTO_NOTE, SET_SLUG, SET_SYRUPS, SET_SYRUPS_HEADING, SET_UNDER_PRICE, isTastingSet, lowestPriceNote, remainingLabel } from "@/lib/eshop/tastingSet";
import ServingPriceLine from "@/components/eshop/ServingPriceLine";
import AddToCartButton from "@/components/eshop/AddToCartButton";
import { boxNote } from "@/lib/eshop/boxOption";
import { askSamplesLink } from "@/lib/eshop/cafePage";
import MetaViewContent from "@/components/eshop/MetaViewContent";
import PageCarousel from "@/components/eshop/PageCarousel";
import DescriptionBlocks from "@/components/eshop/DescriptionBlocks";
import { parseDescription } from "@/lib/eshop/productDescription";
import type { ReactNode } from "react";
import { CAFE_PATH, CAFE_PRODUCT_LINE } from "@/lib/eshop/cafePage";
import { isCafeTasting } from "@/lib/eshop/cafeTasting";
import { TERMS_PATH } from "@/lib/eshop/soupFoodInfo";
import { asSentence, keepTogether } from "@/lib/eshop/typography";
import { PACKAGING_MORE_LABEL, PACKAGING_PAGE_PATH, packagingCopy } from "@/lib/eshop/packaging";
import { productDeliveryNote } from "@/lib/eshop/zasilkovna";
import { shippingModeFromEnv, zasilkovnaEnabledFromEnv } from "@/lib/eshop/shipping";
import { productShippingNote } from "@/lib/eshop/shippingHint";
import { afterOpeningLine, highlightAllergens, NO_PRESERVATIVES, servingPhotoNote, servingPrices, showsNoPreservatives } from "@/lib/eshop/productFacts";
import { breadcrumbJsonLd, jsonLd, productDescription, productJsonLd, productTitle } from "@/lib/eshop/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/eshop/produkt/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const index = await getCatalogIndex();
  const product = index.getProduct(slug);
  if (!product) return {};
  // popis pro vyhledávače = první odstavec popisu produktu; název + kategorie (12. 11. 2026)
  const description = productDescription(product);
  return {
    title: productTitle(product, index.findCategory(product.category) ?? null),
    description,
    alternates: { canonical: `/produkt/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: `/produkt/${product.slug}`,
      ...(product.image ? { images: [product.image] } : {}),
    },
    // vlastní náhled produktu i na X/Twitteru (jinak by se zdědilo logo z layoutu)
    twitter: {
      card: product.image ? "summary_large_image" : "summary",
      title: product.name,
      description,
      ...(product.image ? { images: [product.image] } : {}),
    },
  };
}

const MISSING = "Doplníme";

// Výživové údaje jako tabulka (všechny produkty s úplnými údaji,
// lib/eshop/nutrition.ts): vlevo název, vpravo hodnota zarovnaná doprava;
// přes celou šířku bloku, bez samostatného nadpisu (záhlaví tabulky ho nese).
function NutritionTableView({ table }: { table: NonNullable<Product["foodInfo"]["nutritionTable"]> }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Průměrné výživové hodnoty na {table.basis}</caption>
      <thead>
        <tr className="border-b border-neutral-200">
          <th scope="col" className="pb-2 pr-3 font-normal text-neutral-500">Průměrné výživové hodnoty</th>
          <th scope="col" className="pb-2 text-right font-normal text-neutral-500 whitespace-nowrap">
            na {table.basis.replace(" ", "\u00a0")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {table.rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className={`py-2 pr-3 font-normal ${row.sub ? "pl-4" : ""}`}>
              {row.label}
            </th>
            <td className="py-2 text-right tabular-nums whitespace-nowrap">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ingredientsValue(ingredients: string | null, allergens: string[] | null): ReactNode | null {
  const sentence = asSentence(ingredients);
  if (sentence === null) return null;
  const segments = highlightAllergens(sentence, allergens);
  if (segments.every((segment) => !segment.bold)) return sentence;
  return segments.map((segment, index) => (segment.bold ? <strong key={index}>{segment.text}</strong> : segment.text));
}

function foodInfoRows(product: Product): { label: string; value: ReactNode | null; wide?: boolean }[] {
  const info = product.foodInfo;
  const packages = product.variants.every((variant) => variant.label)
    ? product.variants.map((variant) => variant.label).join(", ")
    : null;
  return [
    { label: "Balení", value: packages },
    // Typografie (10. 11. 2026): seznamy a věty velkým písmenem s tečkou,
    // samostatné hodnoty (balení, obsah alkoholu) beze změny.
    // Alergeny ve složení tučně (16. 11. 2026, čl. 21 nař. 1169/2011) — jen ty,
    // které má produkt v řádku Alergeny; text složení se nemění.
    { label: "Složení", value: ingredientsValue(info.ingredients, info.allergens) },
    // Alergeny (10. 11. 2026): veřejně jen skutečně přítomné alergeny. Prázdný
    // seznam v DB (interně „ověřeno, receptura bez povinných alergenů“) se už
    // nezobrazuje jako „Neobsahuje žádný z alergenů…“ — výroba je ve společném
    // prostoru s lepkem a mlékem, takže to tvrzení není podložené; řádek
    // se pak vynechá. Interní údaj i kontrola úplnosti dat zůstávají.
    // Neověřené alergeny (null) se veřejně neoznačují „Ověřujeme“ — řádek se
    // vynechá a produkt nejde objednat (isOrderable), dokud se údaj nedoplní.
    ...(info.allergens?.length
      ? [{ label: "Alergeny", value: asSentence(info.allergens.join(", ")) }]
      : []),
    ...(product.isAgeRestricted
      ? [
          {
            label: "Obsah alkoholu",
            value:
              product.alcoholPercent === null
                ? null
                : `${new Intl.NumberFormat("cs-CZ").format(product.alcoholPercent)}\u00a0% obj.`,
          },
        ]
      : []),
    // Nápoje nad 1,2 % obj. alkoholu nemusí výživu uvádět (čl. 16 odst. 4
    // nař. 1169/2011): bez údajů se řádek vynechá místo „Doplníme“
    // (koktejly, 10. 11. 2026). Kde údaje jsou (Svařák), zobrazí se.
    ...(info.nutritionTable
      ? [{ label: "Výživové hodnoty", value: <NutritionTableView table={info.nutritionTable} />, wide: true }]
      : info.nutritionPer100g === null && nutritionNotRequired(product)
        ? []
        : [{ label: "Výživové hodnoty", value: asSentence(info.nutritionPer100g) }]),
    { label: "Skladování", value: asSentence(info.storage) },
    { label: "Trvanlivost", value: asSentence(info.shelfLife) },
    ...(info.preparation ? [{ label: "Příprava", value: asSentence(info.preparation) }] : []),
    ...(info.returns
      ? [
          {
            label: "Vrácení a reklamace",
            value: (
              <>
                {keepTogether(info.returns.before)}
                <ShopLink href={TERMS_PATH} className="underline text-begina-primary-900 hover:no-underline">
                  {info.returns.linkText}
                </ShopLink>
                {info.returns.after}
              </>
            ),
          },
        ]
      : []),
  ];
}

export default async function ProductPage({ params }: PageProps<"/eshop/produkt/[slug]">) {
  const { slug } = await params;
  const index = await getCatalogIndex();
  // Ochutnávka do provozu nemá vlastní stránku — objednává se na Pro kavárny a bistra.
  if (isCafeTasting({ slug })) redirect(eshopHref(await eshopBase(), CAFE_PATH));
  const product = index.getProduct(slug);
  const category = product ? index.findCategory(product.category) : undefined;
  if (!product || !category) {
    // Stará adresa z WordPressu u produktu, který zatím není vidět → kategorie (307).
    const fallback = legacyProductFallback(slug, index);
    if (fallback) redirect(eshopHref(await eshopBase(), fallback));
    notFound();
  }
  const hasChoice = product.variants.length > 1;
  // Úvodní odstavce = „Popis“; sekce „## …“ (Pro koho je vhodný, Jak sirup používat…) až pod chutí, jako na begina.cz.
  const description = parseDescription(product.description);
  const openedLine = afterOpeningLine(product);
  const isSet = isTastingSet(product);
  const campaign = product.tastingCampaign;
  // odkaz na set na stránce každého sirupu — jen když je set v katalogu vidět
  const showSetLink = !isSet && product.category === "sirupy" && index.getProduct(SET_SLUG) !== undefined;
  const portions = isSet ? [] : servingPrices(product);
  const reviews = await loadProductReviews(product.slug);
  // „bez konzervantů“ jen kde ve složení žádný konzervant není (16. 11. 2026)
  const highlights = showsNoPreservatives(product) ? [...product.highlights, NO_PRESERVATIVES] : product.highlights;
  const packagingItems = product.variants.flatMap((variant) => {
    const copy = packagingCopy(product.category, variant.label);
    return copy ? [{ sku: variant.sku, copy }] : [];
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product, category)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: "Begina", path: "/" },
              { name: category.name, path: `/kategorie/${category.slug}` },
              { name: product.name, path: `/produkt/${product.slug}` },
            ])
          ),
        }}
      />
      <ShopLink
        href={`/kategorie/${category.slug}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-6 -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        {category.name}
      </ShopLink>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
        <div className="md:sticky md:top-20">
          <ProductGallery
            name={product.name}
            note={isSet ? SET_PHOTO_NOTE : servingPhotoNote(product)}
            photos={product.gallery?.length ? product.gallery : product.image ? [{ url: product.image, alt: product.name }] : []}
          />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{product.name}</h1>
          {product.rating && (
            <a href="#hodnoceni" className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-600 tabular-nums hover:underline underline-offset-2">
              <Stars value={product.rating.average} label={`Hodnocení ${formatAverage(product.rating.average)} z 5`} />
              <span className="font-medium">{formatAverage(product.rating.average)}</span>
              <span>({countLabel(product.rating.count)})</span>
            </a>
          )}
          {product.shortDescription && <p className="text-neutral-600 mt-2">{product.shortDescription}</p>}
          <p className="text-2xl font-semibold mt-5 tabular-nums">
            {isSet && campaign && <s className="mr-2 text-lg font-normal text-neutral-500">{formatKc(campaign.regularPriceKc)}</s>}
            {hasChoice ? `od ${formatKc(lowestPriceKc(product))}` : formatKc(product.variants[0].priceKc)}
            {isSet && campaign && <span className="ml-2 text-base font-medium text-neutral-700">vč. dopravy Zásilkovnou</span>}
          </p>
          {isSet && (
            <div className="mt-3 flex flex-col items-start gap-1.5 text-sm text-neutral-700">
              {campaign && <p className="font-medium">{SET_CAMPAIGN_PRICE_NOTE}</p>}
              {campaign && (
                <p className="rounded-full bg-[#F1EFE3] px-2.5 py-0.5 text-[13px] font-medium text-[#4A5527] tabular-nums">{remainingLabel(campaign.remaining)}</p>
              )}
              {campaign && <p className="text-[13px] text-neutral-500">{lowestPriceNote(campaign.regularPriceKc)}</p>}
              <p>{SET_UNDER_PRICE}</p>
            </div>
          )}
          {!isSet && shippingModeFromEnv() === "weight" && (
            <p className="mt-2 text-sm text-neutral-700">
              🚚 {productShippingNote(product.variants.find((variant) => (variant.volumeMl ?? 0) >= 2900)?.weightGrams ?? null)}{" "}
              <ShopLink href="/doprava" className="underline underline-offset-2 whitespace-nowrap">Ceník dopravy</ShopLink>
            </p>
          )}

          {/* Trvanlivost po otevření a cena za porci (16. 11. 2026) — odvozeno z údajů
              produktu (text trvanlivosti, cena, objem, počet porcí); bez údaje se řádek vynechá. */}
          {(openedLine || portions.length > 0) && (
            <div className="mt-3 flex flex-col gap-1 text-sm text-neutral-700">
              {openedLine && (
                <p className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#5E6B34]" aria-hidden="true" />
                  {openedLine}
                </p>
              )}
              <ServingPriceLine rows={portions} defaultSku={(product.variants.find((variant) => variant.soldOut !== true) ?? product.variants[0]).sku} />
            </div>
          )}

          {highlights.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1.5 font-medium">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}

          <MetaViewContent sku={product.variants[0].sku} name={product.name} priceKc={lowestPriceKc(product)} />
          <div className="mt-6">
            {isOrderable(product) && isSet ? (
              <TastingSetForm name={product.name} sku={product.variants[0].sku} priceKc={product.variants[0].priceKc} maxQuantity={campaign?.remaining} />
            ) : isOrderable(product) ? (
              <>
                <AddToCartButton name={product.name} variants={product.variants} />
                {/* Krabice za 19 Kč (Lucie 22. 11. 2026): hned pod Do košíku, i na mobilu */}
                {boxNote(product) && <p className="mt-2 text-sm text-neutral-600">{boxNote(product)}</p>}
                {askSamplesLink(product) && (
                  <p className="mt-2 text-sm text-neutral-600">
                    {askSamplesLink(product)!.text}{" "}
                    <a href={askSamplesLink(product)!.href} className="font-semibold text-[#4A5527] underline underline-offset-4">
                      {askSamplesLink(product)!.label} →
                    </a>
                  </p>
                )}
              </>
            ) : (
              <div className="border border-neutral-200 rounded-xl p-4">
                <p className="font-medium">{NOT_ORDERABLE_LABEL}</p>
                <p className="text-sm text-neutral-600 mt-1">{NOT_ORDERABLE_NOTICE}</p>
              </div>
            )}
          </div>

          {/* Odkaz pro provozy pod Do košíku (Lucie 20. 11. 2026) */}
          {isOrderable(product) && !isSet && (
            <p className="mt-3 text-sm text-neutral-700">
              {CAFE_PRODUCT_LINE.text}{" "}
              <ShopLink href={CAFE_PATH} className="font-medium text-[#4A5527] underline underline-offset-4">
                {CAFE_PRODUCT_LINE.link} →
              </ShopLink>
            </p>
          )}

          {showSetLink && (
            <p className="mt-3 text-sm">
              {SET_LINK_QUESTION}{" "}
              <ShopLink href={`/produkt/${SET_SLUG}`} className="font-medium underline underline-offset-2">
                {SET_LINK_LABEL}
              </ShopLink>
            </p>
          )}

          <p className="mt-5 text-sm text-neutral-600 flex items-start gap-2">
            {/* vločka jen u chlazené přepravy; set jde Zásilkovnou → balík */}
            {isSet ? <Package className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500" /> : <Snowflake className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500" />}
            {isSet ? (campaign ? SET_DELIVERY_NOTE_CAMPAIGN : SET_DELIVERY_NOTE) : productDeliveryNote(product, zasilkovnaEnabledFromEnv())}
          </p>

          {product.isAgeRestricted && (
            <p className="mt-3 text-sm font-medium">🔞 {AGE_RESTRICTION_NOTICE}</p>
          )}

          {description.intro.length > 0 && (
            <section className="mt-8 border-t border-neutral-200 pt-6 flex flex-col gap-3 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900">Popis</h2>
              <DescriptionBlocks blocks={description.intro} />
            </section>
          )}

          {(isSet ? [] : category.detailSections).map((section) => (
            <section key={section.title} className="mt-8 border-t border-neutral-200 pt-6 flex flex-col gap-3 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900">{section.title}</h2>
              {section.paragraphs[0] && <p>{section.paragraphs[0]}</p>}
              {section.bullets.length > 0 && (
                <ul className="list-disc pl-5 flex flex-col gap-0.5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              {section.paragraphs.slice(1).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}

          {product.taste && (
            <section className="mt-8 border-t border-neutral-200 pt-6 flex flex-col gap-3 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900">Jak chutná {product.name}</h2>
              {product.taste.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          )}

          {description.sections.map((section) => (
            <section key={section.title} className="mt-8 border-t border-neutral-200 pt-6 flex flex-col gap-3 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900">{section.title}</h2>
              <DescriptionBlocks blocks={section.blocks} />
            </section>
          ))}

          {/* Balení (9. 11. 2026): jen varianty, které produkt nabízí; objem tučně,
              pomlčka, popis malým písmenem; odkaz na stránku O balení. */}
          {packagingItems.length > 0 && (
            <section className="mt-8 border-t border-neutral-200 pt-6 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900 mb-3">Balení</h2>
              <ul className="flex flex-col gap-3">
                {packagingItems.map(({ sku, copy }) => (
                  <li key={sku}>
                    <strong className="font-semibold text-begina-primary-900">{copy.volume}</strong> – {copy.text}
                  </li>
                ))}
              </ul>
              <ShopLink href={PACKAGING_PAGE_PATH} className="mt-3 inline-block font-medium underline underline-offset-4 text-begina-primary-900">
                {PACKAGING_MORE_LABEL}
              </ShopLink>
            </section>
          )}

          <section className="mt-8 border-t border-neutral-200 pt-6" aria-labelledby="food-info">
            <h2 id="food-info" className="font-medium mb-3">Informace o potravině</h2>
            <dl className="text-sm divide-y divide-neutral-100">
              {/* mobil: název nad textem (celá šířka); od sm: název vlevo, obsah vpravo.
                  Tabulka výživy přes celou šířku, nadpis jen pro čtečky. */}
              {foodInfoRows(product).filter((row) => !isSet || row.value !== null).map((row) =>
                row.wide ? (
                  <div key={row.label} className="py-3">
                    <dt className="sr-only">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ) : (
                  <div key={row.label} className="py-3 grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
                    <dt className="text-neutral-500">{row.label}</dt>
                    <dd className={`min-w-0 break-words ${row.value === null ? "text-neutral-400 italic" : ""}`}>
                      {row.value ?? MISSING}
                    </dd>
                  </div>
                )
              )}
            </dl>
            {/* Set: složení všech sirupů z nabídky přímo na stránce (17. 11. 2026) —
                bere se ze stránek jednotlivých sirupů, takže je vždy stejné. */}
            {isSet && (
              <div className="mt-5">
                <h3 className="text-sm font-medium mb-1">{SET_SYRUPS_HEADING}</h3>
                <dl className="text-sm divide-y divide-neutral-100">
                  {SET_SYRUPS.map((syrup) => {
                    const info = index.getProduct(syrup.slug)?.foodInfo;
                    const value = info ? ingredientsValue(info.ingredients, info.allergens) : null;
                    return value === null ? null : (
                      <div key={syrup.code} className="py-3 grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
                        <dt className="text-neutral-500">{syrup.name}</dt>
                        <dd className="min-w-0 break-words">{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}
            {product.warnings.map((warning) => (
              <p key={warning} className="mt-3 text-sm text-neutral-600">
                {warning}
              </p>
            ))}
          </section>

          <ProductReviews summary={product.rating ?? null} reviews={reviews} />
        </div>
      </div>

      <PageCarousel />
    </div>
  );
}
