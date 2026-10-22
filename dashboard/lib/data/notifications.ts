// Jarda – volání a provize, část 2 — zápis oznámení o zaplacené objednávce
// pro AKTUÁLNÍHO správce zákazníka (organizations.ownerUserId). Volá se i
// z veřejného Stripe webhooku (app/api/eshop/stripe/webhook/route.ts) —
// BEZ přihlášeného uživatele/session — proto tenhle soubor úmyslně NEIMPORTUJE
// authContext/crmAuth (na rozdíl od notificationsInbox.ts, který čte
// oznámení PŘIHLÁŠENÉHO obchodníka): import "./authContext" z webhooku by
// natáhl @neondatabase/auth (next/headers) do grafu, který se tam nikdy
// netočí a testy (stripe.test.ts) ho ani nemockují.
//
// Tabulka `notifications` ve schema.ts existovala, ale beze čtení/zápisu
// kdekoliv v appce (app/upozorneni je samostatná, zákaznická stránka na
// mock datech — mock/notifications.ts — s touhle tabulkou nijak nesouvisí).
//
// Jen interní záznam v MojeBegina — zadání výslovně říká "zatím neposílej
// e-maily ani jiné externí zprávy".
import "server-only";
import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { notifications, orders, organizations } from "@/lib/db/schema";
import { formatKc } from "@/lib/format";

type Db = NeonHttpDatabase<typeof schema>;

/**
 * Volat PO úspěšném přepnutí objednávky na Zaplaceno (ne při každém
 * zápisu platby — jen když se stav SKUTEČNĚ právě změnil, aby opakovaný
 * webhook/token nezapsal druhé oznámení). Best-effort: nikdy nevyhodí
 * výjimku ani nezpomalí/nezastaví platbu — stejná zásada jako
 * invoiceAndNotifyPaid/sendMetaPurchaseSafe (lib/eshop/invoicing/afterPaid.ts,
 * lib/eshop/metaPurchase.ts).
 */
export async function notifyOrderOwnerPaidSafe(dbOverride: Db, orderId: string): Promise<void> {
  try {
    await notifyOrderOwnerPaid(dbOverride, orderId);
  } catch (error) {
    console.error("Oznámení o zaplacené objednávce se nepodařilo zapsat", orderId, error);
  }
}

async function notifyOrderOwnerPaid(dbOverride: Db, orderId: string): Promise<void> {
  const [order] = await dbOverride
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerOrganizationId: orders.buyerOrganizationId,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || !order.buyerOrganizationId) return; // soukromý zákazník bez organizace — žádný správce k upozornění

  const [org] = await dbOverride
    .select({ ownerUserId: organizations.ownerUserId, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, order.buyerOrganizationId))
    .limit(1);
  if (!org || !org.ownerUserId) return; // zákazník bez přiřazeného obchodníka

  const goodsKc = order.subtotalKc - order.discountKc;
  const label = order.orderNumber ? `#${order.orderNumber}` : order.id.slice(0, 8);

  await dbOverride.insert(notifications).values({
    userId: org.ownerUserId,
    organizationId: order.buyerOrganizationId,
    type: "order_paid",
    title: "Zaplacená objednávka",
    body: `${org.name} zaplatil(a) objednávku ${label} za ${formatKc(goodsKc)}.`,
    href: `/rizeni-firmy/objednavky/${order.id}`,
  });
}
