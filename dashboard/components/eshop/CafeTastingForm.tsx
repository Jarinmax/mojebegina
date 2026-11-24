"use client";

// Vzorky k první begině (20. 11. 2026, přepracováno 24. 11. 2026) — begina 3 l,
// výběr vzorků (z každého nejvýš 1 kus), průběžný součet, pak do košíku a rovnou
// do pokladny. Bez IČO; nárok na dárek ověří pokladna podle e-mailu.
// Pod tím „Chci jen ochutnat“: set sirupů, vzorky polévek ve Viticích
// a (po spuštění) Ochutnávka polévek 3 × 450 ml. Pravidla a texty: lib/eshop/cafeTasting.ts.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAFE_TASTING_ELIGIBLE_TEXT,
  CAFE_TASTING_EXTRA_TEXT,
  CAFE_TASTING_ONCE_TEXT,
  CAFE_TASTING_SOUPS_ONLY_TEXT,
  CAFE_TASTING_SYRUPS_ONLY_HEADING,
  CAFE_TASTING_SYRUPS_ONLY_LINK,
  CAFE_TASTING_SYRUPS_ONLY_TEXT,
  CAFE_TASTING_CREDIT_ENABLED,
  CAFE_TASTING_CREDIT_TEXT,
  CAFE_TASTING_DELIVERY,
  CAFE_TASTING_HEADING,
  CAFE_TASTING_BEGINA_HEADING,
  CAFE_TASTING_NEED_BEGINA_PICK,
  CAFE_TASTING_INTRO,
  CAFE_TASTING_ITEMS,
  CAFE_TASTING_NEED_ITEM,
  CAFE_TASTING_SOUPS_HEADING,
  CAFE_TASTING_SYRUPS_HEADING,
  CAFE_TASTING_MULLED_HEADING,
  CAFE_TASTING_OTHER_SAMPLES,
  CAFE_TASTING_FREE,
  CAFE_TASTING_PRICE_KC,
  cafeTastingTotalKc,
  freeTastingSkus,
  tastingFreeKind,
  type CafeTastingItem,
} from "@/lib/eshop/cafeTasting";
import { SET_SLUG } from "@/lib/eshop/tastingSet";
import { SOUP_PACK_BUTTON, SOUP_PACK_DELIVERY_LABEL, SOUP_PACK_PICKUP_LABEL, SOUP_PACK_SLUG, SOUP_PACK_TEXT, SOUP_PACK_TITLE } from "@/lib/eshop/soupPack";
import { formatKc } from "@/lib/format";
import ShopLink from "./ShopLink";
import { useCart } from "./useCart";
import { useEshopHref } from "./EshopBase";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 h-12 text-base text-[#2A2622] focus:outline-none focus:ring-2 focus:ring-[#5E6B34]";

// 22. 11. 2026 (Lucie): polopatě — vybrané vzorky zdarma zeleně se štítkem
// „zdarma“, každý další vzorek má u sebe „+49 Kč“.
function ItemList({ items, chosen, free, toggle }: { items: readonly CafeTastingItem[]; chosen: Set<string>; free: Set<string>; toggle: (sku: string) => void }) {
  const kind = items[0] ? tastingFreeKind(items[0].sku) : null;
  const quota = kind ? CAFE_TASTING_FREE[kind] : 0;
  const usedFree = items.filter((item) => free.has(item.sku)).length;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => {
        const checked = chosen.has(item.sku);
        const isFree = checked ? free.has(item.sku) : usedFree < quota;
        const box = checked
          ? isFree
            ? "border-[#3F7A2E] bg-[#E6F2DF] ring-1 ring-[#3F7A2E]"
            : "border-[#5E6B34] bg-white ring-1 ring-[#5E6B34]"
          : "border-neutral-200 bg-white";
        return (
          <label key={item.sku} className={`flex items-center gap-3 rounded-xl border px-3 min-h-12 py-2 text-base cursor-pointer ${box}`}>
            <input type="checkbox" checked={checked} onChange={() => toggle(item.sku)} className="w-5 h-5 accent-[#3F7A2E]" />
            <span className="flex-1">{item.name}</span>
            <span
              className={`shrink-0 text-sm tabular-nums whitespace-nowrap ${
                isFree ? (checked ? "font-semibold text-[#2F6322]" : "text-[#3F7A2E]") : checked ? "font-semibold text-[#2A2622]" : "text-neutral-500"
              }`}
            >
              {isFree ? "zdarma" : `+${CAFE_TASTING_PRICE_KC} Kč`}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const samples = (n: number) => (n === 1 ? "vzorek" : n >= 2 && n <= 4 ? "vzorky" : "vzorků");

export type TastingBeginaOption = { sku: string; name: string; priceKc: number };

export default function CafeTastingForm({
  available,
  beginas = [],
  initialChosen = [],
  initialBegina = "",
  soupPack = null,
}: {
  available: readonly string[];
  beginas?: readonly TastingBeginaOption[];
  /** jen pro náhled */ initialChosen?: readonly string[];
  initialBegina?: string;
  /** Ochutnávka polévek 3 × 450 ml — cena a chlazená doprava ze serveru; null = produkt v katalogu není */
  soupPack?: { priceKc: number; coldShippingKc: number | null } | null;
}) {
  const { add } = useCart();
  const router = useRouter();
  const href = useEshopHref();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialChosen));
  const [begina, setBegina] = useState<string>(initialBegina);
  const [error, setError] = useState<string | null>(null);
  const items = CAFE_TASTING_ITEMS.filter((item) => available.includes(item.sku));
  const beginaPrice = beginas.find((option) => option.sku === begina)?.priceKc ?? 0;
  const free = freeTastingSkus([...chosen]);
  const paidCount = chosen.size - free.size;
  const total = cafeTastingTotalKc([...chosen]) + beginaPrice;
  const beginaName = beginas.find((option) => option.sku === begina)?.name ?? null;

  function toggle(sku: string) {
    setError(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function submit() {
    if (beginas.length > 0 && !begina) {
      setError(CAFE_TASTING_NEED_BEGINA_PICK);
      return;
    }
    if (chosen.size === 0) {
      setError(CAFE_TASTING_NEED_ITEM);
      return;
    }
    if (begina) add(begina, 1);
    for (const sku of chosen) add(sku, 1);
    router.push(href("/pokladna"));
  }

  return (
    <section id="ochutnavka" className="rounded-2xl border-2 border-[#5E6B34] bg-[#FAF6EF] p-5 sm:p-6 flex flex-col gap-5 scroll-mt-24">
      <div>
        <h2 className="font-serif text-2xl text-[#2A2622]">{CAFE_TASTING_HEADING}</h2>
        <p className="mt-1 text-base text-neutral-700">{CAFE_TASTING_INTRO}</p>
        <p className="mt-1 text-sm text-neutral-600">{CAFE_TASTING_ONCE_TEXT}</p>
      </div>
      {beginas.length > 0 && (
        <fieldset>
          <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_BEGINA_HEADING}</legend>
          <select value={begina} onChange={(e) => { setBegina(e.target.value); setError(null); }} className={input}>
            <option value="">Vyberte beginu…</option>
            {beginas.map((option) => (
              <option key={option.sku} value={option.sku}>
                {formatKc(option.priceKc)} – {option.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-neutral-600">{CAFE_TASTING_ELIGIBLE_TEXT} Další beginy si můžete přidat v košíku.</p>
        </fieldset>
      )}
      <p className="-mb-2 text-base text-neutral-700">{CAFE_TASTING_EXTRA_TEXT}</p>
      <fieldset>
        <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_SOUPS_HEADING}</legend>
        <ItemList items={items.filter((item) => item.kind === "polevka")} chosen={chosen} free={free} toggle={toggle} />
      </fieldset>
      <fieldset>
        <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_SYRUPS_HEADING}</legend>
        <ItemList items={items.filter((item) => item.kind === "sirup")} chosen={chosen} free={free} toggle={toggle} />
      </fieldset>
      {items.some((item) => item.kind === "svarak" || item.kind === "koktejl") && (
        <fieldset>
          <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_MULLED_HEADING}</legend>
          <ItemList items={items.filter((item) => item.kind === "svarak" || item.kind === "koktejl")} chosen={chosen} free={free} toggle={toggle} />
        </fieldset>
      )}
      <p className="text-sm text-neutral-600">{CAFE_TASTING_OTHER_SAMPLES}</p>
      <div className="rounded-xl bg-white border border-[#EDE5D8] px-4 py-3" aria-live="polite">
        <ul className="flex flex-col gap-1 text-base">
          <li className="flex justify-between gap-3">
            <span>1 begina{beginaName ? ` – ${beginaName}` : " (vyberte nahoře)"}</span>
            <span className="tabular-nums whitespace-nowrap shrink-0">{formatKc(beginaPrice)}</span>
          </li>
          <li className="flex justify-between gap-3 text-[#2F6322]">
            <span>{free.size} {samples(free.size)} zdarma</span>
            <span className="tabular-nums whitespace-nowrap shrink-0">0 Kč</span>
          </li>
          {paidCount > 0 && (
            <li className="flex justify-between gap-3">
              <span>{paidCount} {samples(paidCount)} navíc po {CAFE_TASTING_PRICE_KC} Kč</span>
              <span className="tabular-nums whitespace-nowrap shrink-0">{formatKc(paidCount * CAFE_TASTING_PRICE_KC)}</span>
            </li>
          )}
        </ul>
        <p className="mt-2 pt-2 border-t border-[#EDE5D8] flex items-baseline justify-between gap-3 text-lg">
          <span className="font-semibold">Celkem bez dopravy</span>
          <strong className="tabular-nums whitespace-nowrap shrink-0">{formatKc(total)}</strong>
        </p>
        <p className="mt-1 text-sm text-neutral-600">{CAFE_TASTING_DELIVERY}</p>
        {CAFE_TASTING_CREDIT_ENABLED && <p className="mt-1 text-sm font-medium text-[#4A5527]">{CAFE_TASTING_CREDIT_TEXT}</p>}
      </div>
      {error && (
        <p role="alert" className="text-base font-medium text-[#A51C1C]">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} className="self-stretch sm:self-start rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] text-white font-semibold px-6 h-12 text-base">
        Pokračovat k objednávce
      </button>

      {/* Zadání 24. 11. 2026: kdo nechce celou beginu */}
      <div className="border-t border-[#EDE5D8] pt-5 flex flex-col gap-4">
        <h3 className="font-serif text-xl text-[#2A2622]">Chci jen ochutnat</h3>
        {soupPack && (
          <div className="rounded-xl bg-white border border-[#EDE5D8] p-4">
            <h4 className="font-semibold text-lg text-[#2A2622]">{SOUP_PACK_TITLE}</h4>
            <p className="mt-1 text-base text-neutral-700">{SOUP_PACK_TEXT}</p>
            <ul className="mt-3 flex flex-col gap-1 text-base">
              <li className="flex justify-between gap-3">
                <span>{SOUP_PACK_PICKUP_LABEL}</span>
                <strong className="tabular-nums whitespace-nowrap">{formatKc(soupPack.priceKc)}</strong>
              </li>
              {soupPack.coldShippingKc !== null && (
                <li className="flex justify-between gap-3">
                  <span>{SOUP_PACK_DELIVERY_LABEL}</span>
                  <strong className="tabular-nums whitespace-nowrap">{formatKc(soupPack.priceKc + soupPack.coldShippingKc)}</strong>
                </li>
              )}
            </ul>
            <ShopLink href={`/produkt/${SOUP_PACK_SLUG}`} className="mt-3 inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-[#2F3B1E] text-white font-semibold px-6 h-11 text-base">
              {SOUP_PACK_BUTTON}
            </ShopLink>
          </div>
        )}
        <div className="rounded-xl bg-white border border-[#EDE5D8] p-4">
          <h4 className="font-semibold text-lg text-[#2A2622]">{CAFE_TASTING_SYRUPS_ONLY_HEADING}</h4>
          <p className="mt-1 text-base text-neutral-700">{CAFE_TASTING_SYRUPS_ONLY_TEXT}</p>
          <ShopLink href={`/produkt/${SET_SLUG}`} className="mt-3 inline-flex items-center justify-center rounded-lg border-2 border-[#5E6B34] text-[#4A5527] font-semibold px-5 h-11 text-base">
            {CAFE_TASTING_SYRUPS_ONLY_LINK}
          </ShopLink>
        </div>
        <p className="text-base text-neutral-700">{CAFE_TASTING_SOUPS_ONLY_TEXT}</p>
      </div>
    </section>
  );
}
