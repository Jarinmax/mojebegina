// Párování příchozích plateb z Fio s objednávkami e-shopu (zadání Lucie
// 15. 11. 2026): platba převodem se už nezapisuje ručně.
//
//   1. z Fio se načtou příchozí platby za posledních 10 dní (jen čtení),
//   2. platba se spáruje s objednávkou e-shopu podle variabilního symbolu;
//      zapíše se jen když sedí i částka na haléř a měna CZK,
//   3. objednávka se přepne na Zaplaceno (stejný přepočet jako ruční zápis),
//      zákazník dostane „Platbu jsme přijali“,
//   4. faktura se vystaví v iDokladu a PDF přijde JEN na info@begina.cz ke
//      kontrole — zákazníkovi ji posílá až člověk (MojeBegina / asistent),
//   5. sedí-li symbol, ale ne částka, nic se nezapíše jako zaplacené a na
//      info@begina.cz přijde upozornění (jednou).
// Každý pohyb se zpracuje nejvýš jednou (payments.source='bank', external_id).
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { emailConfig, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";
import { fetchFioTransactions, type FioTransaction } from "./fio";
import { invoiceAndNotifyPaid } from "./invoicing/afterPaid";
import { issueInvoiceSafe, type IssueResult } from "./invoicing/issue";
import { settleOrderPaymentSql } from "./payments";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const FIO_ACTOR = { type: "system" as const, name: "Fio banka" };
const LOOKBACK_DAYS = 10;

export type FioSyncDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  baseUrl: string;
  /** po přepnutí na Zaplaceno: návrh faktury + e-mail zákazníkovi (výchozí invoiceAndNotifyPaid) */
  afterPaid?: (orderId: string) => Promise<unknown>;
  /** vystavení faktury (výchozí issueInvoiceSafe) */
  issue?: (orderId: string) => Promise<IssueResult>;
  mailer?: { config: EmailConfig; transport: EmailTransport } | null;
};

export type FioSyncResult = {
  status: "no-token" | "fio-error" | "done";
  error?: string;
  /** objednávky nově zapsané jako zaplacené */
  paid: { orderNumber: number | null; amountKc: number; invoiceNumber: string | null }[];
  /** symbol sedí, částka ne */
  mismatched: { orderNumber: number | null; receivedKc: number; expectedKc: number }[];
};

function pragueDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const kc = (hal: number) => `${(hal / 100).toLocaleString("cs-CZ", { minimumFractionDigits: hal % 100 ? 2 : 0 })} Kč`;

type OrderRow = { id: string; order_number: number | null; total_kc: number; payment_status: string; contact_name: string | null; billing_company: string | null };

export async function syncFioPayments(db: Db, now: Date, deps: FioSyncDeps): Promise<FioSyncResult> {
  const env = deps.env ?? process.env;
  const token = env.FIO_API_TOKEN?.trim();
  const empty = { paid: [], mismatched: [] };
  if (!token) return { status: "no-token", ...empty };

  const from = pragueDay(new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const fetched = await fetchFioTransactions(token, from, pragueDay(now), deps.fetchImpl);
  if (!fetched.ok) return { status: "fio-error", error: fetched.error, ...empty };

  const incoming = fetched.transactions.filter((t) => t.amountHal > 0 && t.currency === "CZK" && t.vs);
  const result: FioSyncResult = { status: "done", paid: [], mismatched: [] };
  const mailer = deps.mailer === undefined ? defaultMailer(env) : deps.mailer;

  for (const tx of incoming) {
    const found = await db.execute(sql`
      SELECT id, order_number, total_kc, payment_status, contact_name, billing_company FROM orders
      WHERE channel = 'eshop' AND payment_vs = ${tx.vs} AND fulfillment_status <> 'cancelled' LIMIT 1`);
    const order = found.rows[0] as OrderRow | undefined;
    if (!order) continue;
    // Už zaplacená objednávka (karta, ruční zápis, dřívější běh): pohyb se nezapisuje,
    // jinak by se platba započítala dvakrát.
    if (order.payment_status === "paid") continue;
    const expectedHal = Number(order.total_kc) * 100;
    const who = order.billing_company ?? order.contact_name ?? "zákazník";

    if (tx.amountHal !== expectedHal) {
      const inserted = await insertBankPayment(db, order.id, tx, "pending", "needs_review", `Částka nesedí: přišlo ${kc(tx.amountHal)}, objednávka je na ${kc(expectedHal)}`);
      if (inserted) {
        result.mismatched.push({ orderNumber: order.order_number, receivedKc: tx.amountHal / 100, expectedKc: expectedHal / 100 });
        await notify(mailer, {
          subject: `Platba nesedí – objednávka ${order.order_number ?? ""} (${who})`,
          text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}), ale objednávka ${order.order_number ?? ""} je na ${kc(expectedHal)}.\n\nObjednávka zůstává NEZAPLACENÁ a faktura se nevystavila. Rozhodněte v MojeBegina: ${deps.baseUrl}/rizeni-firmy/objednavky/${order.id}`,
          key: `fio-nesedi-${tx.id}`,
        });
      }
      continue;
    }

    const inserted = await insertBankPayment(db, order.id, tx, "succeeded", "matched", tx.counterparty ? `Fio: ${tx.counterparty}` : "Fio banka");
    if (!inserted) continue; // tento pohyb už byl zpracován
    const occurredAt = new Date(`${tx.date}T12:00:00Z`);
    const meta = JSON.stringify({ amountHal: tx.amountHal, method: "bank_transfer", token: `fio:${tx.id}` });
    await db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      VALUES (${order.id}, 'system', NULL, ${FIO_ACTOR.name}, 'payment_recorded', ${meta}::jsonb)`);
    const settle = await db.execute(settleOrderPaymentSql(order.id, FIO_ACTOR, occurredAt, { key: `fio:${tx.id}`, provider: "fio", method: "bank_transfer" }));
    if (settle.rows.length === 0) continue; // už byla zaplacená (nebo platba nestačí)

    await (deps.afterPaid ?? ((orderId: string) => invoiceAndNotifyPaid(db, orderId, "payment_marked_paid", deps.baseUrl, FIO_ACTOR, { env })))(order.id);
    const issued = await (deps.issue ?? ((orderId: string) => issueInvoiceSafe(db, orderId, { env, actor: FIO_ACTOR })))(order.id);
    const invoiceNumber = issued.status === "issued" || issued.status === "already_issued" ? issued.invoiceNumber : null;
    result.paid.push({ orderNumber: order.order_number, amountKc: tx.amountHal / 100, invoiceNumber });

    const pdf = issued.status === "issued" ? issued.pdf : null;
    const invoiceLine =
      issued.status === "issued"
        ? `Faktura ${issued.invoiceNumber} je vystavená${pdf ? " a je v příloze" : ""}. Zákazníkovi zatím NEODEŠLA — zkontrolujte ji a odešlete z MojeBegina.`
        : issued.status === "already_issued"
          ? `Faktura ${issued.invoiceNumber ?? ""} už byla vystavená dřív.`
          : `Fakturu se nepodařilo vystavit automaticky (${issued.status === "failed" ? issued.error : issued.reason}) — vystavte ji prosím v MojeBegina.`;
    await notify(mailer, {
      subject: `Platba přišla – objednávka ${order.order_number ?? ""} (${who}), ${kc(tx.amountHal)}`,
      text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}). Objednávka ${order.order_number ?? ""} je zapsaná jako zaplacená.\n\n${invoiceLine}\n\nObjednávka: ${deps.baseUrl}/rizeni-firmy/objednavky/${order.id}`,
      key: `fio-zaplaceno-${tx.id}`,
      attachment: pdf ? { filename: pdf.filename, contentBase64: pdf.contentBase64 } : null,
    });
  }
  return result;
}

/** true = pohyb byl zapsán teď poprvé. */
async function insertBankPayment(db: Db, orderId: string, tx: FioTransaction, status: "succeeded" | "pending", match: "matched" | "needs_review", note: string): Promise<boolean> {
  const raw = JSON.stringify({ fioId: tx.id, date: tx.date, counterparty: tx.counterparty, message: tx.message });
  const inserted = await db.execute(sql`
    INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, match_status, note, raw)
    VALUES (${orderId}, 'bank', ${tx.id}, 'bank_transfer', 'inflow', ${status}, ${tx.amountHal}, ${tx.vs}, ${`${tx.date}T12:00:00Z`}::timestamptz, ${match}, ${note.slice(0, 500)}, ${raw}::jsonb)
    ON CONFLICT (source, external_id) DO NOTHING
    RETURNING id`);
  return inserted.rows.length > 0;
}

function defaultMailer(env: Env): { config: EmailConfig; transport: EmailTransport } | null {
  const config = emailConfig(env);
  return config ? { config, transport: resendTransport(config.apiKey) } : null;
}

async function notify(
  mailer: { config: EmailConfig; transport: EmailTransport } | null,
  message: { subject: string; text: string; key: string; attachment?: { filename: string; contentBase64: string } | null }
): Promise<void> {
  if (!mailer || mailer.config.internalTo.length === 0) return;
  const escaped = message.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  const sent = await mailer.transport(
    {
      from: mailer.config.from,
      to: mailer.config.internalTo,
      replyTo: mailer.config.replyTo,
      subject: message.subject,
      text: message.text,
      html: `<p>${escaped}</p>`,
      ...(message.attachment ? { attachments: [{ ...message.attachment, contentType: "application/pdf" }] } : {}),
    },
    message.key
  );
  if (!sent.ok) console.error("Fio: upozornění na info se nepodařilo odeslat", sent.error.slice(0, 200));
}
