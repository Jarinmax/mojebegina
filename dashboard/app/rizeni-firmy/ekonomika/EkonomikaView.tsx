import Link from "next/link";
import PenizeTabs from "../_penize/PenizeTabs";
import { MONTH_NAMES, formatKc, type EconomyKind, type MonthTotals } from "@/lib/ekonomika/economy";
import EntryForm from "./EntryForm";

// Finance → Přehled přehledně (Lucie 26. 11. 2026): shora dolů souhrn roku a
// měsíce od nejnovějšího (budoucí se neukazují). Položky se neopakují —
// částka v tabulce otevře Příjmy – faktury nebo Náklady – účtenky za měsíc.
// Formulář na zápis je sbalený za tlačítkem.
const BASE = "/rizeni-firmy/ekonomika";

const differenceTone = (hal: number) => (hal < 0 ? "text-red-700" : "text-green-800");
const signed = (hal: number) => `${hal > 0 ? "+" : ""}${formatKc(hal)}`;

export type EkonomikaViewProps = {
  year: number;
  view: EconomyKind;
  today: string;
  months: MonthTotals[];
  /** Poslední měsíc, který se v tabulce ukazuje (aktuální rok = tento měsíc). */
  lastMonth: number;
};

export default function EkonomikaView({ year, view, today, months, lastMonth }: EkonomikaViewProps) {
  const shown = months.filter((m) => m.month <= lastMonth).reverse();
  const yearIncome = months.reduce((sum, m) => sum + m.incomeHal, 0);
  const yearCost = months.reduce((sum, m) => sum + m.costHal, 0);
  const costsHref = (m: number) => `/rizeni-firmy/doklady?rok=${year}&mesic=${m}&tab=naklady`;
  const incomeHref = (m: number) => `/rizeni-firmy/faktury?rok=${year}&mesic=${m}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <PenizeTabs active="prehled" />

      {/* 1. Souhrn roku */}
      <section className="flex flex-col gap-3 -mt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Rok {year}</h2>
          <p className="text-sm flex gap-4">
            <Link className="underline text-neutral-600" href={`${BASE}?rok=${year - 1}`}>← {year - 1}</Link>
            <Link className="underline text-neutral-600" href={`${BASE}?rok=${year + 1}`}>{year + 1} →</Link>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Příjmy", formatKc(yearIncome), "text-neutral-900"],
            ["Náklady", formatKc(yearCost), "text-neutral-900"],
            ["Rozdíl", signed(yearIncome - yearCost), differenceTone(yearIncome - yearCost)],
          ].map(([title, value, tone]) => (
            <div key={title} className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4">
              <p className="text-xs text-neutral-500">{title}</p>
              <p className={`mt-1 text-base sm:text-xl font-semibold whitespace-nowrap ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-white">
            + Zapsat náklad nebo příjem
          </summary>
          <div className="mt-3">
            <EntryForm today={today} initialKind={view} />
          </div>
        </details>
      </section>

      {/* 2. Měsíce od nejnovějšího */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Po měsících</h2>
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-3 py-2 font-medium">Měsíc</th>
                <th className="px-3 py-2 font-medium text-right">Příjmy</th>
                <th className="px-3 py-2 font-medium text-right">Náklady</th>
                <th className="px-3 py-2 font-medium text-right">Rozdíl</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.month} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-3 py-2 font-medium capitalize">{MONTH_NAMES[m.month - 1]}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link className="text-begina-primary-900 underline decoration-neutral-300 hover:decoration-begina-primary-900" href={incomeHref(m.month)}>{formatKc(m.incomeHal)}</Link>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link className="text-begina-primary-900 underline decoration-neutral-300 hover:decoration-begina-primary-900" href={costsHref(m.month)}>{formatKc(m.costHal)}</Link>
                  </td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${differenceTone(m.differenceHal)}`}>{signed(m.differenceHal)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-neutral-500">Rok {year} ještě nezačal.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Klikni na částku příjmů nebo nákladů a otevřou se faktury nebo účtenky za ten měsíc.</p>
      </section>

    </div>
  );
}
