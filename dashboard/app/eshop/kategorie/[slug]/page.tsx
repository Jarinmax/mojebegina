import type { Metadata } from "next";
import ShopLink from "@/components/eshop/ShopLink";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { AGE_RESTRICTION_NOTICE } from "@/lib/eshop/productRules";
import { imageBackdrop } from "@/lib/eshop/productImages";
import { SHARE_DESCRIPTION, pageShareMeta } from "@/lib/eshop/shareMeta";
import ProductCard from "@/components/eshop/ProductCard";
import { splitLastSentence } from "@/lib/eshop/typography";
import { cheapestSyrupDrinkKc, withSyrupDrinkPrice } from "@/lib/eshop/syrupDrinkPrice";
import { breadcrumbJsonLd, categoryDescription, jsonLd } from "@/lib/eshop/seo";
import { CATEGORY_SOUPS_TEASER, SOUPS_CATEGORY_SEO } from "@/lib/eshop/cafePage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/eshop/kategorie/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const index = await getCatalogIndex();
  const category = index.findCategory(slug);
  if (!category) return {};
  // Náhled při sdílení: vlastní fotka jen u kategorií s čistou fotkou bez
  // zapečeného textu (polévky = hlavní fotka Dýňové); jinak logo z layoutu.
  const shareImage = imageBackdrop(category.image) ? category.image : null;
  // vlastní popis pro vyhledávače: názvy produktů + úvod kategorie (12. 11. 2026)
  const soups = category.slug === "polevky";
  const description = soups ? SOUPS_CATEGORY_SEO.description : categoryDescription(category, index.productsInCategory(category.slug)) || SHARE_DESCRIPTION;
  return {
    // polévky: vlastní SEO titulek z dokumentu ChatGPT (bez šablony layoutu)
    title: soups ? { absolute: SOUPS_CATEGORY_SEO.title } : category.name,
    description,
    alternates: { canonical: `/kategorie/${category.slug}` },
    ...(shareImage
      ? {
          openGraph: { type: "website", title: category.name, description, url: `/kategorie/${category.slug}`, images: [shareImage] },
          twitter: { card: "summary_large_image", title: category.name, description, images: [shareImage] },
        }
      : // Lucie 22. 11. 2026: odkaz na kategorii (např. sirupy) má v náhledu ukázat
        // název kategorie, ne obecné „Begina – Když rozhoduje chuť“.
        pageShareMeta(category.name, description, `/kategorie/${category.slug}`)),
  };
}

export default async function CategoryPage({ params }: PageProps<"/eshop/kategorie/[slug]">) {
  const { slug } = await params;
  const index = await getCatalogIndex();
  const category = index.findCategory(slug);
  if (!category) {
    notFound();
  }
  const items = index.productsInCategory(category.slug);
  // Sirupy: cena nápoje v úvodu z aktuální ceny nejlevnější beginy 3 l (22. 11. 2026)
  const drinkKc = category.slug === "sirupy" ? cheapestSyrupDrinkKc(items) : null;
  const intro = category.intro.map((paragraph) => withSyrupDrinkPrice(paragraph, drinkKc));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(breadcrumbJsonLd([{ name: "Begina", path: "/" }, { name: category.name, path: `/kategorie/${category.slug}` }])),
        }}
      />
      <ShopLink href="/" className="inline-flex items-center gap-1 text-sm text-neutral-600 mb-4 -ml-1">
        <ChevronLeft className="w-4 h-4" />
        Všechny kategorie
      </ShopLink>

      <section className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{category.name}</h1>
        {intro.map((paragraph, index) => {
          const [head, last] = splitLastSentence(paragraph);
          return (
            // mobil: nad produkty jen první odstavec, delší popis až pod nimi (zadání 22. 11. 2026 večer)
            <p key={paragraph} className={`mt-3 ${index === 0 ? "font-medium" : "hidden sm:block text-neutral-600"}`}>
              {head}
              {last && (
                <>
                  {" "}
                  <span className="sm:block">{last}</span>
                </>
              )}
            </p>
          );
        })}
        {category.ageRestricted && <p className="mt-3 font-medium">🔞 {AGE_RESTRICTION_NOTICE}</p>}
        {category.slug === "polevky" && (
          <p className="mt-4 rounded-xl border border-[#5E6B34] bg-[#FAF6EF] px-4 py-3 text-sm sm:text-base text-neutral-800">
            {CATEGORY_SOUPS_TEASER.text}{" "}
            <ShopLink href={CATEGORY_SOUPS_TEASER.pricesHref} className="font-semibold text-[#4A5527] underline underline-offset-4">
              {CATEGORY_SOUPS_TEASER.pricesLabel}
            </ShopLink>{" "}
            {CATEGORY_SOUPS_TEASER.offerText}{" "}
            <ShopLink href={CATEGORY_SOUPS_TEASER.href} className="font-semibold text-[#4A5527] underline underline-offset-4">
              {CATEGORY_SOUPS_TEASER.label} →
            </ShopLink>
          </p>
        )}
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
      {intro.length > 1 && (
        <section className="sm:hidden mt-8 text-center max-w-3xl mx-auto">
          {intro.slice(1).map((paragraph) => (
            <p key={paragraph} className="mt-3 text-neutral-600">{paragraph}</p>
          ))}
        </section>
      )}
    </div>
  );
}
