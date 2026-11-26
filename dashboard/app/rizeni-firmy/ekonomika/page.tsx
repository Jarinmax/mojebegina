import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { summarizeYear, type EconomyKind } from "@/lib/ekonomika/economy";
import { economyTableExists, loadEconomyYear } from "@/lib/ekonomika/economyServer";
import { pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";
import EkonomikaView from "./EkonomikaView";

// EKONOMIKA 1.0 (15. 11. 2026) — příjmy, náklady a měsíční přehled.
// Přístup JEN Jaroslav a Lucie (isInvoiceIssuer); ostatním z vedení se
// stránka tváří, že neexistuje.
export const dynamic = "force-dynamic";

export default async function EkonomikaPage(props: PageProps<"/rizeni-firmy/ekonomika">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  const searchParams = await props.searchParams;
  const now = pragueYearMonth(new Date());
  const yearParam = Number(typeof searchParams.rok === "string" ? searchParams.rok : "");
  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2100 ? yearParam : now.year;
  const monthParam = Number(typeof searchParams.mesic === "string" ? searchParams.mesic : "");
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : year === now.year ? now.month : 12;
  const view: EconomyKind = searchParams.zobrazit === "prijmy" ? "income" : "cost";
  const today = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;

  if (!(await economyTableExists())) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-900">
        <h1 className="text-2xl font-semibold">Ekonomika</h1>
        <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Tabulka pro příjmy a náklady v databázi ještě není. Spusťte v Neonu skript 114_ekonomika_MAIN.</p>
      </div>
    );
  }

  const rows = await loadEconomyYear(year);
  const months = summarizeYear(rows, year);
  const monthKeyPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthRows = rows.filter((row) => row.entryDate.startsWith(monthKeyPrefix));
  return (
    <EkonomikaView
      year={year}
      month={month}
      view={view}
      today={today}
      months={months}
      lastMonth={year === now.year ? now.month : year < now.year ? 12 : 0}
      monthRows={monthRows}
    />
  );
}
