// ESHOP 1.0 — platba kartou přes Stripe (testovací režim, jen Preview).
// Skutečný kód pokladny, platby i webhooku (včetně route handleru a
// ověření podpisu knihovnou Stripe) nad ovladačem Neonu napojeným na PGlite.
// Stripe API nahrazuje napodobenina (bez sítě); podpisy událostí jsou
// skutečné (Stripe.webhooks.generateTestHeaderString).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { saveEshopOrder } from "../orderWrite";
import { isCardPaymentAvailable, stripeConfig } from "../stripe/config";
import { buildCheckoutSessionParams, canPayByCard, startCardPayment, type CheckoutSessionsApi, type PaymentOrder } from "../stripe/payment";
import { catalogIndex } from "./helpers/catalogFixture";

vi.mock("server-only", () => ({}));

const WEBHOOK_SECRET = "whsec_test_begina";
const PREVIEW_ENV = {
  VERCEL_ENV: "preview",
  STRIPE_SECRET_KEY: "sk_test_begina",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
};

describe("Stripe — kdy je platba kartou dostupná (Production guard)", () => {
  it("Preview s testovacími klíči: ano", () => {
    expect(stripeConfig(PREVIEW_ENV)).toEqual({ secretKey: "sk_test_begina", webhookSecret: WEBHOOK_SECRET, testMode: true });
    expect(isCardPaymentAvailable({ ...PREVIEW_ENV, STRIPE_SECRET_KEY: "rk_test_x" })).toBe(true);
  });

  it("bez klíče, bez podpisového klíče nebo s nesmyslem: ne", () => {
    expect(isCardPaymentAvailable({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isCardPaymentAvailable({ ...PREVIEW_ENV, STRIPE_WEBHOOK_SECRET: "" })).toBe(false);
    expect(isCardPaymentAvailable({ ...PREVIEW_ENV, STRIPE_WEBHOOK_SECRET: "abc" })).toBe(false);
    expect(isCardPaymentAvailable({ ...PREVIEW_ENV, STRIPE_SECRET_KEY: "pk_test_x" })).toBe(false);
  });

  it("ostrý klíč omylem v Preview: ne", () => {
    expect(isCardPaymentAvailable({ ...PREVIEW_ENV, STRIPE_SECRET_KEY: "sk_live_x" })).toBe(false);
  });

  it("Production: ne — ani s klíči, ani s povoleným zápisem, dokud není ESHOP_STRIPE_LIVE=on", () => {
    const prod = { ...PREVIEW_ENV, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x" };
    expect(isCardPaymentAvailable(prod)).toBe(false);
    expect(isCardPaymentAvailable({ ...prod, ESHOP_ORDER_WRITE: "on" })).toBe(false);
    expect(isCardPaymentAvailable({ ...prod, ESHOP_STRIPE_LIVE: "on" })).toBe(false); // zápis objednávek vypnutý
    expect(isCardPaymentAvailable({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_STRIPE_LIVE: "on" })).toBe(true);
    // Testovací klíč omylem v Production: ne (objednávka by se „zaplatila“ testovací kartou).
    expect(isCardPaymentAvailable({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_STRIPE_LIVE: "on", STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(isCardPaymentAvailable({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_STRIPE_LIVE: "on", STRIPE_SECRET_KEY: "rk_live_x" })).toBe(true);
  });

  it("pokladna odmítne „Kartou online“, když karta není dostupná", () => {
    const result = validateCheckoutInput(checkoutInput(), catalogIndex, { cardPaymentAvailable: false });
    expect(result).toEqual({ ok: false, error: "Vyberte dostupný způsob platby." });
  });
});

function checkoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart: JSON.stringify([
      { sku: "kulajda", quantity: 2 },
      { sku: "svarak-deluxe-500ml", quantity: 1 },
    ]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "karta",
    street: "Prvního pluku 14",
    city: "Praha",
    zip: "18600",
    note: "",
    termsAccepted: true,
    ageConfirmed: true,
    ...overrides,
  };
}

function cardValue() {
  const result = validateCheckoutInput(checkoutInput(), catalogIndex, { cardPaymentAvailable: true });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("Stripe Checkout — parametry platby", () => {
  const order: PaymentOrder = {
    orderNumber: null,
    orderedAt: new Date("2026-10-02T10:00:00Z"),
    id: "0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11",
    channel: "eshop",
    paymentMethodCode: "karta",
    paymentStatus: "unpaid",
    fulfillmentStatus: "new",
    contactEmail: "jana@example.cz",
    subtotalKc: 887,
    discountKc: 0,
    shippingKc: 99,
    totalKc: 986,
    shippingMethodLabel: "Chlazená přeprava",
    items: [
      { name: "Kulajda", quantity: 2, unitPriceKc: 379 },
      { name: "Svařák Deluxe — 500 ml Praktické balení", quantity: 1, unitPriceKc: 129 },
    ],
  };

  it("položky + doprava v haléřích, spojení s objednávkou, návratové adresy", () => {
    const params = buildCheckoutSessionParams(order, "https://preview.example");
    expect(params.line_items).toEqual([
      { quantity: 2, price_data: { currency: "czk", unit_amount: 37900, product_data: { name: "Kulajda" } } },
      {
        quantity: 1,
        price_data: { currency: "czk", unit_amount: 12900, product_data: { name: "Svařák Deluxe — 500 ml Praktické balení" } },
      },
      { quantity: 1, price_data: { currency: "czk", unit_amount: 9900, product_data: { name: "Chlazená přeprava" } } },
    ]);
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: order.id,
      metadata: { orderId: order.id, source: "mojebegina-eshop" },
      payment_intent_data: { metadata: { orderId: order.id, source: "mojebegina-eshop" } },
      customer_email: "jana@example.cz",
      success_url: `https://preview.example/eshop/objednavka/${order.id}?platba=ok`,
      cancel_url: `https://preview.example/eshop/objednavka/${order.id}?platba=zrusena`,
    });
  });

  it("když položky nedají přesně celkovou částku, zaplatí se jedna položka na total", () => {
    const params = buildCheckoutSessionParams({ ...order, discountKc: 50, totalKc: 936 }, "https://x");
    expect(params.line_items).toEqual([
      { quantity: 1, price_data: { currency: "czk", unit_amount: 93600, product_data: { name: "Objednávka Begina 0b6f7a52" } } },
    ]);
  });

  it("kartou lze platit jen nezaplacenou, nezrušenou e-shopovou objednávku s platbou kartou", () => {
    expect(canPayByCard(order)).toEqual({ ok: true });
    expect(canPayByCard({ ...order, paymentStatus: "paid" }).ok).toBe(false);
    expect(canPayByCard({ ...order, fulfillmentStatus: "cancelled" }).ok).toBe(false);
    expect(canPayByCard({ ...order, paymentMethodCode: "prevod" }).ok).toBe(false);
    expect(canPayByCard({ ...order, channel: "manual" }).ok).toBe(false);
  });
});

// Napodobenina Stripe Checkout Sessions: stejný idempotency key = stejná stránka.
function fakeSessions() {
  const byKey = new Map<string, { id: string; url: string }>();
  const status = new Map<string, string>();
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  let n = 0;
  const api: CheckoutSessionsApi = {
    async create(params, options) {
      const key = options?.idempotencyKey ?? `auto-${n}`;
      const existing = byKey.get(key);
      if (existing) return existing;
      created.push(params);
      n += 1;
      const session = { id: `cs_test_${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_${n}` };
      byKey.set(key, session);
      status.set(session.id, "open");
      return session;
    },
    async retrieve(id) {
      const found = [...byKey.values()].find((s) => s.id === id);
      return { id, url: found?.url ?? null, status: status.get(id) ?? null };
    },
  };
  return { api, created, status };
}

describe("Stripe — objednávka, platba a webhook nad DB (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");

  beforeAll(async () => {
    Object.assign(process.env, PREVIEW_ENV, { DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb" });
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ POST } = await import("@/app/api/eshop/stripe/webhook/route"));
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const orderState = async (id: string) =>
    (await rows(sql`SELECT payment_status, paid_at IS NOT NULL AS paid_at FROM orders WHERE id = ${id}`))[0];
  const activity = async (id: string) =>
    (await rows(sql`SELECT kind, author_name, metadata->>'to' AS "to", metadata->>'from' AS "from"
                    FROM order_activity WHERE order_id = ${id} ORDER BY created_at, kind`)) as {
      kind: string;
      author_name: string;
      to: string | null;
      from: string | null;
    }[];

  function sessionEvent(
    type: string,
    orderId: string,
    overrides: Partial<Stripe.Checkout.Session> = {},
    eventId = `evt_${Math.random().toString(36).slice(2)}`
  ) {
    return {
      id: eventId,
      object: "event",
      type,
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          client_reference_id: orderId,
          metadata: { orderId, source: "mojebegina-eshop" },
          payment_status: "paid",
          amount_total: 98600,
          currency: "czk",
          payment_intent: "pi_test_1",
          ...overrides,
        },
      },
    };
  }

  async function sendWebhook(event: object, secret = WEBHOOK_SECRET) {
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret });
    const response = await POST(
      new Request("http://localhost/api/eshop/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": header },
      })
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  const ORDER = "7a1e2c3d-4b5f-4a6b-8c7d-9e0f1a2b3c4d";
  const stripe = fakeSessions();

  it("objednávka kartou se uloží jako nezaplacená a zákazník dostane platební stránku Stripe", async () => {
    expect(await saveEshopOrder(db, ORDER, cardValue())).toMatchObject({ ok: true });
    expect(await orderState(ORDER)).toEqual({ payment_status: "unpaid", paid_at: false });
    const result = await startCardPayment(db, stripe.api, ORDER, "https://preview.example");
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1", reused: false });
    expect(stripe.created[0]).toMatchObject({ client_reference_id: ORDER, metadata: { orderId: ORDER } });
    expect((await activity(ORDER)).map((a) => a.kind)).toEqual(["created", "payment_started"]);
  });

  it("opakované kliknutí: otevřená platba se použije znovu, nic nového se nezaloží", async () => {
    const [a, b] = await Promise.all([
      startCardPayment(db, stripe.api, ORDER, "https://preview.example"),
      startCardPayment(db, stripe.api, ORDER, "https://preview.example"),
    ]);
    expect(a).toMatchObject({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1", reused: true });
    expect(b).toMatchObject({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1", reused: true });
    expect(stripe.created).toHaveLength(1);
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_started")).toHaveLength(1);
  });

  it("souběžný dvojklik hned na začátku: jedna platební stránka, jeden záznam", async () => {
    const FRESH = "9c3a4e5f-6d7b-4c8d-8e9f-1a2b3c4d5e6f";
    const fresh = fakeSessions();
    expect(await saveEshopOrder(db, FRESH, cardValue())).toMatchObject({ ok: true });
    const [a, b] = await Promise.all([
      startCardPayment(db, fresh.api, FRESH, "https://preview.example"),
      startCardPayment(db, fresh.api, FRESH, "https://preview.example"),
    ]);
    expect(a.ok && b.ok && a.url === b.url).toBe(true);
    expect(fresh.created).toHaveLength(1);
    expect((await activity(FRESH)).filter((x) => x.kind === "payment_started")).toHaveLength(1);
  });

  it("chybný podpis: 400 a objednávka se nezmění", async () => {
    const forged = await sendWebhook(sessionEvent("checkout.session.completed", ORDER), "whsec_utocnik");
    expect(forged.status).toBe(400);
    const unsigned = await POST(
      new Request("http://localhost/api/eshop/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(sessionEvent("checkout.session.completed", ORDER)),
      })
    );
    expect(unsigned.status).toBe(400);
    expect(await orderState(ORDER)).toEqual({ payment_status: "unpaid", paid_at: false });
  });

  it("zrušení / propadnutí platby: objednávka zůstane nezaplacená a jde zaplatit znovu", async () => {
    expect((await sendWebhook(sessionEvent("checkout.session.expired", ORDER, { payment_status: "unpaid" }))).body).toEqual({
      received: true,
      outcome: "no-change",
    });
    expect(await orderState(ORDER)).toEqual({ payment_status: "unpaid", paid_at: false });
    stripe.status.set("cs_test_1", "expired");
    const again = await startCardPayment(db, stripe.api, ORDER, "https://preview.example");
    expect(again).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_2", reused: false });
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_started")).toHaveLength(2);
  });

  it("platba WooCommerce na stejném Stripe účtu se ignoruje", async () => {
    const foreign = sessionEvent("checkout.session.completed", ORDER, { metadata: { order_id: "5094" }, client_reference_id: null });
    expect((await sendWebhook(foreign)).body).toEqual({ received: true, outcome: "ignored-foreign" });
    expect(await orderState(ORDER)).toEqual({ payment_status: "unpaid", paid_at: false });
  });

  it("nesedící částka: NEoznačí se jako zaplaceno, jen varování (jednou)", async () => {
    const wrong = sessionEvent("checkout.session.completed", ORDER, { amount_total: 100, payment_intent: "pi_wrong" });
    expect((await sendWebhook(wrong)).body.outcome).toBe("amount-mismatch");
    expect((await sendWebhook(wrong)).body.outcome).toBe("amount-mismatch");
    expect(await orderState(ORDER)).toEqual({ payment_status: "unpaid", paid_at: false });
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_amount_mismatch")).toHaveLength(1);
  });

  it("úspěšná platba: webhook po ověření podpisu označí Zaplaceno a zapíše aktivitu", async () => {
    const paid = await sendWebhook(sessionEvent("checkout.session.completed", ORDER, { id: "cs_test_2" }, "evt_paid_1"));
    expect(paid).toEqual({ status: 200, body: { received: true, outcome: "paid" } });
    expect(await orderState(ORDER)).toEqual({ payment_status: "paid", paid_at: true });
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_status_changed")).toEqual([
      { kind: "payment_status_changed", author_name: "Stripe", to: "paid", from: "unpaid" },
    ]);
  });

  it("opakovaný webhook (stejná událost i stejná platba): nic se nezmění, žádný druhý záznam", async () => {
    const again = await sendWebhook(sessionEvent("checkout.session.completed", ORDER, { id: "cs_test_2" }, "evt_paid_1"));
    expect(again.body.outcome).toBe("already-paid");
    const async = await sendWebhook(sessionEvent("checkout.session.async_payment_succeeded", ORDER, { id: "cs_test_2" }));
    expect(async.body.outcome).toBe("already-paid");
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_status_changed")).toHaveLength(1);
  });

  it("druhá platba jinou kartou k zaplacené objednávce: varování pro vrácení (jednou)", async () => {
    const second = sessionEvent("checkout.session.completed", ORDER, { id: "cs_test_9", payment_intent: "pi_test_2" });
    expect((await sendWebhook(second)).body.outcome).toBe("second-payment");
    expect((await sendWebhook(second)).body.outcome).toBe("second-payment");
    expect((await activity(ORDER)).filter((x) => x.kind === "payment_duplicate")).toHaveLength(1);
  });

  it("zaplacenou objednávku už nejde znovu platit", async () => {
    expect(await startCardPayment(db, stripe.api, ORDER, "https://preview.example")).toEqual({
      ok: false,
      error: "Objednávka už je zaplacená.",
    });
  });

  it("Production guard: webhook je v Production vypnutý (404) a nic nezpracuje", async () => {
    const OTHER = "8b2f3d4e-5c6a-4b7c-9d8e-0f1a2b3c4d5e";
    expect(await saveEshopOrder(db, OTHER, cardValue())).toMatchObject({ ok: true });
    process.env.VERCEL_ENV = "production";
    try {
      const response = await sendWebhook(sessionEvent("checkout.session.completed", OTHER));
      expect(response.status).toBe(404);
    } finally {
      process.env.VERCEL_ENV = "preview";
    }
    expect(await orderState(OTHER)).toEqual({ payment_status: "unpaid", paid_at: false });
  });
});
