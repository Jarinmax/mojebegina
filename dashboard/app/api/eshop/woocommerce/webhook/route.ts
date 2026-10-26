// ESHOP 1.0 — příjem nové objednávky z WooCommerce (begina.cz). Adresa pro
// WooCommerce webhook (Nastavení e-shopu → Rozšířené → Webhooky):
//   https://<adresa appky>/api/eshop/woocommerce/webhook
//   Téma: "Objednávka vytvořena" (order.created), Tajný klíč = WOOCOMMERCE_WEBHOOK_SECRET.
// Bez platného podpisu (X-WC-Webhook-Signature) se nic nezpracuje. Bez
// nastaveného WOOCOMMERCE_WEBHOOK_SECRET je endpoint vypnutý a vrací 404
// (stejný princip jako app/api/eshop/stripe/webhook).
//
// PRVNÍ automatický import objednávek z WooCommerce — appka dřív uměla
// jen ruční jednorázový import skriptem (docs/eshop-production). Jádro
// zápisu (importExternalOrder) je idempotentní podle externalWooCommerceId
// — opakované doručení stejné objednávky (WooCommerce retry) nikdy
// nevytvoří druhý záznam.
import { verifyWooCommerceSignature, handleWooCommerceOrderPayload, woocommerceConfig } from "@/lib/woocommerce/webhook";

export async function POST(request: Request) {
  const config = woocommerceConfig();
  if (!config) {
    return new Response("Not found", { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-wc-webhook-signature");
  if (!verifyWooCommerceSignature(rawBody, signature, config.webhookSecret)) {
    return Response.json({ error: "Neplatný podpis" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Neplatné tělo požadavku (očekává se JSON)" }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Neplatné tělo požadavku" }, { status: 400 });
  }

  try {
    const outcome = await handleWooCommerceOrderPayload(payload);
    if (outcome.outcome === "needs_review" || outcome.outcome === "rejected") {
      // 200: appka tělo přečetla a rozhodla se nezapsat (ne technická
      // chyba) — WooCommerce by jinak stejnou objednávku opakovaně
      // doručoval. Důvod jde do Vercel Runtime Logs pro ruční kontrolu.
      console.error(`WooCommerce webhook: ${outcome.outcome} — ${outcome.reason}`);
      return Response.json({ received: true, outcome: outcome.outcome, reason: outcome.reason });
    }
    return Response.json({ received: true, outcome: outcome.outcome, orderId: outcome.orderId });
  } catch (error) {
    // 500 → WooCommerce později doručení zopakuje (zpracování je idempotentní).
    console.error("WooCommerce webhook: zpracování selhalo", error);
    return Response.json({ error: "Zpracování selhalo" }, { status: 500 });
  }
}
