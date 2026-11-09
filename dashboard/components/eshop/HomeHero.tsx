import Image from "next/image";
import { ArrowRight, Snowflake } from "lucide-react";
import ShopLink from "./ShopLink";

// Úvod e-shopu podle návrhu z 8. 11. 2026: krémový podklad, olivové
// detaily, výrazné červené hlavní tlačítko a skutečná fotografie čerstvé
// polévky s hrnkem horkého bylinného čaje (fotka od majitele 9. 11. 2026;
// žádné krabice ani vymyšlené obaly).
// Texty a tlačítka jsou webové prvky; logo a menu zůstávají z hlavičky webu.
//
// Rozložení: mobil a tablet = text a tlačítka nahoře na střed, fotografie
// pod nimi přes celou šířku; počítač = text vlevo, fotografie vpravo.
// Fotografie se nikdy neořezává ani nedeformuje (vždy celá v původním poměru),
// velikosti pro rychlé načtení připravuje next/image (AVIF/WebP podle sizes).

export const HERO_PHOTO = {
  src: "/eshop/hero/polevka-a-horky-caj.webp",
  width: 1672,
  height: 941,
  alt: "Čerstvá dýňová polévka v misce a hrnek horkého bylinného čaje s heřmánkem a meduňkou",
};

export const HERO_LINKS = {
  soups: "/kategorie/polevky",
  syrups: "/kategorie/sirupy",
};

export default function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-[#FAF6EF] border-b border-[#EDE5D8]">
      <div className="max-w-6xl mx-auto lg:px-4 lg:py-[clamp(1.5rem,4vh,3.5rem)] grid items-center lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="relative z-10 px-4 pt-9 pb-6 sm:pt-12 sm:pb-8 lg:p-0 text-center lg:text-left">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-[#5E6B34]">
            Čerstvě. Jednoduše. S&nbsp;chutí.
          </p>
          <h1 className="mt-4 font-serif text-[1.85rem] leading-[1.12] sm:text-[2.4rem] lg:text-[clamp(2.1rem,4.2vh,2.8rem)] tracking-tight text-[#2A2622] text-balance max-w-[22ch] mx-auto lg:mx-0">
            Čerstvé polévky, bylinné sirupy, nápoje a&nbsp;zmrzliny
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
          {/* jemný přechod fotografie do krémového podkladu (mobil, tablet) */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#FAF6EF] to-transparent z-10 sm:hidden" />
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            width={HERO_PHOTO.width}
            height={HERO_PHOTO.height}
            priority
            sizes="(min-width: 1152px) 600px, (min-width: 1024px) 52vw, (min-width: 768px) 48rem, 100vw"
            className="block w-full h-auto sm:rounded-2xl sm:shadow-[0_18px_40px_-18px_rgba(90,65,30,0.35)]"
          />
        </div>
      </div>
    </section>
  );
}
