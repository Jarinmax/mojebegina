import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { categories, findCategory, productsInCategory, AGE_RESTRICTION_NOTICE } from "@/lib/eshop/catalog";
import ProductCard from "@/components/eshop/ProductCard";

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/eshop/kategorie/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = findCategory(slug);
  return category ? { title: category.name } : {};
}

export default async function CategoryPage({ params }: PageProps<"/eshop/kategorie/[slug]">) {
  const { slug } = await params;
  const category = findCategory(slug);
  if (!category) {
    notFound();
  }
  const items = productsInCategory(category.slug);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <Link href="/eshop" className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-4 -ml-1">
        <ChevronLeft className="w-4 h-4" />
        Všechny kategorie
      </Link>

      <section className="text-center max-w-3xl mx-auto mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{category.name}</h1>
        {category.intro.map((paragraph, index) => (
          <p key={paragraph} className={`mt-3 ${index === 0 ? "font-medium" : "text-neutral-600"}`}>
            {paragraph}
          </p>
        ))}
        {category.ageRestricted && <p className="mt-3 font-medium">🔞 {AGE_RESTRICTION_NOTICE}</p>}
      </section>

      {items.length === 0 ? (
        <p className="border border-dashed border-neutral-300 rounded-2xl px-4 py-8 text-sm text-neutral-500 text-center">
          Nabídku doplníme.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {items.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}
