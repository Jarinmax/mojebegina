import ShopLink from "./ShopLink";

// 22. 11. 2026 (Lucie): zákazníci domů musí hned na úvodu vidět, za kolik nakoupí.
// Jeden pruh pod ikonami kategorií — ceny z katalogu (vyprodaná balení se nepočítají).
export type HomeShopPrices = { soupKc: number | null; syrupKc: number | null; syrupLabel: string | null; setKc: number | null };

export default function HomeShopBar({ prices }: { prices: HomeShopPrices }) {
  const items = [
    prices.soupKc !== null ? `Polévky 3 l od ${prices.soupKc} Kč` : null,
    prices.syrupKc !== null ? `Sirupy od ${prices.syrupKc} Kč${prices.syrupLabel ? ` (${prices.syrupLabel})` : ""}` : null,
    prices.setKc !== null ? `Ochutnávkový set sirupů ${prices.setKc} Kč` : null,
    "Chlazená doprava po celé ČR",
  ].filter((item): item is string => item !== null);
  return (
    <section aria-label="Nakupuji domů" className="w-full max-w-6xl mx-auto px-4 pt-4">
      <div className="rounded-2xl border border-[#E0D6C3] bg-white px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <h2 className="font-serif text-xl text-[#2A2622] shrink-0">Nakupuji domů</h2>
        <ul className="flex-1 flex flex-wrap gap-x-5 gap-y-1 text-base text-[#3B3631]">
          {items.map((item) => (
            <li key={item} className="whitespace-nowrap">
              <span className="text-[#5E6B34]" aria-hidden="true">✓ </span>
              {item}
            </li>
          ))}
        </ul>
        <ShopLink
          href="/nakupuji-domu"
          className="self-start md:self-auto shrink-0 rounded-lg border-2 border-[#5E6B34] px-5 py-2 text-base font-semibold text-[#4A5527] hover:bg-[#FAF6EF]"
        >
          Nakoupit domů
        </ShopLink>
      </div>
    </section>
  );
}
