import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import { Check } from "lucide-react";
import { getCatalog } from "@/lib/eshop/catalogServer";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import ProductCard from "@/components/eshop/ProductCard";
import ShopLink from "@/components/eshop/ShopLink";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import { HOME_BESTSELLERS, HOME_SHOP_HOME, homeSyrupPoint } from "@/lib/eshop/homeContent";
import { SET_HOME_BANNER, SET_SLUG } from "@/lib/eshop/tastingSet";

// Nakupuji domů (Lucie 20. 11. 2026 večer): tlačítko „Nakoupit domů“ z úvodu vede
// sem — pro koncového zákazníka jen nabídka: kategorie, nejoblíbenější, set sirupů.
// Žádné texty pro kavárny ani formuláře.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: HOME_SHOP_HOME.title,
  description: HOME_SHOP_HOME.description,
  alternates: { canonical: HOME_SHOP_HOME.path },
  ...pageShareMeta(HOME_SHOP_HOME.title, HOME_SHOP_HOME.description, HOME_SHOP_HOME.path),
};

export default async function Page() {
  const { categories, products } = await getCatalog();
  const bestsellers = HOME_BESTSELLERS.flatMap((slug) => products.filter((p) => p.slug === slug));
  const set = products.find((p) => p.slug === SET_SLUG);
  return (
    <>
      <section className="bg-[#FAF6EF] border-b border-[#EDE5D8]">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10 text-center">
          <h1 className="font-serif text-3xl sm:text-4xl text-[#2A2622]">{HOME_SHOP_HOME.title}</h1>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-base text-[#4A5527] font-medium">
            {[homeSyrupPoint(products).replace(/\.$/, ""), ...HOME_SHOP_HOME.points.slice(1)].map((point) => (
              <li key={point} className="inline-flex items-center gap-1">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CategoryIconStrip id="kategorie" categories={availableHomeCategories(categories.map((c) => c.slug))} />
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-12 flex flex-col gap-10">
        {/* jen během kampaně, stejně jako na úvodu */}
        {set?.tastingCampaign && (
          <ShopLink href={`/produkt/${SET_SLUG}`} className="flex items-center gap-3 rounded-2xl border border-[#D9D4C7] bg-[#FAF6EF] px-4 py-3.5 text-[15px] leading-snug text-[#2A2622] hover:bg-[#F4EEE2]">
            <span className="shrink-0 rounded-full bg-[#2A2622] px-2.5 py-0.5 text-xs font-semibold text-white">Novinka</span>
            <span>{SET_HOME_BANNER}</span>
            <span className="ml-auto text-xl" aria-hidden="true">›</span>
          </ShopLink>
        )}
        {bestsellers.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-center text-[#2A2622] mb-5">Nejoblíbenější</h2>
            <ul className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-4">
              {bestsellers.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
