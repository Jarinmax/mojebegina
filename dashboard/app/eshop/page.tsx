import { getCatalog } from "@/lib/eshop/catalogServer";
import CategoryTile from "@/components/eshop/CategoryTile";
import HomeHero from "@/components/eshop/HomeHero";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import { filteredWater, whyBegina } from "@/lib/eshop/infoPages";

// Úvodní stránka podle návrhu „Hero e-shopu Begina.cz“ (2. 10. 2026): hero
// s ilustrací, pruh kategorií s ikonami; pod tím dosavadní obsah (dlaždice
// kategorií s fotkami, „Proč Begina“ — texty doslova z begina.cz).
export const dynamic = "force-dynamic";

const STRIP_ID = "nabidka";

export default async function EshopPage() {
  const { categories } = await getCatalog();
  return (
    <>
      <HomeHero ctaHref={`#${STRIP_ID}`} />
      <CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} />
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
        <h2 className="font-serif text-2xl text-center text-[#2A2622] mb-6">Naše nabídka</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
          {categories.map((category) => (
            <li key={category.slug}>
              <CategoryTile category={category} sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw" />
            </li>
          ))}
        </ul>

        <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center">
          {[
            { title: "Proč Begina", items: whyBegina },
            { title: "Čistá filtrovaná voda", items: filteredWater },
          ].map((block) => (
            <div key={block.title}>
              <h2 className="font-medium text-lg mb-3">{block.title}</h2>
              <ul className="flex flex-col gap-2 text-neutral-700">
                {block.items.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
