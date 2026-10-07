// ESHOP 1.0 — návrh faktury k zaplacené e-shopové objednávce v DB
// (invoices + invoice_provider_links + invoice_customers).
//
// Vzniká po úplné úhradě (Stripe webhook, „Zapsat platbu“) nebo ručně
// v MojeBegina. V režimu návrhu (mode.ts, vždy mimo Production) obsahuje
// request_payload přesně to, co by šlo do iDokladu, a nic se neodesílá.
// V ostrém režimu vzniká vazba ve stavu „pending“ a vystavení provede
// issue.ts.
//
// Pojistka proti dvojí faktuře: jedna prodejní faktura na objednávku
// (částečný unikátní index invoices_one_sales_invoice_per_order) a jedna
// aktivní vazba na poskytovatele (invoice_provider_links_one_active) —
// opakované nebo souběžné volání nic nezdvojí. V ostrém režimu se navíc
// před vystavením vyhledá faktura s VS u poskytovatele (idoklad.ts).
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { invoiceProviderLinks, invoices, orderItems, orders, payments } from "@/lib/db/schema";
import { buildInvoiceDraft, type InvoiceDraft, type InvoiceProblem } from "./draft";
import { IDOKLAD_ISSUE_STEPS, IDOKLAD_PROVIDER, idokladRequests, type IdokladRequests } from "./idoklad";
import { invoiceNumberSeries, invoicingMode } from "./mode";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

/** Co je uložené v invoice_provider_links.request_payload (verze 1). */
export type DraftPayload = {
  version: 1;
  mode: "dry_run" | "live";
  modeReason: string;
  generatedAt: string;
  draft: InvoiceDraft;
  problems: InvoiceProblem[];
  idoklad: IdokladRequests;
  steps: readonly string[];
};

export type InvoiceActor = { type: "system"; name: string } | { type: "user"; userId: string; name: string };

export type PrepareResult =
  | { status: "created" | "regenerated"; problems: InvoiceProblem[] }
  | { status: "exists" | "skipped"; reason: string };

async function loadInputs(db: Db, orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      channel: orders.channel,
      orderNumber: orders.orderNumber,
      paymentVs: orders.paymentVs,
      paymentStatus: orders.paymentStatus,
      contactName: orders.contactName,
      contactEmail: orders.contactEmail,
      contactPhone: orders.contactPhone,
      recipientAddress: orders.recipientAddress,
      shippingMethodLabel: orders.shippingMethodLabel,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
      shippingKc: orders.shippingKc,
      totalKc: orders.totalKc,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return null;
  const items = await db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      unitPriceKc: orderItems.unitPriceKc,
      lineTotalKc: orderItems.lineTotalKc,
      sku: orderItems.skuSnapshot,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  const paymentRows = await db
    .select({
      id: payments.id,
      source: payments.source,
      externalId: payments.externalId,
      method: payments.method,
      direction: payments.direction,
      status: payments.status,
      amountHal: payments.amountHal,
      occurredAt: payments.occurredAt,
    })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.matchStatus, "matched")));
  return { order, items, payments: paymentRows.map((p) => ({ ...p, amountHal: Number(p.amountHal) })) };
}

export function activitySql(orderId: string, actor: InvoiceActor, kind: string, meta: Record<string, unknown>) {
  const userId = actor.type === "user" ? actor.userId : null;
  return sql`
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    VALUES (${orderId}, ${actor.type}, ${userId}, ${actor.name}, ${kind}, ${JSON.stringify(meta)}::jsonb)`;
}

function problemCounts(problems: InvoiceProblem[]) {
  return {
    errors: problems.filter((p) => p.severity === "error").length,
    live: problems.filter((p) => p.severity === "live").length,
    warnings: problems.filter((p) => p.severity === "warning").length,
  };
}

export type DraftInputs = NonNullable<Awaited<ReturnType<typeof loadInputs>>>;

/** Načte objednávku, položky a platby (pro návrh i ostré vystavení). */
export function loadDraftInputs(db: Db, orderId: string) {
  return loadInputs(db, orderId);
}

/** Návrh faktury + data pro iDoklad z aktuálních údajů objednávky (bez zápisu). */
export function buildDraftPayload(inputs: DraftInputs, env: Env = process.env) {
  const mode = invoicingMode(env);
  const seriesConfig = invoiceNumberSeries(env);
  const series = seriesConfig.id;
  const { draft, problems } = buildInvoiceDraft(inputs.order, inputs.items, inputs.payments, {
    numberSeriesId: series,
    // chybějící ID hlásí návrh sám; tady jen neplatná hodnota
    numberSeriesProblem: seriesConfig.problem?.code === "invalid_number_series" ? seriesConfig.problem : null,
    live: mode.mode === "live",
  });
  const payload: DraftPayload = {
    version: 1,
    mode: mode.mode,
    modeReason: mode.reason,
    generatedAt: new Date().toISOString(),
    draft,
    problems,
    idoklad: idokladRequests(draft),
    steps: IDOKLAD_ISSUE_STEPS,
  };
  return { mode, series, draft, problems, payload };
}

/**
 * Vytvoří návrh faktury k zaplacené e-shopové objednávce (nebo ho
 * s `regenerate` přepíše z aktuálních dat, dokud faktura není vystavená).
 * Idempotentní: druhé volání vrátí „exists“ a nic nezdvojí.
 */
export async function prepareInvoiceDraft(
  db: Db,
  orderId: string,
  options: { regenerate?: boolean; actor?: InvoiceActor } = {},
  env: Env = process.env
): Promise<PrepareResult> {
  const actor = options.actor ?? { type: "system", name: "Fakturace" };
  const inputs = await loadInputs(db, orderId);
  if (!inputs) return { status: "skipped", reason: "Objednávka nebyla nalezena." };
  const { order } = inputs;
  if (order.channel !== "eshop") return { status: "skipped", reason: "Návrh faktury se tvoří jen k e-shopovým objednávkám." };
  if (order.paymentStatus !== "paid") return { status: "skipped", reason: "Návrh faktury vznikne až po úplném zaplacení." };

  const { mode, series, draft, problems, payload } = buildDraftPayload(inputs, env);
  const payloadJson = JSON.stringify(payload);
  const linkState = mode.mode === "live" ? "pending" : "dry_run";
  const email = draft.customer.email;

  // Zákazník (osoba podle e-mailu) + faktura + vazba v jednom příkazu.
  const customerId = email ? sql`(SELECT id FROM cust)` : sql`NULL::uuid`;
  const customerCte = email
    ? sql`cust AS (
        INSERT INTO invoice_customers (kind, email_normalized, name)
        VALUES ('person', ${email}, ${draft.customer.name ?? email})
        ON CONFLICT (email_normalized) WHERE kind = 'person'
        DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
      ),`
    : sql``;
  const created = (
    await db.execute(sql`
      WITH ${customerCte}
      inv AS (
        INSERT INTO invoices (order_id, origin, document_type, doc_state, total_kc, payment_vs, customer_id)
        SELECT ${orderId}, 'eshop', 'invoice', 'draft', ${order.totalKc}, ${order.paymentVs}, ${customerId}
        ON CONFLICT (order_id) WHERE document_type = 'invoice' AND doc_state <> 'void' DO NOTHING
        RETURNING id
      )
      INSERT INTO invoice_provider_links (invoice_id, provider, state, number_series, request_payload)
      SELECT id, ${IDOKLAD_PROVIDER}, ${linkState}, ${series}, ${payloadJson}::jsonb FROM inv
      RETURNING invoice_id`)
  ).rows;

  const counts = problemCounts(problems);
  if (created.length > 0) {
    await db.execute(activitySql(orderId, actor, "invoice_draft_created", { mode: mode.mode, ...counts }));
    return { status: "created", problems };
  }

  if (!options.regenerate) return { status: "exists", reason: "Návrh faktury k objednávce už existuje." };

  // Přegenerovat jde jen návrh, ne vystavenou fakturu — a ne ve chvíli, kdy
  // vystavení právě běží (next_attempt_at v budoucnosti) nebo kdy faktura
  // v iDokladu už vznikla (external_id), jen se ještě nedokončila.
  const customer = email
    ? ((
        await db.execute(sql`
          INSERT INTO invoice_customers (kind, email_normalized, name)
          VALUES ('person', ${email}, ${draft.customer.name ?? email})
          ON CONFLICT (email_normalized) WHERE kind = 'person'
          DO UPDATE SET name = EXCLUDED.name, updated_at = now()
          RETURNING id`)
      ).rows[0] as { id: string })
    : null;
  const updated = (
    await db.execute(sql`
      WITH inv AS (
        UPDATE invoices SET total_kc = ${order.totalKc}, payment_vs = ${order.paymentVs},
          customer_id = ${customer?.id ?? null}::uuid, updated_at = now()
        WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'draft'
        RETURNING id
      )
      UPDATE invoice_provider_links l SET request_payload = ${payloadJson}::jsonb, number_series = ${series},
        state = CASE WHEN l.state = 'failed' THEN 'failed' ELSE ${linkState} END, updated_at = now()
      FROM inv
      WHERE l.invoice_id = inv.id AND l.provider = ${IDOKLAD_PROVIDER} AND l.state IN ('dry_run', 'pending', 'failed')
        AND l.external_id IS NULL AND (l.next_attempt_at IS NULL OR l.next_attempt_at < now())
      RETURNING l.id`)
  ).rows;
  if (updated.length === 0) {
    return {
      status: "exists",
      reason: "Faktura je už vystavená nebo se právě vystavuje — návrh nejde přepsat (vystavená se opravuje dobropisem).",
    };
  }
  await db.execute(activitySql(orderId, actor, "invoice_draft_regenerated", { mode: mode.mode, ...counts }));
  return { status: "regenerated", problems };
}

/**
 * Po úplném zaplacení: návrh faktury, ale NIKDY nevyhodí výjimku — platba
 * je už uložená. Chyba se zapíše do historie objednávky.
 */
export async function prepareInvoiceDraftSafe(
  db: Db,
  orderId: string,
  actor?: InvoiceActor,
  env: Env = process.env
): Promise<void> {
  try {
    await prepareInvoiceDraft(db, orderId, { actor }, env);
  } catch (error) {
    console.error("Fakturace: návrh faktury se nepodařilo vytvořit", orderId, error);
    const message = error instanceof Error ? error.message.slice(0, 300) : "neznámá chyba";
    await db
      .execute(activitySql(orderId, { type: "system", name: "Fakturace" }, "invoice_draft_failed", { error: message }))
      .catch(() => undefined);
  }
}

export type OrderInvoiceView = {
  invoiceId: string;
  docState: string;
  invoiceNumber: string | null;
  issuedAt: Date | null;
  totalKc: number;
  paymentVs: string | null;
  createdAt: Date;
  pdfSentAt: Date | null;
  link: {
    provider: string;
    state: string;
    numberSeries: string | null;
    externalId: string | null;
    externalNumber: string | null;
    lastError: string | null;
    attempts: number;
    issuedAt: Date | null;
    pdfFetchedAt: Date | null;
    /** vystavení právě běží (zámek do tohoto času) */
    busyUntil: Date | null;
    updatedAt: Date;
    payload: DraftPayload | null;
  } | null;
};

/** Prodejní faktura objednávky (ne zrušený pokus) a její aktivní vazba na poskytovatele. */
export async function loadOrderInvoice(db: Db, orderId: string): Promise<OrderInvoiceView | null> {
  const [invoice] = await db
    .select({
      id: invoices.id,
      docState: invoices.docState,
      invoiceNumber: invoices.invoiceNumber,
      issuedAt: invoices.issuedAt,
      totalKc: invoices.totalKc,
      paymentVs: invoices.paymentVs,
      createdAt: invoices.createdAt,
      pdfSentAt: invoices.pdfSentAt,
    })
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), eq(invoices.documentType, "invoice"), ne(invoices.docState, "void")))
    .limit(1);
  if (!invoice) return null;
  const [link] = await db
    .select()
    .from(invoiceProviderLinks)
    .where(and(eq(invoiceProviderLinks.invoiceId, invoice.id), ne(invoiceProviderLinks.state, "void")))
    .orderBy(desc(invoiceProviderLinks.createdAt))
    .limit(1);
  return {
    invoiceId: invoice.id,
    docState: invoice.docState,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    totalKc: invoice.totalKc,
    paymentVs: invoice.paymentVs,
    createdAt: invoice.createdAt,
    pdfSentAt: invoice.pdfSentAt,
    link: link
      ? {
          provider: link.provider,
          state: link.state,
          numberSeries: link.numberSeries,
          externalId: link.externalId,
          externalNumber: link.externalNumber,
          lastError: link.lastError,
          attempts: link.attempts,
          issuedAt: link.issuedAt,
          pdfFetchedAt: link.pdfFetchedAt,
          busyUntil: link.nextAttemptAt && link.nextAttemptAt > new Date() ? link.nextAttemptAt : null,
          updatedAt: link.updatedAt,
          payload: (link.requestPayload as DraftPayload | null) ?? null,
        }
      : null,
  };
}
