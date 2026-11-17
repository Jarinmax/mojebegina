import { getCatalog } from "@/lib/eshop/catalogServer";
import HomeHero from "@/components/eshop/HomeHero";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import type { Metadata } from "next";
import { brandShareMeta } from "@/lib/eshop/shareMeta";
import { HOME_DESCRIPTION, HOME_TITLE, jsonLd, organizationJsonLd } from "@/lib/eshop/seo";
import ShopLink from "@/components/eshop/ShopLink";
import Image from "next/image";
import { Clock, Leaf, Percent, Soup } from "lucide-react";
import { INFO_PAGES } from "@/lib/eshop/infoPages";
import ProductCard from "@/components/eshop/ProductCard";
import { SET_HOME_BANNER, SET_SLUG } from "@/lib/eshop/tastingSet";
import { HOME_ABOUT, HOME_BESTSELLERS, HOME_BISTRO, HOME_STEPS, HOME_STEPS_PHOTO, HOME_WHY } from "@/lib/eshop/homeContent";

const WHY_ICONS = { leaf: Leaf, soup: Soup, clock: Clock, percent: Percent } as const;

// Úvodní stránka: hero podle návrhu z 8. 11. 2026 (fotografie polévky
// s bylinným nápojem, tlačítka Vybrat polévku / Objevit sirupy), pruh
// kategorií s ikonami; od 11. 11. 2026 pod nimi Proč Begina (3 konkrétní důvody),
// Jak funguje begina, Nejoblíbenější a Kdo za tím stojí (lib/eshop/homeContent.ts). Dlaždice kategorií s fotkami odebrány (3. 10. 2026) — úvod
// má zůstat jednoduchý a čistý. Čitelnost (9. 11. 2026): nadpisy 20 px,
// body a odkazy 16 px, řádkování 1,5.
export const dynamic = "force-dynamic";

const STRIP_ID = "nabidka";

// Úvodní stránka — nadpis, popis a náhled při sdílení (10. 11. 2026).
export const metadata: Metadata = {
  // název a popis pro vyhledávače se slovy, která lidé hledají (12. 11. 2026);
  // náhled při sdílení zůstává „Begina – Když rozhoduje chuť“ (brandShareMeta)
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  ...brandShareMeta("/"),
};

export default async function EshopPage() {
  const { categories, products } = await getCatalog();
  const tastingSet = products.find((p) => p.slug === SET_SLUG);
  const bestsellers = HOME_BESTSELLERS.flatMap((slug) => products.filter((p) => p.slug === slug));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd()) }} />
      {/* Pořadí (Lucie 15. 11. 2026): na počítači i na mobilu stejně — úvod a pod
          ním oddělený pruh kategorií; na mobilu se obojí vejde na první obrazovku. */}
      {/* První obrazovka na počítači (15. 11. 2026): úvod, pruh kategorií a Proč Begina
          vyplní přesně výšku okna (pod hlavičkou) — končí čtyřmi dlaždicemi,
          „Jak funguje begina“ je až po posunutí. */}
      <div className="flex flex-col lg:min-h-[calc(100svh-4rem)] xl:min-h-[calc(100svh-5.25rem)]">
        <div>
          <HomeHero />
        </div>
        <div>
          <CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} />
        </div>
        {/* Proč Begina – tři konkrétní důvody (11. 11. 2026) a partnerský program (14. 11. 2026) */}
        <section className="w-full max-w-6xl mx-auto px-4 pt-8 sm:pt-10 lg:pt-0 lg:pb-6 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-2xl text-center text-[#2A2622] mb-5 lg:mb-3">Proč Begina</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-4">
            {HOME_WHY.map((item) => {
              const Icon = WHY_ICONS[item.icon];
              const body = (
                <>
                  <Icon className="w-8 h-8 lg:w-6 lg:h-6 mx-auto text-[#5E6B34]" aria-hidden="true" />
                  <h3 className="mt-3 lg:mt-1.5 font-semibold text-lg lg:text-base text-[#2A2622]">{item.title}</h3>
                  <p className="mt-1.5 lg:mt-1 text-base lg:text-[15px] leading-normal lg:leading-snug text-neutral-700">{item.text}</p>
                </>
              );
              const box = "rounded-2xl bg-[#FAF6EF] border border-[#EDE5D8] p-6 lg:p-4 text-center h-full";
              return (
                <li key={item.title}>
                  {"href" in item ? (
                    <ShopLink href={item.href} className={`${box} block group hover:border-[#5E6B34] transition-colors`}>
                      {body}
                      <span className="mt-2 lg:mt-1 inline-block text-base lg:text-[15px] font-medium text-[#4A5527] underline underline-offset-4">{item.linkLabel}</span>
                    </ShopLink>
                  ) : (
                    <div className={box}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-12 sm:pt-14 sm:pb-14 flex flex-col gap-10 sm:gap-14">
        {/* Jak funguje begina */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8 items-center">
          <div className="relative aspect-square w-full max-w-[17rem] md:max-w-xs mx-auto">
            <Image src={HOME_STEPS_PHOTO} alt="Begina s dýňovou polévkou" fill sizes="(min-width: 768px) 20rem, 17rem" className="object-contain" />
          </div>
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#2A2622] mb-4 text-center md:text-left">Jak funguje begina</h2>
            <ol className="flex flex-col gap-5">
              {HOME_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex-none w-9 h-9 rounded-full bg-[#A51C1C] text-white font-semibold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold text-lg text-[#2A2622]">{step.title}</h3>
                    <p className="text-base leading-normal text-neutral-700">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ShopLink href={INFO_PAGES.packaging.path} className="mt-5 inline-block py-1 text-base font-medium underline underline-offset-4">
              Více o balení
            </ShopLink>
          </div>
        </section>

        {/* Novinka: ochutnávkový set sirupů (17. 11. 2026) — jen za úvodní cenu */}
        {tastingSet?.tastingCampaign && (
          <div className="w-full max-w-6xl mx-auto px-4">
            <ShopLink href={`/produkt/${SET_SLUG}`} className="flex items-center gap-3 rounded-2xl border border-[#D9D4C7] bg-[#FAF6EF] px-4 py-3.5 text-[15px] leading-snug text-[#2A2622] hover:bg-[#F4EEE2]">
              <span className="shrink-0 rounded-full bg-[#2A2622] px-2.5 py-0.5 text-xs font-semibold text-white">Novinka</span>
              <span>{SET_HOME_BANNER}</span>
              <span className="ml-auto text-xl" aria-hidden="true">›</span>
            </ShopLink>
          </div>
        )}

        {/* Nejoblíbenější */}
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

        {/* Kdo za tím stojí */}
        <section className="max-w-2xl mx-auto text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-[#2A2622] mb-4">Kdo za tím stojí</h2>
          <p className="text-lg leading-relaxed text-neutral-800">{HOME_ABOUT}</p>
          <p className="mt-3 text-base leading-normal text-neutral-700">{HOME_BISTRO}</p>
          <div className="mt-4 flex justify-center gap-6">
            <ShopLink href={INFO_PAGES.about.path} className="py-1 text-base font-medium underline underline-offset-4">Více o nás</ShopLink>
            <ShopLink href={INFO_PAGES.water.path} className="py-1 text-base font-medium underline underline-offset-4">Více o vodě</ShopLink>
          </div>
        </section>
      </div>
    </>
  );
}
