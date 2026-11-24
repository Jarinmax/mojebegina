// Tři karty hned pod úvodem stránky Pro kavárny a bistra (zadání Lucie / ChatGPT 24. 11. 2026):
// první begina se vzorky, ochutnávka 3 polévek, ochutnávka 5 sirupů. Na počítači vedle sebe,
// na mobilu pod sebou. Ceny přichází ze serveru ze stejných údajů jako košík.
import ShopLink from "./ShopLink";
import { formatKc } from "@/lib/format";
import { CAFE_TASTING_GIFT_TEXT } from "@/lib/eshop/cafeTasting";
import { SOUP_PACK_SLUG } from "@/lib/eshop/soupPack";
import { SET_SLUG } from "@/lib/eshop/tastingSet";

export type CafeStartCardsProps = {
  soupPack: { priceKc: number; coldShippingKc: number | null } | null;
  syrupSet: { priceKc: number; includesShipping: boolean } | null;
  /** kam vede „Vybrat beginu a vzorky“ – na Pro kavárny kotva na stejné stránce, odjinud celá adresa */
  beginaHref?: string;
  className?: string;
};

const card = "rounded-2xl bg-white p-5 flex flex-col";
const title = "font-serif text-xl text-[#2A2622]";
const text = "mt-2 text-base leading-normal text-neutral-700 flex-1";
const button = "mt-4 inline-flex items-center justify-center rounded-lg font-semibold px-5 h-12 text-base";

export default function CafeStartCards({ soupPack, syrupSet, beginaHref = "#vyber-beginy", className = "-mt-4" }: CafeStartCardsProps) {
  return (
    <section aria-label="Jak začít" className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className}`}>
      <div className={`${card} border-2 border-[#5E6B34]`}>
        <h2 className={title}>První begina 3 l</h2>
        <p className={text}>{CAFE_TASTING_GIFT_TEXT}</p>
        {beginaHref.startsWith("#") ? (
          <a href={beginaHref} className={`${button} bg-[#A51C1C] hover:bg-[#8C1717] text-white`}>
            Vybrat beginu a vzorky
          </a>
        ) : (
          <ShopLink href={beginaHref} className={`${button} bg-[#A51C1C] hover:bg-[#8C1717] text-white`}>
            Vybrat beginu a vzorky
          </ShopLink>
        )}
      </div>
      {soupPack && (
        <div className={`${card} border border-[#EDE5D8]`}>
          <h2 className={title}>Ochutnávka 3 polévek</h2>
          <p className={text}>
            Vyberte si tři různé polévky po 450 ml. Při odběru ve Viticích zaplatíte {formatKc(soupPack.priceKc)}
            {soupPack.coldShippingKc !== null ? `, s chlazenou dopravou ${formatKc(soupPack.priceKc + soupPack.coldShippingKc)}` : ""}.
          </p>
          <ShopLink href={`/produkt/${SOUP_PACK_SLUG}#vyber`} className={`${button} bg-[#2F3B1E] hover:bg-[#232D16] text-white`}>
            Vybrat 3 polévky
          </ShopLink>
        </div>
      )}
      {syrupSet && (
        <div className={`${card} border border-[#EDE5D8]`}>
          <h2 className={title}>Ochutnávka 5 sirupů</h2>
          <p className={text}>
            Vyberte si pět příchutí po 100 ml. Set posíláme i Zásilkovnou.
            <span className="mt-2 block font-semibold text-[#2A2622]">
              {formatKc(syrupSet.priceKc)}
              {syrupSet.includesShipping ? " včetně dopravy Zásilkovnou" : " + doprava"}
            </span>
          </p>
          <ShopLink href={`/produkt/${SET_SLUG}#vyber`} className={`${button} border-2 border-[#5E6B34] text-[#4A5527] hover:bg-[#F4F2EA]`}>
            Vybrat 5 sirupů
          </ShopLink>
        </div>
      )}
    </section>
  );
}
