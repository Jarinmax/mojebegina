import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProduct, products, type Product } from "@/lib/eshop/catalog";
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
  return product ? { title: product.name, description: product.shortDescription } : {};
}

const MISSING = "Doplníme";

function foodInfoRows(product: Product): { label: string; value: string | null }[] {
  const info = product.foodInfo;
  return [
    { label: "Balení", value: product.packageLabel },
    { label: "Složení", value: info.ingredients },
    {
      label: "Alergeny",
      value: info.allergens === null ? null : info.allergens.length ? info.allergens.join(", ") : "Bez alergenů",
    },
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <Link href="/eshop" className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-6 -ml-1">
        <ChevronLeft className="w-4 h-4" />
        Všechny polévky
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
        <ProductImage name={product.name} size="lg" />

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-neutral-600 mt-2">{product.shortDescription}</p>
          <p className="text-2xl font-semibold mt-5 tabular-nums">{formatKc(product.priceKc)}</p>

          <div className="mt-6">
            <AddToCartButton slug={product.slug} name={product.name} />
          </div>

          <section className="mt-8 border-t border-neutral-200 pt-6" aria-labelledby="food-info">
            <h2 id="food-info" className="font-medium mb-3">Informace o potravině</h2>
            <dl className="text-sm divide-y divide-neutral-100">
              {foodInfoRows(product).map((row) => (
                <div key={row.label} className="py-2.5 grid grid-cols-[10rem_1fr] gap-3">
                  <dt className="text-neutral-500">{row.label}</dt>
                  <dd className={row.value === null ? "text-neutral-400 italic" : ""}>
                    {row.value ?? MISSING}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
