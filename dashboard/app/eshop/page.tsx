import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import { getCatalog } from "@/lib/eshop/catalogServer";
import HomeHero from "@/components/eshop/HomeHero";
import CategoryIconStrip from "@/components/eshop/CategoryIconStrip";
import HomePriceCards, { homePriceCards } from "@/components/eshop/HomePriceCards";
import { soupPortionRows, syrupDrinkRows } from "@/lib/eshop/landingPages";
import { availableHomeCategories } from "@/lib/eshop/homeNav";
import type { Metadata } from "next";
import { brandShareMeta } from "@/lib/eshop/shareMeta";
import { HOME_DESCRIPTION, HOME_TITLE, jsonLd, organizationJsonLd } from "@/lib/eshop/seo";
import ShopLink from "@/components/eshop/ShopLink";
import Image from "next/image";
import { CAFE_DELIVERY_LINE } from "@/lib/eshop/cafePage";
import { CAFE_CALLBACK_TEXT, CAFE_TASTING_FORM_HEADING } from "@/lib/eshop/cafeTasting";
import CafeForm from "@/app/eshop/pro-kavarny/CafeForm";
import { INFO_PAGES } from "@/lib/eshop/infoPages";
import { FAQ_PATH } from "@/lib/eshop/faq";
import ProductCard from "@/components/eshop/ProductCard";
import { SET_HOME_BANNER, SET_SLUG } from "@/lib/eshop/tastingSet";
import {
  HOME_ABOUT,
  HOME_BESTSELLERS,
  HOME_BISTRO,
  HOME_STEPS,
  HOME_STEPS_PHOTO,
  HOME_VENUES,
  HOME_VENUES_TITLE,
  HOME_STEP_POINTS,
} from "@/lib/eshop/homeContent";

// Od 20. 11. 2026 úvod primárně pro kavárny a bistra (viz komentář v těle).
// Původně: hero podle návrhu z 8. 11. 2026 (fotografie polévky
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
  await applyFuelSurchargeFromDb(); // cena nápoje a porce s dopravou podle aktuálního palivového příplatku
  const { categories, products } = await getCatalog();
  const tastingSet = products.find((p) => p.slug === SET_SLUG);
  const bestsellers = HOME_BESTSELLERS.flatMap((slug) => products.filter((p) => p.slug === slug));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd()) }} />
      {/* Přestavba úvodu (Lucie 20. 11. 2026): primárně pro kavárny a bistra, ale vítaní
          i zákazníci domů — hero, pod ním dvě dlaždice (na mobilu pod sebou, gastro první),
          Proč Beginu berou kavárny a bistra, Kde nás najdete (jen se souhlasem kaváren). */}
      <HomeHero />
      {/* 22. 11. 2026 (Lucie, návrh ChatGPT): ceny porcí s dopravou ve dvou kartách, pod nimi Nakupujete domů */}
      <HomePriceCards cards={homePriceCards(soupPortionRows([3])[0], syrupDrinkRows([3])[0])} setSlug={SET_SLUG} setPriceKc={tastingSet?.variants[0]?.priceKc ?? 349} />
      {/* šest obrázkových kategorií zůstává (návrh ChatGPT 22. 11. 2026); „Proč Beginu…“ spojeno s Jak funguje begina */}
      <div className="pt-8 sm:pt-10"><CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} upcoming={categories.map((c) => c.slug).filter((slug) => !products.some((product) => product.category === slug))} /></div>
      {HOME_VENUES.length > 0 && (
        <section className="w-full max-w-6xl mx-auto px-4 pt-10 sm:pt-14">
          <h2 className="font-serif text-2xl sm:text-3xl text-center text-[#2A2622] mb-5">{HOME_VENUES_TITLE}</h2>
          <ul className="flex flex-wrap justify-center gap-3">
            {HOME_VENUES.map((v) => (
              <li key={`${v.name}-${v.city}`} className="rounded-full border border-[#EDE5D8] bg-[#FAF6EF] px-4 py-2 text-base text-[#2A2622]">
                <span className="font-semibold">{v.name}</span>, {v.city}
              </li>
            ))}
          </ul>
        </section>
      )}
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
            <ul className="mt-5 flex flex-col gap-2 text-base leading-normal text-neutral-800">
              {HOME_STEP_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <span className="text-[#5E6B34] font-semibold" aria-hidden="true">✓</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-base leading-normal text-neutral-700">{CAFE_DELIVERY_LINE}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              <ShopLink href={INFO_PAGES.packaging.path} className="inline-block py-1 text-base font-medium underline underline-offset-4">
                Více o balení
              </ShopLink>
              {/* 22. 11. 2026 (Lucie): Časté otázky i na úvodu */}
              <ShopLink href={FAQ_PATH} className="inline-block py-1 text-base font-medium underline underline-offset-4">
                Časté otázky
              </ShopLink>
            </div>
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
      {/* Formulář ochutnávky před Kontaktem v patičce (Lucie 20. 11. 2026), zdroj leadu „web – úvod“ */}
      <div className="max-w-6xl mx-auto px-4 pb-12 sm:pb-14">
        <CafeForm place="uvod" heading={CAFE_TASTING_FORM_HEADING} anchorId="napiste-nam" intro={CAFE_CALLBACK_TEXT} />
      </div>
    </>
  );
}

