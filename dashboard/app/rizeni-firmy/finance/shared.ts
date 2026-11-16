// FINANCE – KONTROLY A AUDIT 1.0 — společné drobnosti pro stránky složek.
import { pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";
import type { FindingLevel } from "@/lib/finance-kontroly/checks";

export const BASE = "/rizeni-firmy/finance";

export const DENIED = "Finanční kontroly smí vidět a zapisovat jen Jaroslav Viner a Lucie Königsbergová.";

export function pragueToday(now: Date = new Date()): { year: number; today: string } {
  const p = pragueYearMonth(now);
  return { year: p.year, today: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` };
}

export function parseYear(raw: unknown, fallback: number): number {
  const value = Number(typeof raw === "string" ? raw : "");
  return Number.isInteger(value) && value >= 2020 && value <= 2100 ? value : fallback;
}

export const LEVEL_LABELS: Record<FindingLevel, string> = { error: "Chyba", warning: "K prověření", info: "K ověření" };

export const LEVEL_STYLES: Record<FindingLevel, string> = {
  error: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  info: "bg-sky-50 text-sky-900 border-sky-200",
};

export function formatPragueDateTime(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const folderHref = (key: string, year: number) => `${BASE}/${key}?rok=${year}`;
