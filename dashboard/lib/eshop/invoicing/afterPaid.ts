// ESHOP 1.0 — co se stane po úplném zaplacení e-shopové objednávky.
//
//   1. návrh faktury (vždy; nikdy nevyhodí výjimku),
//   2. jen v ostrém režimu (mode.ts — na Preview NIKDY): vystavení
//      v iDokladu (issue.ts) a PDF faktury,
//   3. e-mail zákazníkovi „Platbu jsme přijali“ (resp. potvrzení
//      zaplacené objednávky kartou) — s PDF faktury v příloze, pokud je.
//
// Selhání vystavení platbu ani e-mail nezastaví: zákazník dostane potvrzení
// bez faktury a MojeBegina ukáže chybu s tlačítkem „Vystavit fakturu“;
// po úspěšném vystavení pak odejde zvlášť „Faktura k objednávce“.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "../email/orderEmails";
import { issueInvoice, issueInvoiceSafe, loadIssuedPdf, type InvoicePdf, type IssueResult } from "./issue";
import { invoicingMode } from "./mode";
import { prepareInvoiceDraftSafe, type InvoiceActor } from "./service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export type AfterPaidDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  email?: Omit<SendOrderEmailsOptions, "invoicePdf">;
};

export async function invoiceAndNotifyPaid(
  db: Db,
  orderId: string,
  trigger: "payment_confirmed" | "payment_marked_paid",
  baseUrl: string,
  actor?: InvoiceActor,
  deps: AfterPaidDeps = {}
): Promise<{ invoice: IssueResult | null; emails: OrderEmailOutcome[] }> {
  const env = deps.env ?? process.env;
  await prepareInvoiceDraftSafe(db, orderId, actor);
  let invoice: IssueResult | null = null;
  let pdf: InvoicePdf | null = null;
  if (invoicingMode(env).mode === "live") {
    invoice = await issueInvoiceSafe(db, orderId, { env, actor, fetchImpl: deps.fetchImpl });
    if (invoice.status === "issued") pdf = invoice.pdf;
  }
  const emails = await sendOrderEmails(db, orderId, trigger, baseUrl, { ...deps.email, invoicePdf: pdf });
  return { invoice, emails };
}

/**
 * MojeBegina „Vystavit fakturu v iDokladu“ (opakování po chybě) — vystaví
 * (nebo dokončí rozpracované vystavení) a pokud zákazník PDF ještě
 * nedostal, pošle „Faktura k objednávce“.
 */
export async function issueAndSendInvoice(
  db: Db,
  orderId: string,
  baseUrl: string,
  actor: InvoiceActor,
  deps: AfterPaidDeps = {}
): Promise<IssueResult & { emailed?: boolean }> {
  const env = deps.env ?? process.env;
  const result = await issueInvoice(db, orderId, { env, actor, fetchImpl: deps.fetchImpl });
  if (result.status !== "issued" && result.status !== "already_issued") return result;
  const row = (
    await db.execute(sql`
      SELECT pdf_sent_at FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)
  ).rows[0] as { pdf_sent_at: Date | null } | undefined;
  if (!row || row.pdf_sent_at) return result;
  const pdf =
    result.status === "issued" && result.pdf
      ? result.pdf
      : await loadIssuedPdf(db, orderId, { env, fetchImpl: deps.fetchImpl }).catch(() => null);
  if (!pdf) return result;
  const outcomes = await sendOrderEmails(db, orderId, "invoice_issued", baseUrl, { ...deps.email, invoicePdf: pdf });
  return { ...result, emailed: outcomes.some((o) => o.status === "sent") };
}
