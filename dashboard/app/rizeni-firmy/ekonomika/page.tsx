import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { MONTH_NAMES, formatCzDate, formatKc, summarizeYear, type EconomyKind, type EconomyRow } from "@/lib/ekonomika/economy";
import { economyTableExists, loadEconomyYear } from "@/lib/ekonomika/economyServer";
import { pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";
import EntryForm from "./EntryForm";
import { deleteEconomyEntryAction } from "./actions";

// EKONOMIKA 1.0 (15. 11. 2026) — příjmy, náklady a měsíční přehled.
// Přístup JEN Jaroslav a Lucie (isInvoiceIssuer); ostatním z vedení se
// stránka tváří, že neexistuje.
export const dynamic = "force-dynamic";

const BASE = "/rizeni-firmy/ekonomika";

function EntryTable({ rows, kind }: { rows: EconomyRow[]; kind: EconomyKind }) {
  const isCost = kind === "cost";
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{isCost ? "V tomto měsíci není zapsaný žádný náklad." : "V tomto měsíci není zapsaný žádný příjem."}</p>;
  return (
    <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
          <tr>
            <th className="px-3 py-2 font-medium">Datum</th>
            <th className="px-3 py-2 font-medium">{isCost ? "Zboží" : "Typ"}</th>
            <th className="px-3 py-2 font-medium">{isCost ? "Prodávající" : "Klient"}</th>
            {!isCost && <th className="px-3 py-2 font-medium">Úhrada</th>}
            {!isCost && <th className="px-3 py-2 font-medium">Faktura</th>}
            <th className="px-3 py-2 font-medium text-right">Částka</th>
            {!isCost && <th className="px-3 py-2 font-medium text-right">Bez dopravy</th>}
            <th className="px-3 py-2 font-medium">Poznámka</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100 last:border-0 align-top">
              <td className="px-3 py-2 whitespace-nowrap">{formatCzDate(row.entryDate)}</td>
              <td className="px-3 py-2">{row.title}</td>
              <td className="px-3 py-2">{row.counterparty ?? ""}</td>
              {!isCost && <td className="px-3 py-2">{row.paymentForm ?? ""}</td>}
              {!isCost && <td className="px-3 py-2 whitespace-nowrap">{row.invoiceNumber ?? ""}</td>}
              <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatKc(row.amountHal)}</td>
              {!isCost && <td className="px-3 py-2 text-right whitespace-nowrap">{row.amountNoShippingHal === null ? "" : formatKc(row.amountNoShippingHal)}</td>}
              <td className="px-3 py-2 text-neutral-600">{row.note ?? ""}</td>
              <td className="px-3 py-2 text-right">
                <form action={deleteEconomyEntryAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="text-xs text-neutral-400 hover:text-red-700" aria-label={`Smazat ${row.title}`}>
                    smazat
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EkonomikaPage(props: PageProps<"/rizeni-firmy/ekonomika">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  const searchParams = await props.searchParams;
  const now = pragueYearMonth(new Date());
  const yearParam = Number(typeof searchParams.rok === "string" ? searchParams.rok : "");
  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2100 ? yearParam : now.year;
  const monthParam = Number(typeof searchParams.mesic === "string" ? searchParams.mesic : "");
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : year === now.year ? now.month : 1;
  const view: EconomyKind = searchParams.zobrazit === "prijmy" ? "income" : "cost";
  const today = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;

  if (!(await economyTableExists())) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold">Ekonomika</h1>
        <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Tabulka pro příjmy a náklady v databázi ještě není. Spusťte v Neonu skript 114_ekonomika_MAIN.</p>
      </div>
    );
  }

  const rows = await loadEconomyYear(year);
  const months = summarizeYear(rows, year);
  const yearIncome = months.reduce((sum, item) => sum + item.incomeHal, 0);
  const yearCost = months.reduce((sum, item) => sum + item.costHal, 0);
  const monthKeyPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthRows = rows.filter((row) => row.entryDate.startsWith(monthKeyPrefix));
  const selected = months[month - 1];
  const href = (params: { rok?: number; mesic?: number; zobrazit?: EconomyKind }) =>
    `${BASE}?rok=${params.rok ?? year}&mesic=${params.mesic ?? month}&zobrazit=${(params.zobrazit ?? view) === "income" ? "prijmy" : "naklady"}`;
  const tile = (title: string, hal: number, tone: string) => (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <p className="text-xs text-neutral-500">{title}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{formatKc(hal)}</p>
    </div>
  );
  const differenceTone = (hal: number) => (hal < 0 ? "text-red-700" : "text-green-800");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ekonomika {year}</h1>
          <p className="mt-1 text-sm text-neutral-600">Příjmy, náklady a rozdíl po měsících. Vidí jen Jaroslav a Lucie.</p>
        </div>
        <p className="text-sm flex gap-4">
          <Link className="underline" href={`${BASE}?rok=${year - 1}&mesic=12`}>
            ← {year - 1}
          </Link>
          <Link className="underline" href={`${BASE}?rok=${year + 1}&mesic=1`}>
            {year + 1} →
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tile(`Příjmy ${year}`, yearIncome, "text-neutral-900")}
        {tile(`Náklady ${year}`, yearCost, "text-neutral-900")}
        {tile("Rozdíl", yearIncome - yearCost, differenceTone(yearIncome - yearCost))}
      </div>

      <EntryForm today={today} initialKind={view} />

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6 items-start">
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-3 py-2 font-medium">Měsíc</th>
                <th className="px-3 py-2 font-medium text-right">Příjmy</th>
                <th className="px-3 py-2 font-medium text-right">Náklady</th>
                <th className="px-3 py-2 font-medium text-right">Rozdíl</th>
              </tr>
            </thead>
            <tbody>
              {months.map((item) => (
                <tr key={item.month} className={`border-b border-neutral-100 last:border-0 ${item.month === month ? "bg-begina-primary-50" : ""}`}>
                  <td className="px-3 py-2">
                    <Link className="font-medium text-begina-primary-900 hover:underline" href={href({ mesic: item.month })} aria-current={item.month === month ? "true" : undefined}>
                      {MONTH_NAMES[item.month - 1]}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatKc(item.incomeHal)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatKc(item.costHal)}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${differenceTone(item.differenceHal)}`}>{formatKc(item.differenceHal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <div className="flex gap-2 text-sm">
              <Link href={href({ zobrazit: "cost" })} className={`rounded-lg px-3 py-1.5 font-medium ${view === "cost" ? "bg-begina-primary-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                Náklady ({selected.costCount}) · {formatKc(selected.costHal)}
              </Link>
              <Link href={href({ zobrazit: "income" })} className={`rounded-lg px-3 py-1.5 font-medium ${view === "income" ? "bg-begina-primary-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                Příjmy ({selected.incomeCount}) · {formatKc(selected.incomeHal)}
              </Link>
            </div>
          </div>
          <EntryTable rows={monthRows.filter((row) => row.kind === view)} kind={view} />
        </div>
      </div>
    </div>
  );
}
