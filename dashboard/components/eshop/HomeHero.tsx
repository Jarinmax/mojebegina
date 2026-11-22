import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ShopLink from "./ShopLink";
import { HOME_HERO_BUTTON, HOME_HERO_OFFER, HOME_HERO_PHONE, HOME_HERO_SUBTITLE, HOME_HERO_TITLE } from "@/lib/eshop/homeContent";

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

// v14 (22. 11. 2026, Lucie): kavárna; fotka na počítači širší (sloupec 7/12, až 44rem), protože je 16 : 9 — — obsluha podává dýňovou polévku, vedle begina v lednici; na krabici vloženo oficiální logo.
export const HERO_PHOTO = {
  src: "/eshop/hero/polevka-kavarna-v14.webp",
  width: 1670,
  height: 941,
  alt: "Obsluha v kavárně podává hostovi dýňovou polévku, vedle červený nápoj s ledem, v lednici za pultem begina dýňové polévky 3 l",
};

/** Rychlý nákup nejprodávanějšího (Lucie 20. 11. 2026: stálí zákazníci chtějí hned nakoupit, bez formulářů). */
export const HERO_LINKS = {
  firstPack: "/pro-kavarny#ochutnavka",
  phone: "/pro-kavarny#napiste-nam",
};

export type HeroPortion = { count: number; portions: number; totalKc: number; perPortionKc: number };

// 22. 11. 2026 (Lucie, návrh ChatGPT „úvod pro kavárny“): mobil = nadpis, fotka přes celou
// šířku, text, jedno červené tlačítko, věta o vzorcích, odkaz na telefonát; počítač = text
// vlevo, fotka vpravo zhruba 60 % šířky. Ceny porcí jsou v kartách pod úvodem (HomePriceCards).
export default function HomeHero() {
  return (
    <section className="bg-[#FAF6EF] border-b border-[#EDE5D8]">
      <div className="max-w-6xl mx-auto px-4 pt-5 pb-7 sm:pt-8 sm:pb-10 lg:py-9 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr] gap-x-10 gap-y-5">
        <h1 className="lg:col-start-1 lg:row-start-1 lg:self-end font-serif text-[2rem] leading-[1.1] min-[380px]:text-[2.25rem] sm:text-[2.75rem] lg:text-[clamp(2.4rem,3.6vw,3.25rem)] tracking-tight text-[#2A2622] text-balance">
          {HOME_HERO_TITLE}
        </h1>
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center">
          <Image
            src={HERO_PHOTO.src}
            alt={HERO_PHOTO.alt}
            width={HERO_PHOTO.width}
            height={HERO_PHOTO.height}
            priority
            quality={90}
            sizes="(min-width: 1024px) 40rem, 100vw"
            className="block w-full h-auto rounded-2xl"
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-2 flex flex-col items-stretch sm:items-start gap-4">
          <p className="text-lg sm:text-xl leading-snug text-[#2A2622]">
            {HOME_HERO_SUBTITLE.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </p>
          <ShopLink
            href={HERO_LINKS.firstPack}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#A51C1C] hover:bg-[#8A1616] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A51C1C] transition-colors px-6 py-3.5 text-lg font-semibold text-white"
          >
            {HOME_HERO_BUTTON}
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </ShopLink>
          <p className="text-base leading-snug text-neutral-700">{HOME_HERO_OFFER}</p>
          <ShopLink href={HERO_LINKS.phone} className="inline-flex items-center gap-2 text-base sm:text-lg font-medium text-[#4A5527] underline underline-offset-4">
            {HOME_HERO_PHONE}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </ShopLink>
        </div>
      </div>
    </section>
  );
}
