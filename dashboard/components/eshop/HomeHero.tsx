import Image from "next/image";
import { ArrowRight, Snowflake } from "lucide-react";
import ShopLink from "./ShopLink";

// Úvod e-shopu podle návrhu z 8. 11. 2026: krémový podklad, olivové
// detaily, výrazné červené hlavní tlačítko. Fotografie od 11. 11. 2026
// (schválil majitel): dýňová polévka, hrnek čaje, limonáda a skutečné
// balení begina 3 l s kohoutkem (žádné krabice ani vymyšlené obaly).
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
  src: "/eshop/hero/polevka-begina-caj-limonada.webp",
  width: 1202,
  height: 901,
  alt: "Dýňová polévka v misce, hrnek horkého bylinného čaje, ledová limonáda a třílitrová begina s kohoutkem",
};

export const HERO_LINKS = {
  soups: "/kategorie/polevky",
  syrups: "/kategorie/sirupy",
};

export default function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#FAF6EF] border-b border-[#EDE5D8]">
      <div className="max-w-[76rem] mx-auto lg:px-4 lg:py-[clamp(1.5rem,4vh,3.5rem)] grid items-center lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-6">
        <div className="relative z-10 px-4 pt-9 pb-6 sm:pt-12 sm:pb-8 lg:p-0 text-center lg:text-left">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[#5E6B34]">
            Čerstvě. Jednoduše. S&nbsp;chutí.
          </p>
          {/* Velikost: mobil o 10 % menší než dřív (na výšku i na šířku — telefon
              na šířku pozná nízká výška okna), tablet na výšku 40 px, tablet na
              šířku a počítač podle šířky (beze změny).
              Přesně tři řádky (majitel 9. 11. 2026), žádný se dál neláme; mezery
              mezi řádky kvůli čtečkám a vyhledávačům („… polévky Bylinné …“). */}
          <h1 className="mt-4 font-serif text-[1.62rem] leading-[1.15] min-[400px]:text-[1.8rem] sm:text-[2.5rem] sm:[@media(max-height:500px)]:text-[2.25rem] lg:text-[clamp(2.15rem,3.4vw,2.75rem)] tracking-tight text-[#2A2622]">
            <span className="block whitespace-nowrap">Čerstvé polévky</span>{" "}
            <span className="block whitespace-nowrap">Bylinné sirupy</span>{" "}
            <span className="block whitespace-nowrap">Nápoje a&nbsp;zmrzliny</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#3B3631] leading-relaxed max-w-md mx-auto lg:mx-0 text-balance">
            Z pečlivě vybraných surovin a&nbsp;čisté filtrované vody.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 max-w-xs sm:max-w-none mx-auto lg:mx-0">
            <ShopLink
              href={HERO_LINKS.soups}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#A51C1C] hover:bg-[#8A1616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A51C1C] transition-colors px-7 py-3.5 text-lg font-medium text-white shadow-md shadow-[#A51C1C]/20"
            >
              Vybrat polévku
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </ShopLink>
            <ShopLink
              href={HERO_LINKS.syrups}
              className="inline-flex items-center justify-center rounded-lg border-2 border-[#5E6B34] hover:bg-[#5E6B34]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E6B34] transition-colors px-7 py-3 text-lg font-medium text-[#4A5527]"
            >
              Objevit sirupy
            </ShopLink>
          </div>
          <p className="mt-6 flex items-center justify-center lg:justify-start gap-2 text-sm sm:text-base text-[#5E6B34]">
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
