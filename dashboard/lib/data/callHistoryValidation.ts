// Hovory a kontakty (/prace/hovory) — čistá logika bez databáze: hledání
// kontaktů, popis uloženého hovoru a seskupení historie po dnech
// (Europe/Prague). Testy: __tests__/callHistoryValidation.test.ts.
import { CALL_RESULT_LABELS } from "@/app/rizeni-firmy/obchod/dnes/dailyCallLabels";
import { STAGE_LABELS } from "@/app/rizeni-firmy/obchod/leadLabels";
import type { CallResult } from "./dailyCallsValidation";
import type { LeadStage } from "./leadValidation";

export const CALL_HISTORY_PAGE_SIZE = 50;
export const CONTACT_SEARCH_LIMIT = 30;
const MAX_QUERY_LENGTH = 80;
const TIME_ZONE = "Europe/Prague";

export type ContactSearch = {
  /** Vstup po ořezání (pro zobrazení ve formuláři). */
  text: string;
  /** Vzor pro ILIKE s escapovanými %, _ a \. */
  pattern: string;
  /** Číslice z dotazu, pokud jich je aspoň 3 (hledání v telefonu bez mezer). */
  digits: string | null;
};

/** null = nic nehledat (prázdný nebo jednoznakový dotaz). */
export function parseContactSearch(raw: unknown): ContactSearch | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (text.length < 2) return null;
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  const digits = text.replace(/\D/g, "");
  return { text, pattern: `%${escaped}%`, digits: digits.length >= 3 ? digits : null };
}

/** Číslo stránky z URL (?strana=), od 0; cokoli neplatného = 0. */
export function parsePage(raw: unknown): number {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return 0;
  return Number(raw);
}

export type CallSummary = {
  resultLabel: string | null;
  stageLabel: string | null;
};

/** Popis výsledku z metadata záznamu call_logged (Denní volání i zápis z detailu leadu). */
export function describeCall(metadata: unknown): CallSummary {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const result = typeof meta.callResult === "string" ? meta.callResult : null;
  const stage = typeof meta.stageChangedTo === "string" ? meta.stageChangedTo : null;
  return {
    resultLabel: result === null ? null : (CALL_RESULT_LABELS[result as CallResult] ?? result),
    stageLabel: stage === null ? null : (STAGE_LABELS[stage as LeadStage] ?? stage),
  };
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabelFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** Den v Praze jako YYYY-MM-DD. */
export function pragueDayKey(at: Date): string {
  return dayKeyFormat.format(at);
}

export function pragueTimeLabel(at: Date): string {
  return timeFormat.format(at);
}

const dateFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" });

/** Datum v Praze, např. „6. 11. 2026“. */
export function pragueDateLabel(at: Date): string {
  return dateFormat.format(at);
}

/** „Dnes“, „Včera“, jinak např. „pondělí 2. 11. 2026“. */
export function pragueDayLabel(dayKey: string, now: Date = new Date()): string {
  const today = pragueDayKey(now);
  const yesterday = pragueDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (dayKey === today) return "Dnes";
  if (dayKey === yesterday) return "Včera";
  // Poledne UTC daného dne leží v Praze vždy v tomtéž dni.
  return dayLabelFormat.format(new Date(`${dayKey}T12:00:00Z`));
}

/** Seskupí záznamy (už seřazené od nejnovějšího) po pražských dnech, pořadí zachová. */
export function groupByPragueDay<T extends { createdAt: Date }>(rows: readonly T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const row of rows) {
    const day = pragueDayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(row);
    else groups.push({ day, items: [row] });
  }
  return groups;
}

/** Kam vede „← Zpět“ z detailu kontaktu, když na něj přišel z /prace. */
export const LEAD_BACK_LINKS: Record<string, { href: string; label: string }> = {
  hovory: { href: "/prace/hovory", label: "← Hovory a kontakty" },
  prace: { href: "/prace", label: "← Moje práce" },
  dnes: { href: "/rizeni-firmy/obchod/dnes", label: "← Dnešní volání" },
};

export function leadBackLink(raw: unknown): { href: string; label: string } {
  if (typeof raw === "string" && Object.hasOwn(LEAD_BACK_LINKS, raw)) return LEAD_BACK_LINKS[raw];
  return { href: "/rizeni-firmy/obchod", label: "← Obchod / CRM" };
}
