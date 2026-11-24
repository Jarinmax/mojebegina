// PDF manuálu pro obchodníky generované při stažení z aktuálního textu
// (lib/obchod/salesManual.ts) — ceny porcí s dopravou tak sedí s webem ten den
// (Lucie 24. 11. 2026; dřív předem vygenerované PDF v salesManualPdf.ts).
import { renderDocument, type DocLine } from "@/lib/eshop/legal/termsPdf";
import { SALES_MANUAL_SECTIONS, SALES_MANUAL_SUBTITLE, SALES_MANUAL_TITLE } from "./salesManual";

export const SALES_MANUAL_LIVE_PDF_FILENAME = "Begina-manual-pro-obchodniky.pdf";

/** Font PDF nemá šipky — v PDF je nahradí pomlčka. */
const pdfSafe = (t: string) => t.replace(/→/g, "–");

export function salesManualDocument(todayLabel: string): DocLine[] {
  const lines: DocLine[] = [
    { kind: "text", style: "title", text: SALES_MANUAL_TITLE, indent: 0 },
    { kind: "text", style: "subtitle", text: `${SALES_MANUAL_SUBTITLE} · stav ${todayLabel} · ceny vždy podle begina.cz`, indent: 0 },
  ];
  for (const section of SALES_MANUAL_SECTIONS) {
    lines.push({ kind: "text", style: "heading", text: pdfSafe(section.title), indent: 0 });
    for (const item of section.items) {
      lines.push({ kind: "text", style: "body", text: pdfSafe(item.text), indent: 14, marker: "•" });
      if (item.note) lines.push({ kind: "text", style: "note", text: pdfSafe(item.note), indent: 14 });
    }
  }
  return lines;
}

export async function salesManualPdf(now: Date = new Date()): Promise<Uint8Array> {
  const todayLabel = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(now);
  return renderDocument(salesManualDocument(todayLabel), {
    header: `${SALES_MANUAL_TITLE} — stav ${todayLabel}`,
    title: SALES_MANUAL_TITLE,
    subject: SALES_MANUAL_SUBTITLE,
    fixedDate: now,
  });
}
