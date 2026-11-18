// EKONOMIKA 1.0 — čisté výpočty nad příjmy a náklady (bez databáze).

export type EconomyKind = "income" | "cost";

export type EconomyRow = {
  id: string;
  kind: EconomyKind;
  entryDate: string; // YYYY-MM-DD
  title: string;
  counterparty: string | null;
  amountHal: number;
  amountNoShippingHal: number | null;
  paymentForm: string | null;
  invoiceNumber: string | null;
  note: string | null;
  source: string;
};

export type MonthTotals = { month: number; incomeHal: number; costHal: number; differenceHal: number; incomeCount: number; costCount: number };

export const MONTH_NAMES = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

export const PAYMENT_FORMS = ["převodem", "hotově", "kartou"] as const;

/** „1 234,50 Kč“ → 123450 haléřů; null když to není kladná částka. */
export function parseAmountToHal(input: string): number | null {
  const cleaned = input.replace(/kč/i, "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const hal = Math.round(Number(cleaned) * 100);
  return hal > 0 ? hal : null;
}

/** Přijme „2026-11-15“ i „15.11.2026“ / „15. 11. 2026“; vrací YYYY-MM-DD nebo null. */
export function parseEntryDate(input: string): string | null {
  const text = input.trim();
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const cz = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(text);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (cz) [year, month, day] = [Number(cz[3]), Number(cz[2]), Number(cz[1])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Součty po měsících pro jeden rok (vždy 12 řádků, i prázdné měsíce). */
export function summarizeYear(rows: Pick<EconomyRow, "kind" | "entryDate" | "amountHal">[], year: number): MonthTotals[] {
  const totals: MonthTotals[] = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, incomeHal: 0, costHal: 0, differenceHal: 0, incomeCount: 0, costCount: 0 }));
  for (const row of rows) {
    if (Number(row.entryDate.slice(0, 4)) !== year) continue;
    const bucket = totals[Number(row.entryDate.slice(5, 7)) - 1];
    if (!bucket) continue;
    if (row.kind === "income") {
      bucket.incomeHal += row.amountHal;
      bucket.incomeCount += 1;
    } else {
      bucket.costHal += row.amountHal;
      bucket.costCount += 1;
    }
  }
  for (const bucket of totals) bucket.differenceHal = bucket.incomeHal - bucket.costHal;
  return totals;
}

export function formatKc(hal: number): string {
  const kc = hal / 100;
  return `${kc.toLocaleString("cs-CZ", { minimumFractionDigits: Number.isInteger(kc) ? 0 : 2, maximumFractionDigits: 2 })} Kč`;
}

export function formatCzDate(iso: string): string {
  return `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;
}

// 18. 11. 2026 (Lucie): poznámka „není faktura“ (libovolná velikost písmen)
// označí řádek červeně a počítá se do „Bez faktury“ — co je třeba urgovat.
export function isMissingInvoice(note: string | null | undefined): boolean {
  return !!note && note.toLocaleLowerCase("cs").includes("není faktura");
}

export function missingInvoiceSummary(rows: EconomyRow[]): { count: number; amountHal: number } {
  const missing = rows.filter((row) => isMissingInvoice(row.note));
  return { count: missing.length, amountHal: missing.reduce((sum, row) => sum + row.amountHal, 0) };
}

/** Řádky ze serveru jdou od nejstaršího (datum, pak čas zápisu) — pro výpis měsíce obráceně: nahoře nejnovější. */
export function newestFirst(rows: EconomyRow[]): EconomyRow[] {
  return [...rows].reverse();
}
