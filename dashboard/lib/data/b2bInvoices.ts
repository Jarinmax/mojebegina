// Ruční faktury odběratelům mimo e-shop (B2B, řada 2026xxxx) — vstup z datové
// vrstvy: oprávnění jako u ostatní fakturace (requireOrderContext +
// isInvoiceIssuer: Jaroslav Viner, Lucie Königsbergová).
// Od 23. 11. 2026 vystavuje MojeBegina sama (lib/eshop/invoicing/ownB2b.ts);
// stará cesta přes iDoklad (b2bInvoice.ts) jen s INVOICING_PROVIDER=idoklad.
import "server-only";
import { db } from "@/lib/db/client";
import { pragueToday } from "./callActivityValidation";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import { requireOrderContext } from "./orders";
import { issueB2bInvoice, prepareB2bInvoice } from "@/lib/eshop/invoicing/b2bInvoice";
import { validateB2bInvoice, type B2bInvoiceRaw } from "@/lib/eshop/invoicing/b2bInvoiceValidation";
import { ownInvoicingActive } from "@/lib/eshop/invoicing/mode";
import { issueOwnB2bInvoice, ownInvoicePdfPath, prepareOwnB2bInvoice } from "@/lib/eshop/invoicing/ownB2b";
import { idokladInvoicePdfPath } from "@/lib/idoklad-read/tools";

/** Společný tvar náhledu pro obě cesty (MCP i UI). */
export type B2bInvoicePreview = {
  value: import("@/lib/eshop/invoicing/b2bInvoiceValidation").B2bInvoiceInput;
  canIssueLive: boolean;
  liveReason: string | null;
  series: { id: string; name: string } | null;
  expectedNumber: string | null;
  customer: Record<string, unknown> | null;
  paymentLabel: string;
  similar: { number: string; totalKc: number | null; issueDate: string | null }[];
  blocking: string[];
  warnings: string[];
  fingerprint: string;
};

export type B2bInvoiceIssued =
  | { ok: true; invoiceNumber: string; totalKc: number; paid: boolean; dueDate: string; partnerName: string; pdfPath: string; contactCreated: boolean; warnings?: string[] }
  | { ok: false; error: string; existing?: { number: string; totalKc: number | null; issueDate: string | null }[] };

async function issuer() {
  const ctx = await requireOrderContext();
  return isInvoiceIssuer(ctx) ? ctx : null;
}

export async function previewB2bInvoice(raw: B2bInvoiceRaw): Promise<{ ok: true; preview: B2bInvoicePreview } | { ok: false; error: string }> {
  if (!(await issuer())) return { ok: false, error: `Faktury smí připravit jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateB2bInvoice(raw, pragueToday(new Date()));
  if (!validated.ok) return validated;
  if (ownInvoicingActive()) {
    const p = await prepareOwnB2bInvoice(db, validated.value);
    return { ok: true, preview: { ...p, series: { id: "mojebegina", name: "MojeBegina 2026xxxx" }, customer: p.customer } };
  }
  const prepared = await prepareB2bInvoice(db, validated.value);
  if (!prepared.ok) return prepared;
  const p = prepared.preview;
  return {
    ok: true,
    preview: {
      value: p.value,
      canIssueLive: p.canIssueLive,
      liveReason: p.liveReason,
      series: p.series,
      expectedNumber: p.nextNumber,
      customer: p.partner as unknown as Record<string, unknown>,
      paymentLabel: p.paymentLabel,
      similar: p.similar.map((s) => ({ number: s.number, totalKc: s.totalKc, issueDate: s.dateOfIssue })),
      blocking: p.blocking,
      warnings: p.warnings,
      fingerprint: p.fingerprint,
    },
  };
}

export async function createB2bInvoice(
  raw: B2bInvoiceRaw,
  options: { expectedFingerprint: string; confirmNotDuplicate: boolean; via: Record<string, unknown> }
): Promise<B2bInvoiceIssued> {
  const ctx = await issuer();
  if (!ctx) return { ok: false, error: `Fakturu smí vystavit jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateB2bInvoice(raw, pragueToday(new Date()));
  if (!validated.ok) return validated;
  const actor = { userId: ctx.userId, name: ctx.name ?? ctx.email };
  if (ownInvoicingActive()) {
    const r = await issueOwnB2bInvoice(db, validated.value, { ...options, actor });
    if (!r.ok) return r;
    return { ok: true, invoiceNumber: r.invoiceNumber, totalKc: r.totalKc, paid: r.paid, dueDate: r.dueDate, partnerName: r.partnerName, pdfPath: ownInvoicePdfPath(r.invoiceNumber), contactCreated: false, ...(r.warnings ? { warnings: r.warnings } : {}) };
  }
  const r = await issueB2bInvoice(db, validated.value, { ...options, actor });
  if (!r.ok) return { ok: false, error: r.error, existing: r.existing?.map((s) => ({ number: s.number, totalKc: s.totalKc, issueDate: s.dateOfIssue })) };
  return { ok: true, invoiceNumber: r.invoiceNumber, totalKc: r.totalKc, paid: r.paid, dueDate: r.dueDate, partnerName: r.partnerName, pdfPath: idokladInvoicePdfPath(r.idokladId), contactCreated: r.contactCreated, ...(r.warnings ? { warnings: r.warnings } : {}) };
}
