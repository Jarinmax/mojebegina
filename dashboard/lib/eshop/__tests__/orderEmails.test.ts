// ESHOP 1.0 — e-maily k objednávce nad skutečným kódem pokladny (server
// action) a webhooku Stripe (route handler s ověřením podpisu), DB =
// ovladač Neonu napojený na PGlite. Resend a Stripe API nahrazují
// napodobeniny (bez sítě) — testuje se, CO a KOMU by odešlo.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import type { EmailMessage } from "../email/resend";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));

const mail = vi.hoisted(() => ({
  sent: [] as (EmailMessage & { key: string })[],
  mode: "ok" as "ok" | "error" | "throw",
}));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: EmailMessage, key: string) => {
    if (mail.mode === "throw") throw new Error("Resend spadl");
    if (mail.mode === "error") return { ok: false, error: "Resend 503: Service Unavailable" };
    mail.sent.push({ ...message, key });
    return { ok: true, id: `msg_${mail.sent.length}` };
  },
}));

const stripeFake = vi.hoisted(() => ({ created: 0 }));
vi.mock("@/lib/eshop/stripe/client", async () => {
  const { default: RealStripe } = await vi.importActual<typeof import("stripe")>("stripe");
  const webhooks = new RealStripe("sk_test_begina").webhooks;
  return {
    getStripe: () => ({
      webhooks,
      checkout: {
        sessions: {
          create: async () => {
            stripeFake.created += 1;
            return { id: `cs_test_${stripeFake.created}`, url: `https://checkout.stripe.com/c/pay/cs_test_${stripeFake.created}` };
          },
          retrieve: async (id: string) => ({ id, url: null, status: "expired" }),
        },
      },
    }),
  };
});

const WEBHOOK_SECRET = "whsec_test_begina";
const ENV = {
  VERCEL_ENV: "preview",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  STRIPE_SECRET_KEY: "sk_test_begina",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test, lucie@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test, lucie@begina.test, tester@begina.test",
};
const TESTERS = ["jaroslav@begina.test", "lucie@begina.test", "tester@begina.test"];
const INTERNAL = ["jaroslav@begina.test", "lucie@begina.test"];

describe("e-maily k objednávce — pokladna a Stripe nad DB (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ POST } = await import("@/app/api/eshop/stripe/webhook/route"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
    mail.mode = "ok";
    Object.assign(process.env, ENV);
    delete process.env.ESHOP_ORDER_WRITE;
    delete process.env.ESHOP_EMAIL_LIVE;
    delete process.env.ESHOP_STRIPE_LIVE;
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const orderState = async (id: string) =>
    (await rows(sql`SELECT payment_status, paid_at IS NOT NULL AS paid_at FROM orders WHERE id = ${id}`))[0];
  const emailActivity = async (id: string) =>
    (await rows(sql`SELECT kind, author_name, metadata->>'template' AS template, metadata->>'error' AS error
                    FROM order_activity WHERE order_id = ${id} AND kind LIKE 'email%' ORDER BY created_at, template`)) as {
      kind: string;
      author_name: string;
      template: string;
      error: string | null;
    }[];

  function form(orderToken: string, overrides: Record<string, string> = {}) {
    const fields: Record<string, string> = {
      cart: JSON.stringify([
        { sku: "kulajda", quantity: 2 },
        { sku: "dynova-polevka", quantity: 1 },
      ]),
      name: "Jana Nováková",
      email: "jana@example.cz",
      phone: "+420 777 123 456",
      shippingMethodId: "rozvoz",
      paymentMethodId: "prevod",
      street: "Prvního pluku 14",
      city: "Praha",
      zip: "18600",
      note: "Prosím zvonit dvakrát",
      termsAccepted: "on",
      orderToken,
      website: "",
      ...overrides,
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  function paidEvent(orderId: string, amountKc: number, eventId: string, sessionId = "cs_test_paid") {
    return {
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          client_reference_id: orderId,
          metadata: { orderId, source: "mojebegina-eshop" },
          payment_status: "paid",
          amount_total: amountKc * 100,
          currency: "czk",
          payment_intent: `pi_${sessionId}`,
        },
      },
    };
  }

  async function sendWebhook(event: object) {
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await POST(
      new Request("https://preview.example/api/eshop/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": header },
      })
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  const total = async (id: string) => Number((await rows(sql`SELECT total_kc FROM orders WHERE id = ${id}`))[0].total_kc);

  it("běžná objednávka (osobní odběr, převod): potvrzení zákazníkovi + upozornění Begině, obojí jednou", async () => {
    const ID = "a1a1a1a1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(null, form(ID, { shippingMethodId: "osobni-odber", street: "", city: "", zip: "" }));
    expect(result).toMatchObject({ savedOrderId: ID, email: "sent" });
    expect(mail.sent).toHaveLength(2);

    const [customer, internal] = mail.sent;
    // Preview: zákazník (jana@example.cz) není na seznamu → e-mail dostanou testeři.
    expect(customer.to).toEqual(TESTERS);
    expect(customer.subject).toBe("[TEST] Přijali jsme vaši objednávku a1a1a1a1");
    expect(customer.text).toContain("V ostrém provozu by šel na: jana@example.cz");
    expect(customer.text).toContain("Stav platby: Čeká na platbu převodem");
    expect(customer.text).toContain("Vitice 119");
    expect(customer.from).toBe("Begina <objednavky@begina.cz>");
    expect(customer.key).toBe(`eshop-customer_confirmation-${ID}`);
    expect(JSON.stringify(mail.sent)).not.toContain('"jana@example.cz"]');

    expect(internal.to).toEqual(INTERNAL);
    // Preview: odpověď na [TEST] upozornění nesmí jít na adresu z objednávky.
    expect(internal.replyTo).toBeNull();
    expect(internal.text).toContain("Zákazník: Jana Nováková");
    expect(internal.text).toContain("Poznámka zákazníka: Prosím zvonit dvakrát");
    expect(internal.text).toContain(`https://preview.example/rizeni-firmy/objednavky/${ID}`);

    expect(await emailActivity(ID)).toEqual([
      { kind: "email_sent", author_name: "E-shop", template: "customer_confirmation", error: null },
      { kind: "email_sent", author_name: "E-shop", template: "internal_new_order", error: null },
    ]);
  });

  it("dvojí odeslání formuláře (stejný token): žádný druhý e-mail", async () => {
    const ID = "a1a1a1a1-1111-4111-8111-111111111111";
    const again = await submitCheckoutAction(null, form(ID, { shippingMethodId: "osobni-odber", street: "", city: "", zip: "" }));
    expect(again).toMatchObject({ savedOrderId: ID, email: "off" });
    expect(mail.sent).toHaveLength(0);
    expect(await emailActivity(ID)).toHaveLength(2);
  });

  it("bankovní převod s rozvozem: adresa, doprava, celkem; nikde „zaplaceno“", async () => {
    const ID = "b2b2b2b2-2222-4222-8222-222222222222";
    await submitCheckoutAction(null, form(ID));
    const [customer, internal] = mail.sent;
    expect(customer.text).toContain("Chlazená přeprava — Prvního pluku 14, 186 00 Praha");
    expect(customer.text).toContain(`Celkem: ${new Intl.NumberFormat("cs-CZ").format(await total(ID))} Kč`);
    expect(customer.text).toContain("Platební údaje pro převod vám pošleme");
    expect(internal.subject).toContain("Čeká na platbu převodem");
    for (const m of mail.sent) expect(m.text.toLowerCase()).not.toMatch(/zaplacen[oaá](?![\p{L}])/u);
  });

  it("zákazník na seznamu testerů dostane e-mail přímo (bez přesměrování)", async () => {
    const ID = "c3c3c3c3-3333-4333-8333-333333333333";
    await submitCheckoutAction(null, form(ID, { email: "Tester@Begina.test" }));
    expect(mail.sent[0].to).toEqual(["tester@begina.test"]);
    expect(mail.sent[1].replyTo).toBe("tester@begina.test");
    expect(mail.sent[0].text).not.toContain("V ostrém provozu by šel na");
  });

  const CARD = "d4d4d4d4-4444-4444-8444-444444444444";

  it("Stripe objednávka PŘED zaplacením: přesměrování na Stripe, žádný e-mail", async () => {
    const result = await submitCheckoutAction(null, form(CARD, { paymentMethodId: "karta", ageConfirmed: "on" }));
    expect(result).toEqual({ redirectTo: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) });
    expect(await orderState(CARD)).toEqual({ payment_status: "unpaid", paid_at: false });
    expect(mail.sent).toHaveLength(0);
    expect(await emailActivity(CARD)).toEqual([]);
  });

  it("Stripe objednávka PO zaplacení (webhook): jedno potvrzení „zaplaceno“ + upozornění Begině", async () => {
    const response = await sendWebhook(paidEvent(CARD, await total(CARD), "evt_card_paid"));
    expect(response).toEqual({ status: 200, body: { received: true, outcome: "paid" } });
    expect(mail.sent).toHaveLength(2);
    const [customer, internal] = mail.sent;
    expect(customer.subject).toBe("[TEST] Objednávka d4d4d4d4 je zaplacená — děkujeme");
    expect(customer.text).toContain("Stav platby: Zaplaceno kartou");
    expect(customer.text).toContain(`https://preview.example/eshop/objednavka/${CARD}`);
    expect(internal.subject).toContain("Zaplaceno kartou");
    expect(await emailActivity(CARD)).toHaveLength(2);
  });

  it("opakovaný webhook (stejná událost i async_payment_succeeded): žádný další e-mail", async () => {
    const again = await sendWebhook(paidEvent(CARD, await total(CARD), "evt_card_paid"));
    expect(again.body.outcome).toBe("already-paid");
    const asyncEvent = { ...paidEvent(CARD, await total(CARD), "evt_card_async"), type: "checkout.session.async_payment_succeeded" };
    expect((await sendWebhook(asyncEvent)).body.outcome).toBe("already-paid");
    expect(mail.sent).toHaveLength(0);
    expect(await emailActivity(CARD)).toHaveLength(2);
  });

  it("souběžně doručený stejný webhook: e-maily odejdou jen jednou", async () => {
    const ID = "e5e5e5e5-5555-4555-8555-555555555555";
    await submitCheckoutAction(null, form(ID, { paymentMethodId: "karta" }));
    const event = paidEvent(ID, await total(ID), "evt_parallel", "cs_parallel");
    const outcomes = (await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)])).map((r) => r.body.outcome);
    expect(outcomes.filter((o) => o === "paid")).toHaveLength(1);
    expect(mail.sent).toHaveLength(2);
  });

  it("výpadek e-mailové služby u převodu: objednávka zůstane uložená, zákazník vidí potvrzení, v historii varování", async () => {
    const ID = "f6f6f6f6-6666-4666-8666-666666666666";
    mail.mode = "error";
    const result = await submitCheckoutAction(null, form(ID));
    expect(result).toMatchObject({ savedOrderId: ID, email: "failed" });
    expect(await orderState(ID)).toEqual({ payment_status: "unpaid", paid_at: false });
    expect((await rows(sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${ID}`))[0].n).toBe(2);
    expect(await emailActivity(ID)).toEqual([
      { kind: "email_failed", author_name: "E-shop", template: "customer_confirmation", error: "Resend 503: Service Unavailable" },
      { kind: "email_failed", author_name: "E-shop", template: "internal_new_order", error: "Resend 503: Service Unavailable" },
    ]);
  });

  it("výpadek e-mailové služby po platbě: webhook 200, objednávka ZAPLACENÁ, v historii varování", async () => {
    const ID = "a7a7a7a7-7777-4777-8777-777777777777";
    await submitCheckoutAction(null, form(ID, { paymentMethodId: "karta" }));
    mail.mode = "error";
    const response = await sendWebhook(paidEvent(ID, await total(ID), "evt_fail_mail", "cs_fail_mail"));
    expect(response).toEqual({ status: 200, body: { received: true, outcome: "paid" } });
    expect(await orderState(ID)).toEqual({ payment_status: "paid", paid_at: true });
    expect((await emailActivity(ID)).map((a) => a.kind)).toEqual(["email_failed", "email_failed"]);
  });

  it("i neočekávaná výjimka při odesílání neshodí pokladnu ani webhook", async () => {
    const ID = "b8b8b8b8-8888-4888-8888-888888888888";
    mail.mode = "throw";
    expect(await submitCheckoutAction(null, form(ID))).toMatchObject({ savedOrderId: ID, email: "failed" });
    const CARD2 = "c9c9c9c9-9999-4999-8999-999999999999";
    await submitCheckoutAction(null, form(CARD2, { paymentMethodId: "karta" }));
    const response = await sendWebhook(paidEvent(CARD2, await total(CARD2), "evt_throw", "cs_throw"));
    expect(response.status).toBe(200);
    expect(await orderState(CARD2)).toEqual({ payment_status: "paid", paid_at: true });
  });

  it("Preview bez seznamu testovacích adres: nic neodejde (objednávka se uloží)", async () => {
    const ID = "d0d0d0d0-0000-4000-8000-000000000001";
    delete process.env.ESHOP_EMAIL_TEST_RECIPIENTS;
    expect(await submitCheckoutAction(null, form(ID))).toMatchObject({ savedOrderId: ID, email: "off" });
    expect(mail.sent).toHaveLength(0);
    expect(await emailActivity(ID)).toEqual([]);
  });

  it("Production: ani s povoleným zápisem objednávek nic neodejde, dokud není ESHOP_EMAIL_LIVE=on", async () => {
    const ID = "d0d0d0d0-0000-4000-8000-000000000002";
    process.env.VERCEL_ENV = "production";
    process.env.ESHOP_ORDER_WRITE = "on";
    expect(await submitCheckoutAction(null, form(ID))).toMatchObject({ savedOrderId: ID, email: "off" });
    expect(mail.sent).toHaveLength(0);
  });
});
