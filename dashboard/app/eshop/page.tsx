import { getCatalog } from "@/lib/eshop/catalogServer";
import HomeHero from "@/components/eshop/HomeHero";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import type { Metadata } from "next";
import { SHARE_DESCRIPTION, SHARE_TITLE, brandShareMeta } from "@/lib/eshop/shareMeta";
import ShopLink from "@/components/eshop/ShopLink";
import { INFO_PAGES, filteredWater, whyBegina } from "@/lib/eshop/infoPages";

// Úvodní stránka: hero podle návrhu z 8. 11. 2026 (fotografie polévky
// s bylinným nápojem, tlačítka Vybrat polévku / Objevit sirupy), pruh
// kategorií s ikonami a „Proč Begina“ (texty doslova z begina.cz). Dlaždice kategorií s fotkami odebrány (3. 10. 2026) — úvod
// má zůstat jednoduchý a čistý. Čitelnost (9. 11. 2026): nadpisy 20 px,
// body a odkazy 16 px, řádkování 1,5.
export const dynamic = "force-dynamic";

const STRIP_ID = "nabidka";

// Úvodní stránka — nadpis, popis a náhled při sdílení (10. 11. 2026).
export const metadata: Metadata = {
  title: { absolute: SHARE_TITLE },
  description: SHARE_DESCRIPTION,
  alternates: { canonical: "/" },
  ...brandShareMeta("/"),
};

export default async function EshopPage() {
  const { categories } = await getCatalog();
  return (
    <>
      <HomeHero />
      <CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} />
      <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-12 text-center">
          {[
            { title: "Proč Begina", items: whyBegina, more: { href: INFO_PAGES.about.path, label: "Více o nás" } },
            { title: "Čistá filtrovaná voda", items: filteredWater, more: { href: INFO_PAGES.water.path, label: "Více o vodě" } },
          ].map((block) => (
            <div key={block.title}>
              <h2 className="font-semibold text-xl leading-snug text-[#2A2622] mb-4">{block.title}</h2>
              <ul className="flex flex-col gap-2.5 text-base leading-normal text-neutral-800">
                {block.items.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <ShopLink href={block.more.href} className="mt-4 inline-block py-1 text-base font-medium underline underline-offset-4">
                {block.more.label}
              </ShopLink>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
