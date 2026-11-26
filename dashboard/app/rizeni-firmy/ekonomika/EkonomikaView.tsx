import Link from "next/link";
import PenizeTabs from "../_penize/PenizeTabs";
import { MONTH_NAMES, formatCzDate, formatKc, isMissingInvoice, missingInvoiceSummary, newestFirst, type EconomyKind, type EconomyRow, type MonthTotals } from "@/lib/ekonomika/economy";
import EntryForm from "./EntryForm";
import { deleteEconomyEntryAction } from "./actions";

// Finance → Přehled přehledně (Lucie 26. 11. 2026): místo tří sloupců vedle
// sebe jde všechno shora dolů — souhrn roku, měsíce od nejnovějšího
// (budoucí měsíce se neukazují), pod tím vybraný měsíc a jeho položky.
// Formulář na zápis je sbalený za tlačítkem.
const BASE = "/rizeni-firmy/ekonomika";

const differenceTone = (hal: number) => (hal < 0 ? "text-red-700" : "text-green-800");
const signed = (hal: number) => `${hal > 0 ? "+" : ""}${formatKc(hal)}`;

function EntryList({ rows, kind }: { rows: EconomyRow[]; kind: EconomyKind }) {
  const isCost = kind === "cost";
  if (rows.length === 0) return <p className="text-sm text-neutral-500 px-1">{isCost ? "V tomto měsíci není zapsaný žádný náklad." : "V tomto měsíci není zapsaný žádný příjem."}</p>;
  return (
    <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100 text-sm">
      {rows.map((row) => {
        const meta = [row.counterparty, !isCost ? row.paymentForm : null, !isCost && row.invoiceNumber ? `faktura ${row.invoiceNumber}` : null].filter(Boolean);
        const missing = isMissingInvoice(row.note);
        return (
          <li key={row.id} className={`px-3 py-2.5 flex gap-3 border-l-4 ${missing ? "bg-red-50 border-red-600" : "border-transparent"}`}>
            <div className="w-14 shrink-0 text-neutral-500 whitespace-nowrap">{formatCzDate(row.entryDate).replace(/ \d{4}$/, "")}</div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 break-words">{row.title}</p>
              {meta.length > 0 && <p className="text-neutral-600 break-words">{meta.join(" · ")}</p>}
              {row.note && <p className={`mt-0.5 text-xs break-words ${missing ? "font-bold text-red-700" : "text-neutral-500"}`}>{row.note}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium whitespace-nowrap">{formatKc(row.amountHal)}</p>
              {!isCost && row.amountNoShippingHal !== null && <p className="text-xs text-neutral-500 whitespace-nowrap">bez dopravy {formatKc(row.amountNoShippingHal)}</p>}
              <form action={deleteEconomyEntryAction} className="mt-1">
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className="text-xs text-neutral-400 hover:text-red-700" aria-label={`Smazat ${row.title}`}>
                  smazat
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type EkonomikaViewProps = {
  year: number;
  month: number;
  view: EconomyKind;
  today: string;
  months: MonthTotals[];
  /** Poslední měsíc, který se v tabulce ukazuje (aktuální rok = tento měsíc). */
  lastMonth: number;
  monthRows: EconomyRow[];
};

export default function EkonomikaView({ year, month, view, today, months, lastMonth, monthRows }: EkonomikaViewProps) {
  const shown = months.filter((m) => m.month <= lastMonth).reverse();
  const yearIncome = months.reduce((sum, m) => sum + m.incomeHal, 0);
  const yearCost = months.reduce((sum, m) => sum + m.costHal, 0);
  const selected = months[month - 1];
  const missingInvoice = missingInvoiceSummary(monthRows.filter((row) => row.kind === "cost"));
  const href = (p: { mesic?: number; zobrazit?: EconomyKind }) =>
    `${BASE}?rok=${year}&mesic=${p.mesic ?? month}&zobrazit=${(p.zobrazit ?? view) === "income" ? "prijmy" : "naklady"}#mesic`;

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
              {shown.map((m) => {
                const active = m.month === month;
                return (
                  <tr key={m.month} className={`border-b border-neutral-100 last:border-0 ${active ? "bg-begina-primary-50" : "hover:bg-neutral-50"}`}>
                    <td className="px-3 py-2">
                      <Link className={`text-begina-primary-900 hover:underline ${active ? "font-semibold" : "font-medium"}`} href={href({ mesic: m.month })} aria-current={active ? "true" : undefined}>
                        {MONTH_NAMES[m.month - 1]}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatKc(m.incomeHal)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatKc(m.costHal)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${differenceTone(m.differenceHal)}`}>{signed(m.differenceHal)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-neutral-500">Rok {year} ještě nezačal.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Klikni na měsíc a pod tabulkou uvidíš jeho položky.</p>
      </section>

      {/* 3. Vybraný měsíc */}
      {selected && month <= Math.max(lastMonth, 1) && (
        <section id="mesic" className="flex flex-col gap-3 scroll-mt-4">
          <h2 className="text-lg font-semibold capitalize">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link href={href({ zobrazit: "income" })} className={`rounded-xl border px-3 py-2.5 ${view === "income" ? "border-begina-primary-900 bg-begina-primary-900 text-white" : "border-neutral-200 bg-white"}`}>
              <span className="block text-xs opacity-80">Příjmy ({selected.incomeCount})</span>
              <span className="block font-semibold">{formatKc(selected.incomeHal)}</span>
            </Link>
            <Link href={href({ zobrazit: "cost" })} className={`rounded-xl border px-3 py-2.5 ${view === "cost" ? "border-begina-primary-900 bg-begina-primary-900 text-white" : "border-neutral-200 bg-white"}`}>
              <span className="block text-xs opacity-80">Náklady ({selected.costCount})</span>
              <span className="block font-semibold">{formatKc(selected.costHal)}</span>
            </Link>
          </div>
          <p className={`text-sm font-medium ${differenceTone(selected.differenceHal)}`}>Rozdíl za měsíc: {signed(selected.differenceHal)}</p>
          {view === "cost" && missingInvoice.count > 0 && (
            <p className="rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-sm font-medium text-red-800">
              Bez faktury: {missingInvoice.count} {missingInvoice.count === 1 ? "položka" : missingInvoice.count <= 4 ? "položky" : "položek"} za {formatKc(missingInvoice.amountHal)}
            </p>
          )}
          <EntryList rows={newestFirst(monthRows.filter((row) => row.kind === view))} kind={view} />
        </section>
      )}
    </div>
  );
}
