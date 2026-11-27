"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Počet begin (Lucie 27. 11. 2026): tlačítka přepínají hned, bez „Přepočítat“.
// Jiný počet: − / + nebo napsat číslo — přepočítá se samo (Enter nebo kliknutí jinam).
const QUICK = [1, 2, 3, 5, 10];

export function BatchPicker({ base, count }: { base: string; count: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(count));
  const href = (n: number) => (n === 1 ? base : `${base}?beginy=${n}`);
  const apply = (raw: string) => {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 200 && n !== count) router.push(href(n));
    else setValue(String(count));
  };
  const btn = "rounded-md border px-3 py-1.5 text-sm font-medium";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-neutral-600">Kolik begin vyrábíš?</span>
      <div className="flex items-center gap-1">
        {QUICK.map((n) => (
          <Link key={n} href={href(n)} className={`${btn} ${n === count ? "border-begina-primary-900 bg-begina-primary-900 text-white" : "border-neutral-300 bg-white text-neutral-900 hover:border-begina-primary-300"}`}>
            {n}
          </Link>
        ))}
      </div>
      <div className={`flex items-center gap-1 rounded-lg border px-1 py-0.5 ${QUICK.includes(count) ? "border-neutral-200" : "border-begina-primary-900"}`}>
        <span className="pl-1 text-neutral-500">jiný:</span>
        <Link href={href(Math.max(1, count - 1))} aria-label="O jednu méně" className="rounded px-2 py-1 text-base font-bold text-neutral-700 hover:bg-neutral-100">−</Link>
        <input
          key={count}
          type="number"
          min={1}
          max={200}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => apply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply((e.target as HTMLInputElement).value); }}
          aria-label="Počet begin"
          className="w-14 rounded-md border border-neutral-300 bg-white px-1 py-1 text-center font-semibold text-neutral-900"
        />
        <Link href={href(Math.min(200, count + 1))} aria-label="O jednu víc" className="rounded px-2 py-1 text-base font-bold text-neutral-700 hover:bg-neutral-100">+</Link>
      </div>
    </div>
  );
}
