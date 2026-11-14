import ShopLink from "./ShopLink";
import Image from "next/image";
import { stripCategories, type HomeCategory } from "@/lib/eshop/homeNav";

// Pruh kategorií s kreslenými ikonami — od 14. 11. 2026 nahoře pod hlavičkou, nad hero.
// Na počítači kompaktní, aby byl vidět hned po otevření stránky (spolu s hero).
// Ikony na počítači poloviční (decentní pruh, 14. 11. 2026).
// Všech šest vždy v jedné řadě (Lucie 14. 11. 2026): na mobilu menší ikony a popisky.
export default function CategoryIconStrip({ id, categories }: { id: string; categories: HomeCategory[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-[#FBF8F3] scroll-mt-20">
      <ul className="max-w-5xl mx-auto px-1 sm:px-2 py-3 sm:py-4 flex justify-center">
        {stripCategories(categories).map((category, i) => (
          <li
            key={category.slug}
            className={`w-1/6 min-w-0 md:w-auto md:flex-1 ${i > 0 ? "md:border-l md:border-dashed md:border-[#D9CFBF]" : ""}`}
          >
            <ShopLink
              href={`/kategorie/${category.slug}`}
              className="group flex flex-col items-center gap-1 sm:gap-2 px-0.5 sm:px-2 text-center"
            >
              {/* Všechny ikony mají stejné plátno (stejná zem i výška), takže
                  je stačí zobrazit ve stejné výšce — optická velikost sedí. */}
              <span className="h-11 sm:h-12 flex items-end">
                <Image
                  src={category.icon}
                  alt=""
                  width={category.iconSize?.[0] ?? 200}
                  height={category.iconSize?.[1] ?? 240}
                  sizes="64px"
                  className="h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="text-[11px] leading-tight sm:text-base sm:leading-[1.35] font-medium hyphens-auto break-words max-w-full text-[#4F5B2B] group-hover:underline underline-offset-4">
                {/* mobil: šest sloupců je úzkých, dlouhý popisek koktejlů by se lámal na tři řádky */}
                {category.slug === "koktejly" ? (
                  <>
                    <span className="sm:hidden">Koktejly</span>
                    <span className="hidden sm:inline">{category.stripLabel}</span>
                  </>
                ) : (
                  category.stripLabel
                )}
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
