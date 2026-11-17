// MĚŘENÍ E-SHOPU 1.0 — týdenní report na info@begina.cz (čistá funkce).
import { FUNNEL_STEPS, buildFunnel, type FunnelStep } from "./funnel";
import type { FunnelDay } from "./funnelServer";

type Counts = Partial<Record<FunnelStep | "order" | "paid", number>>;
const KEYS = [...FUNNEL_STEPS, "order", "paid"] as const;
export const FUNNEL_REPORT_URL = "https://moje.begina.cz/rizeni-firmy/mereni-eshopu";

export function sumDays(days: FunnelDay[]): Counts {
  const totals: Counts = {};
  for (const day of days) for (const key of KEYS) totals[key] = (totals[key] ?? 0) + (day.counts[key] ?? 0);
  return totals;
}

const googleVisits = (days: FunnelDay[]) => days.reduce((sum, day) => sum + (day.counts.google_visit ?? 0), 0);
const googleOrders = (days: FunnelDay[]) => days.reduce((sum, day) => sum + (day.counts.google_order ?? 0), 0);
const conversion = (counts: Counts) => ((counts.visit ?? 0) > 0 ? Math.round(((counts.paid ?? 0) / (counts.visit ?? 1)) * 1000) / 10 : null);
const pctText = (value: number | null) => (value === null ? "nelze spočítat (žádné návštěvy)" : `${value.toLocaleString("cs-CZ")} %`);
const dayText = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * week = 7 ukončených dní (nejnovější první), previous = 7 dní před nimi.
 * Největší odpad se hledá jen mezi kroky, kde je z čeho počítat.
 */
export function buildFunnelReport(week: FunnelDay[], previous: FunnelDay[]): { subject: string; text: string; html: string } {
  const now = sumDays(week);
  const before = sumDays(previous);
  const rows = buildFunnel(now);
  const beforeRows = buildFunnel(before);
  const from = week[week.length - 1]?.day ?? "";
  const to = week[0]?.day ?? "";
  const drop = rows
    .slice(1)
    .filter((row) => row.ofPreviousPct !== null)
    .sort((a, b) => (a.ofPreviousPct ?? 0) - (b.ofPreviousPct ?? 0))[0];
  const dropFrom = drop ? rows[rows.findIndex((row) => row.key === drop.key) - 1] : null;

  const lines = [
    `E-shop begina.cz, týden ${dayText(from)} – ${dayText(to)}`,
    "",
    `Konverzní poměr (zaplacené objednávky / návštěvy): ${pctText(conversion(now))}`,
    `Týden předtím: ${pctText(conversion(before))}`,
    "",
    "Krok: tento týden (týden předtím)",
    ...rows.map((row, index) => `${row.label}: ${row.count} (${beforeRows[index].count})`),
    "",
    drop && dropFrom
      ? `Největší odpad: ${dropFrom.label} → ${drop.label}, pokračuje jen ${pctText(drop.ofPreviousPct)}.`
      : "Největší odpad zatím nejde určit, je málo dat.",
    "",
    `Z bezplatných výpisů Google: ${googleVisits(week)} návštěv, ${googleOrders(week)} odeslaných objednávek (týden předtím ${googleVisits(previous)} / ${googleOrders(previous)}).`,
    "",
    "Návštěva = jedno načtení e-shopu v prohlížeči, roboti se nepočítají. Počítají se i vaše vlastní návštěvy a zkušební objednávky. Při malých číslech berte procenta s rezervou.",
    "",
    `Podrobný přehled po dnech: ${FUNNEL_REPORT_URL}`,
  ].filter((line): line is string => typeof line === "string");
  const text = lines.join("\n");
  return {
    subject: `E-shop: týdenní měření ${dayText(from)} – ${dayText(to)} · konverze ${conversion(now) === null ? "—" : `${conversion(now)!.toLocaleString("cs-CZ")} %`}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${lines.map((line) => (line ? `<p style="margin:0 0 6px">${escapeHtml(line)}</p>` : "<br>")).join("")}</div>`,
  };
}
