// Security Phase 15 (Objednávky 1.0) — datová vrstva objednávek. Stejný
// princip jako companyNodes.ts: kontrola a dotaz jsou neoddělitelné, každá
// exportovaná funkce si sama volá requireOrderContext(). Gate je z
// orderAuth.ts, ne z adminAuth.ts — viz komentář tam. Rozšiřuje existující
// `orders`/`order_items`/`invoices` (Fáze 2.0), ne paralelní model — viz
// schema.ts komentář u `orders` pro zdůvodnění tří nezávislých rolí kolem
// "kdo objednal".
import "server-only";
import { createHash, randomUUID } from "crypto";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, orderActivity, organizations, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireOrderAccess } from "./orderAuth";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import { buyerDisplayName, distinctOrganizationIds } from "./orderBuyer";
import { getAppOrigin } from "@/lib/appOrigin";
import { isTransferOverdue, transferDueAt, TRANSFER_PAYMENT_METHOD } from "@/lib/eshop/bankTransfer";
import { invoiceAndNotifyPaid, invoiceAndNotifyReplacement, issueAndSendInvoice } from "@/lib/eshop/invoicing/afterPaid";
import { reallyPaid } from "@/lib/eshop/invoicing/issue";
import { emailConfig, invoiceCopyRecipients, resolveRecipients } from "@/lib/eshop/email/config";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { validateCheckoutInput } from "@/lib/eshop/checkout";
import { parseOrderToken } from "@/lib/eshop/orderWrite";
import {
  shippingMethodsFor,
  shippingModeFromEnv,
  type ShippingContact,
  type ShippingMethod,
  type ShippingMode,
} from "@/lib/eshop/shipping";
import { OPERATOR } from "@/lib/eshop/infoPages";
import { isOrderable } from "@/lib/eshop/productRules";
import {
  afterOrderCancelled,
  createReplacementOrder,
  type ReplacementResult,
  moneyAlerts,
  normalizeTxId,
  recordPaymentAfterCancellation,
  recordRefund,
  requestRefund,
  transferPayments,
  type MoneyAlert,
  type CancellationOutcome,
  type TransferTarget,
} from "@/lib/eshop/cancellation";
import { ESHOP_SERIES, invoicingMode, type InvoicingMode } from "@/lib/eshop/invoicing/mode";
import { blockingProblems, isInvoiceableOrder, type DraftLine, type InvoiceDraft, type InvoiceProblem } from "@/lib/eshop/invoicing/draft";
import { runPreflightFromEnv, type PreflightResult } from "@/lib/eshop/invoicing/preflight";
import type { NumberingAuditResult } from "@/lib/eshop/invoicing/numberingAudit";
import { runIdokladRead } from "@/lib/idoklad-read/tools";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "./invoiceAuth";
import {
  loadOrderPayments,
  parseAmountKcToHal,
  recordManualPayment,
  type OrderPaymentSummary,
} from "@/lib/eshop/payments";
import {
  buildDraftPayload,
  loadDraftInputs,
  loadOrderInvoice,
  prepareInvoiceDraft,
  type OrderInvoiceView,
  type PrepareResult,
} from "@/lib/eshop/invoicing/service";
import {
  validateCreateOrderInput,
  validateImportOrderInput,
  validateFulfillmentStatusInput,
  validatePaymentStatusInput,
  validateNoteInput,
  isPaymentOverdue,
  type CreateOrderInput,
  type ImportOrderInput,
  type FulfillmentStatus,
  type PaymentStatus,
  type NoteInput,
} from "./orderValidation";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "./orderLabels";
import type { AuthContext } from "./types";

export async function requireOrderContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireOrderAccess(ctx);
}

// --- Pickery pro formulář ručního zadání ------------------------------

export type OrganizationOption = { id: string; name: string };

export async function listOrganizationsForOrderPicker(): Promise<OrganizationOption[]> {
  await requireOrderContext();

  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(organizations.name);
}

export type InternalStaffOption = { userId: string; name: string | null; email: string };

// MVP: ADMIN/EXECUTIVE/EMPLOYEE jsou kandidáti na "odpovědná osoba" — širší
// množina než requireOrderAccess (jen ADMIN/EXECUTIVE smí objednávky číst
// a upravovat), protože odpovědným řešitelem může být i EMPLOYEE, i když
// dnes ještě žádný účet tuhle roli nemá (viz companyNodeAuth.ts komentář
// o stejném MVP omezení).
export async function listInternalStaff(): Promise<InternalStaffOption[]> {
  await requireOrderContext();

  const roleRows = await db
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.systemRole, ["ADMIN", "EXECUTIVE", "EMPLOYEE"]));

  const userIds = roleRows.map((r) => r.userId);
  const profiles = await getUserProfiles(userIds);

  return userIds
    .map((userId) => {
      const profile = profiles.get(userId);
      return profile ? { userId, name: profile.name, email: profile.email } : null;
    })
    .filter((v): v is InternalStaffOption => v !== null)
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

// --- Seznam / souhrnné dlaždice ----------------------------------------

export type OrderCardData = {
  id: string;
  // Číslo pro zákazníka — NULL, dokud se nečísluje (ESHOP 1.0, krok 6b).
  orderNumber: number | null;
  // NULL = soukromý zákazník bez organizace (ESHOP 1.0, krok 7);
  // buyerOrganizationName je pak „Soukromý zákazník“ a kdo to je, říká contactName.
  buyerOrganizationId: string | null;
  buyerOrganizationName: string;
  contactName: string | null;
  itemsSummary: string;
  totalKc: number;
  orderedAt: Date;
  plannedDeliveryAt: Date | null;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentOverdue: boolean;
  responsibleUserId: string | null;
  responsibleName: string | null;
  /**
   * Peníze k vyřešení (lib/eshop/cancellation.ts): stornovaná objednávka
   * s drženými penězi („contact“ = kontaktovat zákazníka, „refund“ =
   * zákazník požaduje vrácení) nebo přeplatek k vrácení („overpaid“).
   * null = nic k řešení.
   */
  moneyAlert: MoneyAlert | null;
};

export type OrderCounts = {
  new: number;
  inProcess: number;
  readyForDelivery: number;
  awaitingPayment: number;
};

export type OrderList = { orders: OrderCardData[]; counts: OrderCounts };

async function buildOrderCards(
  orderRows: (typeof orders.$inferSelect)[]
): Promise<OrderCardData[]> {
  if (orderRows.length === 0) {
    return [];
  }

  const orgIds = distinctOrganizationIds(orderRows);
  const orgRows = orgIds.length
    ? await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, orgIds))
    : [];
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));

  const responsibleIds = [
    ...new Set(orderRows.map((o) => o.responsibleUserId).filter((v): v is string => v !== null)),
  ];
  const responsibleProfiles = await getUserProfiles(responsibleIds);

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length
    ? await db
        .select({ orderId: orderItems.orderId, name: orderItems.name, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const money = await moneyAlerts(
    db,
    orderRows.filter((o) => o.channel === "eshop").map((o) => o.id)
  );
  const itemsByOrder = new Map<string, string[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(`${item.quantity}× ${item.name}`);
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((o) => {
    const responsible = o.responsibleUserId ? responsibleProfiles.get(o.responsibleUserId) : null;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      buyerOrganizationId: o.buyerOrganizationId,
      buyerOrganizationName: buyerDisplayName(o.buyerOrganizationId, orgNameById),
      contactName: o.contactName,
      itemsSummary: (itemsByOrder.get(o.id) ?? []).join(", "),
      totalKc: o.totalKc,
      orderedAt: o.orderedAt,
      plannedDeliveryAt: o.plannedDeliveryAt,
      fulfillmentStatus: o.fulfillmentStatus as FulfillmentStatus,
      paymentStatus: o.paymentStatus as PaymentStatus,
      // Faktury (invoices.dueAt) objednávky v 1.0 nezakládají — isPaymentOverdue
      // zůstává hák pro ně. ESHOP 1.0: převod z e-shopu má splatnost 5 dní
      // od objednání (lib/eshop/bankTransfer.ts); po ní jen označení, nic
      // se automaticky neruší.
      paymentOverdue: isPaymentOverdue(o.paymentStatus as PaymentStatus, null) || isTransferOverdue(o),
      responsibleUserId: o.responsibleUserId,
      responsibleName: responsible?.name ?? responsible?.email ?? null,
      moneyAlert: money.get(o.id) ?? null,
    };
  });
}

export async function listOrders(): Promise<OrderList> {
  await requireOrderContext();

  const rows = await db.select().from(orders).orderBy(desc(orders.orderedAt));
  const cards = await buildOrderCards(rows);

  const counts: OrderCounts = { new: 0, inProcess: 0, readyForDelivery: 0, awaitingPayment: 0 };
  for (const card of cards) {
    if (card.fulfillmentStatus === "new") counts.new += 1;
    if (card.fulfillmentStatus === "confirmed" || card.fulfillmentStatus === "preparing") {
      counts.inProcess += 1;
    }
    if (card.fulfillmentStatus === "ready" || card.fulfillmentStatus === "out_for_delivery") {
      counts.readyForDelivery += 1;
    }
    if (card.paymentStatus === "unpaid" || card.paymentStatus === "invoiced") {
      counts.awaitingPayment += 1;
    }
  }

  return { orders: cards, counts };
}

// --- Detail --------------------------------------------------------------

export type OrderItemData = { name: string; quantity: number; unitPriceKc: number; lineTotalKc: number };

export type OrderActivityEntry = {
  id: string;
  kind: string;
  // "user" | "system" | "customer" — systém a zákazník nemají Neon Auth účet,
  // authorUserId je u nich NULL (ESHOP 1.0, krok 3).
  actorType: string;
  authorUserId: string | null;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type OrderDetail = {
  order: OrderCardData & {
    subtotalKc: number;
    shippingKc: number;
    contactPhone: string | null;
    contactEmail: string | null;
    enteredByUserId: string | null;
    enteredByName: string | null;
    note: string | null;
    // ESHOP 1.0 — údaje z pokladny e-shopu (u ručních objednávek NULL).
    channel: string;
    recipientAddress: string | null;
    shippingMethodLabel: string | null;
    paymentMethodLabel: string | null;
    customerNote: string | null;
    ageConfirmedAt: Date | null;
    /** Splatnost převodu z e-shopu; null u ostatních objednávek. */
    transferDueAt: Date | null;
    /** Platební identifikátor (VS 7xxxxxxx) e-shopové objednávky; null u ostatních. */
    paymentVs: string | null;
    /** Číslo objednávky ve WooCommerce (import z begina.cz); null u ostatních. */
    externalWooCommerceId: string | null;
    /** Platby a faktura se vedou v MojeBegina (e-shop, import z WooCommerce). */
    invoiceable: boolean;
  };
  items: OrderItemData[];
  activity: OrderActivityEntry[];
  /** Platby a stav úhrady — jen e-shopové objednávky (ostatní null). */
  payments: OrderPaymentSummary | null;
  /** Prodejní faktura / návrh faktury — jen e-shopové objednávky. */
  invoice: OrderInvoiceView | null;
};

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  await requireOrderContext();

  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) {
    return null;
  }

  const [card] = await buildOrderCards([row]);
  const invoiceable = isInvoiceableOrder(row);

  const enteredBy = row.enteredByUserId ? await getUserProfile(row.enteredByUserId) : null;

  const items = await db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      unitPriceKc: orderItems.unitPriceKc,
      lineTotalKc: orderItems.lineTotalKc,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const activityRows = await db
    .select()
    .from(orderActivity)
    .where(eq(orderActivity.orderId, orderId));
  activityRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    order: {
      ...card,
      subtotalKc: row.subtotalKc,
      shippingKc: row.shippingKc,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      enteredByUserId: row.enteredByUserId,
      enteredByName: enteredBy?.name ?? enteredBy?.email ?? null,
      note: row.note,
      channel: row.channel,
      recipientAddress: row.recipientAddress,
      shippingMethodLabel: row.shippingMethodLabel,
      paymentMethodLabel: row.paymentMethodLabel,
      customerNote: row.customerNote,
      ageConfirmedAt: row.ageConfirmedAt,
      transferDueAt:
        row.channel === "eshop" && row.paymentMethodCode === TRANSFER_PAYMENT_METHOD ? transferDueAt(row.orderedAt) : null,
      paymentVs: row.paymentVs,
      externalWooCommerceId: row.externalWooCommerceId,
      invoiceable,
    },
    items,
    payments: invoiceable ? await loadOrderPayments(db, orderId) : null,
    invoice: invoiceable ? await loadOrderInvoice(db, orderId) : null,
    activity: activityRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      actorType: r.actorType,
      authorUserId: r.authorUserId,
      authorName: r.authorName,
      body: r.body,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  };
}

// --- Zápisy ----------------------------------------------------------

export type OrderResult = { ok: true } | { ok: false; error: string };
export type CreateOrderResult = { ok: true; id: string } | { ok: false; error: string };

export async function createOrder(rawInput: CreateOrderInput): Promise<CreateOrderResult> {
  const ctx = await requireOrderContext();

  const validated = validateCreateOrderInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [buyer] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, value.buyerOrganizationId))
    .limit(1);
  if (!buyer) {
    return { ok: false, error: "Zákaznická organizace nebyla nalezena." };
  }

  const id = randomUUID();
  await db.batch([
    db.insert(orders).values({
      id,
      buyerOrganizationId: value.buyerOrganizationId,
      contactName: value.contactName,
      contactPhone: value.contactPhone,
      contactEmail: value.contactEmail,
      enteredByUserId: ctx.userId,
      subtotalKc: value.subtotalKc,
      shippingKc: value.shippingKc,
      totalKc: value.totalKc,
      paymentStatus: "unpaid",
      fulfillmentStatus: "new",
      plannedDeliveryAt: value.plannedDeliveryAt,
      note: value.note,
    }),
    db.insert(orderItems).values(
      value.items.map((item) => ({
        orderId: id,
        name: item.name,
        quantity: item.quantity,
        unitPriceKc: item.unitPriceKc,
        lineTotalKc: item.lineTotalKc,
      }))
    ),
    db.insert(orderActivity).values({
      orderId: id,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "created",
    }),
  ]);

  return { ok: true, id };
}

/** Kdo/co objednávku zapisuje — do order_activity (actor_type, author). */
export type ImportOrderActor =
  | { type: "user"; userId: string; name: string | null }
  | { type: "system"; name: string };

export type ImportOrderResult =
  | { ok: true; id: string; /** true = objednávka s tímhle externalWooCommerceId už existovala, nic nového se nezapsalo */ alreadyExisted: boolean }
  | { ok: false; error: string };

/**
 * Jediné zápisové jádro pro objednávky importované z WooCommerce — volá ho
 * webhook (lib/woocommerce/webhook.ts), MCP nástroj
 * (lib/agent/mcp/tools/orders.ts) i případný budoucí ruční formulář.
 * ZÁMĚRNĚ nevolá requireOrderContext() — každý volající se autorizuje
 * sám (webhook podpisem, MCP/web session+rolí) a předá `actor` pro audit
 * log; appka tady jen zapisuje, nerozhoduje, kdo smí.
 *
 * Idempotentní podle (provider, external_woocommerce_id) — druhé zavolání
 * se stejným ID NEVYTVOŘÍ duplikát, vrátí id už existující objednávky
 * (alreadyExisted: true). channel je vždy 'import' (nikdy 'eshop' — appka
 * si číslo VS nevymýšlí, 'eshop' navíc vyžaduje payment_vs, který tu
 * nemáme — orders_eshop_requires_vs). payment_status vždy 'unpaid': appka
 * stav platby nikdy nepřevezme automaticky z WooCommerce bez ověření
 * (zadání explicitně).
 */
export async function importExternalOrder(
  rawInput: ImportOrderInput,
  actor: ImportOrderActor
): Promise<ImportOrderResult> {
  const validated = validateImportOrderInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.externalWooCommerceId, value.externalWooCommerceId))
    .limit(1);
  if (existing.length > 0) {
    return { ok: true, id: existing[0].id, alreadyExisted: true };
  }

  const [buyer] = await db
    .select({ id: organizations.id, ico: organizations.ico })
    .from(organizations)
    .where(eq(organizations.id, value.buyerOrganizationId))
    .limit(1);
  if (!buyer) {
    return { ok: false, error: "Zákaznická organizace nebyla nalezena." };
  }
  if (value.expectedIco && buyer.ico !== value.expectedIco) {
    return {
      ok: false,
      error: `Organizace má IČO ${buyer.ico}, zdroj uvádí ${value.expectedIco} — zastavuji, aby se objednávka nepropojila s jinou firmou.`,
    };
  }

  const id = randomUUID();
  try {
    await db.batch([
      db.insert(orders).values({
        id,
        channel: "import",
        externalWooCommerceId: value.externalWooCommerceId,
        buyerOrganizationId: value.buyerOrganizationId,
        contactName: value.contactName,
        contactPhone: value.contactPhone,
        contactEmail: value.contactEmail,
        recipientName: value.recipientName,
        recipientAddress: value.recipientAddress,
        recipientPhone: value.recipientPhone,
        customerNote: value.customerNote,
        note: value.note,
        shippingMethodLabel: value.shippingMethodLabel,
        paymentMethodCode: value.paymentMethodCode,
        paymentMethodLabel: value.paymentMethodLabel,
        subtotalKc: value.subtotalKc,
        discountKc: value.discountKc,
        shippingKc: value.shippingKc,
        totalKc: value.totalKc,
        paymentStatus: "unpaid",
        fulfillmentStatus: "new",
        orderedAt: value.orderedAt,
      }),
      db.insert(orderItems).values(
        value.items.map((item) => ({
          orderId: id,
          name: item.name,
          quantity: item.quantity,
          unitPriceKc: item.unitPriceKc,
          lineTotalKc: item.lineTotalKc,
        }))
      ),
      db.insert(orderActivity).values(
        actor.type === "user"
          ? {
              orderId: id,
              actorType: "user",
              authorUserId: actor.userId,
              authorName: actor.name,
              kind: "created",
              body: `Importováno z WooCommerce #${value.externalWooCommerceId}.`,
            }
          : {
              orderId: id,
              actorType: "system",
              authorName: actor.name,
              kind: "created",
              body: `Importováno z WooCommerce #${value.externalWooCommerceId}.`,
            }
      ),
    ]);
  } catch (error) {
    // Souběh: dva souběžné pokusy (dvojí doručení webhooku, dvojí MCP
    // volání) obě prošly kontrolou výš dřív, než druhý zapsal — unique
    // index orders_external_woocommerce_id_key tohle zachytí jako chybu
    // zápisu, ne jako tichou duplicitu. Při NÍ (a jen při ní) dohledáme
    // už zapsanou objednávku a vrátíme ji jako alreadyExisted, přesně
    // jako běžnou (ne souběžnou) idempotenci výš.
    const isUniqueViolation = error instanceof Error && "code" in error && (error as { code?: string }).code === "23505";
    if (!isUniqueViolation) throw error;
    const [raceWinner] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.externalWooCommerceId, value.externalWooCommerceId))
      .limit(1);
    if (!raceWinner) throw error; // jiná kolize (ne na tomhle klíči) — nezakrývat
    return { ok: true, id: raceWinner.id, alreadyExisted: true };
  }

  return { ok: true, id, alreadyExisted: false };
}

export type StatusChangeResult =
  | {
      ok: true;
      /** false = uložený stav už byl požadovaný (nic se nezapsalo) */
      changed: boolean;
      /** skutečný stav objednávky v DB po uložení */
      status: string;
      /** jen u storna: držené peníze a e-mail zákazníkovi */
      cancellation?: CancellationOutcome;
    }
  | { ok: false; error: string };

/**
 * Atomická změna stavu: UPDATE proběhne jen tehdy, když má objednávka v DB
 * pořád stav `from` (z něj uživatel ve formuláři vycházel) — a záznam do
 * historie vznikne v tomtéž příkazu jen při skutečné změně. Dva souběžné
 * zápisy tedy nikdy nezmění stav dvakrát ani nezapíšou dvojí historii.
 */
async function changeOrderColumn(
  orderId: string,
  column: "fulfillment_status" | "payment_status",
  from: string,
  to: string,
  ctx: NonNullable<AuthContext>
): Promise<boolean> {
  const kind = column === "fulfillment_status" ? "fulfillment_status_changed" : "payment_status_changed";
  const set =
    column === "fulfillment_status"
      ? sql`fulfillment_status = ${to}`
      : sql`payment_status = ${to}, paid_at = ${to === "paid" ? sql`now()` : sql`NULL`}`;
  const result = await db.execute(sql`
    WITH upd AS (
      UPDATE orders SET ${set}
      WHERE id = ${orderId} AND ${sql.raw(column)} = ${from}
      RETURNING id
    )
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    SELECT id, 'user', ${ctx.userId}, ${ctx.name}, ${kind}, ${JSON.stringify({ from, to })}::jsonb FROM upd
    RETURNING id`);
  return result.rows.length > 0;
}

/** Proč se uložení neprovedlo, když se stav mezitím změnil (vychází z aktuálního stavu v DB). */
function conflictResult(current: string, wanted: string, labels: Readonly<Record<string, string>>, what: string): StatusChangeResult {
  if (current === wanted) return { ok: true, changed: false, status: current };
  return {
    ok: false,
    error: `${what} mezitím změnil někdo jiný na „${labels[current] ?? current}“. Formulář teď ukazuje aktuální stav — zkontrolujte ho a případně uložte znovu.`,
  };
}

export async function updateFulfillmentStatus(
  orderId: string,
  rawStatus: string,
  /** stav, který formulář ukazoval (ochrana proti souběžné změně); bez něj se vezme aktuální */
  rawExpected?: string
): Promise<StatusChangeResult> {
  const ctx = await requireOrderContext();

  const validated = validateFulfillmentStatusInput(rawStatus);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }
  const from = rawExpected ?? current.fulfillmentStatus;
  if (current.fulfillmentStatus !== from) {
    return conflictResult(current.fulfillmentStatus, validated.value, FULFILLMENT_LABELS, "Stav objednávky");
  }
  if (from === validated.value) {
    return { ok: true, changed: false, status: from };
  }

  if (!(await changeOrderColumn(orderId, "fulfillment_status", from, validated.value, ctx))) {
    const [now] = await db
      .select({ fulfillmentStatus: orders.fulfillmentStatus })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return conflictResult(now?.fulfillmentStatus ?? from, validated.value, FULFILLMENT_LABELS, "Stav objednávky");
  }

  // Storno: jen po SKUTEČNÉ změně (tento zápis vyhrál) — e-mail zákazníkovi
  // (nejvýš jednou na objednávku). Zaplacená objednávka se NEoznačuje
  // k vrácení: nejdřív kontaktovat zákazníka (lib/eshop/cancellation.ts).
  const cancellation =
    validated.value === "cancelled"
      ? await afterOrderCancelled(db, orderId, await getAppOrigin())
      : undefined;
  return { ok: true, changed: true, status: validated.value, ...(cancellation ? { cancellation } : {}) };
}

export async function updatePaymentStatus(
  orderId: string,
  rawStatus: string,
  /** stav, který formulář ukazoval (ochrana proti souběžné změně); bez něj se vezme aktuální */
  rawExpected?: string
): Promise<StatusChangeResult> {
  const ctx = await requireOrderContext();

  const validated = validatePaymentStatusInput(rawStatus);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ paymentStatus: orders.paymentStatus, channel: orders.channel, externalWooCommerceId: orders.externalWooCommerceId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }
  // ESHOP 1.0 — u e-shopové objednávky se stav nepřepíná: „Zaplaceno“
  // se počítá z plateb (recordOrderPayment / Stripe, lib/eshop/payments.ts).
  if (isInvoiceableOrder(current)) {
    return { ok: false, error: "U e-shopové objednávky se stav platby nepřepíná — zapište platbu." };
  }
  const from = rawExpected ?? current.paymentStatus;
  if (current.paymentStatus !== from) {
    return conflictResult(current.paymentStatus, validated.value, PAYMENT_LABELS, "Stav platby");
  }
  if (from === validated.value) {
    return { ok: true, changed: false, status: from };
  }

  if (!(await changeOrderColumn(orderId, "payment_status", from, validated.value, ctx))) {
    const [now] = await db
      .select({ paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return conflictResult(now?.paymentStatus ?? from, validated.value, PAYMENT_LABELS, "Stav platby");
  }
  return { ok: true, changed: true, status: validated.value };
}

export type RecordPaymentInput = {
  token: string;
  amountKc: string;
  date: string; // YYYY-MM-DD (den, kdy peníze přišly)
  method: string;
  note: string;
};

export type RecordPaymentResult =
  | { ok: true; recorded: boolean; settled: boolean }
  | { ok: false; error: string };

const MANUAL_METHODS = ["bank_transfer", "cash"] as const;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dnešní datum v Praze jako YYYY-MM-DD. */
function pragueToday(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
}

/**
 * ESHOP 1.0 — „Zapsat platbu“ k e-shopové objednávce (převod / hotovost).
 * Platba se zapíše do payments; Zaplaceno nastaví přepočet, až je uhrazená
 * celá částka — pak zákazník dostane „Platbu jsme přijali“ (nejvýš jednou).
 * Stejný token formuláře = žádná druhá platba.
 */
export async function recordOrderPayment(orderId: string, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const ctx = await requireOrderContext();

  if (!TOKEN_RE.test(input.token)) return { ok: false, error: "Formulář vypršel — obnovte prosím stránku." };
  const amountHal = parseAmountKcToHal(input.amountKc);
  if (amountHal === null) return { ok: false, error: "Zadejte částku v Kč (např. 379 nebo 379,50)." };
  const method = MANUAL_METHODS.find((m) => m === input.method);
  if (!method) return { ok: false, error: "Vyberte způsob platby." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T12:00:00Z`))) {
    return { ok: false, error: "Zadejte datum platby." };
  }
  if (input.date > pragueToday(new Date())) return { ok: false, error: "Datum platby nemůže být v budoucnosti." };
  const note = input.note.trim().slice(0, 500) || null;

  const [order] = await db
    .select({ channel: orders.channel, paymentVs: orders.paymentVs, fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.channel !== "eshop") return { ok: false, error: "Platby se zatím zapisují jen u e-shopových objednávek." };
  if (order.fulfillmentStatus === "cancelled") {
    return {
      ok: false,
      error: "Objednávka je stornovaná — platbu zapište přes „Zapsat platbu po stornu“ (s ID transakce).",
    };
  }

  const result = await recordManualPayment(db, {
    orderId,
    token: input.token.toLowerCase(),
    method,
    amountHal,
    // poledne UTC = tentýž den v Praze
    occurredAt: new Date(`${input.date}T12:00:00Z`),
    note,
    vs: order.paymentVs,
    user: { userId: ctx.userId, name: ctx.name ?? ctx.email },
  });

  // Zaplaceno teď → návrh faktury → (jen ostrý provoz) vystavení v iDokladu
  // → „Platbu jsme přijali“ s PDF (nejvýš jednou, lib/eshop/email/orderEmails.ts).
  // Nic z toho nevyhazuje výjimku — platba je už uložená.
  if (result.settled) {
    await invoiceAndNotifyPaid(db, orderId, "payment_marked_paid", await getAppOrigin(), {
      type: "user",
      userId: ctx.userId,
      name: ctx.name ?? ctx.email,
    });
  }
  return { ok: true, ...result };
}

/**
 * ESHOP 1.0 — „Vytvořit / Přegenerovat návrh faktury“ z MojeBegina (režim
 * návrhu: do iDokladu se nic neodesílá). Vystavenou fakturu nepřepíše.
 */
export async function prepareOrderInvoiceDraft(
  orderId: string,
  regenerate: boolean
): Promise<{ ok: true; result: PrepareResult } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  const [order] = await db
    .select({ fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (order?.fulfillmentStatus === "cancelled") return { ok: false, error: "Objednávka je stornovaná — faktura se nepřipravuje." };
  const result = await prepareInvoiceDraft(db, orderId, {
    regenerate,
    actor: { type: "user", userId: ctx.userId, name: ctx.name ?? ctx.email },
  });
  if (result.status === "skipped") return { ok: false, error: result.reason };
  return { ok: true, result };
}

export type InvoiceIssueAccess = {
  mode: InvoicingMode;
  /** přihlášený uživatel smí vystavovat (invoiceAuth.ts) */
  issuer: boolean;
  /** tlačítko „Vystavit fakturu“ má smysl ukázat (ostrý provoz + oprávnění) */
  canIssue: boolean;
};

/** Pro detail objednávky: režim fakturace a zda smí tento uživatel vystavit. */
export async function getInvoiceIssueAccess(): Promise<InvoiceIssueAccess> {
  const ctx = await requireOrderContext();
  const mode = invoicingMode();
  const issuer = isInvoiceIssuer(ctx);
  return { mode, issuer, canIssue: issuer && mode.mode === "live" };
}

export type IssueOrderInvoiceOutcome =
  | {
      ok: true;
      status: "issued" | "already_issued";
      invoiceNumber: string | null;
      /** PDF právě odešlo zákazníkovi */
      emailed: boolean;
      /** PDF už zákazník dostal dřív (pdf_sent_at) */
      pdfSentBefore: boolean;
      /** PDF právě odesílá jiný souběžný požadavek */
      emailInProgress: boolean;
      message: string;
    }
  | { ok: false; error: string };

/**
 * ESHOP 1.0 — „Vystavit fakturu v iDokladu“ z MojeBegina: režim „manual“
 * (jediná cesta k vystavení), v „on“ opakování po chybě. Tentýž motor jako
 * automat (issue.ts) včetně kontroly iDokladu a idempotence. Jen oprávněný
 * uživatel a jen v ostrém provozu — na Preview vrátí důvod a do iDokladu
 * nic nepošle (ani s IDOKLAD_INVOICING_ENABLED=manual/on).
 */
export async function issueOrderInvoice(
  orderId: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const result = await issueOrderInvoiceDetailed(orderId);
  return result.ok ? { ok: true, message: result.message } : result;
}

/**
 * Stejné vystavení jako tlačítko v detailu objednávky (issueOrderInvoice),
 * jen se strukturovaným výsledkem — pro asistenta přes MCP. S
 * `expectedFingerprint` se navíc vystaví jen tehdy, když návrh z aktuálních
 * dat objednávky je PŘESNĚ ten, který uživatel viděl v náhledu
 * (previewOrderInvoice); jinak stop bez požadavku do iDokladu.
 */
export async function issueOrderInvoiceDetailed(
  orderId: string,
  options: { expectedFingerprint?: string } = {}
): Promise<IssueOrderInvoiceOutcome> {
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: `Fakturu do iDokladu smí vystavit jen ${INVOICE_ISSUER_NAMES}.` };
  const mode = invoicingMode();
  if (mode.mode !== "live") return { ok: false, error: mode.reason };
  const before = await loadOrderInvoice(db, orderId);
  if (options.expectedFingerprint !== undefined) {
    // asistent: při nejasném stavu nic nezkoušet, jen ohlásit k ruční kontrole
    const unclear = unclearInvoiceState(before);
    if (unclear) return { ok: false, error: unclear };
  }
  if (options.expectedFingerprint !== undefined && before?.docState !== "issued") {
    const inputs = await loadDraftInputs(db, orderId);
    if (!inputs) return { ok: false, error: "Objednávka nebyla nalezena." };
    if (invoiceDraftFingerprint(buildDraftPayload(inputs).draft) !== options.expectedFingerprint) {
      return {
        ok: false,
        error: "Údaje faktury se od zobrazeného náhledu změnily (objednávka, platba nebo datum vystavení). Nic se nevystavilo — zobrazte náhled znovu a nechte ho potvrdit.",
      };
    }
  }
  const result = await issueAndSendInvoice(db, orderId, await getAppOrigin(), {
    type: "user",
    userId: ctx.userId,
    name: ctx.name ?? ctx.email,
  });
  const pdfSentBefore = before?.pdfSentAt != null;
  switch (result.status) {
    case "issued":
      return {
        ok: true,
        status: "issued",
        invoiceNumber: result.invoiceNumber,
        emailed: result.emailed === true,
        pdfSentBefore: false,
        emailInProgress: result.emailInProgress === true,
        message: `Faktura ${result.invoiceNumber} je vystavená a uhrazená${result.emailed ? " a odeslaná zákazníkovi" : ""}.`,
      };
    case "already_issued":
      return {
        ok: true,
        status: "already_issued",
        invoiceNumber: result.invoiceNumber,
        emailed: result.emailed === true,
        pdfSentBefore,
        emailInProgress: result.emailInProgress === true,
        message: `Faktura ${result.invoiceNumber ?? ""} už je vystavená${result.emailed ? " — PDF odesláno zákazníkovi" : ""}.`,
      };
    case "skipped":
      return { ok: false, error: result.reason };
    default:
      return { ok: false, error: result.error };
  }
}

/**
 * Stav, ve kterém asistent fakturu nevystavuje ani neposílá: jiný pokus
 * právě běží, předchozí pokus nedoběhl, nebo v iDokladu už doklad vznikl,
 * ale vystavení skončilo chybou. To musí zkontrolovat člověk v detailu
 * objednávky (tlačítko tam pokus bezpečně naváže).
 */
export function unclearInvoiceState(invoice: OrderInvoiceView | null): string | null {
  const link = invoice?.link;
  if (!invoice || !link) return null;
  if (link.busyUntil) {
    return "Faktura této objednávky se právě vystavuje nebo odesílá (jiný požadavek). Nic dalšího se nespustilo — za pár minut zobrazte náhled znovu.";
  }
  if (invoice.docState === "issued") return null;
  // „pending“ bez pokusu = jen čeká na vystavení (ruční režim); s pokusem
  // (attempts > 0) a bez zámku = pokus spadl uprostřed
  if (link.state === "pending" && (link.attempts > 0 || link.externalId)) {
    return "Předchozí pokus o vystavení nedoběhl. Nic se nespustilo — zkontrolujte stav v iDokladu a v detailu objednávky v MojeBegina.";
  }
  if (link.state === "failed" && link.externalId) {
    return `V iDokladu už k objednávce existuje doklad (ID ${link.externalId}), ale vystavení skončilo chybou: ${link.lastError ?? "bez popisu"}. Nic se nespustilo — nutná ruční kontrola v detailu objednávky.`;
  }
  return null;
}

/** Otisk návrhu faktury — náhled a vystavení musí mít stejný (žádná změna mezi tím). */
export function invoiceDraftFingerprint(draft: InvoiceDraft): string {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

export type InvoicePreview = {
  orderId: string;
  orderNumber: number | null;
  externalWooCommerceId: string | null;
  orderStatus: { payment: string; fulfillment: string; paidForInvoice: boolean; notPaidReason: string | null };
  mode: { live: boolean; trigger: string; reason: string };
  numberSeries: { id: string | null; expected: string; name: string };
  draft: {
    customer: InvoiceDraft["customer"];
    vs: string | null;
    orderReference: string | null;
    issueDate: string | null;
    dueDate: string | null;
    paidDate: string | null;
    paymentMethod: string | null;
    lines: DraftLine[];
    totalKc: number;
    currency: string;
    vatMode: string;
    note: string;
  };
  blocking: InvoiceProblem[];
  warnings: InvoiceProblem[];
  existing: {
    docState: string;
    invoiceNumber: string | null;
    pdfSent: boolean;
    providerState: string | null;
    externalId: string | null;
    lastError: string | null;
    busy: boolean;
    /** nejasný stav (unclearInvoiceState) — asistent nic nevystaví */
    unclear: string | null;
  } | null;
  email: { enabled: boolean; to: string[]; withheld: string[]; bcc: string[] };
  fingerprint: string;
};

export type InvoicePreviewLookup = { orderId: string } | { orderNumber: string };

/** Objednávka podle id, čísla v MojeBegina nebo čísla z WooCommerce (import). */
async function findOrderForInvoice(
  lookup: InvoicePreviewLookup
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  if ("orderId" in lookup) return { ok: true, orderId: lookup.orderId };
  const number = lookup.orderNumber;
  const byWoo = eq(orders.externalWooCommerceId, number);
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(/^\d{1,9}$/.test(number) ? or(eq(orders.orderNumber, Number(number)), byWoo) : byWoo)
    .limit(3);
  if (rows.length === 0) return { ok: false, error: `Objednávka ${number} nebyla nalezena.` };
  if (rows.length > 1) return { ok: false, error: `Číslu ${number} odpovídá víc objednávek — použijte order_id.` };
  return { ok: true, orderId: rows[0].id };
}

/**
 * Náhled faktury k objednávce (JEN ČTENÍ: nic se neukládá, do iDokladu nic):
 * stejný návrh, jaký by z aktuálních dat sestavilo vystavení (issue.ts),
 * jeho blokující problémy, stav dosavadní faktury a komu by PDF odešlo.
 * Jen pro vystavovatele faktur (invoiceAuth.ts).
 */
export async function previewOrderInvoice(
  lookup: InvoicePreviewLookup
): Promise<{ ok: true; preview: InvoicePreview } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: `Náhled faktury smí zobrazit jen ${INVOICE_ISSUER_NAMES}.` };
  const found = await findOrderForInvoice(lookup);
  if (!found.ok) return found;
  const inputs = await loadDraftInputs(db, found.orderId);
  if (!inputs) return { ok: false, error: "Objednávka nebyla nalezena." };
  const { order } = inputs;
  if (!isInvoiceableOrder(order)) return { ok: false, error: "K této objednávce MojeBegina fakturu nevystavuje (jen e-shopové a importované objednávky)." };

  const { mode, series, draft, problems } = buildDraftPayload(inputs);
  const notPaidReason = await reallyPaid(db, found.orderId);
  const existing = await loadOrderInvoice(db, found.orderId);
  const config = emailConfig();
  const resolved = config && order.contactEmail ? resolveRecipients([order.contactEmail], config) : { to: [], withheld: [] };
  const [status] = await db
    .select({ paymentStatus: orders.paymentStatus, fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, found.orderId))
    .limit(1);

  return {
    ok: true,
    preview: {
      orderId: found.orderId,
      orderNumber: order.orderNumber,
      externalWooCommerceId: order.externalWooCommerceId,
      orderStatus: {
        payment: status.paymentStatus,
        fulfillment: status.fulfillmentStatus,
        paidForInvoice: notPaidReason === null,
        notPaidReason,
      },
      mode: { live: mode.mode === "live", trigger: mode.trigger, reason: mode.reason },
      numberSeries: { id: series, expected: ESHOP_SERIES.id, name: ESHOP_SERIES.name },
      draft: {
        customer: draft.customer,
        vs: draft.vs,
        orderReference: draft.orderReference,
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        paidDate: draft.paidDate ?? null,
        paymentMethod: draft.paymentMethod,
        lines: draft.lines,
        totalKc: draft.totalKc,
        currency: draft.currency,
        vatMode: draft.vatMode,
        note: draft.note,
      },
      blocking: blockingProblems(problems, mode.mode),
      warnings: problems.filter((p) => !blockingProblems(problems, mode.mode).includes(p)),
      existing: existing
        ? {
            docState: existing.docState,
            invoiceNumber: existing.invoiceNumber,
            pdfSent: existing.pdfSentAt !== null,
            providerState: existing.link?.state ?? null,
            externalId: existing.link?.externalId ?? null,
            lastError: existing.link?.lastError ?? null,
            busy: existing.link?.busyUntil != null,
            unclear: unclearInvoiceState(existing),
          }
        : null,
      email: {
        enabled: config !== null,
        to: resolved.to,
        withheld: resolved.withheld,
        bcc: config ? invoiceCopyRecipients(config, resolved.to) : [],
      },
      fingerprint: invoiceDraftFingerprint(draft),
    },
  };
}

/**
 * ESHOP 1.0 — ruční kontrola připojení iDokladu (jen čtení) se stejnými
 * Client Credentials, jaké použije ostré vystavení. Jen oprávněný uživatel.
 */
export async function runEshopIdokladPreflight(): Promise<
  { ok: true; result: PreflightResult } | { ok: false; error: string }
> {
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: `Kontrolu iDokladu smí spustit jen ${INVOICE_ISSUER_NAMES}.` };
  return runPreflightFromEnv();
}

/** Audit číslování vydaných faktur v iDokladu — jen čtení, nic se nezapisuje ani neukládá. */
export async function runEshopNumberingAudit(input: { year: string; numbers: string[] }): Promise<
  { ok: true; result: NumberingAuditResult } | { ok: false; error: string }
> {
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: `Audit číslování smí spustit jen ${INVOICE_ISSUER_NAMES}.` };
  if (!/^20\d{2}$/.test(input.year)) return { ok: false, error: "Zadejte rok (např. 2026)." };
  // společné čtení iDokladu (lib/idoklad-read): oprávnění, limit a auditní záznam jako u asistentů
  const outcome = await runIdokladRead("idoklad_numbering_audit", { year: input.year, numbers: input.numbers }, "ui");
  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, result: { ...(outcome.data as unknown as NumberingAuditResult), requests: [] } };
}

// --- Peníze stornované objednávky (lib/eshop/cancellation.ts) ---------

export type PostCancelInput = { txId: string; amountKc: string; date: string; method: string; note: string };
export type ConsentInput = { consent: boolean; note: string };

/** Společná validace formuláře platby / vrácení: ID transakce, částka, datum. */
function parseMoneyForm(
  input: PostCancelInput,
  methods: readonly string[]
): { ok: true; txId: string; amountHal: number; occurredAt: Date; method: string; note: string | null } | { ok: false; error: string } {
  const txId = normalizeTxId(input.txId);
  if (!txId) return { ok: false, error: "Zadejte ID transakce (z výpisu banky, Stripe nebo pokladny)." };
  const amountHal = parseAmountKcToHal(input.amountKc);
  if (amountHal === null) return { ok: false, error: "Zadejte částku v Kč (např. 379 nebo 379,50)." };
  const method = methods.find((m) => m === input.method);
  if (!method) return { ok: false, error: "Vyberte způsob." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T12:00:00Z`))) {
    return { ok: false, error: "Zadejte datum." };
  }
  if (input.date > pragueToday(new Date())) return { ok: false, error: "Datum nemůže být v budoucnosti." };
  // poledne UTC = tentýž den v Praze
  return { ok: true, txId, amountHal, occurredAt: new Date(`${input.date}T12:00:00Z`), method, note: input.note.trim().slice(0, 500) || null };
}

/** Souhlas zákazníka: zaškrtnutí + poznámka, jak a kdy souhlasil. */
function parseConsent(input: ConsentInput): { ok: true; note: string } | { ok: false; error: string } {
  const note = input.note.trim().slice(0, 500);
  if (!input.consent || note.length < 3) {
    return { ok: false, error: "Potvrďte souhlas zákazníka a poznamenejte, jak a kdy souhlasil (např. „e-mail 9. 10.“)." };
  }
  return { ok: true, note };
}

function actorOf(ctx: NonNullable<AuthContext>) {
  return { userId: ctx.userId, name: ctx.name ?? ctx.email };
}

/** Platba přijatá po stornu (s ID transakce) — objednávka zůstává Stornovaná. */
export async function recordOrderPaymentAfterCancellation(
  orderId: string,
  input: PostCancelInput
): Promise<{ ok: true; recorded: boolean } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  const form = parseMoneyForm(input, MANUAL_METHODS);
  if (!form.ok) return form;
  return recordPaymentAfterCancellation(db, {
    orderId,
    txId: form.txId,
    method: form.method as (typeof MANUAL_METHODS)[number],
    amountHal: form.amountHal,
    occurredAt: form.occurredAt,
    note: form.note,
    user: actorOf(ctx),
  });
}

/** Zákazník požaduje vrácení peněz (jeho rozhodnutí). */
export async function requestOrderRefund(
  orderId: string,
  input: ConsentInput
): Promise<{ ok: true; requested: boolean; heldHal: number } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  const consent = parseConsent(input);
  if (!consent.ok) return consent;
  return requestRefund(db, { orderId, note: consent.note, user: actorOf(ctx) });
}

const REFUND_METHODS = ["bank_transfer", "cash", "card"] as const;

/** Skutečně vrácené peníze (s ID transakce vrácení). */
export async function recordOrderRefund(
  orderId: string,
  input: PostCancelInput
): Promise<{ ok: true; recorded: boolean; remainingHal: number } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  const form = parseMoneyForm(input, REFUND_METHODS);
  if (!form.ok) return form;
  return recordRefund(db, {
    orderId,
    txId: form.txId,
    method: form.method as (typeof REFUND_METHODS)[number],
    amountHal: form.amountHal,
    occurredAt: form.occurredAt,
    note: form.note,
    user: actorOf(ctx),
  });
}

/**
 * Zákazník souhlasí s jiným produktem → převod platby na jeho e-shopovou
 * objednávku. Při úplné úhradě cílové objednávky běží běžný postup
 * (návrh / vystavení faktury podle režimu, „Platbu jsme přijali“).
 */
export async function transferOrderPayment(
  orderId: string,
  input: ConsentInput & { target: string; allowDifferentCustomer: boolean }
): Promise<{ ok: true; movedHal: number; settled: boolean; target: TransferTarget } | { ok: false; error: string }> {
  const ctx = await requireOrderContext();
  const consent = parseConsent(input);
  if (!consent.ok) return consent;
  const result = await transferPayments(db, {
    fromOrderId: orderId,
    target: input.target,
    note: consent.note,
    allowDifferentCustomer: input.allowDifferentCustomer,
    user: actorOf(ctx),
  });
  if (result.ok && result.settled) {
    await invoiceAndNotifyPaid(db, result.target.id, "payment_marked_paid", await getAppOrigin(), {
      type: "user",
      userId: ctx.userId,
      name: ctx.name ?? ctx.email,
    });
  }
  return result;
}

// --- Náhradní objednávka ze stornované (lib/eshop/cancellation.ts) -----

export type ReplacementProductOption = {
  sku: string;
  label: string;
  priceKc: number;
  ageRestricted: boolean;
  /** hmotnost balení (doprava podle hmotnosti), null = neznámá */
  weightGrams: number | null;
};
export type ReplacementShippingOption = ShippingMethod;

/** Nabídka pro formulář náhradní objednávky: aktivní balení z katalogu a doprava. */
export async function listReplacementOptions(): Promise<{
  products: ReplacementProductOption[];
  shipping: ReplacementShippingOption[];
  shippingMode: ShippingMode;
  shippingContact: ShippingContact;
}> {
  await requireOrderContext();
  const index = await getCatalogIndex();
  // Neověřené alergeny → produkt nenabízet (server to stejně odmítne v priceCart).
  const products = index.catalog.products.filter(isOrderable).flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      label: `${product.name}${variant.label ? ` — ${variant.label}` : ""}`,
      priceKc: variant.priceKc,
      ageRestricted: product.isAgeRestricted,
      weightGrams: variant.weightGrams,
    }))
  );
  const shippingMode = shippingModeFromEnv();
  return {
    products,
    shipping: shippingMethodsFor(shippingMode),
    shippingMode,
    shippingContact: { email: OPERATOR.email, phone: OPERATOR.phone },
  };
}

export type ReplacementInput = ConsentInput & {
  /** token formuláře = id nové objednávky (dvojklik nevytvoří druhou) */
  token: string;
  /** JSON [{sku, quantity}] */
  cart: string;
  shippingMethodId: string;
  street: string;
  city: string;
  zip: string;
  /** zákazník znovu potvrdil věk 18+ (povinné, když je v objednávce alkohol) */
  ageConfirmed: boolean;
};

/**
 * Náhradní objednávka: údaje zákazníka z původní objednávky, nové produkty
 * a doprava, souhlas zákazníka; tatáž kontrola jako v pokladně (ceny,
 * doprava, adresa, 18+). Platba se převede v téže transakci; zákazník
 * dostane jen e-mail „Náhradní objednávka“ (bez výzvy k úhradě celé částky).
 */
export async function createReplacementFromCancelled(
  orderId: string,
  input: ReplacementInput
): Promise<
  | ({ ok: true } & ReplacementResult & { email: "sent" | "duplicate" | "failed" | "no-recipient" | "off" })
  | { ok: false; error: string }
> {
  const ctx = await requireOrderContext();
  const consent = parseConsent(input);
  if (!consent.ok) return consent;
  const newOrderId = parseOrderToken(input.token);
  if (!newOrderId) return { ok: false, error: "Formulář vypršel — obnovte prosím stránku." };
  const [original] = await db
    .select({ name: orders.contactName, email: orders.contactEmail, phone: orders.contactPhone })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!original) return { ok: false, error: "Objednávka nebyla nalezena." };
  const validated = validateCheckoutInput(
    {
      cart: input.cart,
      name: original.name ?? "",
      email: original.email ?? "",
      phone: original.phone ?? "",
      shippingMethodId: input.shippingMethodId,
      // doplatek (je-li) jen převodem — QR na zbytek; karta by účtovala celou částku
      paymentMethodId: "prevod",
      street: input.street,
      city: input.city,
      zip: input.zip,
      note: "",
      // obchodní podmínky: přijaté u původní objednávky (createReplacementOrder)
      termsAccepted: true,
      ageConfirmed: input.ageConfirmed,
    },
    await getCatalogIndex(),
    { shippingMode: shippingModeFromEnv() }
  );
  if (!validated.ok) {
    return {
      ok: false,
      error: /18/.test(validated.error)
        ? "Objednávka obsahuje alkohol — zákazník musí znovu potvrdit, že je starší 18 let."
        : validated.error,
    };
  }
  const actor = actorOf(ctx);
  const created = await createReplacementOrder(db, {
    fromOrderId: orderId,
    newOrderId,
    value: validated.value,
    consentNote: consent.note,
    user: actor,
  });
  if (!created.ok) return created;
  if (created.alreadyCreated) return { ...created, email: "duplicate" };
  const { emails } = await invoiceAndNotifyReplacement(
    db,
    created.orderId,
    await getAppOrigin(),
    { type: "user", ...actor },
    { settled: created.settled, fromReference: created.fromReference, receivedHal: created.movedHal }
  );
  const email = emails.find((e) => e.template === "customer_replacement")?.status ?? "off";
  return { ...created, email };
}

export async function assignResponsible(orderId: string, responsibleUserId: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const responsible = await getUserProfile(responsibleUserId);
  if (!responsible) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db.update(orders).set({ responsibleUserId }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "responsible_assigned",
      metadata: { responsibleUserId, responsibleName: responsible.name ?? responsible.email },
    }),
  ]);

  return { ok: true };
}

export async function unassignResponsible(orderId: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db.update(orders).set({ responsibleUserId: null }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "responsible_assigned",
      metadata: { responsibleUserId: null },
    }),
  ]);

  return { ok: true };
}

export async function updateOrderNote(orderId: string, rawInput: NoteInput): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const validated = validateNoteInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db
      .update(orders)
      .set({ note: validated.value || null })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "note_added",
      body: validated.value || null,
    }),
  ]);

  return { ok: true };
}
