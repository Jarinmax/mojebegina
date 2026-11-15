// Opravy existujících faktur v iDokladu (Luciina řada) — vstup z datové
// vrstvy: oprávnění jako u ostatní fakturace (requireOrderContext +
// isInvoiceIssuer: Jaroslav Viner, Lucie Königsbergová), práce
// v lib/eshop/invoicing/invoiceCorrection.ts.
import "server-only";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import { requireOrderContext } from "./orders";
import {
  applyInvoiceCorrection,
  correctionToday,
  prepareInvoiceCorrection,
  validateCorrection,
  type CorrectionPreview,
  type CorrectionResult,
  type InvoiceCorrectionInput,
} from "@/lib/eshop/invoicing/invoiceCorrection";

async function issuer() {
  const ctx = await requireOrderContext();
  return isInvoiceIssuer(ctx) ? ctx : null;
}

export async function previewInvoiceCorrection(raw: InvoiceCorrectionInput): Promise<{ ok: true; preview: CorrectionPreview } | { ok: false; error: string }> {
  if (!(await issuer())) return { ok: false, error: `Faktury v iDokladu smí opravovat jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateCorrection(raw, correctionToday());
  if (!validated.ok) return validated;
  const prepared = await prepareInvoiceCorrection(validated.value);
  return prepared.ok ? { ok: true, preview: prepared.preview } : prepared;
}

export async function correctInvoice(raw: InvoiceCorrectionInput, options: { expectedFingerprint: string }): Promise<CorrectionResult> {
  if (!(await issuer())) return { ok: false, error: `Faktury v iDokladu smí opravovat jen ${INVOICE_ISSUER_NAMES}.` };
  const validated = validateCorrection(raw, correctionToday());
  if (!validated.ok) return validated;
  return applyInvoiceCorrection(validated.value, options);
}
