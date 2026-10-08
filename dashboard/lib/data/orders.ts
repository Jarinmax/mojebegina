// Security Phase 15 (Objednávky 1.0) — datová vrstva objednávek. Stejný
// princip jako companyNodes.ts: kontrola a dotaz jsou neoddělitelné, každá
// exportovaná funkce si sama volá requireOrderContext(). Gate je z
// orderAuth.ts, ne z adminAuth.ts — viz komentář tam. Rozšiřuje existující
// `orders`/`order_items`/`invoices` (Fáze 2.0), ne paralelní model — viz
// schema.ts komentář u `orders` pro zdůvodnění tří nezávislých rolí kolem
// "kdo objednal".
import "server-only";
import { randomUUID } from "crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, orderActivity, organizations, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireOrderAccess } from "./orderAuth";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import { buyerDisplayName, distinctOrganizationIds } from "./orderBuyer";
import { getAppOrigin } from "@/lib/appOrigin";
import { isTransferOverdue, transferDueAt, TRANSFER_PAYMENT_METHOD } from "@/lib/eshop/bankTransfer";
import { invoiceAndNotifyPaid, issueAndSendInvoice } from "@/lib/eshop/invoicing/afterPaid";
import { afterOrderCancelled, openRefunds, REFUND_RESOLVED, type CancellationOutcome } from "@/lib/eshop/cancellation";
import { invoicingMode, type InvoicingMode } from "@/lib/eshop/invoicing/mode";
import { runPreflightFromEnv, type PreflightResult } from "@/lib/eshop/invoicing/preflight";
import { isInvoiceIssuer } from "./invoiceAuth";
import {
  loadOrderPayments,
  parseAmountKcToHal,
  recordManualPayment,
  type OrderPaymentSummary,
} from "@/lib/eshop/payments";
import {
  loadOrderInvoice,
  prepareInvoiceDraft,
  type OrderInvoiceView,
  type PrepareResult,
} from "@/lib/eshop/invoicing/service";
import {
  validateCreateOrderInput,
  validateFulfillmentStatusInput,
  validatePaymentStatusInput,
  validateNoteInput,
  isPaymentOverdue,
  type CreateOrderInput,
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
  /** Stornovaná objednávka, za kterou Begina drží peníze — vrácení se řeší samostatně (lib/eshop/cancellation.ts). */
  refundRequired: boolean;
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
  const refunds = await openRefunds(db, orderIds);
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
      refundRequired: o.fulfillmentStatus === "cancelled" && refunds.has(o.id),
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
    },
    items,
    payments: row.channel === "eshop" ? await loadOrderPayments(db, orderId) : null,
    invoice: row.channel === "eshop" ? await loadOrderInvoice(db, orderId) : null,
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

export type StatusChangeResult =
  | {
      ok: true;
      /** false = uložený stav už byl požadovaný (nic se nezapsalo) */
      changed: boolean;
      /** skutečný stav objednávky v DB po uložení */
      status: string;
      /** jen u storna: vrácení peněz a e-mail zákazníkovi */
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

  // Storno: jen po SKUTEČNÉ změně (tento zápis vyhrál) — vrácení peněz
  // a e-mail zákazníkovi (nejvýš jednou na objednávku).
  const cancellation =
    validated.value === "cancelled"
      ? await afterOrderCancelled(db, orderId, { type: "user", userId: ctx.userId, name: ctx.name ?? ctx.email }, await getAppOrigin())
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
    .select({ paymentStatus: orders.paymentStatus, channel: orders.channel })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }
  // ESHOP 1.0 — u e-shopové objednávky se stav nepřepíná: „Zaplaceno“
  // se počítá z plateb (recordOrderPayment / Stripe, lib/eshop/payments.ts).
  if (current.channel === "eshop") {
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
      error:
        "Objednávka je stornovaná — platba se tu nezapisuje a zákazníkovi nic neodejde (ani faktura). Pokud zákazník přesto zaplatil, vraťte mu peníze a zapište to do poznámky.",
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
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: "Fakturu do iDokladu smí vystavit jen Jaroslav Viner (role ADMIN)." };
  const mode = invoicingMode();
  if (mode.mode !== "live") return { ok: false, error: mode.reason };
  const result = await issueAndSendInvoice(db, orderId, await getAppOrigin(), {
    type: "user",
    userId: ctx.userId,
    name: ctx.name ?? ctx.email,
  });
  switch (result.status) {
    case "issued":
      return {
        ok: true,
        message: `Faktura ${result.invoiceNumber} je vystavená a uhrazená${result.emailed ? " a odeslaná zákazníkovi" : ""}.`,
      };
    case "already_issued":
      return { ok: true, message: `Faktura ${result.invoiceNumber ?? ""} už je vystavená${result.emailed ? " — PDF odesláno zákazníkovi" : ""}.` };
    case "skipped":
      return { ok: false, error: result.reason };
    default:
      return { ok: false, error: result.error };
  }
}

/**
 * ESHOP 1.0 — ruční kontrola připojení iDokladu (jen čtení) se stejnými
 * Client Credentials, jaké použije ostré vystavení. Jen oprávněný uživatel.
 */
export async function runEshopIdokladPreflight(): Promise<
  { ok: true; result: PreflightResult } | { ok: false; error: string }
> {
  const ctx = await requireOrderContext();
  if (!isInvoiceIssuer(ctx)) return { ok: false, error: "Kontrolu iDokladu smí spustit jen Jaroslav Viner (role ADMIN)." };
  return runPreflightFromEnv();
}

/**
 * Storno — „Vrácení peněz vyřešeno“: uzavře označení k vrácení
 * (refund_required) záznamem do historie. Peníze vrací člověk mimo
 * MojeBegina (banka / Stripe / hotově); tady se jen potvrdí, že je hotovo.
 */
export async function resolveRefund(orderId: string, rawNote: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();
  const note = rawNote.trim().slice(0, 500);
  if (!(await openRefunds(db, [orderId])).has(orderId)) {
    return { ok: false, error: "Objednávka nečeká na vrácení peněz." };
  }
  await db.insert(orderActivity).values({
    orderId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: REFUND_RESOLVED,
    body: note || null,
    metadata: {},
  });
  return { ok: true };
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
