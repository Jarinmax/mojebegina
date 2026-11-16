// LEGISLATIVNÍ AUDIT 1.0 — čtení a zápis právních reportů. Jen Jaroslav
// a Lucie (isInvoiceIssuer). Když tabulka ještě neexistuje (migrace
// docs/eshop-production/124_legislativni_audit_MAIN.sql neproběhla),
// funkce vrátí notReady místo pádu stránky.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { legalAuditReports } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import type { LegalAuditKind } from "@/lib/legislativniAudit/kinds";

export const LEGAL_AUDIT_DENIED = `Legislativní audit smí číst a zapisovat jen ${INVOICE_ISSUER_NAMES}.`;
export const LEGAL_AUDIT_NOT_READY =
  "Úložiště Legislativního auditu ještě není v databázi založené — je potřeba jednou spustit skript docs/eshop-production/124_legislativni_audit_MAIN.sql v Neon SQL Editoru (Production).";

export type LegalAuditRow = typeof legalAuditReports.$inferSelect;
type Result<T> = { ok: true; data: T } | { ok: false; error: string; notReady?: boolean };

function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "42P01" || e?.cause?.code === "42P01" || /legal_audit_reports.*does not exist/i.test(String(e?.message ?? ""));
}

async function guard(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: LEGAL_AUDIT_DENIED };
  return { ok: true, userId: ctx.userId };
}

export async function listLegalAuditReports(limit = 200): Promise<Result<Omit<LegalAuditRow, "body">[]>> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    const rows = await db
      .select({
        id: legalAuditReports.id,
        reportDate: legalAuditReports.reportDate,
        kind: legalAuditReports.kind,
        title: legalAuditReports.title,
        summary: legalAuditReports.summary,
        urgentCount: legalAuditReports.urgentCount,
        source: legalAuditReports.source,
        sourceRef: legalAuditReports.sourceRef,
        createdByUserId: legalAuditReports.createdByUserId,
        createdAt: legalAuditReports.createdAt,
      })
      .from(legalAuditReports)
      .orderBy(desc(legalAuditReports.reportDate), desc(legalAuditReports.createdAt))
      .limit(limit);
    return { ok: true, data: rows };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: LEGAL_AUDIT_NOT_READY, notReady: true };
    throw error;
  }
}

export async function getLegalAuditReport(id: string): Promise<Result<LegalAuditRow | null>> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    const [row] = await db.select().from(legalAuditReports).where(eq(legalAuditReports.id, id)).limit(1);
    return { ok: true, data: row ?? null };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: LEGAL_AUDIT_NOT_READY, notReady: true };
    throw error;
  }
}

export async function saveLegalAuditReport(input: {
  reportDate: string;
  kind: LegalAuditKind;
  title: string;
  summary: string | null;
  body: string;
  urgentCount: number;
  key: string;
}): Promise<Result<{ id: string | null; created: boolean }>> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    const { key, ...values } = input;
    const inserted = await db
      .insert(legalAuditReports)
      .values({ ...values, source: "agent", sourceRef: key, createdByUserId: auth.userId })
      .onConflictDoNothing({ target: [legalAuditReports.source, legalAuditReports.sourceRef] })
      .returning({ id: legalAuditReports.id });
    return { ok: true, data: { id: inserted[0]?.id ?? null, created: inserted.length > 0 } };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: LEGAL_AUDIT_NOT_READY, notReady: true };
    throw error;
  }
}
