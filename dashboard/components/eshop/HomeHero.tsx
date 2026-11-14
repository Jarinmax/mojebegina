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
// (od 11. 11. 2026 fotka dostává víc místa, poměr sloupců 0,72 : 1,28).
// Fotografie se nikdy neořezává ani nedeformuje (vždy celá v původním poměru).
// Její pozadí je přímo v obrázku přebarvené na béžovou úvodu (#FAF6EF), bez
// rámečku a stínu — splývá s podkladem (9. 11. 2026).
// velikosti pro rychlé načtení připravuje next/image (AVIF/WebP podle sizes).

export const HERO_PHOTO = {
  src: "/eshop/hero/polevka-a-napoje-v4.webp",
  width: 1448,
  height: 1126,
  alt: "Dýňová polévka v misce, ovocný nápoj s malinami, koktejl s granátovým jablkem a hrnek horkého bylinného nápoje",
};

export const HERO_LINKS = {
  soups: "/kategorie/polevky",
  syrups: "/kategorie/sirupy",
};

export default function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#FAF6EF] border-b border-[#EDE5D8]">
      <div className="max-w-[76rem] mx-auto lg:px-4 lg:py-[clamp(1.5rem,4vh,3.5rem)] grid items-center lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-6">
        <div className="relative z-10 px-4 pt-6 pb-5 sm:pt-12 sm:pb-8 lg:p-0 text-center lg:text-left">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[#5E6B34]">
            Čerstvě. Jednoduše. S&nbsp;chutí.
          </p>
          {/* Nadpis s hlavní výhodou (11. 11. 2026): begina = natočíte si, kolik chcete. */}
          <h1 className="mt-3 sm:mt-4 font-serif text-[1.75rem] leading-[1.15] min-[400px]:text-[1.95rem] sm:text-[2.5rem] lg:text-[clamp(2.15rem,3.4vw,2.9rem)] tracking-tight text-[#2A2622]">
            <span className="block">Polévky a nápoje</span>{" "}
            <span className="block">v&nbsp;begině</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#3B3631] leading-relaxed max-w-md mx-auto lg:mx-0 text-balance">
            Natočíte si, kolik chcete a&nbsp;kdy chcete. 100&nbsp;% rostlinné, z&nbsp;čisté filtrované vody.
          </p>
          <div className="mt-5 sm:mt-7 flex flex-row items-stretch sm:items-center justify-center lg:justify-start gap-2 sm:gap-3 mx-auto lg:mx-0">
            <ShopLink
              href={HERO_LINKS.soups}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#A51C1C] hover:bg-[#8A1616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A51C1C] transition-colors px-4 sm:px-7 py-3 sm:py-3.5 text-base sm:text-lg font-medium text-white shadow-md shadow-[#A51C1C]/20"
            >
              Vybrat polévku
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </ShopLink>
            <ShopLink
              href={HERO_LINKS.syrups}
              className="inline-flex items-center justify-center rounded-lg border-2 border-[#5E6B34] hover:bg-[#5E6B34]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E6B34] transition-colors px-4 sm:px-7 py-2.5 sm:py-3 text-base sm:text-lg font-medium text-[#4A5527]"
            >
              Objevit sirupy
            </ShopLink>
          </div>
          <p className="mt-4 sm:mt-6 flex items-center justify-center lg:justify-start gap-2 text-sm sm:text-base text-[#5E6B34]">
            <Snowflake className="w-5 h-5" aria-hidden="true" />
            Doručujeme chlazenou přepravou.
          </p>
        </div>

        <div className="relative w-full sm:max-w-3xl sm:mx-auto sm:px-6 sm:pb-8 lg:p-0 lg:max-w-none">
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            width={HERO_PHOTO.width}
            height={HERO_PHOTO.height}
            priority
            sizes="(min-width: 1216px) 760px, (min-width: 1024px) 62vw, (min-width: 768px) 48rem, 100vw"
            className="block w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}
