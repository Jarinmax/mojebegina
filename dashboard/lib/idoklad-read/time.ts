// Čtení iDokladu — data a časy (bez I/O).
//
// iDoklad API v3 vrací:
//   • data dokladu (DateOfIssue, DateOfTaxing, DateOfMaturity, DateOfPayment)
//     jako den bez pásma („2026-10-19T00:00:00“) — bere se jen YYYY-MM-DD,
//   • Metadata.DateCreated / DateLastChange v UTC (ověřeno 23. 10. 2026:
//     faktura 9260001 vystavená z MojeBegina ve 12:13:30 pražského času má
//     DateCreated 2026-10-20T10:13:30.687) — pro porovnání s datem dokladu
//     se převádí na pražský čas,
//   • „prázdné“ datum jako 1753-01-01 (minimum SQL Serveru; oficiální SDK
//     ho v DateTimeConverter převádí na null) — např. DateOfPayment
//     neuhrazené faktury. Navenek null.

const PRAGUE = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** „Prázdné“ datum iDokladu (1753-01-01) nebo chybějící hodnota. */
export function isEmptyIdokladDate(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "" || value.startsWith("1753-01-01");
}

/** Den dokladu YYYY-MM-DD; prázdné / neplatné = null. */
export function idokladDay(value: unknown): string | null {
  if (isEmptyIdokladDate(value)) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Časová značka iDokladu (UTC, bez pásma nebo se „Z“) → Date; prázdné / neplatné = null. */
export function idokladUtc(value: unknown): Date | null {
  if (isEmptyIdokladDate(value)) return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return null;
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Pražský čas „YYYY-MM-DD HH:mm:ss“. */
export function pragueDateTime(date: Date): string {
  return PRAGUE.format(date).replace("T", " ");
}

/** Pražský den YYYY-MM-DD. */
export function pragueDay(date: Date): string {
  return pragueDateTime(date).slice(0, 10);
}

/** Dnešní den v Praze. */
export function todayPrague(now: Date = new Date()): string {
  return pragueDay(now);
}

/** Rozdíl dní a − b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}
