import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import Image from "next/image";
import CafeBenefits from "@/components/eshop/CafeBenefits";
import ShopLink from "@/components/eshop/ShopLink";
import { getCatalog } from "@/lib/eshop/catalogServer";
import { HOME_CATEGORIES } from "@/lib/eshop/homeNav";
import {
  CAFE_ALCOHOL_NOTE,
  CAFE_ALCOHOL_SLUG,
  CAFE_COMING_SOON,
  CAFE_DELIVERY_LINE,
  CAFE_CATEGORY_SLUGS,
  CAFE_DESCRIPTION,
  CAFE_PATH,
  CAFE_PRICE_NOTE,
  CAFE_STEPS,
  CAFE_SUBTITLE,
  CAFE_TITLE,
  VAT_NOTE,
  CAFE_SOUPS_TEASER,
} from "@/lib/eshop/cafePage";
import { splitLastSentence } from "@/lib/eshop/typography";
import CafeForm from "./CafeForm";
import CafeTastingForm from "@/components/eshop/CafeTastingForm";
import { CAFE_CALLBACK_TEXT, CAFE_TASTING_FORM_HEADING, isCafeTasting, isCafeTastingSku } from "@/lib/eshop/cafeTasting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CAFE_TITLE,
  description: CAFE_DESCRIPTION,
  alternates: { canonical: CAFE_PATH },
  ...pageShareMeta(CAFE_TITLE, CAFE_DESCRIPTION, CAFE_PATH),
};

// Stránka pro provozy (zadání Lucie 18. 11. 2026). Texty: lib/eshop/cafePage.ts.
export default async function Page() {
  const catalog = await getCatalog().catch(() => null);
  const present = new Set((catalog?.categories ?? []).map((c) => c.slug));
  // kategorie bez jediného výrobku (zatím zmrzliny) se ukáže jako „Připravujeme“ a nikam neodkazuje
  const stocked = new Set((catalog?.products ?? []).map((p) => p.category));
  // druhá věta podnadpisu na počítači celá na nový řádek (Lucie 18. 11. 2026)
  const [subtitleHead, subtitleLast] = splitLastSentence(CAFE_SUBTITLE);
  // balení ochutnávky, která jsou v katalogu (produkt je v katalogu jen po spuštění / v náhledu)
  const tastingSkus = (catalog?.products.find(isCafeTasting)?.variants ?? []).map((variant) => variant.sku).filter(isCafeTastingSku);
  const categories = CAFE_CATEGORY_SLUGS.flatMap((slug) => HOME_CATEGORIES.filter((c) => c.slug === slug && present.has(slug)));
  return (
    <article className="max-w-5xl mx-auto px-4 py-8 sm:py-12 flex flex-col gap-10 sm:gap-14 text-[#2A2622]">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight">{CAFE_TITLE}</h1>
        <p className="mt-3 text-lg leading-normal font-medium text-[#4A5527]">{CAFE_DELIVERY_LINE}</p>
        <p className="mt-2 text-lg leading-normal text-neutral-700">
          {subtitleHead}
          {subtitleLast && (
            <>
              {" "}
              <span className="sm:block">{subtitleLast}</span>
            </>
          )}
        </p>
        <a href="#ochutnavka" className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] text-white font-semibold px-6 h-12 text-base">
          Chci ochutnávku do provozu
        </a>
      </header>

      <section aria-label="Výhody pro provoz">
        <CafeBenefits />
      </section>

      {categories.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl sm:text-3xl text-center mb-5">Co dodáváme</h2>
          <ul className="grid grid-cols-3 lg:grid-cols-6 gap-3 max-w-3xl mx-auto">
            {categories.map((category) => {
              const box = "h-full rounded-xl border border-[#EDE5D8] bg-white p-2.5 flex flex-col items-center gap-1 text-center";
              const icon = category.icon && category.iconSize && (
                <Image src={category.icon} alt="" width={category.iconSize[0]} height={category.iconSize[1]} className="h-12 w-auto" />
              );
              return (
                <li key={category.slug}>
                  {stocked.has(category.slug) ? (
                    <ShopLink href={`/kategorie/${category.slug}`} className={`${box} hover:border-[#5E6B34] transition-colors`}>
                      {icon}
                      <span className="text-base font-medium underline underline-offset-4">{category.menuLabel}</span>
                      {category.slug === CAFE_ALCOHOL_SLUG && <span className="text-sm text-neutral-600">{CAFE_ALCOHOL_NOTE}</span>}
                    </ShopLink>
                  ) : (
                    <div className={box}>
                      {icon}
                      <span className="text-base font-medium">{category.menuLabel}</span>
                      <span className="text-sm text-neutral-600">{CAFE_COMING_SOON}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="max-w-2xl mx-auto -mt-4 rounded-xl border border-[#5E6B34] bg-[#FAF6EF] px-4 py-3 text-base text-neutral-800 text-center">
        {CAFE_SOUPS_TEASER.text}{" "}
        <ShopLink href={CAFE_SOUPS_TEASER.href} className="font-semibold text-[#4A5527] underline underline-offset-4">
          {CAFE_SOUPS_TEASER.label} →
        </ShopLink>
      </p>

      <section className="max-w-2xl mx-auto w-full">
        <h2 className="font-serif text-2xl sm:text-3xl text-center mb-5">Jak spolupráce funguje</h2>
        <ol className="flex flex-col gap-5">
          {CAFE_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex-none w-9 h-9 rounded-full bg-[#A51C1C] text-white font-semibold flex items-center justify-center">{i + 1}</span>
              <div>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-base leading-normal text-neutral-700">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-2xl mx-auto w-full flex flex-col gap-8">
        {/* Ochutnávka do provozu (20. 11. 2026): objednávka na e-shopu; dosavadní formulář zůstává jako druhá možnost */}
        {tastingSkus.length > 0 ? (
          <>
            <CafeTastingForm available={tastingSkus} />
            <CafeForm heading={CAFE_TASTING_FORM_HEADING} anchorId="napiste-nam" intro={CAFE_CALLBACK_TEXT} />
          </>
        ) : (
          <CafeForm />
        )}
        <p className="mt-5 text-center text-base text-neutral-700">
          {CAFE_PRICE_NOTE.before}
          <ShopLink href={CAFE_PRICE_NOTE.href} className="font-medium underline underline-offset-4">
            {CAFE_PRICE_NOTE.link}
          </ShopLink>
          {CAFE_PRICE_NOTE.after} {VAT_NOTE}
        </p>
      </section>
    </article>
  );
}
