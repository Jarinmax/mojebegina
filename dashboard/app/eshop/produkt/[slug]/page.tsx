import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Snowflake } from "lucide-react";
import {
  getProduct,
  getCategory,
  isAgeRestricted,
  lowestPriceKc,
  products,
  AGE_RESTRICTION_NOTICE,
  type Product,
} from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import ProductImage from "@/components/eshop/ProductImage";
import AddToCartButton from "@/components/eshop/AddToCartButton";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/eshop/produkt/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return product ? { title: product.name, description: product.shortDescription ?? undefined } : {};
}

const MISSING = "Doplníme";

function foodInfoRows(product: Product): { label: string; value: string | null }[] {
  const info = product.foodInfo;
  const packages = product.variants.every((variant) => variant.label)
    ? product.variants.map((variant) => variant.label).join(", ")
    : null;
  return [
    { label: "Balení", value: packages },
    { label: "Složení", value: info.ingredients },
    {
      label: "Alergeny",
      value: info.allergens === null ? null : info.allergens.length ? info.allergens.join(", ") : "Bez alergenů",
    },
    ...(isAgeRestricted(product)
      ? [
          {
            label: "Obsah alkoholu",
            value:
              product.alcoholPercent === null
                ? null
                : `${new Intl.NumberFormat("cs-CZ").format(product.alcoholPercent)} % obj.`,
          },
        ]
      : []),
    { label: "Výživové hodnoty (100 g)", value: info.nutritionPer100g },
    { label: "Skladování", value: info.storage },
    { label: "Trvanlivost", value: info.shelfLife },
  ];
}

export default async function ProductPage({ params }: PageProps<"/eshop/produkt/[slug]">) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) {
    notFound();
  }
  const category = getCategory(product.category);
  const hasChoice = product.variants.length > 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <Link
        href={`/eshop/kategorie/${category.slug}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-6 -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        {category.name}
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
        <div className="md:sticky md:top-20">
          <ProductImage name={product.name} src={product.image} size="lg" />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{product.name}</h1>
          {product.shortDescription && <p className="text-neutral-600 mt-2">{product.shortDescription}</p>}
          <p className="text-2xl font-semibold mt-5 tabular-nums">
            {hasChoice ? `od ${formatKc(lowestPriceKc(product))}` : formatKc(product.variants[0].priceKc)}
          </p>

          {product.highlights.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1.5 font-medium">
              {product.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <AddToCartButton name={product.name} variants={product.variants} />
          </div>

          <p className="mt-5 text-sm text-neutral-600 flex items-start gap-2">
            <Snowflake className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500" />
            Tento produkt vám doručíme chlazenou přepravou.
          </p>

          {category.ageRestricted && (
            <p className="mt-3 text-sm font-medium">🔞 {AGE_RESTRICTION_NOTICE}</p>
          )}

          {product.description.length > 0 && (
            <section className="mt-8 border-t border-neutral-200 pt-6 flex flex-col gap-3 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900">Popis</h2>
              {product.description.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          )}

          {category.detailSections.map((section) => (
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
              <p>{product.taste}</p>
            </section>
          )}

          {product.variants.some((variant) => variant.description) && (
            <section className="mt-8 border-t border-neutral-200 pt-6 text-neutral-700">
              <h2 className="font-medium text-begina-primary-900 mb-3">Balení</h2>
              <ul className="flex flex-col gap-3">
                {product.variants.map((variant) => (
                  <li key={variant.sku}>
                    <span className="font-medium text-begina-primary-900">{variant.label}.</span>{" "}
                    {variant.description}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8 border-t border-neutral-200 pt-6" aria-labelledby="food-info">
            <h2 id="food-info" className="font-medium mb-3">Informace o potravině</h2>
            <dl className="text-sm divide-y divide-neutral-100">
              {foodInfoRows(product).map((row) => (
                <div key={row.label} className="py-2.5 grid grid-cols-[8.5rem_1fr] sm:grid-cols-[10rem_1fr] gap-3">
                  <dt className="text-neutral-500">{row.label}</dt>
                  <dd className={row.value === null ? "text-neutral-400 italic" : ""}>
                    {row.value ?? MISSING}
                  </dd>
                </div>
              ))}
            </dl>
            {product.warnings.map((warning) => (
              <p key={warning} className="mt-3 text-sm text-neutral-600">
                {warning}
              </p>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
