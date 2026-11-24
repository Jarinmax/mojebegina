// Fio banka — vazba příchozí platby na objednávku a fakturu (JEN ČTENÍ).
// Zadání Lucie 24. 11. 2026: asistent přes MCP (ChatGPT nemá přístup do
// databáze) má u každé příchozí platby vidět, ke které objednávce a faktuře
// patří a jestli je spárovaná. Nic nezapisuje ani nepáruje — zápis dělá jen
// automat v fioSync.ts; tady se jen čte, co už v MojeBegina je.
//
// Pořadí, podle čeho se vazba hledá:
//   1. pohyb už zapsal automat (payments.source='bank', external_id = ID pohybu),
//   2. variabilní symbol = symbol objednávky (orders.payment_vs),
//   3. variabilní symbol = číslo vlastní faktury MojeBegina (own_invoice_documents.number).
// Starší faktury z iDokladu (do 20260214) v databázi nejsou — u nespárované
// platby s osmimístným symbolem na to upozorní poznámka.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import type { FioTransaction } from "./fio";

type Db = NeonHttpDatabase<typeof schema>;

export type FioLinkStatus = "sparovano" | "nesedi_castka" | "ceka_na_zapis" | "nesparovano";

export const FIO_LINK_LABELS: Record<FioLinkStatus, string> = {
  sparovano: "spárováno",
  nesedi_castka: "nesedí částka",
  ceka_na_zapis: "sedí, ale ještě není zapsáno jako zaplacené",
  nesparovano: "nespárováno",
};

export type FioLink = {
  status: FioLinkStatus;
  statusLabel: string;
  /** čím se vazba našla nebo proč se nenašla */
  note: string;
  orderNumber: string | null;
  /** stav úhrady objednávky v MojeBegina (paid, unpaid, …) */
  orderPaymentStatus: string | null;
  orderTotalKc: number | null;
  invoiceNumber: string | null;
  /** den úhrady faktury RRRR-MM-DD; jen u vlastních faktur MojeBegina */
  invoicePaidOn: string | null;
};

type OrderRow = { id: string; order_number: string | number | null; total_kc: string | number; payment_status: string; payment_vs: string | null };
type RecordedRow = { external_id: string; match_status: string; order_id: string | null };
type DocRow = { number: string; total_kc: string | number; order_id: string | null; paid_on: string | Date | null; paid_date_snapshot: string | null };
type InvoiceRow = { order_id: string; invoice_number: string };

const list = (values: string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);
const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];
const day = (value: string | Date | null): string | null => (value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/**
 * Vazby pro dané příchozí platby; klíč je ID pohybu ve Fio. Jen SELECT.
 * Platba, u které se nic nenašlo, dostane stav „nespárováno“ s důvodem.
 */
export async function linkFioPayments(db: Db, transactions: FioTransaction[]): Promise<Map<string, FioLink>> {
  const result = new Map<string, FioLink>();
  if (transactions.length === 0) return result;
  const ids = unique(transactions.map((t) => t.id));
  const symbols = unique(transactions.map((t) => t.vs));
  const invoiceNumbers = symbols.filter((vs) => /^\d{8}$/.test(vs));

  const recorded = (await db.execute(sql`
    SELECT external_id, match_status, order_id FROM payments WHERE source = 'bank' AND external_id IN (${list(ids)})`)).rows as RecordedRow[];
  const docs =
    invoiceNumbers.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT number, total_kc, order_id, paid_on, snapshot->>'paidDate' AS paid_date_snapshot FROM own_invoice_documents
          WHERE kind = 'invoice' AND state = 'issued' AND number IN (${list(invoiceNumbers)})`)).rows as DocRow[]);
  const orderIds = unique([...recorded.map((r) => r.order_id), ...docs.map((d) => d.order_id)]);
  const orders =
    symbols.length === 0 && orderIds.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT id, order_number, total_kc, payment_status, payment_vs FROM orders
          WHERE (${symbols.length > 0 ? sql`payment_vs IN (${list(symbols)}) AND fulfillment_status <> 'cancelled'` : sql`false`})
             OR (${orderIds.length > 0 ? sql`id::text IN (${list(orderIds)})` : sql`false`})`)).rows as OrderRow[]);
  const invoices =
    orders.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT order_id, invoice_number FROM invoices
          WHERE document_type = 'invoice' AND doc_state = 'issued' AND invoice_number IS NOT NULL
            AND order_id::text IN (${list(orders.map((o) => String(o.id)))})`)).rows as InvoiceRow[]);
  // vlastní faktura k nalezené objednávce (kvůli dni úhrady); nejnovější první
  const orderDocs =
    orders.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT number, total_kc, order_id, paid_on, snapshot->>'paidDate' AS paid_date_snapshot FROM own_invoice_documents
          WHERE kind = 'invoice' AND state = 'issued' AND order_id::text IN (${list(orders.map((o) => String(o.id)))})
          ORDER BY created_at DESC`)).rows as DocRow[]);

  const recordedById = new Map(recorded.map((r) => [r.external_id, r]));
  const docByNumber = new Map(docs.map((d) => [d.number, d]));
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  const invoiceByOrder = new Map(invoices.map((i) => [String(i.order_id), i.invoice_number]));

  for (const tx of transactions) {
    const rec = recordedById.get(tx.id);
    const doc = tx.vs ? docByNumber.get(tx.vs) : undefined;
    // orders.payment_vs je v databázi jedinečný — symbol patří nejvýš jedné objednávce
    const bySymbol = tx.vs ? orders.find((o) => o.payment_vs === tx.vs) : undefined;
    const order = (rec?.order_id ? orderById.get(String(rec.order_id)) : undefined) ?? bySymbol ?? (doc?.order_id ? orderById.get(String(doc.order_id)) : undefined);
    const docForOrder = doc ?? (order ? orderDocs.find((d) => d.order_id && String(d.order_id) === String(order.id)) : undefined);
    const base = {
      orderNumber: order?.order_number == null ? null : String(order.order_number),
      orderPaymentStatus: order?.payment_status ?? null,
      orderTotalKc: order ? Number(order.total_kc) : null,
      invoiceNumber: docForOrder?.number ?? (order ? invoiceByOrder.get(String(order.id)) ?? null : null),
      invoicePaidOn: docForOrder ? day(docForOrder.paid_on) ?? docForOrder.paid_date_snapshot ?? null : null,
    };
    const make = (status: FioLinkStatus, note: string): FioLink => ({ status, statusLabel: FIO_LINK_LABELS[status], note, ...base });

    if (rec) {
      result.set(tx.id, rec.match_status === "needs_review" ? make("nesedi_castka", "automat Fio platbu zapsal k ručnímu rozhodnutí — částka neodpovídá") : make("sparovano", "zapsal automat Fio"));
      continue;
    }
    if (doc) {
      const fits = Math.round(Number(doc.total_kc) * 100) === tx.amountHal;
      if (!fits) result.set(tx.id, make("nesedi_castka", `variabilní symbol je číslo faktury ${doc.number} na ${Number(doc.total_kc)} Kč`));
      else result.set(tx.id, base.invoicePaidOn ? make("sparovano", `podle čísla faktury ${doc.number}; faktura je uhrazená`) : make("ceka_na_zapis", `podle čísla faktury ${doc.number}; faktura zatím není označená jako uhrazená`));
      continue;
    }
    if (order) {
      const fits = Math.round(Number(order.total_kc) * 100) === tx.amountHal;
      if (!fits) result.set(tx.id, make("nesedi_castka", `variabilní symbol patří objednávce na ${Number(order.total_kc)} Kč`));
      else result.set(tx.id, order.payment_status === "paid" ? make("sparovano", "podle variabilního symbolu; objednávka je zaplacená (zapsáno ručně nebo jinak než automatem)") : make("ceka_na_zapis", "podle variabilního symbolu; objednávka zatím není zapsaná jako zaplacená"));
      continue;
    }
    result.set(
      tx.id,
      make(
        "nesparovano",
        !tx.vs
          ? "platba nemá variabilní symbol"
          : /^\d{7,8}$/.test(tx.vs)
            ? "symbol neodpovídá žádné objednávce ani vlastní faktuře MojeBegina — může jít o starší fakturu z iDokladu (ověř idoklad_search_invoices podle čísla)"
            : "symbol neodpovídá žádné objednávce ani faktuře v MojeBegina"
      )
    );
  }
  return result;
}
