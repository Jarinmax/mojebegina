// ESHOP 1.0 — co se stane po úplném zaplacení e-shopové objednávky.
//
//   1. návrh faktury (vždy; nikdy nevyhodí výjimku),
//   2. jen v automatickém ostrém režimu „on“ (mode.ts — na Preview NIKDY):
//      vystavení v iDokladu (issue.ts) a PDF faktury. V režimu „manual“
//      se tu NIC nevystavuje — faktura čeká na tlačítko v detailu
//      objednávky (issueAndSendInvoice níže, tentýž motor),
//   3. e-mail zákazníkovi „Platbu jsme přijali“ (resp. potvrzení
//      zaplacené objednávky kartou) — s PDF faktury v příloze, pokud je,
//   4. Meta „Purchase“ (dokončený nákup) — jen se souhlasem zákazníka
//      a zapnutým přepínačem, nejvýš jednou (lib/eshop/metaPurchase.ts).
//
// Selhání vystavení platbu ani e-mail nezastaví: zákazník dostane potvrzení
// bez faktury a MojeBegina ukáže chybu s tlačítkem „Vystavit fakturu“;
// po úspěšném vystavení pak odejde zvlášť „Faktura k objednávce“.
//
// Stornovaná objednávka: žádný návrh ani faktura, žádný e-mail o přijetí
// platby. Pojistka — stornovaná objednávka se na Zaplaceno nepřepne vůbec
// (settleOrderPaymentSql); platbu po stornu řeší lib/eshop/cancellation.ts.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "../email/orderEmails";
import { isOrderCancelled } from "../cancellation";
import { issueInvoice, issueInvoiceSafe, loadIssuedPdf, type InvoicePdf, type IssueResult } from "./issue";
import { invoicingMode } from "./mode";
import { prepareInvoiceDraftSafe, type InvoiceActor } from "./service";
import { sendMetaPurchaseSafe } from "../metaPurchase";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export type AfterPaidDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  email?: Omit<SendOrderEmailsOptions, "invoicePdf">;
  /** odeslání do Meta Conversions API (testy) */
  metaFetchImpl?: typeof fetch;
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
    if (await isOrderCancelled(db, orderId)) return { invoice: null, emails: [] };
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
  await sendMetaPurchaseSafe(db, orderId, { env, fetchImpl: deps.metaFetchImpl });
  return { invoice, emails };
}

/** Jak dlouho drží odesílání PDF zámek (pád uprostřed = po vypršení zkusí znovu). */
export const SEND_LEASE_MINUTES = 5;

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
): Promise<IssueResult & { emailed?: boolean; emailInProgress?: boolean }> {
  const env = deps.env ?? process.env;
  const result = await issueInvoice(db, orderId, { env, actor, fetchImpl: deps.fetchImpl });
  if (result.status !== "issued" && result.status !== "already_issued") return result;
  // PDF zákazníkovi nejvýš jednou: pdf_sent_at se zapíše až PO odeslání, proto
  // odesílá jen ten, kdo zabere krátký zámek na vazbě vystavené faktury
  // (stejný sloupec next_attempt_at jako zámek vystavení v issue.ts; u stavu
  // „issued“ ho jinak nic nepoužívá). Souběžné volání (web i asistent) zámek
  // nedostane a nic nepošle.
  const lease = (
    await db.execute(sql`
      UPDATE invoice_provider_links l
      SET next_attempt_at = now() + ${sql.raw(`interval '${SEND_LEASE_MINUTES} minutes'`)}, updated_at = now()
      FROM invoices i
      WHERE l.invoice_id = i.id AND i.order_id = ${orderId} AND i.document_type = 'invoice' AND i.doc_state = 'issued'
        AND i.pdf_sent_at IS NULL AND l.state = 'issued'
        AND (l.next_attempt_at IS NULL OR l.next_attempt_at < now())
      RETURNING l.id`)
  ).rows as { id: string }[];
  if (lease.length === 0) {
    const row = (
      await db.execute(sql`
        SELECT pdf_sent_at FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)
    ).rows[0] as { pdf_sent_at: Date | null } | undefined;
    return row && !row.pdf_sent_at ? { ...result, emailInProgress: true } : result;
  }
  try {
    const pdf =
      result.status === "issued" && result.pdf
        ? result.pdf
        : await loadIssuedPdf(db, orderId, { env, fetchImpl: deps.fetchImpl }).catch(() => null);
    if (!pdf) return result;
    const outcomes = await sendOrderEmails(db, orderId, "invoice_issued", baseUrl, { ...deps.email, invoicePdf: pdf });
    return { ...result, emailed: outcomes.some((o) => o.status === "sent") };
  } finally {
    await db
      .execute(sql`UPDATE invoice_provider_links SET next_attempt_at = NULL, updated_at = now() WHERE id = ${lease[0].id}`)
      .catch((error: unknown) => console.error("Fakturace: zámek odeslání PDF se nepodařilo uvolnit", orderId, error));
  }
}

/**
 * Náhradní objednávka s převedenou platbou (lib/eshop/cancellation.ts):
 * je-li tím zaplacená, návrh faktury a v automatickém ostrém režimu
 * vystavení (PDF přiložené k e-mailu) — vše podle skutečného stavu platby,
 * jedna faktura (motor issue.ts). Pak JEDINÝ e-mail „Náhradní objednávka“
 * (žádné „Přijali jsme objednávku“ ani „Platbu jsme přijali“). Doplatek
 * později jde běžnou cestou (invoiceAndNotifyPaid).
 */
export async function invoiceAndNotifyReplacement(
  db: Db,
  orderId: string,
  baseUrl: string,
  actor: InvoiceActor,
  replacement: { settled: boolean; fromReference: string; receivedHal: number },
  deps: AfterPaidDeps = {}
): Promise<{ invoice: IssueResult | null; emails: OrderEmailOutcome[] }> {
  const env = deps.env ?? process.env;
  let invoice: IssueResult | null = null;
  let pdf: InvoicePdf | null = null;
  if (replacement.settled) {
    await prepareInvoiceDraftSafe(db, orderId, actor, env);
    const mode = invoicingMode(env);
    if (mode.mode === "live" && mode.automatic) {
      invoice = await issueInvoiceSafe(db, orderId, { env, actor, fetchImpl: deps.fetchImpl });
      if (invoice.status === "issued") pdf = invoice.pdf;
    }
  }
  const emails = await sendOrderEmails(db, orderId, "replacement_created", baseUrl, {
    ...deps.email,
    invoicePdf: pdf,
    replacement: { fromReference: replacement.fromReference, receivedHal: replacement.receivedHal },
  });
  if (replacement.settled) await sendMetaPurchaseSafe(db, orderId, { env, fetchImpl: deps.metaFetchImpl });
  return { invoice, emails };
}
