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
// Mobil (pod 640 px): po třech ve dvou řadách, ikona 56 px, název 14 px na jeden řádek (zadání 22. 11. večer);
// od 640 px všech šest v jedné řadě.
export default function CategoryIconStrip({ id, categories, upcoming = [] }: { id: string; categories: HomeCategory[]; /** kategorie bez zboží — štítek „Připravujeme“ (zmrzliny, 22. 11. 2026) */ upcoming?: readonly string[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-white scroll-mt-20">
      <ul className="max-w-6xl mx-auto px-1 sm:px-4 pt-3 pb-1 sm:pt-4 sm:pb-2 grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
        {stripCategories(categories).map((category) => (
          <li key={category.slug} className="min-w-0">
            <ShopLink
              href={`/kategorie/${category.slug}`}
              className="group relative flex flex-col items-center justify-end gap-1 sm:gap-1.5 h-full px-1 sm:px-2 py-2.5 sm:py-3 text-center rounded-xl sm:rounded-2xl border-2 border-[#DDD3BF] bg-white shadow-[0_2px_6px_rgba(60,40,20,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#4F5B2B] hover:shadow-md active:bg-[#F3EDE1]"
            >
              {upcoming.includes(category.slug) && (
                <span className="absolute top-1 right-1 rounded-full bg-[#F3EDE1] px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-[#6B5A3A]">
                  Připravujeme
                </span>
              )}
              {/* Všechny ikony mají stejné plátno (stejná zem i výška) — stejná výška = stejná optická velikost. */}
              <span className="h-14 sm:h-12 lg:h-16 flex items-end flex-none">
                <Image
                  src={category.icon}
                  alt=""
                  width={category.iconSize?.[0] ?? 200}
                  height={category.iconSize?.[1] ?? 240}
                  sizes="(min-width: 1024px) 120px, 64px"
                  className="h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="w-full min-h-[2.5em] sm:min-h-0 flex items-center justify-center sm:block sm:truncate text-sm leading-tight lg:text-[15px] font-semibold text-[#3F4A1F] group-hover:underline underline-offset-4">
                {SHORT_LABELS[category.slug] ?? category.stripLabel}
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
