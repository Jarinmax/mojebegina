"use client";

// Ochutnávka do provozu (20. 11. 2026) — výběr polévek a sirupů (z každého nejvýš
// 1 kus), průběžný součet, název provozu a IČO (ověření + ARES), pak do košíku
// a rovnou do pokladny. Pravidla a texty: lib/eshop/cafeTasting.ts.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAFE_TASTING_COMPANY_STORAGE,
  CAFE_TASTING_CREDIT_ENABLED,
  CAFE_TASTING_CREDIT_TEXT,
  CAFE_TASTING_DELIVERY,
  CAFE_TASTING_HEADING,
  CAFE_TASTING_BEGINA_HEADING,
  CAFE_TASTING_NEED_BEGINA_PICK,
  CAFE_TASTING_ICO_NOTE,
  CAFE_TASTING_INTRO,
  CAFE_TASTING_ITEMS,
  CAFE_TASTING_NEED_ITEM,
  CAFE_TASTING_SOUPS_HEADING,
  CAFE_TASTING_SYRUPS_HEADING,
  CAFE_TASTING_MULLED_HEADING,
  cafeTastingTotalKc,
  type CafeTastingCompany,
  type CafeTastingItem,
} from "@/lib/eshop/cafeTasting";
import { checkTastingIcoAction } from "@/app/eshop/pro-kavarny/tastingActions";
import { formatKc } from "@/lib/format";
import { useCart } from "./useCart";
import { useEshopHref } from "./EshopBase";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 h-12 text-base text-[#2A2622] focus:outline-none focus:ring-2 focus:ring-[#5E6B34]";

function ItemList({ items, chosen, toggle }: { items: readonly CafeTastingItem[]; chosen: Set<string>; toggle: (sku: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => {
        const checked = chosen.has(item.sku);
        return (
          <label key={item.sku} className={`flex items-center gap-3 rounded-xl border bg-white px-3 min-h-12 py-2 text-base cursor-pointer ${checked ? "border-[#5E6B34] ring-1 ring-[#5E6B34]" : "border-neutral-200"}`}>
            <input type="checkbox" checked={checked} onChange={() => toggle(item.sku)} className="w-5 h-5 accent-[#5E6B34]" />
            <span className="flex-1">{item.name}</span>
          </label>
        );
      })}
    </div>
  );
}

export type TastingBeginaOption = { sku: string; name: string; priceKc: number };

export default function CafeTastingForm({ available, beginas = [] }: { available: readonly string[]; beginas?: readonly TastingBeginaOption[] }) {
  const { add } = useCart();
  const router = useRouter();
  const href = useEshopHref();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [begina, setBegina] = useState<string>("");
  const [venue, setVenue] = useState("");
  const [ico, setIco] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = CAFE_TASTING_ITEMS.filter((item) => available.includes(item.sku));
  const beginaPrice = beginas.find((option) => option.sku === begina)?.priceKc ?? 0;
  const total = cafeTastingTotalKc([...chosen]) + beginaPrice;

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
    startTransition(async () => {
      const result = await checkTastingIcoAction(ico, venue);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const company: CafeTastingCompany = {
        venue: venue.trim(),
        company: result.company?.name ?? venue.trim(),
        ico: result.ico,
        dic: result.company?.dic ?? null,
        street: result.company?.street ?? "",
        city: result.company?.city ?? "",
        zip: result.company?.zip ?? "",
      };
      try {
        sessionStorage.setItem(CAFE_TASTING_COMPANY_STORAGE, JSON.stringify(company));
      } catch {
        // bez sessionStorage se údaje vyplní v pokladně ručně
      }
      if (begina) add(begina, 1);
      for (const sku of chosen) add(sku, 1);
      router.push(href("/pokladna"));
    });
  }

  return (
    <section id="ochutnavka" className="rounded-2xl border-2 border-[#5E6B34] bg-[#FAF6EF] p-5 sm:p-6 flex flex-col gap-5 scroll-mt-24">
      <div>
        <h2 className="font-serif text-2xl text-[#2A2622]">{CAFE_TASTING_HEADING}</h2>
        <p className="mt-1 text-base text-neutral-700">{CAFE_TASTING_INTRO}</p>
      </div>
      {beginas.length > 0 && (
        <fieldset>
          <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_BEGINA_HEADING}</legend>
          <select value={begina} onChange={(e) => { setBegina(e.target.value); setError(null); }} className={input}>
            <option value="">Vyberte beginu…</option>
            {beginas.map((option) => (
              <option key={option.sku} value={option.sku}>
                {option.name} – {formatKc(option.priceKc)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-neutral-600">Další beginy si můžete přidat v košíku.</p>
        </fieldset>
      )}
      <fieldset>
        <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_SOUPS_HEADING}</legend>
        <ItemList items={items.filter((item) => item.kind === "polevka")} chosen={chosen} toggle={toggle} />
      </fieldset>
      <fieldset>
        <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_SYRUPS_HEADING}</legend>
        <ItemList items={items.filter((item) => item.kind === "sirup")} chosen={chosen} toggle={toggle} />
      </fieldset>
      {items.some((item) => item.kind === "svarak" || item.kind === "koktejl") && (
        <fieldset>
          <legend className="font-semibold text-base text-[#2A2622] mb-2">{CAFE_TASTING_MULLED_HEADING}</legend>
          <ItemList items={items.filter((item) => item.kind === "svarak" || item.kind === "koktejl")} chosen={chosen} toggle={toggle} />
        </fieldset>
      )}
      <div className="rounded-xl bg-white border border-[#EDE5D8] px-4 py-3" aria-live="polite">
        <p className="flex items-baseline justify-between gap-3 text-lg">
          <span>
            {begina ? "Begina + " : ""}<span className="tabular-nums">{chosen.size}</span> {chosen.size === 1 ? "vzorek" : chosen.size >= 2 && chosen.size <= 4 ? "vzorky" : "vzorků"}
          </span>
          <strong className="tabular-nums">{formatKc(total)}</strong>
        </p>
        <p className="mt-1 text-sm text-neutral-600">{CAFE_TASTING_DELIVERY}</p>
        {CAFE_TASTING_CREDIT_ENABLED && <p className="mt-1 text-sm font-medium text-[#4A5527]">{CAFE_TASTING_CREDIT_TEXT}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Název podniku</span>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} autoComplete="organization" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">IČO</span>
          <input value={ico} onChange={(e) => setIco(e.target.value)} inputMode="numeric" maxLength={10} className={input} />
        </label>
      </div>
      <p className="-mt-2 text-sm text-neutral-600">{CAFE_TASTING_ICO_NOTE}</p>
      {error && (
        <p role="alert" className="text-base font-medium text-[#A51C1C]">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={pending} className="self-stretch sm:self-start rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] disabled:opacity-60 text-white font-semibold px-6 h-12 text-base">
        {pending ? "Ověřujeme IČO…" : "Pokračovat k objednávce"}
      </button>
    </section>
  );
}
