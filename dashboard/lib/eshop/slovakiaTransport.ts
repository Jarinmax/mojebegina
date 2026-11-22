// Slovensko s vlastní dopravou zákazníka (Lucie 22. 11. 2026): na Slovensko
// jen chlazenou přepravou CoolBalík, kterou si zákazník objedná a zaplatí sám.
// Po přepnutí zaplacené objednávky na „Připravená“ mu automaticky odejde
// e-mail s hmotností zásilky; zásilku Jarin doveze na depo CoolBalíku (nejvýš jednou).
import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { orderItems, productVariants } from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "./email/orderEmails";

type Db = NeonHttpDatabase<typeof schema>;

/** Hmotnost zboží v gramech z katalogu; null = u některé položky chybí. */
export async function orderGoodsGrams(db: Db, orderId: string): Promise<number | null> {
  const rows = await db
    .select({ quantity: orderItems.quantity, weightG: productVariants.weightG })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
    .where(eq(orderItems.orderId, orderId));
  if (rows.length === 0 || rows.some((r) => !r.weightG || r.weightG <= 0)) return null;
  return rows.reduce((sum, r) => sum + (r.weightG ?? 0) * r.quantity, 0);
}

/** Po skutečném přepnutí na „Připravená“. Nikdy nevyhazuje výjimku. */
export async function afterOrderReady(
  db: Db,
  orderId: string,
  baseUrl: string,
  email: SendOrderEmailsOptions = {}
): Promise<OrderEmailOutcome | null> {
  try {
    const grams = await orderGoodsGrams(db, orderId);
    const outcomes = await sendOrderEmails(db, orderId, "order_ready", baseUrl, { ...email, skTransport: { grams } });
    return outcomes.find((o) => o.template === "customer_sk_transport") ?? null;
  } catch (error) {
    console.error("Slovensko: e-mail k dopravě se nepodařilo poslat", orderId, error);
    return null;
  }
}
