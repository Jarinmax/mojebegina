// Storno objednávky (zadání majitele 8. 10. 2026) nad skutečnou pokladnou,
// webhookem Stripe a datovou vrstvou MojeBegina (ovladač Neonu → PGlite).
// Stav se mění atomicky (souběh, uložení beze změny), e-mail o zrušení
// odejde jen při skutečné změně a nejvýš jednou, zaplacená objednávka se
// označí k samostatnému vrácení peněz, platba ani faktura se už nezapíšou.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import type { EmailMessage } from "../email/resend";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));
vi.mock("@/lib/data/authContext", () => ({
  getAuthContext: async () => ({
    userId: "admin-1",
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Lucie Test",
    email: "lucie@begina.test",
  }),
}));
vi.mock("@/lib/data/userProfiles", () => ({
  getUserProfile: async () => null,
  getUserProfiles: async () => new Map(),
}));

const mail = vi.hoisted(() => ({ sent: [] as (EmailMessage & { key: string })[], mode: "ok" as "ok" | "error" }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: EmailMessage, key: string) => {
    if (mail.mode === "error") return { ok: false, error: "Resend 503: Service Unavailable" };
    mail.sent.push({ ...message, key });
    return { ok: true, id: `msg_${mail.sent.length}` };
  },
}));

vi.mock("@/lib/eshop/stripe/client", async () => {
  const { default: RealStripe } = await vi.importActual<typeof import("stripe")>("stripe");
  const webhooks = new RealStripe("sk_test_begina").webhooks;
  let n = 0;
  return {
    getStripe: () => ({
      webhooks,
      checkout: {
        sessions: {
          create: async () => {
            n += 1;
            return { id: `cs_test_${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_${n}` };
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
  E2E_ORDER_NUMBER_START: "900000",
  STRIPE_SECRET_KEY: "sk_test_begina",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test, lucie@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test, lucie@begina.test",
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399",
};

describe("storno objednávky (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let orders: typeof import("@/lib/data/orders");
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");
  // každý síťový požadavek mimo testovací DB (iDoklad nesmí dostat nic)
  const outbound: string[] = [];

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!/neon\.tech\/sql$/.test(url)) outbound.push(url);
      return shimFetch(input, init);
    }) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    ({ POST } = await import("@/app/api/eshop/stripe/webhook/route"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
    orders = await import("@/lib/data/orders");
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
    mail.mode = "ok";
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  function form(orderToken: string, overrides: Record<string, string> = {}) {
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
      name: "Jana Nováková",
      email: "jana@example.cz",
      phone: "+420 777 123 456",
      shippingMethodId: "osobni-odber",
      paymentMethodId: "prevod",
      street: "",
      city: "",
      zip: "",
      note: "",
      termsAccepted: "on",
      orderToken,
      website: "",
      ...overrides,
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  async function payByWebhook(orderId: string, eventId: string) {
    const [{ total_kc }] = await rows(sql`SELECT total_kc FROM orders WHERE id = ${orderId}`);
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_${eventId}`,
          object: "checkout.session",
          client_reference_id: orderId,
          metadata: { orderId, source: "mojebegina-eshop" },
          payment_status: "paid",
          amount_total: Number(total_kc) * 100,
          currency: "czk",
          payment_intent: `pi_${eventId}`,
        },
      },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await POST(
      new Request("https://preview.example/api/eshop/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } })
    );
    return response.json();
  }

  const activity = async (id: string, kind: string) =>
    (await rows(sql`SELECT metadata FROM order_activity WHERE order_id = ${id} AND kind = ${kind} ORDER BY created_at`)).map(
      (r: { metadata: unknown }) => r.metadata
    );
  const status = async (id: string) =>
    (await rows(sql`SELECT fulfillment_status FROM orders WHERE id = ${id}`))[0].fulfillment_status as string;
  const cancellationMails = () => mail.sent.filter((m) => /byla zrušena$/.test(m.subject));

  async function newOrder(id: string, overrides: Record<string, string> = {}) {
    const result = await submitCheckoutAction(null, form(id, overrides));
    // převod → potvrzení; karta → přesměrování na platební bránu
    expect(result).toMatchObject(overrides.paymentMethodId === "karta" ? { redirectTo: expect.any(String) } : { savedOrderId: id });
    mail.sent.length = 0;
  }

  async function payManually(id: string) {
    const [{ total_kc }] = await rows(sql`SELECT total_kc FROM orders WHERE id = ${id}`);
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
    expect(
      await orders.recordOrderPayment(id, { token: randomUUID(), amountKc: String(total_kc), date: today, method: "bank_transfer", note: "" })
    ).toMatchObject({ ok: true, settled: true });
    mail.sent.length = 0;
  }

  it("nezaplacená: storno se uloží, historie jednou, zákazník dostane potvrzení „už nehraďte“ — zaznamenané v historii", async () => {
    const id = randomUUID();
    await newOrder(id);
    expect(await orders.updateFulfillmentStatus(id, "preparing", "new")).toMatchObject({ ok: true, changed: true, status: "preparing" });
    const result = await orders.updateFulfillmentStatus(id, "cancelled", "preparing");
    expect(result).toEqual({
      ok: true,
      changed: true,
      status: "cancelled",
      cancellation: { refundHal: 0, email: { template: "customer_cancellation", status: "sent" } },
    });
    expect(await status(id)).toBe("cancelled");
    expect(await activity(id, "fulfillment_status_changed")).toEqual([
      { from: "new", to: "preparing" },
      { from: "preparing", to: "cancelled" },
    ]);
    const [mailOut] = cancellationMails();
    expect(mail.sent).toHaveLength(1);
    expect(mailOut.subject).toMatch(/^\[TEST\] Objednávka \d+ byla zrušena$/);
    expect(mailOut.text).toContain("Potvrzujeme, že vaše objednávka");
    expect(mailOut.text).toContain("Objednávku už prosím nehraďte.");
    expect(mailOut.text).not.toMatch(/QR|Variabilní symbol|Číslo účtu/);
    expect(mailOut.key).toBe(`eshop-customer_cancellation-${id}`);
    expect(await activity(id, "email_sent")).toContainEqual(expect.objectContaining({ template: "customer_cancellation" }));
    expect(await activity(id, "refund_required")).toEqual([]);
    // ve výpisu ani detailu nic k vrácení
    expect((await orders.getOrderDetail(id))!.order).toMatchObject({ fulfillmentStatus: "cancelled", refundRequired: false });
  });

  it("opakované uložení storna: nic se nezmění, žádný další záznam ani e-mail", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    expect(await orders.updateFulfillmentStatus(id, "cancelled", "cancelled")).toEqual({ ok: true, changed: false, status: "cancelled" });
    // starý formulář (ukazoval „Nová“) a uživatel zvolí znovu Stornovaná → už je, nic se nezapíše
    expect(await orders.updateFulfillmentStatus(id, "cancelled", "new")).toEqual({ ok: true, changed: false, status: "cancelled" });
    expect(mail.sent).toEqual([]);
    expect(await activity(id, "fulfillment_status_changed")).toHaveLength(1);
    expect((await activity(id, "email_sent")).filter((m: { template: string }) => m.template === "customer_cancellation")).toHaveLength(1);
  });

  it("dvojí souběžné uložení storna: stav se změní jednou, jeden záznam, jeden e-mail", async () => {
    const id = randomUUID();
    await newOrder(id);
    const results = await Promise.all([
      orders.updateFulfillmentStatus(id, "cancelled", "new"),
      orders.updateFulfillmentStatus(id, "cancelled", "new"),
    ]);
    expect(results.filter((r) => r.ok && r.changed)).toHaveLength(1);
    expect(results.filter((r) => r.ok && !r.changed)).toHaveLength(1);
    expect(await activity(id, "fulfillment_status_changed")).toHaveLength(1);
    expect(cancellationMails()).toHaveLength(1);
  });

  it("souběžná změna jiným uživatelem: uložení ze zastaralého formuláře se odmítne a nic nepřepíše", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "delivered", "new");
    const stale = await orders.updateFulfillmentStatus(id, "preparing", "new");
    expect(stale).toEqual({ ok: false, error: expect.stringMatching(/mezitím změnil někdo jiný na „Doručená“/) });
    expect(await status(id)).toBe("delivered");
    expect(await activity(id, "fulfillment_status_changed")).toHaveLength(1);
  });

  it("obnovení ze storna a nové storno: e-mail o zrušení nejde podruhé", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    await orders.updateFulfillmentStatus(id, "confirmed", "cancelled");
    mail.sent.length = 0;
    const again = await orders.updateFulfillmentStatus(id, "cancelled", "confirmed");
    expect(again).toMatchObject({ ok: true, changed: true, cancellation: { email: { status: "duplicate" } } });
    expect(mail.sent).toEqual([]);
    expect(await activity(id, "fulfillment_status_changed")).toHaveLength(3);
  });

  it("zaplacená: storno označí k vrácení peněz; e-mail nic automaticky neslibuje; „Vrácení vyřešeno“ označení uzavře", async () => {
    const id = randomUUID();
    await newOrder(id);
    await payManually(id);
    const result = await orders.updateFulfillmentStatus(id, "cancelled", "new");
    expect(result).toMatchObject({ ok: true, changed: true, cancellation: { refundHal: 75800, email: { status: "sent" } } });
    expect(await activity(id, "refund_required")).toEqual([{ amountHal: 75800, reason: "cancelled" }]);

    const [mailOut] = cancellationMails();
    expect(mailOut.text).toContain("Platbu 758 Kč za tuto objednávku jsme přijali. O jejím vrácení se s vámi domluvíme — ozveme se vám.");
    expect(mailOut.text).not.toMatch(/nehraďte|automaticky|vrátíme|do \d+ dn/);

    const card = (await orders.listOrders()).orders.find((o) => o.id === id)!;
    expect(card.refundRequired).toBe(true);
    // znovu uložit storno = žádné druhé označení
    await orders.updateFulfillmentStatus(id, "cancelled", "cancelled");
    expect(await activity(id, "refund_required")).toHaveLength(1);

    expect(await orders.resolveRefund(id, "vráceno převodem")).toEqual({ ok: true });
    expect((await orders.getOrderDetail(id))!.order.refundRequired).toBe(false);
    expect(await orders.resolveRefund(id, "")).toEqual({ ok: false, error: "Objednávka nečeká na vrácení peněz." });
  });

  it("stornovaná: platba se nezapíše, návrh faktury nevznikne, zákazníkovi nic neodejde", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
    expect(
      await orders.recordOrderPayment(id, { token: randomUUID(), amountKc: "758", date: today, method: "bank_transfer", note: "" })
    ).toEqual({ ok: false, error: expect.stringMatching(/^Objednávka je stornovaná/) });
    expect(await orders.prepareOrderInvoiceDraft(id, false)).toEqual({ ok: false, error: expect.stringMatching(/stornovaná/) });
    expect(await rows(sql`SELECT id FROM payments WHERE order_id = ${id}`)).toEqual([]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);
    expect(mail.sent).toEqual([]);
  });

  it("platba kartou dorazí až po stornu: bez faktury a bez e-mailu o platbě, jen označení k vrácení", async () => {
    const id = randomUUID();
    await newOrder(id, { paymentMethodId: "karta" });
    // karta: potvrzení odchází až po zaplacení → storno nezaplacené objednávky
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    await payByWebhook(id, `evt_${id.slice(0, 8)}`);
    expect(mail.sent).toEqual([]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);
    const [{ total_kc }] = await rows(sql`SELECT total_kc FROM orders WHERE id = ${id}`);
    expect(await activity(id, "refund_required")).toEqual([{ amountHal: Number(total_kc) * 100, reason: "paid_after_cancellation" }]);
    expect((await orders.getOrderDetail(id))!.order.refundRequired).toBe(true);
  });

  it("ruční (B2B) objednávka: storno bez e-mailu; zaplacená se označí k vrácení", async () => {
    const [org] = await rows(sql`
      INSERT INTO organizations (name, ico, registered_address) VALUES ('Kavárna Test', ${String(Date.now()).slice(-8)}, 'Praha')
      RETURNING id`);
    const created = await orders.createOrder({
      buyerOrganizationId: org.id,
      contactName: "Petr",
      contactPhone: "",
      contactEmail: "petr@example.cz",
      plannedDeliveryAt: "",
      note: "",
      shippingKc: "0",
      items: [{ name: "Kulajda 5 l", quantity: "1", unitPriceKc: "900" }],
    });
    expect(created).toMatchObject({ ok: true });
    const id = (created as { id: string }).id;
    expect(await orders.updatePaymentStatus(id, "paid", "unpaid")).toEqual({ ok: true, changed: true, status: "paid" });
    expect(await orders.updatePaymentStatus(id, "paid", "paid")).toEqual({ ok: true, changed: false, status: "paid" });
    mail.sent.length = 0;
    const result = await orders.updateFulfillmentStatus(id, "cancelled");
    expect(result).toMatchObject({ ok: true, changed: true, cancellation: { refundHal: 90000, email: null } });
    expect(mail.sent).toEqual([]);
  });
});
