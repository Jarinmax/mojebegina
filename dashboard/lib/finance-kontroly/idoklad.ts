// FINANCE – KONTROLY A AUDIT 1.0 — kontrola iDokladu (jen na tlačítko).
//
// Nevzniká žádná nová integrace: čte se přes společný runIdokladRead
// (lib/idoklad-read/tools.ts) — stejná oprávnění, limity a auditní záznam
// v idoklad_read_log jako u ostatního čtení iDokladu. Tady se jen výsledky
// auditu číslování a neuhrazených faktur převedou na nálezy kontroly.
import "server-only";
import { runIdokladRead } from "@/lib/idoklad-read/tools";
import { idokladFindings, type IdokladAuditData, type IdokladUnpaidData } from "./idokladFindings";
import type { Finding } from "./checks";

export type IdokladCheckResult = { ok: true; findings: Finding[]; dateFrom: string; scanned: number; truncated: boolean } | { ok: false; error: string };

/** iDoklad hledá neuhrazené nejvýš 366 dní zpět. */
export function unpaidDateFrom(year: number, today: string): string {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const start = `${year}-01-01`;
  return start > limit ? start : limit;
}

export async function runIdokladCheck(year: number, today: string): Promise<IdokladCheckResult> {
  const audit = await runIdokladRead("idoklad_numbering_audit", { year: String(year) }, "ui");
  if (!audit.ok) return { ok: false, error: `Audit číslování: ${audit.error}` };
  const dateFrom = unpaidDateFrom(year, today);
  const unpaid = await runIdokladRead("idoklad_unpaid_and_discrepancies", { date_from: dateFrom }, "ui");
  if (!unpaid.ok) return { ok: false, error: `Neuhrazené faktury: ${unpaid.error}` };
  const unpaidData = unpaid.data as unknown as IdokladUnpaidData;
  return {
    ok: true,
    findings: idokladFindings(audit.data as unknown as IdokladAuditData, unpaidData),
    dateFrom,
    scanned: unpaidData.scanned ?? 0,
    truncated: unpaidData.truncated === true,
  };
}
