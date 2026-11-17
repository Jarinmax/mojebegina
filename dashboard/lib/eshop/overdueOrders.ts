// OBJEDNÁVKY PO TERMÍNU (zadání Lucie 17. 11. 2026) — čisté funkce.
//
// Kontrola 1: zaplacená objednávka (e-shop i ruční), od data úhrady uplynulo
//   víc než 5 pracovních dnů a není „doručeno“ ani „stornováno“.
// Kontrola 2: objednávka „Na rozvozu“ / „Předáno přepravci“ déle než
//   5 pracovních dnů a nikdo ji neoznačil jako doručenou — bez označení
//   „doručeno“ neodejde žádost o hodnocení.
//
// Pracovní dny = bez sobot, nedělí a státních svátků ČR. Počítají se dny PO
// dni úhrady (předání) až do dneška včetně; den úhrady se nepočítá.
// Příklad: zaplaceno v pátek 13. 11. 2026 → 5. pracovní den je po 23. 11.
// (17. 11. je svátek), upozornění poprvé 24. 11.
import { FULFILLMENT_LABELS } from "@/lib/data/orderLabels";
import type { FulfillmentStatus } from "@/lib/data/orderValidation";

export const OVERDUE_WORKING_DAYS = 5;
export const MOJEBEGINA_ORIGIN = "https://moje.begina.cz";
export const OVERDUE_PAGE_URL = `${MOJEBEGINA_ORIGIN}/rizeni-firmy/objednavky-po-terminu`;
export const SHIPPED_STATUSES = ["out_for_delivery", "handed_to_carrier"] as const;

/** Datum v Praze jako "YYYY-MM-DD". */
export function pragueDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Hodina v Praze (0–23). */
export function pragueHour(at: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(at));
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Velikonoční neděle (gregoriánský kalendář, anonymní algoritmus). */
function easterSunday(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

const holidayCache = new Map<number, Set<string>>();

/** Státní svátky a ostatní svátky ČR (zákon č. 245/2000 Sb.), kdy se nepracuje. */
export function czechHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const fixed: [number, number][] = [
    [1, 1], [5, 1], [5, 8], [7, 5], [7, 6], [9, 28], [10, 28], [11, 17], [12, 24], [12, 25], [12, 26],
  ];
  const set = new Set(fixed.map(([m, d]) => iso(year, m, d)));
  const easter = easterSunday(year);
  const sunday = Date.UTC(year, easter.m - 1, easter.d);
  const shift = (days: number) => new Date(sunday + days * 86_400_000).toISOString().slice(0, 10);
  set.add(shift(-2)); // Velký pátek
  set.add(shift(1)); // Velikonoční pondělí
  holidayCache.set(year, set);
  return set;
}

export function isWorkingDay(day: string): boolean {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !czechHolidays(date.getUTCFullYear()).has(day);
}

/** Počet pracovních dnů d, kde from < d ≤ to (obojí "YYYY-MM-DD"). */
export function workingDaysAfter(from: string, to: string): number {
  let count = 0;
  let cursor = Date.parse(`${from}T12:00:00Z`) + 86_400_000;
  const end = Date.parse(`${to}T12:00:00Z`);
  while (cursor <= end) {
    if (isWorkingDay(new Date(cursor).toISOString().slice(0, 10))) count += 1;
    cursor += 86_400_000;
  }
  return count;
}

export type OverdueCandidate = {
  id: string;
  number: string;
  customer: string;
  channel: string;
  fulfillmentStatus: string;
  totalKc: number;
  paidAt: Date | null;
  /** kdy se objednávka dostala do stavu Na rozvozu / Předáno přepravci */
  shippedAt: Date | null;
  carrier: string | null;
};

export type OverdueRow = {
  id: string;
  number: string;
  customer: string;
  channelLabel: string;
  statusLabel: string;
  totalKc: number;
  /** datum úhrady (kontrola 1) nebo odeslání (kontrola 2), "YYYY-MM-DD" */
  since: string;
  workingDays: number;
  carrier: string | null;
  url: string;
};

export type OverdueReport = { today: string; unshipped: OverdueRow[]; undelivered: OverdueRow[] };

const CHANNEL_LABELS: Record<string, string> = { eshop: "e-shop", manual: "ruční", import: "import" };
const statusLabel = (status: string) => FULFILLMENT_LABELS[status as FulfillmentStatus] ?? status;
const orderUrl = (id: string) => `${MOJEBEGINA_ORIGIN}/rizeni-firmy/objednavky/${id}`;

function toRow(order: OverdueCandidate, since: string, today: string): OverdueRow {
  return {
    id: order.id,
    number: order.number,
    customer: order.customer,
    channelLabel: CHANNEL_LABELS[order.channel] ?? order.channel,
    statusLabel: statusLabel(order.fulfillmentStatus),
    totalKc: order.totalKc,
    since,
    workingDays: workingDaysAfter(since, today),
    carrier: order.carrier,
    url: orderUrl(order.id),
  };
}

const oldestFirst = (a: OverdueRow, b: OverdueRow) => b.workingDays - a.workingDays || a.since.localeCompare(b.since) || a.number.localeCompare(b.number);

/**
 * Obě kontroly nad zaplacenými, nedoručenými a nestornovanými objednávkami.
 * Objednávka na rozvozu, která je zároveň dlouho po úhradě, je jen v druhém
 * seznamu (tam je přesnější informace — odešla, ale nikdo ji neoznačil).
 */
export function buildOverdueReport(orders: OverdueCandidate[], now: Date): OverdueReport {
  const today = pragueDate(now);
  const unshipped: OverdueRow[] = [];
  const undelivered: OverdueRow[] = [];
  for (const order of orders) {
    if (order.fulfillmentStatus === "delivered" || order.fulfillmentStatus === "cancelled") continue;
    const shipped = (SHIPPED_STATUSES as readonly string[]).includes(order.fulfillmentStatus);
    if (shipped && order.shippedAt) {
      const row = toRow(order, pragueDate(order.shippedAt), today);
      if (row.workingDays > OVERDUE_WORKING_DAYS) {
        undelivered.push(row);
        continue;
      }
    }
    if (!order.paidAt) continue;
    const row = toRow(order, pragueDate(order.paidAt), today);
    if (row.workingDays > OVERDUE_WORKING_DAYS) unshipped.push(row);
  }
  return { today, unshipped: unshipped.sort(oldestFirst), undelivered: undelivered.sort(oldestFirst) };
}

export const dateText = (day: string) => `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}`;
const kc = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const daysWord = (n: number) => (n === 1 ? "pracovní den" : n >= 2 && n <= 4 ? "pracovní dny" : "pracovních dnů");

/** Interní e-mail na info@begina.cz; null = není co hlásit (neposílá se nic). */
export function buildOverdueEmail(report: OverdueReport): { subject: string; text: string; html: string } | null {
  const total = report.unshipped.length + report.undelivered.length;
  if (total === 0) return null;

  const sections = [
    {
      rows: report.unshipped,
      title: `Zaplacené a nedoručené déle než ${OVERDUE_WORKING_DAYS} pracovních dnů`,
      intro: "Obchodní podmínky slibují odeslání do 5 pracovních dnů. Zkontrolujte, jestli objednávka odešla; když už je doručená, označte ji v MojeBegina jako doručenou.",
      sinceLabel: "Uhrazeno",
    },
    {
      rows: report.undelivered,
      title: `Odeslané déle než ${OVERDUE_WORKING_DAYS} pracovních dnů, neoznačené jako doručené`,
      intro: "Dokud objednávka není označená jako doručená, zákazník nedostane žádost o hodnocení.",
      sinceLabel: "Odesláno",
    },
  ].filter((section) => section.rows.length > 0);

  const textLines: string[] = [`Kontrola objednávek ${dateText(report.today)}`, ""];
  for (const section of sections) {
    textLines.push(`${section.title} (${section.rows.length})`, section.intro, "");
    for (const row of section.rows) {
      textLines.push(
        `Objednávka ${row.number} (${row.channelLabel}) — ${row.customer}`,
        `  ${section.sinceLabel}: ${dateText(row.since)}, uplynulo ${row.workingDays} ${daysWord(row.workingDays)}`,
        `  Stav: ${row.statusLabel}${row.carrier ? ` (${row.carrier})` : ""} · Částka: ${kc(row.totalKc)}`,
        `  ${row.url}`,
        "",
      );
    }
  }
  textLines.push(`Celý přehled: ${OVERDUE_PAGE_URL}`, "", "Zákazníkům se nic neposílá. Tento e-mail chodí jen na info@begina.cz.");

  const th = 'style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:12px;color:#555"';
  const td = 'style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top"';
  const htmlSections = sections
    .map(
      (section) => `
<h3 style="margin:18px 0 4px;font-size:15px">${escapeHtml(section.title)} (${section.rows.length})</h3>
<p style="margin:0 0 8px;color:#555">${escapeHtml(section.intro)}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr><th ${th}>Objednávka</th><th ${th}>Zákazník</th><th ${th}>${section.sinceLabel}</th><th ${th}>Prac. dnů</th><th ${th}>Stav</th><th ${th}>Částka</th></tr>
${section.rows
  .map(
    (row) =>
      `<tr><td ${td}><a href="${escapeHtml(row.url)}">${escapeHtml(row.number)}</a><br><span style="color:#777;font-size:12px">${escapeHtml(row.channelLabel)}</span></td><td ${td}>${escapeHtml(row.customer)}</td><td ${td}>${dateText(row.since)}</td><td ${td}><b>${row.workingDays}</b></td><td ${td}>${escapeHtml(row.statusLabel)}${row.carrier ? `<br><span style="color:#777;font-size:12px">${escapeHtml(row.carrier)}</span>` : ""}</td><td ${td} style="white-space:nowrap">${kc(row.totalKc)}</td></tr>`,
  )
  .join("\n")}
</table>`,
    )
    .join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">
<p style="margin:0 0 6px">Kontrola objednávek ${dateText(report.today)}</p>${htmlSections}
<p style="margin:18px 0 0"><a href="${OVERDUE_PAGE_URL}">Celý přehled v MojeBegina →</a></p>
<p style="margin:8px 0 0;color:#777;font-size:12px">Zákazníkům se nic neposílá. Tento e-mail chodí jen na info@begina.cz.</p>
</div>`;

  return {
    subject: `Objednávky po termínu: ${total} ${total === 1 ? "objednávka" : total <= 4 ? "objednávky" : "objednávek"} (${dateText(report.today)})`,
    text: textLines.join("\n"),
    html,
  };
}
