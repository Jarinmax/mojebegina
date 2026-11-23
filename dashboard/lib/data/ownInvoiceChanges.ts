// Úpravy / storno / smazání vlastních faktur MojeBegina — vstup z datové
// vrstvy: jen vystavovatelé faktur (Jaroslav Viner, Lucie Königsbergová).
import "server-only";
import { db } from "@/lib/db/client";
import { pragueToday } from "./callActivityValidation";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import { requireOrderContext } from "./orders";
import { applyOwnChange, prepareOwnChange, type OwnChangeInput, type OwnChangePreview, type OwnChangeResult } from "@/lib/eshop/invoicing/ownChange";
import { loadOwnDocument } from "@/lib/eshop/invoicing/ownIssue";

async function issuer() {
  const ctx = await requireOrderContext();
  return isInvoiceIssuer(ctx) ? ctx : null;
}

export async function isOwnInvoiceNumber(number: string | null | undefined): Promise<boolean> {
  return Boolean(number && /^\d{8}$/.test(number) && (await loadOwnDocument(db, number)));
}

export async function previewOwnInvoiceChange(input: OwnChangeInput): Promise<{ ok: true; preview: OwnChangePreview } | { ok: false; error: string }> {
  if (!(await issuer())) return { ok: false, error: `Faktury smí měnit jen ${INVOICE_ISSUER_NAMES}.` };
  const preview = await prepareOwnChange(db, input, pragueToday(new Date()));
  return preview ? { ok: true, preview } : { ok: false, error: `Faktura ${input.number} v MojeBegina není.` };
}

export async function applyOwnInvoiceChange(input: OwnChangeInput, options: { expectedFingerprint: string; via: string }): Promise<OwnChangeResult> {
  const ctx = await issuer();
  if (!ctx) return { ok: false, error: `Faktury smí měnit jen ${INVOICE_ISSUER_NAMES}.` };
  return applyOwnChange(db, input, { expectedFingerprint: options.expectedFingerprint, actorName: `${ctx.name ?? ctx.email}${options.via}`, today: pragueToday(new Date()) });
}
