// ESHOP 1.0 — co se stane po úplném zaplacení e-shopové objednávky.
//
//   1. návrh faktury (vždy; nikdy nevyhodí výjimku),
//   2. jen v automatickém ostrém režimu „on“ (mode.ts — na Preview NIKDY):
//      vystavení v iDokladu (issue.ts) a PDF faktury. V režimu „manual“
//      se tu NIC nevystavuje — faktura čeká na tlačítko v detailu
//      objednávky (issueAndSendInvoice níže, tentýž motor),
//   3. e-mail zákazníkovi „Platbu jsme přijali“ (resp. potvrzení
//      zaplacené objednávky kartou) — s PDF faktury v příloze, pokud je.
//
// Selhání vystavení platbu ani e-mail nezastaví: zákazník dostane potvrzení
// bez faktury a MojeBegina ukáže chybu s tlačítkem „Vystavit fakturu“;
// po úspěšném vystavení pak odejde zvlášť „Faktura k objednávce“.
//
// Stornovaná objednávka (platba dorazila až po stornu): žádný návrh ani
// faktura, žádný e-mail o přijetí platby — jen označení k vrácení peněz
// (lib/eshop/cancellation.ts).
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "../email/orderEmails";
import { isOrderCancelled, markRefundRequired } from "../cancellation";
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
  try {
    if (await isOrderCancelled(db, orderId)) {
      await markRefundRequired(db, orderId, actor ?? { type: "system", name: "Platby" }, "paid_after_cancellation");
      return { invoice: null, emails: [] };
    }
  } catch (error) {
    // Bez jistoty o stavu raději nic nevystavovat ani neposílat.
    console.error("Po platbě: stav storna se nepodařilo ověřit", orderId, error);
    return { invoice: null, emails: [] };
  }
  await prepareInvoiceDraftSafe(db, orderId, actor, env);
  let invoice: IssueResult | null = null;
  let pdf: InvoicePdf | null = null;
  const mode = invoicingMode(env);
  if (mode.mode === "live" && mode.automatic) {
    invoice = await issueInvoiceSafe(db, orderId, { env, actor, fetchImpl: deps.fetchImpl });
    if (invoice.status === "issued") pdf = invoice.pdf;
  }
  const emails = await sendOrderEmails(db, orderId, trigger, baseUrl, { ...deps.email, invoicePdf: pdf });
  return { invoice, emails };
}

/**
 * MojeBegina „Vystavit fakturu v iDokladu“ (režim „manual“, nebo opakování
 * po chybě v „on“) — tentýž motor issueInvoice: vystaví (nebo dokončí
 * rozpracované vystavení) a pokud zákazník PDF ještě nedostal, pošle
 * „Faktura k objednávce“. Mimo ostrý provoz (Preview) vrátí „skipped“
 * a nic nevolá. Oprávnění ověřuje volající (lib/data/orders.ts).
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
