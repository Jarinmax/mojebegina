import Image from "next/image";
import { ArrowRight, Snowflake } from "lucide-react";
import ShopLink from "./ShopLink";

// Úvod e-shopu podle návrhu z 8. 11. 2026: krémový podklad, olivové
// detaily, výrazné červené hlavní tlačítko. Fotografie od 11. 11. 2026
// (schválil majitel): dýňová polévka, hrnek čaje, limonáda a skutečné
// balení begina 3 l s kohoutkem (žádné krabice ani vymyšlené obaly).
// Od 14. 11. 2026 (schválila Lucie): nová fotografie bez beginy – dýňová
// polévka, ovocný nápoj, koktejl a hrnek horkého nápoje ze sirupu; begina
// zůstává níž v části „Jak funguje begina“.
// Texty a tlačítka jsou webové prvky; logo a menu zůstávají z hlavičky webu.
//
// Rozložení: mobil a tablet = text a tlačítka nahoře na střed, fotografie
// pod nimi přes celou šířku; počítač = text vlevo, fotografie vpravo
// (od 14. 11. 2026 na přání Lucie menší fotka: nejvýše 32rem na počítači
// a 36rem na tabletu). Na počítači je fotka u pravého okraje obsahu stejně
// jako text u levého (šířka jako hlavička), aby úvod působil vyváženě.
// Na počítači je úvod nízký (nadpis na jeden řádek, fotka 22rem), aby se na
// první obrazovku vešel i pruh kategorií a dlaždice Proč Begina.
// Mobil (15. 11. 2026): nadpis na jeden řádek, těsnější odstupy a fotka 19rem,
// aby se pod hlavičku vešly ikony, text i celá fotka bez posouvání.
// Fotografie se nikdy neořezává ani nedeformuje (vždy celá v původním poměru).
// Její pozadí je přímo v obrázku přebarvené na béžovou úvodu (#FAF6EF), bez
// rámečku a stínu — splývá s podkladem (9. 11. 2026).
// velikosti pro rychlé načtení připravuje next/image (AVIF/WebP podle sizes).

export const HERO_PHOTO = {
  src: "/eshop/hero/polevka-a-napoje-v9.webp",
  width: 1448,
  height: 1126,
  alt: "Dýňová polévka v misce, koktejl Lady Carneval s grepem, horký Svařák Deluxe a hrnek horkého bylinného nápoje ze sirupu",
};

export const HERO_LINKS = {
  soups: "/kategorie/polevky",
  syrups: "/kategorie/sirupy",
};

export default function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#FAF6EF] border-b border-[#EDE5D8]">
      <div className="max-w-6xl mx-auto lg:px-4 lg:py-3 grid items-center lg:grid-cols-2 lg:gap-6">
        <div className="relative z-10 px-4 pt-3 pb-2 sm:pt-12 sm:pb-8 lg:p-0 text-center lg:text-left">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[#5E6B34]">
            Čerstvě. Jednoduše. S&nbsp;chutí.
          </p>
          {/* Nadpis s hlavní výhodou (11. 11. 2026): begina = natočíte si, kolik chcete. */}
          <h1 className="mt-1.5 sm:mt-4 font-serif text-[1.4rem] leading-[1.15] min-[380px]:text-[1.55rem] sm:text-[2.5rem] lg:text-[clamp(2rem,3vw,2.5rem)] tracking-tight text-[#2A2622]">
            <span className="sm:block lg:inline">Polévky a nápoje</span>{" "}
            <span className="sm:block lg:inline">v&nbsp;begině</span>
          </h1>
          <p className="mt-2 sm:mt-4 text-[15px] leading-snug sm:text-lg sm:leading-relaxed text-[#3B3631] max-w-md mx-auto lg:mx-0 text-balance">
            Natočíte si, kolik chcete a&nbsp;kdy chcete. 100&nbsp;% rostlinné, z&nbsp;čisté filtrované vody.
          </p>
          <div className="mt-3 sm:mt-7 lg:mt-5 flex flex-row items-stretch sm:items-center justify-center lg:justify-start gap-2 sm:gap-3 mx-auto lg:mx-0">
            <ShopLink
              href={HERO_LINKS.soups}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#A51C1C] hover:bg-[#8A1616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A51C1C] transition-colors px-4 sm:px-7 py-2.5 sm:py-3.5 text-base sm:text-lg font-medium text-white shadow-md shadow-[#A51C1C]/20"
            >
              Vybrat polévku
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </ShopLink>
            <ShopLink
              href={HERO_LINKS.syrups}
              className="inline-flex items-center justify-center rounded-lg border-2 border-[#5E6B34] hover:bg-[#5E6B34]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E6B34] transition-colors px-4 sm:px-7 py-2 sm:py-3 text-base sm:text-lg font-medium text-[#4A5527]"
            >
              Objevit sirupy
            </ShopLink>
          </div>
          <p className="mt-2.5 sm:mt-6 lg:mt-4 flex items-center justify-center lg:justify-start gap-2 text-sm sm:text-base text-[#5E6B34]">
            <Snowflake className="w-5 h-5" aria-hidden="true" />
            Doručujeme chlazenou přepravou.
          </p>
        </div>

        <div className="relative w-full max-w-[19rem] mx-auto sm:max-w-xl sm:mx-auto sm:px-6 sm:pb-8 lg:p-0 lg:max-w-[22rem] lg:ml-auto lg:mr-0">
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            width={HERO_PHOTO.width}
            height={HERO_PHOTO.height}
            priority
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 36rem, 100vw"
            className="block w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}
