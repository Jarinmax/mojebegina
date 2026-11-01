// B2B faktury do iDokladu (Luciina řada 2026xxxx) — vstup z datové vrstvy:
// oprávnění jako u ostatní fakturace (requireOrderContext + isInvoiceIssuer:
// Jaroslav Viner, Lucie Königsbergová), práce v lib/eshop/invoicing/b2bInvoice.ts.
import "server-only";
import { db } from "@/lib/db/client";
import { pragueToday } from "./callActivityValidation";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import { requireOrderContext } from "./orders";
import { issueB2bInvoice, prepareB2bInvoice, type B2bIssueResult, type B2bPreview } from "@/lib/eshop/invoicing/b2bInvoice";
import { validateB2bInvoice, type B2bInvoiceRaw } from "@/lib/eshop/invoicing/b2bInvoiceValidation";

async function issuer() {
  const ctx = await requireOrderContext();
  return isInvoiceIssuer(ctx) ? ctx : null;
}

export async function previewB2bInvoice(raw: B2bInvoiceRaw): Promise<{ ok: true; preview: B2bPreview } | { ok: false; error: string }> {
  if (!(await issuer())) return { ok: false, error: `Faktury do iDokladu smí připravit jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateB2bInvoice(raw, pragueToday(new Date()));
  if (!validated.ok) return validated;
  const prepared = await prepareB2bInvoice(db, validated.value);
  return prepared.ok ? { ok: true, preview: prepared.preview } : prepared;
}

export async function createB2bInvoice(
  raw: B2bInvoiceRaw,
  options: { expectedFingerprint: string; confirmNotDuplicate: boolean; via: Record<string, unknown> }
): Promise<B2bIssueResult> {
  const ctx = await issuer();
  if (!ctx) return { ok: false, error: `Fakturu do iDokladu smí vystavit jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateB2bInvoice(raw, pragueToday(new Date()));
  if (!validated.ok) return validated;
  return issueB2bInvoice(db, validated.value, { ...options, actor: { userId: ctx.userId, name: ctx.name ?? ctx.email } });
}
