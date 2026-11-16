// FINANCE – KONTROLY A AUDIT 1.0 — převod výsledků čtení iDokladu na nálezy
// (čistá funkce, testovatelná bez iDokladu).
import type { Finding, FindingLevel } from "./checks";

export type IdokladAuditData = {
  findings?: { level: FindingLevel; series: string; numbers: string[]; message: string }[];
};

export type IdokladUnpaidData = {
  unpaid?: { number: string; totalKc: number | null; paidKc: number | null; payment: string; overdueDays: number | null; dateOfMaturity: string | null; partner?: { name: string | null } | null }[];
  discrepancies?: { kind: string; number: string | null; message: string }[];
  scanned?: number;
  truncated?: boolean;
};

const amount = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("cs-CZ")} Kč`);

export function idokladFindings(audit: IdokladAuditData, unpaid: IdokladUnpaidData): Finding[] {
  const findings: Finding[] = [];
  for (const f of audit.findings ?? []) {
    findings.push({ key: `audit:${f.series}:${f.numbers.join(",")}:${f.message}`.slice(0, 400), level: f.level, message: `${f.series}: ${f.message}` });
  }
  for (const invoice of unpaid.unpaid ?? []) {
    const overdue = invoice.overdueDays !== null && invoice.overdueDays > 0;
    const who = invoice.partner?.name ? ` (${invoice.partner.name})` : "";
    const paid = invoice.payment === "partially_paid" ? `, uhrazeno ${amount(invoice.paidKc)}` : "";
    findings.push({
      key: `unpaid:${invoice.number}`,
      level: overdue ? "error" : "info",
      message: overdue
        ? `Faktura ${invoice.number}${who} na ${amount(invoice.totalKc)}${paid} je ${invoice.overdueDays} dní po splatnosti.`
        : `Faktura ${invoice.number}${who} na ${amount(invoice.totalKc)}${paid} zatím není uhrazená (splatnost ${invoice.dateOfMaturity ?? "neuvedena"}).`,
    });
  }
  for (const d of unpaid.discrepancies ?? []) {
    findings.push({ key: `disc:${d.kind}:${d.number ?? d.message}`.slice(0, 400), level: d.kind === "backdated" ? "info" : "warning", message: d.message });
  }
  return findings;
}
