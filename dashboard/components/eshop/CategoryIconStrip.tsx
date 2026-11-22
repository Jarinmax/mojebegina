import ShopLink from "./ShopLink";
import Image from "next/image";
import { stripCategories, type HomeCategory } from "@/lib/eshop/homeNav";

// Pruh kategorií s kreslenými ikonami pod hero (úvodní stránka).
// Na počítači kompaktní, aby byl vidět hned po otevření stránky (spolu s hero).
// Ikony na počítači poloviční (decentní pruh, 14. 11. 2026).
// Položky jsou bílé dlaždice s rámečkem i na počítači (Lucie 22. 11. 2026: plochý pruh nevypadal klikací);
// na počítači navíc šipka › a při najetí myší se dlaždice zvedne a zvýrazní rámeček.
// 22. 11. 2026 (Lucie): o polovinu nižší — na počítači ikona vedle popisku, aby bylo vidět „Chci ochutnávku do provozu“.
// Všech šest vždy v jedné řadě (Lucie 14. 11. 2026): na mobilu menší ikony a popisky.
export default function CategoryIconStrip({ id, categories }: { id: string; categories: HomeCategory[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-[#FBF8F3] scroll-mt-20">
      <ul className="max-w-5xl mx-auto px-1 sm:px-2 pt-3 pb-2 sm:py-2 lg:py-1.5 flex justify-center">
        {stripCategories(categories).map((category) => (
          <li
            key={category.slug}
            className="w-1/6 min-w-0 md:w-auto md:flex-1 md:px-1.5"
          >
            <ShopLink
              href={`/kategorie/${category.slug}`}
              className="group flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 mx-0.5 sm:mx-0 px-0.5 sm:px-2 py-1 sm:py-1 text-center rounded-lg border border-[#E0D6C3] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#4F5B2B] hover:shadow-md active:bg-[#F3EDE1] h-full"
            >
              {/* Všechny ikony mají stejné plátno (stejná zem i výška), takže
                  je stačí zobrazit ve stejné výšce — optická velikost sedí. */}
              <span className="h-7 sm:h-6 flex items-end flex-none">
                <Image
                  src={category.icon}
                  alt=""
                  width={category.iconSize?.[0] ?? 200}
                  height={category.iconSize?.[1] ?? 240}
                  sizes="64px"
                  className="h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="text-[11px] leading-tight sm:text-sm sm:leading-tight font-medium text-[#4F5B2B] group-hover:underline underline-offset-4">
                {/* mobil: šest sloupců je úzkých, dlouhý popisek koktejlů by se lámal na tři řádky */}
                {category.slug === "koktejly" ? (
                  <>
                    <span className="lg:hidden">Koktejly</span>
                    <span className="hidden lg:inline">{category.stripLabel}</span>
                  </>
                ) : (
                  category.stripLabel
                )}
                {/* šipka: je vidět, že dlaždice vede dál (Lucie 22. 11. 2026) */}
                <span aria-hidden="true" className="hidden sm:inline ml-1 transition-transform duration-200 group-hover:translate-x-0.5">›</span>
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
