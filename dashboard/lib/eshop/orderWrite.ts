// ESHOP 1.0 — uložení objednávky z pokladny do Objednávek MojeBegina.
//
// Jeden zápis = jedna transakce (neon-http `db.batch`): objednávka
// (channel "eshop", soukromý zákazník bez organizace, e-mail povinný),
// položky s vazbou na balení + snapshot SKU/názvu/ceny a systémový záznam
// "E-shop" v historii. Stav jako u nové ruční objednávky: fulfillment
// "new", platba "unpaid". Číslo objednávky přidělí databáze (výchozí
// hodnota sloupce ze sekvence order_number_seq), jakmile je na daném
// prostředí zapnuté číslování (skript 06b); do té doby zůstává NULL.
// Platební identifikátor (VS, 7xxxxxxx) přidělí databáze ze řady
// payment_vs_seq v témže INSERTu (PAYMENT_VS_SQL) — je neměnný a QR,
// stránka objednávky i e-maily ho jen čtou (docs/eshop-payments).
//
// Zapisuje se JEN mimo Vercel Production (Preview, lokální vývoj), dokud
// se v Production výslovně nenastaví ESHOP_ORDER_WRITE=on — viz
// isOrderWriteEnabled.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { orderActivity, orderItems, orders, productVariants } from "@/lib/db/schema";
import type { CheckoutValue } from "./checkout";

export const ESHOP_ACTOR_NAME = "E-shop";

/** VS z řady payment_vs_seq: 8 číslic začínajících 7 (70000001, 70000002, …). */
export const PAYMENT_VS_SQL = sql`'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`;

type Db = NeonHttpDatabase<typeof schema>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Token z formuláře = id objednávky; dvojí odeslání tak nevytvoří dvě objednávky. */
export function parseOrderToken(raw: string): string | null {
  const token = raw.trim().toLowerCase();
  return UUID_PATTERN.test(token) ? token : null;
}

export function isOrderWriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production" || env.ESHOP_ORDER_WRITE === "on";
}

export type VariantRef = { id: string; priceKc: number };

type OrderRows = {
  order: PgInsertValue<typeof orders>; // paymentVs = SQL (PAYMENT_VS_SQL)
  items: (typeof orderItems.$inferInsert)[];
  activity: typeof orderActivity.$inferInsert;
};

/** Čisté sestavení řádků — žádné I/O, testované zvlášť. */
export function buildEshopOrderRows(
  orderId: string,
  value: CheckoutValue,
  variantsBySku: Map<string, VariantRef>,
  now: Date
): { ok: true; rows: OrderRows } | { ok: false; error: string } {
  const { pricedCart } = value;
  const items: OrderRows["items"] = [];
  for (const line of pricedCart.lines) {
    const variant = variantsBySku.get(line.sku);
    if (!variant) {
      return { ok: false, error: "Košík obsahuje produkt, který už nenabízíme. Obnovte prosím košík." };
    }
    if (variant.priceKc !== line.unitPriceKc) {
      return { ok: false, error: "Mezitím se změnila cena. Obnovte prosím stránku a zkontrolujte košík." };
    }
    items.push({
      orderId,
      productVariantId: variant.id,
      skuSnapshot: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPriceKc: line.unitPriceKc,
      lineTotalKc: line.lineTotalKc,
    });
  }

  const address = value.address ? `${value.address.street}, ${value.address.zip} ${value.address.city}` : null;

  return {
    ok: true,
    rows: {
      order: {
        id: orderId,
        channel: "eshop",
        buyerOrganizationId: null,
        contactName: value.name,
        contactPhone: value.phone,
        contactEmail: value.email,
        recipientName: value.name,
        recipientPhone: value.phone,
        recipientAddress: address,
        subtotalKc: pricedCart.subtotalKc,
        discountKc: 0,
        shippingKc: pricedCart.shippingKc,
        totalKc: pricedCart.totalKc,
        paymentStatus: "unpaid",
        fulfillmentStatus: "new",
        customerNote: value.note,
        shippingMethodCode: pricedCart.shipping.id,
        shippingMethodLabel: pricedCart.shipping.label,
        paymentMethodCode: value.payment.id,
        paymentMethodLabel: value.payment.label,
        ageConfirmedAt: pricedCart.containsAgeRestricted ? now : null,
        termsAcceptedAt: now,
        orderedAt: now,
        paymentVs: PAYMENT_VS_SQL,
      },
      items,
      activity: {
        orderId,
        actorType: "system",
        authorUserId: null,
        authorName: ESHOP_ACTOR_NAME,
        kind: "created",
        metadata: { channel: "eshop" },
        createdAt: now,
      },
    },
  };
}

export type SaveOrderResult =
  | { ok: true; orderId: string; orderNumber: number | null; paymentVs: string | null; alreadySaved: boolean }
  | { ok: false; error: string };

type SavedNumbers = { orderNumber: number | null; paymentVs: string | null };

/** undefined = objednávka neexistuje; jinak její číslo (null = číslování vypnuté) a VS. */
async function existingOrder(db: Db, orderId: string): Promise<SavedNumbers | undefined> {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber, paymentVs: orders.paymentVs })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return row;
}

export async function saveEshopOrder(db: Db, orderId: string, value: CheckoutValue): Promise<SaveOrderResult> {
  const existing = await existingOrder(db, orderId);
  if (existing !== undefined) {
    return { ok: true, orderId, ...existing, alreadySaved: true };
  }

  const skus = value.pricedCart.lines.map((line) => line.sku);
  const variantRows = await db
    .select({ id: productVariants.id, sku: productVariants.sku, priceKc: productVariants.priceB2cKc })
    .from(productVariants)
    .where(and(inArray(productVariants.sku, skus), eq(productVariants.isActive, true)));
  const variantsBySku = new Map(variantRows.map((v) => [v.sku, { id: v.id, priceKc: v.priceKc }]));

  const built = buildEshopOrderRows(orderId, value, variantsBySku, new Date());
  if (!built.ok) {
    return built;
  }

  const { order, items, activity } = built.rows;
  try {
    await db.batch([
      db.insert(orders).values(order),
      db.insert(orderItems).values(items),
      db.insert(orderActivity).values(activity),
    ]);
  } catch (error) {
    // Souběžné dvojí odeslání: druhý batch narazí na primární klíč a celý
    // se vrátí (transakce) — objednávka už existuje jen jednou.
    const raced = await existingOrder(db, orderId);
    if (raced !== undefined) {
      return { ok: true, orderId, ...raced, alreadySaved: true };
    }
    throw error;
  }
  const saved = await existingOrder(db, orderId);
  return { ok: true, orderId, orderNumber: saved?.orderNumber ?? null, paymentVs: saved?.paymentVs ?? null, alreadySaved: false };
}
