// Finance 1.0 — období v českém čase. „Dnes“ a „tento měsíc“ se počítají
// v Europe/Prague, ne v UTC serverless funkce: faktura vystavená 1. 11.
// v 0:30 patří do listopadu, i když je v UTC ještě 31. 10.
import type { IsoDate } from "./types";

export type Period = { from: IsoDate; to: IsoDate }; // obě meze včetně

const PRAGUE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pragueToday(now: Date): IsoDate {
  return PRAGUE_DATE.format(now);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthPeriod(year: number, month: number): Period {
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}` };
}

export function dayPeriod(day: IsoDate): Period {
  return { from: day, to: day };
}

export function currentMonthPeriod(now: Date): Period {
  const [year, month] = pragueToday(now).split("-").map(Number);
  return monthPeriod(year, month);
}

export function previousMonthPeriod(now: Date): Period {
  const [year, month] = pragueToday(now).split("-").map(Number);
  return month === 1 ? monthPeriod(year - 1, 12) : monthPeriod(year, month - 1);
}

export function isInPeriod(date: IsoDate | null, period: Period): boolean {
  return date !== null && date >= period.from && date <= period.to;
}

// Počet celých dní mezi dvěma daty (b − a).
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
