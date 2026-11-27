import { ArrowRight } from "lucide-react";
import ShopLink from "./ShopLink";

// 22. 11. 2026 (Lucie, návrh ChatGPT): pod úvodem „Kolik stojí porce s dopravou?“ — dvě celé
// klikací karty (3 balení po 3 l, ceny výrobků i dopravy ze stejného zdroje jako košík),
// pod nimi „Nakupujete domů?“. Celkové částky a výpočet jsou na odkazovaných stránkách.
export type PriceCard = { label: string; price: string; /** malým písmem hned za cenou, např. „za sklenici“ */ priceSuffix?: string; note: string; href: string };

export const HOME_PRICES_TITLE = "Kolik Vás vyjde jedna porce?";
export const HOME_SHOP_TITLE = "Nakupujete domů?";

const czk = (value: number) => `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;

/** Karty z vypočtených řádků (soupPortionRows / syrupDrinkRows pro 3 balení). */
export function homePriceCards(soup: { portions: number; perPortionKc: number }, drink: { portions: number; perPortionKc: number }): PriceCard[] {
  return [
    // 27. 11. 2026 (Lucie): přesné znění; „3 × 3 l“ s nezalomitelnými mezerami
    { label: "Polévka (250 ml)", price: czk(Math.round(soup.perPortionKc)), priceSuffix: "za porci včetně dopravy", note: `3\u00a0×\u00a03\u00a0l polévky vystačí na ${soup.portions} porcí.`, href: "/polevky-pro-kavarny" },
    { label: "Limonáda nebo horký nápoj (200 ml)", price: `od ${czk(drink.perPortionKc)}`, priceSuffix: "za porci včetně dopravy", note: `Z 3\u00a0×\u00a03\u00a0l sirupu připravíte až ${drink.portions} porcí limonády nebo horkého nápoje.`, href: "/bylinne-sirupy-pro-kavarny" },
  ];
}

export default function HomePriceCards({ cards, setSlug, setPriceKc = 349 }: { cards: readonly PriceCard[]; setSlug: string; setPriceKc?: number }) {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-8 sm:pt-10" aria-labelledby="ceny-porci">
      <h2 id="ceny-porci" className="font-serif text-[1.75rem] sm:text-[2.25rem] leading-tight text-[#2A2622]">
        {HOME_PRICES_TITLE}
      </h2>
      <ul className="mt-4 sm:mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {cards.map((card) => (
          <li key={card.href}>
            <ShopLink
              href={card.href}
              className="group block h-full rounded-2xl bg-[#F4F2EA] hover:bg-[#ECE9DD] transition-colors px-5 py-3.5 sm:px-6 sm:py-4"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-base font-medium text-[#2A2622]">{card.label}</span>
                <ArrowRight className="w-5 h-5 shrink-0 text-[#4A5527] transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
              <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="font-serif text-[2.1rem] sm:text-[2.5rem] leading-none text-[#2A2622] whitespace-nowrap">{card.price}</span>
                {card.priceSuffix && <span className="text-lg sm:text-xl text-[#2A2622]">{card.priceSuffix}</span>}
              </span>
              <span className="mt-1.5 block text-base text-neutral-700">{card.note}</span>
            </ShopLink>
          </li>
        ))}
      </ul>
      <div className="mt-8 border-t border-[#E3DED0] pt-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-10">
        <h2 className="font-serif text-[1.75rem] sm:text-[2rem] leading-tight text-[#2A2622] md:flex-1">{HOME_SHOP_TITLE}</h2>
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-lg font-medium text-[#4A5527]">
          <ShopLink href="/nakupuji-domu" className="inline-flex items-center gap-2 underline underline-offset-4">
            Nakoupit domů <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </ShopLink>
          <ShopLink href={`/produkt/${setSlug}`} className="inline-flex items-center gap-2 underline underline-offset-4">
            Sada 5 sirupů za {setPriceKc} Kč <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </ShopLink>
          <ShopLink href="/produkt/ochutnavka-polevek-3x450" className="inline-flex items-center gap-2 underline underline-offset-4">
            Ochutnat 3 polévky za 299 Kč <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </ShopLink>
          {/* 4 vzorky zdarma platí i pro domácnosti (Lucie 24. 11. 2026) */}
          <ShopLink href="/pro-kavarny#vyber-beginy" className="inline-flex items-center gap-2 underline underline-offset-4">
            4 vzorky zdarma k první begině <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </ShopLink>
        </div>
      </div>
    </section>
  );
}
