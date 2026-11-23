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
//
// Ručně zapsané objednávky (zadání Lucie 18. 11. 2026, případ Café Academia):
// zákazník platí s číslem faktury z iDokladu, ne se symbolem objednávky. Když
// symbol nesedí na žádnou objednávku e-shopu, dohledá se v iDokladu faktura
// s tímto číslem; sedí-li její částka na platbu a odběratel (IČO, jinak jméno)
// na právě JEDNU nezaplacenou ruční objednávku se stejnou částkou, objednávka
// se přepne na Zaplaceno. Faktura se nevystavuje (už existuje) a zákazníkovi
// nic neodchází — jen zpráva na info@begina.cz. Víc možných objednávek = nic
// se nezapíše a na info@begina.cz přijde upozornění k ručnímu rozhodnutí.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { emailConfig, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";
import { fetchFioTransactions, type FioTransaction } from "./fio";
import { invoiceAndNotifyPaid, sendInvoiceOnDispatch } from "./invoicing/afterPaid";
import { issueInvoiceSafe, type IssueResult } from "./invoicing/issue";
import { settleOrderPaymentSql } from "./payments";
import { EshopIdokladClient, eqFilter, issuedInvoiceFilter } from "./invoicing/idokladHttp";
import { eshopIdokladCredentials } from "./invoicing/mode";
import { assertBeginaAgenda, summarize, type RawInvoice } from "@/lib/idoklad-read/service";
import { updateOwnDocument, type OwnDocumentRow } from "./invoicing/ownIssue";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const FIO_ACTOR = { type: "system" as const, name: "Fio banka" };
const LOOKBACK_DAYS = 10;
/** Ruční objednávka smí být nejvýš tolik dní stará, aby se spárovala s platbou faktury. */
export const MANUAL_ORDER_MAX_AGE_DAYS = 90;

/** Co je k párování potřeba vědět o faktuře z iDokladu. */
export type MatchInvoice = { number: string; totalKc: number | null; partnerIco: string | null; partnerName: string | null };

export type FioSyncDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  baseUrl: string;
  /** po přepnutí na Zaplaceno: návrh faktury + e-mail zákazníkovi (výchozí invoiceAndNotifyPaid) */
  afterPaid?: (orderId: string) => Promise<unknown>;
  /** vystavení faktury (výchozí issueInvoiceSafe) */
  issue?: (orderId: string) => Promise<IssueResult>;
  mailer?: { config: EmailConfig; transport: EmailTransport } | null;
  /** faktura z iDokladu podle čísla (jen čtení); výchozí čte iDoklad, bez přístupu vrací null */
  findInvoice?: (number: string) => Promise<MatchInvoice | null>;
};

export type FioSyncResult = {
  status: "no-token" | "fio-error" | "done";
  error?: string;
  /** objednávky nově zapsané jako zaplacené */
  paid: { orderNumber: number | null; amountKc: number; invoiceNumber: string | null }[];
  /** symbol sedí, částka ne */
  mismatched: { orderNumber: number | null; receivedKc: number; expectedKc: number }[];
  /** ruční objednávky zapsané jako zaplacené podle čísla faktury */
  manualPaid: { orderNumber: number | null; amountKc: number; invoiceNumber: string }[];
  /** vlastní faktury MojeBegina (VS = číslo faktury) nově označené jako uhrazené */
  invoicesPaid?: { invoiceNumber: string; amountKc: number }[];
};

function pragueDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const kc = (hal: number) => `${(hal / 100).toLocaleString("cs-CZ", { minimumFractionDigits: hal % 100 ? 2 : 0 })} Kč`;

type OrderRow = { id: string; order_number: number | null; total_kc: number; payment_status: string; contact_name: string | null; billing_company: string | null };

export async function syncFioPayments(db: Db, now: Date, deps: FioSyncDeps): Promise<FioSyncResult> {
  const env = deps.env ?? process.env;
  const token = env.FIO_API_TOKEN?.trim();
  const empty = { paid: [], mismatched: [], manualPaid: [] };
  if (!token) return { status: "no-token", ...empty };

  const from = pragueDay(new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const mailer = deps.mailer === undefined ? defaultMailer(env) : deps.mailer;
  const fetched = await fetchFioTransactions(token, from, pragueDay(now), deps.fetchImpl);
  if (!fetched.ok) {
    // Tichý výpadek (neplatný / propadlý token) by znamenal, že se platby přestanou
    // párovat a nikdo se to nedozví — proto upozornění, nejvýš jednou denně.
    await notify(mailer, {
      subject: "Fio: platby se nepodařilo načíst",
      text: `Automatická kontrola plateb ve Fio selhala: ${fetched.error}.\n\nPlatby převodem se teď nepárují samy. Když se to bude opakovat, zkontrolujte ve Fio (Nastavení → API), jestli token „Pouze sledovat účet“ ještě platí, a případně vytvořte nový a vložte ho do Vercelu jako FIO_API_TOKEN.`,
      key: `fio-chyba-${pragueDay(now)}`,
    });
    return { status: "fio-error", error: fetched.error, ...empty };
  }

  const incoming = fetched.transactions.filter((t) => t.amountHal > 0 && t.currency === "CZK" && t.vs);
  const result: FioSyncResult = { status: "done", paid: [], mismatched: [], manualPaid: [] };
  const findInvoice = ownInvoiceFirst(db, deps.findInvoice ?? defaultFindInvoice(env, deps.fetchImpl, now));

  for (const tx of incoming) {
    const found = await db.execute(sql`
      SELECT id, order_number, total_kc, payment_status, contact_name, billing_company FROM orders
      WHERE channel = 'eshop' AND payment_vs = ${tx.vs} AND fulfillment_status <> 'cancelled' LIMIT 1`);
    const order = found.rows[0] as OrderRow | undefined;
    if (!order) {
      let manual: FioSyncResult["manualPaid"][number] | null = null;
      try {
        manual = await matchManualOrder(db, tx, findInvoice, mailer, deps.baseUrl);
        if (manual) result.manualPaid.push(manual);
      } catch (error) {
        // výpadek iDokladu nesmí zastavit párování e-shopových plateb; zkusí se při dalším běhu
        console.error("Fio: párování ruční objednávky selhalo", error instanceof Error ? error.message.slice(0, 200) : "neznámá chyba");
      }
      try {
        const own = await settleOwnInvoice(db, tx, Boolean(manual), mailer, deps.baseUrl);
        if (own) (result.invoicesPaid ??= []).push(own);
      } catch (error) {
        console.error("Fio: párování vlastní faktury selhalo", error instanceof Error ? `${error.message.slice(0, 300)} ${String((error as { cause?: unknown }).cause ?? "").slice(0, 300)}` : "neznámá chyba");
      }
      continue;
    }
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

    // Zaplaceno až po expedici (zboží už je na cestě): faktura zákazníkovi hned.
    // Jinak odejde sama ve chvíli, kdy se objednávka označí jako předaná dopravci.
    const dispatched = await sendInvoiceOnDispatch(db, order.id, deps.baseUrl, { env });
    const customerLine =
      dispatched?.status === "sent" || dispatched?.status === "already_sent"
        ? "Objednávka už je expedovaná, faktura proto zákazníkovi odešla hned."
        : "Zákazníkovi faktura odejde sama, až objednávku označíte jako předanou dopravci.";
    const pdf = issued.status === "issued" ? issued.pdf : null;
    const invoiceLine =
      issued.status === "issued"
        ? `Faktura ${issued.invoiceNumber} je vystavená${pdf ? " a je v příloze" : ""}. ${customerLine}`
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

type ManualRow = {
  id: string;
  order_number: number | null;
  contact_name: string | null;
  recipient_name: string | null;
  billing_name: string | null;
  billing_company: string | null;
  org_name: string | null;
  org_ico: string | null;
};

/** Jméno pro porovnání: bez diakritiky, velikosti písmen a oddělovačů. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sedí odběratel faktury na ruční objednávku? IČO má přednost, jinak přesně stejné jméno. */
export function invoiceFitsOrder(invoice: MatchInvoice, order: Pick<ManualRow, "contact_name" | "recipient_name" | "billing_name" | "billing_company" | "org_name" | "org_ico">): boolean {
  const ico = invoice.partnerIco?.replace(/\s/g, "") || null;
  const orderIco = order.org_ico?.replace(/\s/g, "") || null;
  if (ico && orderIco) return ico === orderIco;
  const partner = nameKey(invoice.partnerName);
  if (!partner) return false;
  return [order.contact_name, order.recipient_name, order.billing_name, order.billing_company, order.org_name].some((n) => nameKey(n) === partner);
}

async function matchManualOrder(
  db: Db,
  tx: FioTransaction,
  findInvoice: (number: string) => Promise<MatchInvoice | null>,
  mailer: { config: EmailConfig; transport: EmailTransport } | null,
  baseUrl: string
): Promise<FioSyncResult["manualPaid"][number] | null> {
  if (!tx.vs || tx.amountHal % 100 !== 0) return null; // orders.total_kc jsou celé koruny
  const seen = await db.execute(sql`SELECT 1 FROM payments WHERE source = 'bank' AND external_id = ${tx.id} LIMIT 1`);
  if (seen.rows.length > 0) return null;
  const day = `${tx.date}T23:59:59Z`;
  const found = await db.execute(sql`
    SELECT o.id, o.order_number, o.contact_name, o.recipient_name, o.billing_name, o.billing_company, org.name AS org_name, org.ico AS org_ico
    FROM orders o LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.channel = 'manual' AND o.payment_status <> 'paid' AND o.fulfillment_status <> 'cancelled'
      AND o.total_kc = ${tx.amountHal / 100}
      AND o.ordered_at <= ${day}::timestamptz + interval '1 day'
      AND o.ordered_at > ${day}::timestamptz - make_interval(days => ${MANUAL_ORDER_MAX_AGE_DAYS})
    ORDER BY o.ordered_at`);
  const candidates = found.rows as ManualRow[];
  if (candidates.length === 0) return null; // bez kandidáta se do iDokladu vůbec nesahá

  const invoice = await findInvoice(tx.vs);
  if (!invoice || invoice.totalKc === null || Math.round(invoice.totalKc * 100) !== tx.amountHal) return null;
  const fitting = candidates.filter((c) => invoiceFitsOrder(invoice, c));
  if (fitting.length === 0) return null;
  const who = invoice.partnerName ?? tx.counterparty ?? "zákazník";

  if (fitting.length > 1) {
    await notify(mailer, {
      subject: `Platba faktury ${invoice.number} – víc možných objednávek (${who})`,
      text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}). Faktura ${invoice.number} sedí na víc nezaplacených ručních objednávek se stejnou částkou: ${fitting.map((f) => f.order_number ?? "bez čísla").join(", ")}.\n\nNic se nezapsalo. Označte prosím správnou objednávku jako zaplacenou v MojeBegina: ${baseUrl}/rizeni-firmy/objednavky`,
      key: `fio-rucni-vic-${tx.id}`,
    });
    return null;
  }

  const order = fitting[0];
  const inserted = await insertBankPayment(db, order.id, tx, "succeeded", "matched", `Fio: ${tx.counterparty ?? "banka"} · faktura ${invoice.number}`);
  if (!inserted) return null;
  const occurredAt = `${tx.date}T12:00:00Z`;
  const meta = JSON.stringify({ amountHal: tx.amountHal, method: "bank_transfer", token: `fio:${tx.id}`, invoiceNumber: invoice.number });
  const changed = await db.execute(sql`
    WITH upd AS (
      UPDATE orders SET payment_status = 'paid', paid_at = ${occurredAt}::timestamptz
      WHERE id = ${order.id} AND channel = 'manual' AND payment_status <> 'paid' AND fulfillment_status <> 'cancelled'
      RETURNING id
    )
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    SELECT id, 'system', NULL, ${FIO_ACTOR.name}, 'payment_status_changed',
      ${JSON.stringify({ to: "paid", provider: "fio", method: "bank_transfer", key: `fio:${tx.id}`, invoiceNumber: invoice.number })}::jsonb
    FROM upd
    RETURNING order_id`);
  if (changed.rows.length === 0) return null;
  await db.execute(sql`
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    VALUES (${order.id}, 'system', NULL, ${FIO_ACTOR.name}, 'payment_recorded', ${meta}::jsonb)`);
  await notify(mailer, {
    subject: `Platba přišla – faktura ${invoice.number} (${who}), ${kc(tx.amountHal)}`,
    text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}). Podle faktury ${invoice.number} je ručně zapsaná objednávka ${order.order_number ?? ""} označená jako zaplacená.\n\nFaktura už existuje, nová se nevystavila a zákazníkovi nic neodešlo.\n\nObjednávka: ${baseUrl}/rizeni-firmy/objednavky/${order.id}`,
    key: `fio-rucni-zaplaceno-${tx.id}`,
  });
  return { orderNumber: order.order_number, amountKc: tx.amountHal / 100, invoiceNumber: invoice.number };
}

/** Vlastní faktura MojeBegina má přednost před archivem iDokladu (stejná řada 2026xxxx). */
function ownInvoiceFirst(db: Db, fallback: (number: string) => Promise<MatchInvoice | null>): (number: string) => Promise<MatchInvoice | null> {
  return async (number) => {
    if (/^\d{8}$/.test(number)) {
      const row = (await db.execute(sql`SELECT number, state, total_kc, customer_ico, customer_name FROM own_invoice_documents WHERE number = ${number}`)).rows[0] as
        | { number: string; state: string; total_kc: number; customer_ico: string | null; customer_name: string }
        | undefined;
      if (row) return row.state === "issued" ? { number: row.number, totalKc: Number(row.total_kc), partnerIco: row.customer_ico, partnerName: row.customer_name } : null;
    }
    return fallback(number);
  };
}

/**
 * Platba vlastní faktury (Lucie 23. 11. 2026): VS = číslo faktury MojeBegina.
 * Sedí-li částka na haléř, faktura se označí jako uhrazená ke dni platby
 * (nová verze PDF „Uhrazeno – neplaťte“) a na info@begina.cz přijde zpráva.
 * Nesedí-li, nic se nezapíše jako uhrazené a přijde upozornění (jednou).
 */
async function settleOwnInvoice(
  db: Db,
  tx: FioTransaction,
  manualMatched: boolean,
  mailer: { config: EmailConfig; transport: EmailTransport } | null,
  baseUrl: string
): Promise<{ invoiceNumber: string; amountKc: number } | null> {
  if (!tx.vs || !/^\d{8}$/.test(tx.vs)) return null;
  const doc = (await db.execute(sql`
    SELECT id, number, state, version, sent_at, invoice_id, order_id, snapshot FROM own_invoice_documents
    WHERE number = ${tx.vs} AND state = 'issued' AND paid_on IS NULL`)).rows[0] as OwnDocumentRow | undefined;
  if (!doc || doc.snapshot.paidDate) return null;
  const expectedHal = Math.round(doc.snapshot.totalKc * 100);
  const who = doc.snapshot.customer.name;
  const raw = JSON.stringify({ fioId: tx.id, date: tx.date, counterparty: tx.counterparty, message: tx.message, invoiceNumber: doc.number });
  const record = async (status: "succeeded" | "pending", match: "matched" | "unmatched" | "needs_review", note: string) =>
    (
      await db.execute(sql`
        INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, match_status, note, raw)
        VALUES (${doc.order_id}::uuid, 'bank', ${tx.id}, 'bank_transfer', 'inflow', ${status}, ${tx.amountHal}, ${tx.vs}, ${`${tx.date}T12:00:00Z`}::timestamptz, ${match}, ${note.slice(0, 500)}, ${raw}::jsonb)
        ON CONFLICT (source, external_id) DO NOTHING RETURNING id`)
    ).rows.length > 0;

  if (tx.amountHal !== expectedHal) {
    if (await record("pending", "needs_review", `Faktura ${doc.number}: přišlo ${kc(tx.amountHal)}, faktura je na ${kc(expectedHal)}`)) {
      await notify(mailer, {
        subject: `Platba nesedí – faktura ${doc.number} (${who})`,
        text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}), ale faktura ${doc.number} je na ${kc(expectedHal)}.\n\nFaktura zůstává NEUHRAZENÁ. Rozhodněte v MojeBegina: ${baseUrl}/rizeni-firmy/faktury`,
        key: `fio-faktura-nesedi-${tx.id}`,
      });
    }
    return null;
  }
  // ruční objednávka už platbu zapsala (stejný pohyb) — jinak se pohyb zapíše tady (jednou)
  // payments_matched_has_order: bez objednávky je pohyb „unmatched“ (k objednávce), faktura je v poznámce a raw
  if (!manualMatched && !(await record("succeeded", doc.order_id ? "matched" : "unmatched", `Fio: ${tx.counterparty ?? "banka"} · faktura ${doc.number}`))) return null;
  await updateOwnDocument(db, doc.id, { ...doc.snapshot, paidDate: tx.date }, FIO_ACTOR.name);
  if (!manualMatched) {
    await notify(mailer, {
      subject: `Platba přišla – faktura ${doc.number} (${who}), ${kc(tx.amountHal)}`,
      text: `Na účet přišlo ${kc(tx.amountHal)} s variabilním symbolem ${tx.vs} (${tx.date}, ${tx.counterparty ?? "neznámý plátce"}). Faktura ${doc.number} je označená jako uhrazená.\n\nFaktury: ${baseUrl}/rizeni-firmy/faktury`,
      key: `fio-faktura-zaplaceno-${tx.id}`,
    });
  }
  return { invoiceNumber: doc.number, amountKc: tx.amountHal / 100 };
}

/** Čtení faktury z iDokladu podle čísla (jen GET). Bez přístupových údajů se nepáruje. */
function defaultFindInvoice(env: Env, fetchImpl: typeof fetch | undefined, now: Date): (number: string) => Promise<MatchInvoice | null> {
  let client: EshopIdokladClient | null | undefined;
  let agendaChecked = false;
  return async (number) => {
    if (!/^[0-9]{4,10}$/.test(number)) return null;
    if (client === undefined) {
      const credentials = eshopIdokladCredentials(env);
      client = credentials ? new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl }) : null;
    }
    if (!client) return null;
    if (!agendaChecked) {
      await assertBeginaAgenda(client);
      agendaChecked = true;
    }
    const items = (await client.list<RawInvoice>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", number)), 5)).Items;
    if (items.length !== 1) return null;
    const summary = summarize(items[0], null, pragueDay(now));
    return { number: summary.number, totalKc: summary.totalKc, partnerIco: summary.partner.ico, partnerName: summary.partner.name };
  };
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
