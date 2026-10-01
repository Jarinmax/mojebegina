// ESHOP 1.0 — příjem událostí ze Stripe (webhook). Adresa pro Stripe:
//   https://<Preview adresa>/api/eshop/stripe/webhook
// Bez platného podpisu (STRIPE_WEBHOOK_SECRET) se nic nezpracuje. Mimo
// podmínky stripeConfig (např. Production bez ESHOP_STRIPE_LIVE=on) je
// endpoint vypnutý a vrací 404.
//
// Po skutečném přepnutí objednávky na Zaplaceno (outcome "paid") odejde
// zákazníkovi potvrzení a Begině interní upozornění. Opakovaná událost
// vrátí "already-paid" → žádný další e-mail. Selhání e-mailu vrací 200
// (platba je zapsaná; varování je v historii objednávky).
import { db } from "@/lib/db/client";
import { stripeConfig } from "@/lib/eshop/stripe/config";
import { getStripe } from "@/lib/eshop/stripe/client";
import { handleStripeEvent } from "@/lib/eshop/stripe/webhook";
import { sendOrderEmails } from "@/lib/eshop/email/orderEmails";

export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config) {
    return new Response("Not found", { status: 404 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event;
  try {
    event = getStripe(config).webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch {
    return Response.json({ error: "Neplatný podpis" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(db, event);
    if (outcome === "paid") {
      // handleStripeEvent už ověřil, že client_reference_id je naše objednávka.
      const orderId = (event.data.object as { client_reference_id: string }).client_reference_id;
      await sendOrderEmails(db, orderId, "payment_confirmed", new URL(request.url).origin);
    }
    return Response.json({ received: true, outcome });
  } catch (error) {
    // 500 → Stripe událost později zopakuje (zpracování je idempotentní).
    console.error("Stripe webhook: zpracování selhalo", event.id, error);
    return Response.json({ error: "Zpracování selhalo" }, { status: 500 });
  }
}
