"use server";

// Zákaznické recenze Google na stránce objednávky (návrat ze Stripe):
// údaje se vydají až po kliknutí zákazníka a jen u zaplacené, nestornované
// e-shopové objednávky. Klíčem je náhodné id objednávky z adresy.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { parseOrderToken } from "@/lib/eshop/orderWrite";
import { googleReviewsPayload, type GoogleReviewsPayload } from "@/lib/eshop/googleReviews";

export async function googleReviewsPayloadAction(token: string): Promise<GoogleReviewsPayload | null> {
  const orderId = parseOrderToken(token);
  if (!orderId) return null;
  const [order] = await db
    .select({
      channel: orders.channel,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      orderNumber: orders.orderNumber,
      email: orders.contactEmail,
      country: orders.billingCountry,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.channel !== "eshop" || order.paymentStatus !== "paid" || order.fulfillmentStatus === "cancelled") return null;
  return googleReviewsPayload({ orderNumber: order.orderNumber, email: order.email, country: order.country, orderedAt: order.createdAt });
}
