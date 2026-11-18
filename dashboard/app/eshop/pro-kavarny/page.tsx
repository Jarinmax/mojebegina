import type { Metadata } from "next";
import Image from "next/image";
import { Calculator, Droplets, Leaf, Recycle, Timer, Truck } from "lucide-react";
import ShopLink from "@/components/eshop/ShopLink";
import { getCatalog } from "@/lib/eshop/catalogServer";
import { HOME_CATEGORIES } from "@/lib/eshop/homeNav";
import { OPERATOR } from "@/lib/eshop/operator";
import {
  CAFE_ALCOHOL_NOTE,
  CAFE_ALCOHOL_SLUG,
  CAFE_BENEFITS,
  CAFE_COMING_SOON,
  CAFE_CATEGORY_SLUGS,
  CAFE_DESCRIPTION,
  CAFE_PATH,
  CAFE_PRICE_LIST_NOTE,
  CAFE_STEPS,
  CAFE_SUBTITLE,
  CAFE_TITLE,
  type CafeIcon,
} from "@/lib/eshop/cafePage";
import CafeForm from "./CafeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CAFE_TITLE,
  description: CAFE_DESCRIPTION,
  alternates: { canonical: CAFE_PATH },
};

const ICONS: Record<CafeIcon, typeof Leaf> = { recycle: Recycle, timer: Timer, calculator: Calculator, leaf: Leaf, droplets: Droplets, truck: Truck };

// Stránka pro provozy (zadání Lucie 18. 11. 2026). Texty: lib/eshop/cafePage.ts.
export default async function Page() {
  const catalog = await getCatalog().catch(() => null);
  const present = new Set((catalog?.categories ?? []).map((c) => c.slug));
  // kategorie bez jediného výrobku (zatím zmrzliny) se ukáže jako „Připravujeme“ a nikam neodkazuje
  const stocked = new Set((catalog?.products ?? []).map((p) => p.category));
  const categories = CAFE_CATEGORY_SLUGS.flatMap((slug) => HOME_CATEGORIES.filter((c) => c.slug === slug && present.has(slug)));
  return (
    <article className="max-w-5xl mx-auto px-4 py-8 sm:py-12 flex flex-col gap-10 sm:gap-14 text-[#2A2622]">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight">{CAFE_TITLE}</h1>
        <p className="mt-3 text-lg leading-normal text-neutral-700">{CAFE_SUBTITLE}</p>
        <a href="#ochutnavka" className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] text-white font-semibold px-6 h-12 text-base">
          Chci ochutnávku do provozu
        </a>
      </header>

      <section aria-label="Výhody pro provoz">
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAFE_BENEFITS.map((benefit) => {
            const Icon = ICONS[benefit.icon];
            return (
              <li key={benefit.title} className="rounded-2xl bg-[#FAF6EF] border border-[#EDE5D8] p-5 flex gap-4">
                <Icon className="flex-none w-7 h-7 text-[#5E6B34]" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-lg leading-snug">{benefit.title}</h2>
                  <p className="mt-1 text-base leading-normal text-neutral-700">{benefit.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {categories.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl sm:text-3xl text-center mb-5">Co dodáváme</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => {
              const box = "h-full rounded-2xl border border-[#EDE5D8] bg-white p-4 flex flex-col items-center gap-2 text-center";
              const icon = category.icon && category.iconSize && (
                <Image src={category.icon} alt="" width={category.iconSize[0]} height={category.iconSize[1]} className="h-20 w-auto mb-1" />
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

      <section className="max-w-2xl mx-auto w-full">
        <CafeForm />
        <p className="mt-5 text-center text-base text-neutral-700">
          {CAFE_PRICE_LIST_NOTE}{" "}
          <a href={`mailto:${OPERATOR.email}`} className="font-medium underline underline-offset-4">
            {OPERATOR.email}
          </a>
          ,{" "}
          <a href={OPERATOR.phoneHref} className="font-medium underline underline-offset-4 whitespace-nowrap">
            {OPERATOR.phone}
          </a>
        </p>
      </section>
    </article>
  );
}
