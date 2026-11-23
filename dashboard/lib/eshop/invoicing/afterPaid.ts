// ESHOP 1.0 — co se stane po úplném zaplacení e-shopové objednávky.
//
//   1. návrh faktury (vždy; nikdy nevyhodí výjimku),
//   2. jen v automatickém ostrém režimu „on“ (mode.ts — na Preview NIKDY):
//      vystavení v iDokladu (issue.ts) a PDF faktury. V režimu „manual“
//      se tu NIC nevystavuje — faktura čeká na tlačítko v detailu
//      objednávky (issueAndSendInvoice níže, tentýž motor),
//      Zákazníkovi faktura odchází až s expedicí (sendInvoiceOnDispatch níže),
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
import { invoicingMode, ownInvoicingActive } from "./mode";
import { sendManualOrderInvoiceOnDispatch } from "./ownManual";
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
        AND i.pdf_sent_at IS NULL
        -- iDoklad: vazba „issued“; vlastní faktura MojeBegina: vazba „void“ + doklad (ownIssue.ts)
        AND (l.state = 'issued' OR (l.state = 'void' AND EXISTS (SELECT 1 FROM own_invoice_documents d WHERE d.invoice_id = i.id AND d.state = 'issued')))
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

/** Stavy vyřízení, od kterých je objednávka „na cestě k zákazníkovi“. */
export const DISPATCHED_STATUSES = ["handed_to_carrier", "out_for_delivery", "delivered"] as const;
export const DISPATCH_ACTOR: InvoiceActor = { type: "system", name: "Expedice" };

export type DispatchInvoiceOutcome =
  | { status: "sent"; invoiceNumber: string | null }
  | { status: "already_sent" | "not_eshop" | "not_dispatched" | "not_paid" }
  | { status: "not_sent"; reason: string; invoiceNumber?: string | null };

export type DispatchInvoiceDeps = AfterPaidDeps & {
  /** vystavení + odeslání PDF (výchozí issueAndSendInvoice) */
  issueAndSend?: typeof issueAndSendInvoice;
};

/**
 * Faktura zákazníkovi až s expedicí (rozhodnutí Lucie 18. 11. 2026): po
 * zaplacení se faktura jen připraví; zákazníkovi odejde ve chvíli, kdy je
 * e-shopová objednávka předaná dopravci / na rozvozu / doručená. Tehdy se
 * (pokud ještě není) vystaví v iDokladu a PDF odejde e-mailem — nejvýš jednou
 * (pdf_sent_at + zámek v issueAndSendInvoice). Nezaplacená objednávka nic
 * neposílá; zaplatí-li se až po expedici, volá se tatáž funkce po platbě.
 * Nikdy nevyhodí výjimku — stav objednávky se kvůli faktuře nesmí vrátit.
 */
export async function sendInvoiceOnDispatch(db: Db, orderId: string, baseUrl: string, deps: DispatchInvoiceDeps = {}): Promise<DispatchInvoiceOutcome> {
  try {
    const order = (
      await db.execute(sql`
        SELECT o.channel, o.payment_status, o.fulfillment_status,
               (SELECT i.pdf_sent_at FROM invoices i WHERE i.order_id = o.id AND i.document_type = 'invoice' AND i.doc_state = 'issued' LIMIT 1) AS pdf_sent_at
        FROM orders o WHERE o.id = ${orderId}`)
    ).rows[0] as { channel: string; payment_status: string; fulfillment_status: string; pdf_sent_at: Date | string | null } | undefined;
    if (!order) return { status: "not_eshop" };
    if (!(DISPATCHED_STATUSES as readonly string[]).includes(order.fulfillment_status)) return { status: "not_dispatched" };
    // Ruční objednávka (Lucie 23. 11. 2026): faktura (i nezaplacená s QR) odchází se zbožím
    if (order.channel === "manual" && ownInvoicingActive(deps.env ?? process.env)) {
      const manual = await sendManualOrderInvoiceOnDispatch(db, orderId, { env: deps.env });
      if (manual.status === "sent") return { status: "sent", invoiceNumber: manual.invoiceNumber };
      if (manual.status === "already_sent") return { status: "already_sent" };
      return { status: "not_sent", reason: manual.reason, invoiceNumber: manual.invoiceNumber ?? null };
    }
    if (order.channel !== "eshop") return { status: "not_eshop" };
    if (order.payment_status !== "paid") return { status: "not_paid" };
    if (order.pdf_sent_at) return { status: "already_sent" };
    const result = await (deps.issueAndSend ?? issueAndSendInvoice)(db, orderId, baseUrl, DISPATCH_ACTOR, deps);
    if (result.status === "skipped") return { status: "not_sent", reason: result.reason };
    if (result.status === "failed") return { status: "not_sent", reason: result.error };
    if (result.emailed) return { status: "sent", invoiceNumber: result.invoiceNumber };
    return { status: "not_sent", reason: result.emailInProgress ? "odesílání právě probíhá" : "fakturu se nepodařilo odeslat e-mailem", invoiceNumber: result.invoiceNumber };
  } catch (error) {
    console.error("Faktura při expedici selhala", orderId, error instanceof Error ? error.message.slice(0, 200) : error);
    return { status: "not_sent", reason: "neočekávaná chyba — fakturu odešlete tlačítkem v objednávce" };
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
