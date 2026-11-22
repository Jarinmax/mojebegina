import ShopLink from "./ShopLink";
import Image from "next/image";
import { stripCategories, type HomeCategory } from "@/lib/eshop/homeNav";

// Pruh kategorií s kreslenými ikonami pod hero (úvodní stránka).
// Na počítači kompaktní, aby byl vidět hned po otevření stránky (spolu s hero).
// Ikony na počítači poloviční (decentní pruh, 14. 11. 2026).
// Položky jsou bílé dlaždice s rámečkem i na počítači (Lucie 22. 11. 2026: plochý pruh nevypadal klikací);
// na počítači navíc šipka › a při najetí myší se dlaždice zvedne a zvýrazní rámeček.
// 22. 11. 2026 odpoledne (Lucie): ikony byly miniaturní a nalepené na béžový úvod — teď samostatné bílé dlaždice
// na bílém podkladu, větší ikona a tučnější popisek. Dřív (22. 11.): o polovinu nižší — na počítači ikona vedle popisku, aby bylo vidět „Chci ochutnávku do provozu“.
// Všech šest vždy v jedné řadě (Lucie 14. 11. 2026): na mobilu menší ikony a popisky.
/** krátké popisky do dlaždic — na jeden řádek (Lucie 22. 11. 2026 večer) */
const SHORT_LABELS: Record<string, string> = {
  polevky: "Polévky",
  sirupy: "Sirupy",
  caje: "Čaje",
  "ovocne-napoje": "Ovocné nápoje",
  koktejly: "Koktejly",
  zmrzliny: "Zmrzliny",
};

// 22. 11. 2026 večer (Lucie): ikona o třetinu menší (h-16) — h-24 byla na počítači moc velká.
// Předtím: větší dlaždice přes celou šířku, velká ikona nahoře,
// pod ní krátký název na jeden řádek, bez šipek — celá dlaždice je odkaz.
// Všech šest vždy v jedné řadě (Lucie 14. 11. 2026).
export default function CategoryIconStrip({ id, categories }: { id: string; categories: HomeCategory[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-white scroll-mt-20">
      <ul className="max-w-6xl mx-auto px-1 sm:px-4 pt-3 pb-1 sm:pt-4 sm:pb-2 grid grid-cols-6 gap-1 sm:gap-3 lg:gap-4">
        {stripCategories(categories).map((category) => (
          <li key={category.slug} className="min-w-0">
            <ShopLink
              href={`/kategorie/${category.slug}`}
              className="group flex flex-col items-center justify-end gap-1 sm:gap-1.5 h-full px-0.5 sm:px-2 py-2 sm:py-3 text-center rounded-xl sm:rounded-2xl border-2 border-[#DDD3BF] bg-white shadow-[0_2px_6px_rgba(60,40,20,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#4F5B2B] hover:shadow-md active:bg-[#F3EDE1]"
            >
              {/* Všechny ikony mají stejné plátno (stejná zem i výška) — stejná výška = stejná optická velikost. */}
              <span className="h-10 sm:h-12 lg:h-16 flex items-end flex-none">
                <Image
                  src={category.icon}
                  alt=""
                  width={category.iconSize?.[0] ?? 200}
                  height={category.iconSize?.[1] ?? 240}
                  sizes="(min-width: 1024px) 120px, 64px"
                  className="h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="w-full sm:truncate text-[11px] leading-tight sm:text-sm lg:text-[15px] font-semibold text-[#3F4A1F] group-hover:underline underline-offset-4">
                {SHORT_LABELS[category.slug] ?? category.stripLabel}
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
