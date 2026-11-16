// FINANCE – KONTROLY A AUDIT 1.0 — načtení dat pro kontroly a auditní deník.
// Volající MUSÍ předem ověřit isInvoiceIssuer (jen Jaroslav a Lucie).
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financeCheckLog } from "@/lib/db/schema";
import {
  CHECKS,
  checkCompleteness,
  checkEconomyDuplicates,
  checkGaps,
  checkHighAmounts,
  checkInvoiceNumbering,
  checkInvoicesInEconomy,
  checkOrderPayments,
  checkOrdersWithoutInvoice,
  type CheckKey,
  type EconomyCheckRow,
  type Finding,
  type IssuedInvoiceRow,
  type LogAction,
  type LogEntry,
  type OrderCheckRow,
  type PaymentCheckRow,
} from "./checks";

type Rows<T> = { rows: T[] };

async function tableExists(name: string): Promise<boolean> {
  const result = (await db.execute(sql`SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS present`)) as unknown as Rows<{ present: boolean }>;
  return result.rows?.[0]?.present === true;
}

/** false = tabulka deníku ještě není (skript 123 nebyl spuštěn). */
export const financeLogTableExists = () => tableExists("finance_check_log");
export const economyTableReady = () => tableExists("economy_entries");

// ------------------------------------------------------------------ data pro kontroly

async function loadEconomyRows(where: ReturnType<typeof sql>): Promise<EconomyCheckRow[]> {
  const result = (await db.execute(sql`
    SELECT id, kind, entry_date::text AS entry_date, title, counterparty, amount_hal, payment_form, invoice_number
    FROM economy_entries
    WHERE deleted_at IS NULL AND ${where}
    ORDER BY entry_date, created_at`)) as unknown as Rows<{
    id: string;
    kind: "income" | "cost";
    entry_date: string;
    title: string;
    counterparty: string | null;
    amount_hal: string | number;
    payment_form: string | null;
    invoice_number: string | null;
  }>;
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    entryDate: row.entry_date,
    title: row.title,
    counterparty: row.counterparty,
    amountHal: Number(row.amount_hal),
    paymentForm: row.payment_form,
    invoiceNumber: row.invoice_number,
  }));
}

const loadEconomyYear = (year: number) => loadEconomyRows(sql`entry_date >= ${`${year}-01-01`}::date AND entry_date < ${`${year + 1}-01-01`}::date`);

/** Příjmy s číslem faktury ze všech let (faktura z prosince může být zapsaná v lednu). */
const loadIncomeWithInvoice = () => loadEconomyRows(sql`kind = 'income' AND invoice_number IS NOT NULL`);

async function loadOrders(year: number): Promise<OrderCheckRow[]> {
  const result = (await db.execute(sql`
    SELECT o.id, o.order_number, o.channel, o.total_kc, o.payment_status, o.fulfillment_status,
           (o.ordered_at AT TIME ZONE 'Europe/Prague')::date::text AS ordered_day,
           COALESCE(o.billing_company, org.name, o.billing_name, o.contact_name, o.recipient_name, 'bez jména') AS label,
           b.balance_state, COALESCE(b.net_hal, 0) AS received_hal,
           COALESCE(b.required_hal, o.total_kc::bigint * 100) AS required_hal,
           (SELECT i.invoice_number FROM invoices i
             WHERE i.order_id = o.id AND i.document_type = 'invoice' AND i.doc_state = 'issued'
             ORDER BY i.issued_at DESC LIMIT 1) AS invoice_number
    FROM orders o
    LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    LEFT JOIN order_payment_balance b ON b.order_id = o.id
    WHERE (o.ordered_at AT TIME ZONE 'Europe/Prague')::date >= ${`${year}-01-01`}::date
      AND (o.ordered_at AT TIME ZONE 'Europe/Prague')::date < ${`${year + 1}-01-01`}::date
    ORDER BY o.ordered_at`)) as unknown as Rows<{
    id: string;
    order_number: string | number | null;
    channel: string;
    total_kc: number;
    payment_status: string;
    fulfillment_status: string;
    ordered_day: string;
    label: string;
    balance_state: string | null;
    received_hal: string | number;
    required_hal: string | number;
    invoice_number: string | null;
  }>;
  return result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number === null ? null : Number(row.order_number),
    label: row.label,
    channel: row.channel,
    orderedAt: row.ordered_day,
    totalKc: Number(row.total_kc),
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    balanceState: row.balance_state,
    receivedHal: Number(row.received_hal),
    requiredHal: Number(row.required_hal),
    issuedInvoiceNumber: row.invoice_number,
  }));
}

/** Nespárované platby — bez ohledu na rok, dokud se nevyřeší. */
async function loadUnmatchedPayments(): Promise<PaymentCheckRow[]> {
  const result = (await db.execute(sql`
    SELECT id, (occurred_at AT TIME ZONE 'Europe/Prague')::date::text AS occurred_day, amount_hal, method, vs, match_status
    FROM payments WHERE match_status <> 'matched' ORDER BY created_at`)) as unknown as Rows<{
    id: string;
    occurred_day: string | null;
    amount_hal: string | number;
    method: string;
    vs: string | null;
    match_status: string;
  }>;
  return result.rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_day,
    amountHal: Number(row.amount_hal),
    method: row.method,
    vs: row.vs,
    matchStatus: row.match_status,
  }));
}

async function loadIssuedInvoices(year: number): Promise<IssuedInvoiceRow[]> {
  const result = (await db.execute(sql`
    SELECT invoice_number, total_kc, (issued_at AT TIME ZONE 'Europe/Prague')::date::text AS issued_day, order_id
    FROM invoices
    WHERE document_type = 'invoice' AND doc_state = 'issued' AND invoice_number IS NOT NULL
      AND (issued_at AT TIME ZONE 'Europe/Prague')::date >= ${`${year}-01-01`}::date
      AND (issued_at AT TIME ZONE 'Europe/Prague')::date < ${`${year + 1}-01-01`}::date
    ORDER BY issued_at`)) as unknown as Rows<{ invoice_number: string; total_kc: number; issued_day: string; order_id: string }>;
  return result.rows.map((row) => ({ number: row.invoice_number, totalKc: Number(row.total_kc), issuedAt: row.issued_day, orderId: row.order_id }));
}

export type CheckRun = { key: CheckKey; available: boolean; error: string | null; findings: Finding[] };

/**
 * Spustí všechny kontroly nad daty MojeBegina za rok (kromě iDokladu, ten
 * běží jen na tlačítko). Chyba jedné skupiny nezastaví ostatní — kontrola
 * se ukáže jako nedostupná (available=false), ne jako „bez nálezů“.
 */
export async function runDatabaseChecks(year: number, today: string): Promise<CheckRun[]> {
  const economy = (async () => {
    if (!(await economyTableReady())) throw new Error("Tabulka Ekonomiky v databázi ještě není (skript 114).");
    return { yearRows: await loadEconomyYear(year), incomeWithInvoice: await loadIncomeWithInvoice() };
  })();
  const orders = (async () => ({ orders: await loadOrders(year), payments: await loadUnmatchedPayments(), invoices: await loadIssuedInvoices(year) }))();
  const [eco, ord] = await Promise.allSettled([economy, orders]);

  const message = (reason: unknown) => (reason instanceof Error ? reason.message : "Data se nepodařilo načíst.");
  const run = (key: CheckKey, settled: PromiseSettledResult<unknown>, compute: () => Finding[]): CheckRun =>
    settled.status === "fulfilled" ? { key, available: true, error: null, findings: compute() } : { key, available: false, error: message(settled.reason), findings: [] };
  const e = () => (eco as PromiseFulfilledResult<Awaited<typeof economy>>).value;
  const o = () => (ord as PromiseFulfilledResult<Awaited<typeof orders>>).value;

  return [
    run("ekonomika-duplicity", eco, () => checkEconomyDuplicates(e().yearRows)),
    run("ekonomika-cislovani", eco, () => checkInvoiceNumbering(e().yearRows)),
    run("ekonomika-uplnost", eco, () => checkCompleteness(e().yearRows, today)),
    run("ekonomika-vysoke-castky", eco, () => checkHighAmounts(e().yearRows)),
    run("ekonomika-mezery", eco, () => checkGaps(e().yearRows, year, today)),
    run("objednavky-faktury", ord, () => checkOrdersWithoutInvoice(o().orders)),
    run("objednavky-uhrady", ord, () => checkOrderPayments(o().orders, o().payments, today)),
    {
      key: "faktury-v-ekonomice",
      ...(eco.status === "fulfilled" && ord.status === "fulfilled"
        ? { available: true, error: null, findings: checkInvoicesInEconomy(o().invoices, e().incomeWithInvoice) }
        : { available: false, error: message(eco.status === "rejected" ? eco.reason : (ord as PromiseRejectedResult).reason), findings: [] }),
    },
  ];
}

export const DATABASE_CHECK_KEYS = CHECKS.filter((check) => !check.onDemand).map((check) => check.key);

// ------------------------------------------------------------------ auditní deník

type LogRow = typeof financeCheckLog.$inferSelect;

const toEntry = (row: LogRow): LogEntry => ({
  id: row.id,
  checkKey: row.checkKey,
  findingKey: row.findingKey,
  action: row.action as LogAction,
  note: row.note,
  snapshot: row.snapshot,
  authorName: row.authorName,
  createdAt: row.createdAt.toISOString(),
});

export async function loadCheckLog(checkKey: CheckKey): Promise<LogEntry[]> {
  const rows = await db.select().from(financeCheckLog).where(eq(financeCheckLog.checkKey, checkKey)).orderBy(desc(financeCheckLog.createdAt)).limit(1000);
  return rows.map(toEntry);
}

/** Celý deník (nejnovější první), bez snapshotů — ty jsou ve složce kontroly. */
export async function loadJournal(limit = 300): Promise<LogEntry[]> {
  const rows = await db
    .select({
      id: financeCheckLog.id,
      checkKey: financeCheckLog.checkKey,
      findingKey: financeCheckLog.findingKey,
      action: financeCheckLog.action,
      note: financeCheckLog.note,
      authorName: financeCheckLog.authorName,
      createdAt: financeCheckLog.createdAt,
    })
    .from(financeCheckLog)
    .orderBy(desc(financeCheckLog.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, action: row.action as LogAction, snapshot: null, createdAt: row.createdAt.toISOString() }));
}

/** Rozhodnutí (ok/fixed) všech kontrol — pro souhrn na přehledu. */
export async function loadDecisions(): Promise<LogEntry[]> {
  const rows = await db
    .select({
      id: financeCheckLog.id,
      checkKey: financeCheckLog.checkKey,
      findingKey: financeCheckLog.findingKey,
      action: financeCheckLog.action,
      createdAt: financeCheckLog.createdAt,
    })
    .from(financeCheckLog)
    .where(sql`${financeCheckLog.action} IN ('ok', 'fixed')`);
  return rows.map((row) => ({ ...row, action: row.action as LogAction, note: null, snapshot: null, authorName: null, createdAt: row.createdAt.toISOString() }));
}

/** Poslední zápis o provedení každé kontroly (bez snapshotu). */
export async function loadLastRuns(): Promise<Map<string, string>> {
  const result = (await db.execute(sql`
    SELECT check_key, max(created_at) AS last_run FROM finance_check_log WHERE action = 'run' GROUP BY check_key`)) as unknown as Rows<{
    check_key: string;
    last_run: string | Date;
  }>;
  return new Map(result.rows.map((row) => [row.check_key, new Date(row.last_run).toISOString()]));
}

export type NewLogEntry = {
  checkKey: CheckKey;
  findingKey: string | null;
  action: LogAction;
  note: string | null;
  snapshot?: unknown;
  createdByUserId: string;
  authorName: string | null;
};

export async function appendLog(entry: NewLogEntry): Promise<void> {
  await db.insert(financeCheckLog).values({ ...entry, snapshot: entry.snapshot ?? null });
}
