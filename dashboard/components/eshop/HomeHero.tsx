import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ShopLink from "./ShopLink";
import { HOME_HERO_BOX_NOTE, HOME_HERO_BUTTON, HOME_HERO_OFFER, HOME_HERO_TASTE_LINK, HOME_HERO_SUBTITLE, HOME_HERO_TITLE } from "@/lib/eshop/homeContent";

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
// první obrazovku vešel i pruh kategorií a dlaždice Proč Begina; fotka se
// zvětšuje s výškou okna (20–34rem), aby první obrazovka byla vyplněná.
// Od 16. 11. 2026 (Lucie) je pod nadpisem na všech zařízeních řádek tří výhod
// (HOME_HERO_POINTS); nahradil větu „100 % rostlinné“ v odstavci a řádek o dopravě.
// Mobil (15. 11. 2026, Lucie: „moc nápisů“): jen heslo, nadpis, tři výhody a velká fotka;
// pod úvodem dlaždice kategorií. Odstavec, tlačítka a řádek o dopravě jsou
// na mobilu skryté — totéž říkají dlaždice kategorií a části Proč Begina
// a Jak funguje begina hned pod tím.
// Fotografie se nikdy neořezává ani nedeformuje (vždy celá v původním poměru).
// Její pozadí je přímo v obrázku přebarvené na béžovou úvodu (#FAF6EF), bez
// rámečku a stínu — splývá s podkladem (9. 11. 2026).
// v13 (19. 11. 2026, Lucie): skutečná „fotka“ na dřevěném stole u okna, v rámečku se zaoblenými rohy
// (pozadí už nesplývá s úvodem). Dřív v12: nová čistá fotka z ChatGPT (hladká miska, čisté sklo), pozadí doladěné na #FAF6EF, posílá se v kvalitě 90.
// velikosti pro rychlé načtení připravuje next/image (AVIF/WebP podle sizes).

// v16 (28. 11. 2026): černobílá etiketa na krabici (Lucie – zatím se tisknou černobílé). v15 (28. 11. 2026, Lucie + Jarin): nová úvodní stránka – světlá kavárna, Dýňová polévka teče
// z kohoutku krabice do misky (to, čím se lišíme); na krabici vložena skutečná přední etiketa.
// Počítač: fotka přes celou šířku obsahu, text vlevo přes jemný tmavý přechod. Mobil: fotka nahoře,
// text pod ní (aby fotka zůstala světlá a text čitelný). Fotka se nikdy neořezává (16 : 9, h-auto).
// Jedno tlačítko, pod ním věta o vzorcích a drobný odkaz na ochutnávku; žádné další texty.
export const HERO_PHOTO = {
  src: "/eshop/hero/dynova-z-krabice-kavarna-v16.webp",
  width: 1672,
  height: 941,
  alt: "Ve světlé kavárně teče Dýňová polévka z kohoutku krabice Begina 3 l do keramické misky",
};

/** Odkazy z úvodu. */
export const HERO_LINKS = {
  firstPack: "/pro-kavarny#vyber-beginy",
  tasteSoups: "/produkt/ochutnavka-polevek-3x450",
};

export type HeroPortion = { count: number; portions: number; totalKc: number; perPortionKc: number };

export default function HomeHero() {
  // 28. 11. 2026 večer (Lucie): fotka vždy celá v původním formátu (oříznutá byla bez nápisu Dýňová); šířka max-w-5xl.
  // Dřív: velká fotka přes celou šířku s textem přes ni, ale NIŽŠÍ, aby byly pod ní
  // hned vidět dlaždice Pro kavárny / Domů. Počítač: výška 26rem, fotka přes šířku (ořez jen nahoře
  // a dole), text vlevo přes jemný přechod. Mobil: fotka nahoře celá, text pod ní.
  return (
    <section className="bg-[#FAF6EF]">
      <div className="max-w-5xl mx-auto lg:px-4 lg:pt-4">
        <div className="relative">
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            width={HERO_PHOTO.width}
            height={HERO_PHOTO.height}
            priority
            quality={90}
            sizes="(min-width: 1152px) 72rem, 100vw"
            className="block w-full h-auto lg:rounded-2xl"
          />
          {/* mobil: popisek hned pod fotkou (na počítači pod celým úvodem) */}
          <p className="lg:hidden px-4 mt-2 text-sm leading-snug text-neutral-600 text-center">{HOME_HERO_BOX_NOTE}</p>
          <div className="px-4 pt-5 pb-6 lg:absolute lg:inset-0 lg:flex lg:flex-col lg:justify-center lg:items-start lg:px-12 lg:py-8 lg:rounded-2xl lg:bg-gradient-to-r lg:from-[rgba(40,28,16,0.66)] lg:via-[rgba(40,28,16,0.28)] lg:to-transparent">
            <h1 className="font-serif text-[2rem] leading-[1.1] min-[380px]:text-[2.25rem] sm:text-[2.75rem] lg:text-[3rem] tracking-tight text-[#2A2622] lg:text-white text-balance lg:max-w-[36rem]">
              {HOME_HERO_TITLE}
            </h1>
            <p className="mt-3 text-lg sm:text-xl leading-snug text-[#2A2622] lg:text-white lg:max-w-[34rem]">{HOME_HERO_SUBTITLE.join(" ")}</p>
            <ShopLink
              href={HERO_LINKS.firstPack}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#A51C1C] hover:bg-[#8A1616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A51C1C] transition-colors px-7 py-3.5 text-lg font-semibold text-white w-full sm:w-auto"
            >
              {HOME_HERO_BUTTON}
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </ShopLink>
            <p className="mt-3 text-base leading-snug text-neutral-700 lg:text-white/95">{HOME_HERO_OFFER}</p>
            <ShopLink href={HERO_LINKS.tasteSoups} className="mt-1.5 inline-flex items-center gap-1.5 text-base font-medium text-[#4A5527] lg:text-white underline underline-offset-4">
              {HOME_HERO_TASTE_LINK}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </ShopLink>
          </div>
        </div>
        {/* 28. 11. 2026 (Jarin + Lucie): na fotce je krabice, kterou k begině nedodáváme → popisek hned pod fotkou */}
        <p className="hidden lg:block mt-2 text-sm leading-snug text-neutral-600 text-center">{HOME_HERO_BOX_NOTE}</p>
      </div>
    </section>
  );
}
