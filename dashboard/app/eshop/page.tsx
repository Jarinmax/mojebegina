import { getCatalog } from "@/lib/eshop/catalogServer";
import HomeHero from "@/components/eshop/HomeHero";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import Link from "next/link";
import { INFO_PAGES, filteredWater, whyBegina } from "@/lib/eshop/infoPages";

// Úvodní stránka podle návrhu „Hero e-shopu Begina.cz“ (2. 10. 2026): hero
// s ilustrací, pruh kategorií s ikonami a „Proč Begina“ (texty doslova
// z begina.cz). Dlaždice kategorií s fotkami odebrány (3. 10. 2026) — úvod
// má zůstat jednoduchý a čistý.
export const dynamic = "force-dynamic";

const STRIP_ID = "nabidka";

export default async function EshopPage() {
  const { categories } = await getCatalog();
  return (
    <>
      <HomeHero ctaHref={`#${STRIP_ID}`} />
      <CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} />
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-center">
          {[
            { title: "Proč Begina", items: whyBegina, more: { href: INFO_PAGES.about.path, label: "Více o nás" } },
            { title: "Čistá filtrovaná voda", items: filteredWater, more: { href: INFO_PAGES.water.path, label: "Více o vodě" } },
          ].map((block) => (
            <div key={block.title}>
              <h2 className="font-medium text-lg mb-3">{block.title}</h2>
              <ul className="flex flex-col gap-2 text-neutral-700">
                {block.items.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <Link href={block.more.href} className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
                {block.more.label}
              </Link>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
