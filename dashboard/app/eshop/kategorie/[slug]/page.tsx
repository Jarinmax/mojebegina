import type { Metadata } from "next";
import ShopLink from "@/components/eshop/ShopLink";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { AGE_RESTRICTION_NOTICE } from "@/lib/eshop/productRules";
import ProductCard from "@/components/eshop/ProductCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/eshop/kategorie/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getCatalogIndex()).findCategory(slug);
  return category ? { title: category.name, alternates: { canonical: `/kategorie/${category.slug}` } } : {};
}

export default async function CategoryPage({ params }: PageProps<"/eshop/kategorie/[slug]">) {
  const { slug } = await params;
  const index = await getCatalogIndex();
  const category = index.findCategory(slug);
  if (!category) {
    notFound();
  }
  const items = index.productsInCategory(category.slug);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <ShopLink href="/" className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-4 -ml-1">
        <ChevronLeft className="w-4 h-4" />
        Všechny kategorie
      </ShopLink>

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
          Připravujeme — nabídku brzy doplníme.
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
