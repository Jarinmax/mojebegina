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
import { CAFE_CALLBACK_TEXT, CAFE_TASTING_FORM_HEADING } from "@/lib/eshop/cafeTasting";
import CafeForm from "@/app/eshop/pro-kavarny/CafeForm";
import { INFO_PAGES } from "@/lib/eshop/infoPages";
import { FAQ_PATH } from "@/lib/eshop/faq";
import HomeDoors from "@/components/eshop/HomeDoors";
import { SET_HOME_BANNER, SET_SLUG } from "@/lib/eshop/tastingSet";
import {
  HOME_DELIVERY_LINE,
  HOME_BESTSELLERS,
  HOME_BESTSELLER_PHOTOS,
  HOME_HERO_BOX_NOTE,
  HOME_STEPS,
  HOME_STEPS_PHOTO,
  HOME_VENUES,
  HOME_VENUES_TITLE,
} from "@/lib/eshop/homeContent";

// Od 20. 11. 2026 úvod primárně pro kavárny a bistra (viz komentář v těle).
// Původně: hero podle návrhu z 8. 11. 2026 (fotografie polévky
// s bylinkovým nápojem, tlačítka Vybrat polévku / Objevit sirupy), pruh
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
      {/* Nová úvodní stránka (Lucie + Jarin 28. 11. 2026): úvod s fotkou, dvě dlaždice Pro kavárny / Domů,
          pruh kaváren (jen se souhlasem), kategorie, cena za porci, nejoblíbenější s atmosférickými
          fotkami, jak funguje begina. Méně textu a tlačítek, víc fotek. „Kdo za tím stojí“ je na stránce O nás. */}
      <HomeHero />
      <HomeDoors />
      {HOME_VENUES.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pt-8 sm:pt-10 text-center" aria-labelledby="kavarny-s-nami">
          <h2 id="kavarny-s-nami" className="text-sm uppercase tracking-[0.15em] text-neutral-600">{HOME_VENUES_TITLE}</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-2 font-serif text-xl sm:text-2xl text-[#4A423B]">
            {HOME_VENUES.map((v) => (
              <li key={v.name}>{v.name}{v.city ? `, ${v.city}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="pt-8 sm:pt-10"><CategoryIconStrip id={STRIP_ID} categories={availableHomeCategories(categories.map((c) => c.slug))} upcoming={categories.map((c) => c.slug).filter((slug) => !products.some((product) => product.category === slug))} /></div>
      <HomePriceCards cards={homePriceCards(soupPortionRows([3])[0], syrupDrinkRows([3])[0])} setSlug={SET_SLUG} setPriceKc={tastingSet?.variants[0]?.priceKc ?? 349} showShop={false} />
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-12 sm:pt-14 sm:pb-14 flex flex-col gap-10 sm:gap-14">
        {/* Novinka: ochutnávkový set sirupů (17. 11. 2026) — jen za úvodní cenu */}
        {tastingSet?.tastingCampaign && (
          <ShopLink href={`/produkt/${SET_SLUG}`} className="flex items-center gap-3 rounded-2xl border border-[#D9D4C7] bg-[#FAF6EF] px-4 py-3.5 text-[15px] leading-snug text-[#2A2622] hover:bg-[#F4EEE2]">
            <span className="shrink-0 rounded-full border border-[#B5762A] bg-[#FBF3E6] px-2.5 py-0.5 text-xs font-semibold text-[#8A5A1E]">Novinka</span>
            <span>{SET_HOME_BANNER}</span>
            <span className="ml-auto text-xl" aria-hidden="true">›</span>
          </ShopLink>
        )}

        {/* Nejoblíbenější – atmosférické fotky (28. 11. 2026); bílé produktové fotky jsou v kategoriích */}
        {bestsellers.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#2A2622] mb-5">Nejoblíbenější</h2>
            <ul className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
              {bestsellers.map((product) => {
                const prices = product.variants.map((v) => v.priceKc);
                const min = Math.min(...prices);
                const priceText = prices.length > 1 ? `od ${min} Kč` : `${product.variants[0].label ? `${product.variants[0].label} · ` : ""}${min} Kč`;
                return (
                  <li key={product.slug}>
                    <ShopLink href={`/produkt/${product.slug}`} className="group block">
                      <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-xl bg-[#F0EADF]">
                        <Image src={HOME_BESTSELLER_PHOTOS[product.slug] ?? product.image} alt={product.name} fill sizes="(min-width: 1024px) 17rem, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </span>
                      <span className="mt-2 block text-base font-medium text-[#2A2622] group-hover:underline underline-offset-2">{product.name}</span>
                      <span className="block text-sm text-neutral-600 tabular-nums">{priceText.replace(/ /g, "\u00a0")}</span>
                    </ShopLink>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
                  <span className="flex-none w-9 h-9 rounded-full bg-[#4A5527] text-white font-semibold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold text-lg text-[#2A2622]">{step.title}</h3>
                    <p className="text-base leading-normal text-neutral-700">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-base leading-normal text-neutral-700">{HOME_DELIVERY_LINE}</p>
            {/* 27. 11. 2026 (Lucie): krabice se přikupuje zvlášť */}
            <p className="mt-2 text-sm leading-snug text-neutral-600">{HOME_HERO_BOX_NOTE}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              <ShopLink href={INFO_PAGES.packaging.path} className="inline-block py-1 text-base font-medium underline underline-offset-4">
                Více o balení
              </ShopLink>
              <ShopLink href={FAQ_PATH} className="inline-block py-1 text-base font-medium underline underline-offset-4">
                Časté otázky
              </ShopLink>
              <ShopLink href={INFO_PAGES.about.path} className="inline-block py-1 text-base font-medium underline underline-offset-4">
                Kdo za tím stojí
              </ShopLink>
            </div>
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

