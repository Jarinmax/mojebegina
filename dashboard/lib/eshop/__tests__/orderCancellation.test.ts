// Storno objednávky (zadání majitele 8. 10. 2026) nad skutečnou pokladnou,
// webhookem Stripe a datovou vrstvou MojeBegina (ovladač Neonu → PGlite).
// Stav se mění atomicky (souběh, uložení beze změny), e-mail o zrušení
// odejde jen při skutečné změně a nejvýš jednou. Peníze za stornovanou
// objednávku NEZNAMENAJÍ automaticky vrácení: objednávka zůstane
// Stornovaná, upozorní „kontaktovat zákazníka“ a podle jeho rozhodnutí se
// platba převede (se souhlasem) nebo vrátí (zápis skutečného vrácení).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import jsQR from "jsqr";
import { PNG } from "pngjs";
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
      cancellation: { heldHal: 0, email: { template: "customer_cancellation", status: "sent" } },
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
    // ve výpisu ani detailu nic k řešení
    expect((await orders.getOrderDetail(id))!.order).toMatchObject({ fulfillmentStatus: "cancelled", moneyAlert: null });
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

  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  const orderRow = async (id: string) =>
    (await rows(sql`SELECT fulfillment_status, payment_status, payment_vs FROM orders WHERE id = ${id}`))[0] as {
      fulfillment_status: string;
      payment_status: string;
      payment_vs: string;
    };
  const money = async (id: string) => (await orders.getOrderDetail(id))!.order.moneyAlert;
  const postCancel = (id: string, txId: string, amountKc = "758") =>
    orders.recordOrderPaymentAfterCancellation(id, { txId, amountKc, date: today(), method: "bank_transfer", note: "" });

  it("zaplacená a pak stornovaná: NIC se automaticky nevrací — upozornění „kontaktovat zákazníka“, e-mail nabízí domluvu", async () => {
    const id = randomUUID();
    await newOrder(id);
    await payManually(id);
    const result = await orders.updateFulfillmentStatus(id, "cancelled", "new");
    expect(result).toMatchObject({ ok: true, changed: true, cancellation: { heldHal: 75800, email: { status: "sent" } } });
    expect(await activity(id, "refund_requested")).toEqual([]);
    expect(await money(id)).toEqual({ stage: "contact", heldHal: 75800 });
    expect((await orders.listOrders()).orders.find((o) => o.id === id)!.moneyAlert).toEqual({ stage: "contact", heldHal: 75800 });

    const [mailOut] = cancellationMails();
    expect(mailOut.text).toContain(
      "Platbu 758 Kč za tuto objednávku jsme přijali. Ozveme se vám a domluvíme se, jak s platbou naložit — například jiný produkt, nebo vrácení peněz."
    );
    expect(mailOut.text).not.toMatch(/nehraďte|automaticky|vrátíme/);
  });

  it("stornovaná: běžná platba se nezapíše, návrh faktury nevznikne, zákazníkovi nic neodejde", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    expect(
      await orders.recordOrderPayment(id, { token: randomUUID(), amountKc: "758", date: today(), method: "bank_transfer", note: "" })
    ).toEqual({ ok: false, error: expect.stringMatching(/Zapsat platbu po stornu/) });
    expect(await orders.prepareOrderInvoiceDraft(id, false)).toEqual({ ok: false, error: expect.stringMatching(/stornovaná/) });
    expect(await rows(sql`SELECT id FROM payments WHERE order_id = ${id}`)).toEqual([]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);
    expect(mail.sent).toEqual([]);
    expect(await money(id)).toBeNull();
  });

  it("platba po stornu s ID transakce: zapíše se jednou, objednávka zůstává Stornovaná a nezaplacená, bez faktury a e-mailu", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    expect(await postCancel(id, "  ab ")).toEqual({ ok: false, error: expect.stringMatching(/ID transakce/) });
    expect(await postCancel(id, "BANK-2026-10-09-001")).toEqual({ ok: true, recorded: true });
    // dvojí odeslání / stejná transakce znovu
    expect(await postCancel(id, "BANK-2026-10-09-001")).toEqual({ ok: true, recorded: false });
    expect(await orderRow(id)).toMatchObject({ fulfillment_status: "cancelled", payment_status: "unpaid" });
    expect(await rows(sql`SELECT external_id, amount_hal::int AS amount FROM payments WHERE order_id = ${id}`)).toEqual([
      { external_id: "tx:BANK-2026-10-09-001", amount: 75800 },
    ]);
    expect(await activity(id, "payment_after_cancellation")).toEqual([
      expect.objectContaining({ amountHal: 75800, txId: "BANK-2026-10-09-001", method: "bank_transfer" }),
    ]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);
    expect(mail.sent).toEqual([]);
    expect(await money(id)).toEqual({ stage: "contact", heldHal: 75800 });

    // stejná transakce u jiné objednávky = odmítnuto
    const other = randomUUID();
    await newOrder(other);
    await orders.updateFulfillmentStatus(other, "cancelled", "new");
    expect(await postCancel(other, "BANK-2026-10-09-001")).toEqual({ ok: false, error: expect.stringMatching(/u jiné objednávky/) });
  });

  it("zákazník chce vrácení: jen s jeho souhlasem → „Vrátit peníze“ → zápis skutečného vrácení (i po částech), bez duplicit", async () => {
    const id = randomUUID();
    await newOrder(id);
    await payManually(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    const refund = (txId: string, amountKc: string) =>
      orders.recordOrderRefund(id, { txId, amountKc, date: today(), method: "bank_transfer", note: "" });

    // bez rozhodnutí zákazníka vrácení zapsat nejde
    expect(await refund("VRAT-1", "758")).toEqual({ ok: false, error: expect.stringMatching(/po rozhodnutí zákazníka/) });
    expect(await orders.requestOrderRefund(id, { consent: false, note: "telefon" })).toEqual({ ok: false, error: expect.stringMatching(/souhlas/) });
    expect(await orders.requestOrderRefund(id, { consent: true, note: "telefon 9. 10." })).toEqual({ ok: true, requested: true, heldHal: 75800 });
    expect(await orders.requestOrderRefund(id, { consent: true, note: "znovu" })).toEqual({ ok: true, requested: false, heldHal: 75800 });
    expect(await money(id)).toEqual({ stage: "refund", heldHal: 75800 });

    expect(await refund("VRAT-1", "800")).toEqual({ ok: false, error: expect.stringMatching(/nejvýš 758/) });
    expect(await refund("VRAT-1", "500")).toEqual({ ok: true, recorded: true, remainingHal: 25800 });
    expect(await refund("VRAT-1", "500")).toEqual({ ok: true, recorded: false, remainingHal: 25800 });
    expect(await money(id)).toEqual({ stage: "refund", heldHal: 25800 });
    expect(await refund("VRAT-2", "258")).toEqual({ ok: true, recorded: true, remainingHal: 0 });
    expect(await money(id)).toBeNull();

    const outflows = await rows(sql`
      SELECT p.external_id, p.amount_hal::int AS amount, p.direction, r.direction AS of_direction
      FROM payments p LEFT JOIN payments r ON r.id = p.refund_of_payment_id
      WHERE p.order_id = ${id} AND p.direction = 'outflow' ORDER BY p.amount_hal DESC`);
    expect(outflows).toEqual([
      { external_id: "refund:VRAT-1", amount: 50000, direction: "outflow", of_direction: "inflow" },
      { external_id: "refund:VRAT-2", amount: 25800, direction: "outflow", of_direction: "inflow" },
    ]);
    expect(await activity(id, "refund_recorded")).toHaveLength(2);
    expect(await orderRow(id)).toMatchObject({ fulfillment_status: "cancelled" });
  });

  it("zákazník souhlasí s jiným produktem: platba se převede celá na jeho objednávku, ta je zaplacená; historie u obou", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    await postCancel(id, "BANK-TRANSFER-1");
    const target = randomUUID();
    await newOrder(target); // zákazník si objednal jiný produkt za stejnou cenu
    const { payment_vs: targetVs } = await orderRow(target);
    const transfer = (input: Partial<{ target: string; consent: boolean; note: string; allowDifferentCustomer: boolean }>) =>
      orders.transferOrderPayment(id, { target: targetVs, consent: true, note: "e-mail 9. 10.", allowDifferentCustomer: false, ...input });

    expect(await transfer({ consent: false })).toEqual({ ok: false, error: expect.stringMatching(/souhlas/) });
    expect(await transfer({ target: "99999999" })).toEqual({ ok: false, error: expect.stringMatching(/nebyla nalezena/) });
    const { payment_vs: ownVs } = await orderRow(id);
    expect(await transfer({ target: ownVs })).toEqual({ ok: false, error: expect.stringMatching(/tutéž objednávku/) });
    mail.sent.length = 0;

    const result = await transfer({});
    expect(result).toMatchObject({ ok: true, movedHal: 75800, settled: true, target: { id: target } });
    // původní platba: převedená (dohledatelná), nová u cílové objednávky
    const [original] = await rows(sql`SELECT status, superseded_by_payment_id FROM payments WHERE external_id = 'tx:BANK-TRANSFER-1'`);
    expect(original.status).toBe("superseded");
    const [moved] = await rows(sql`
      SELECT p.id, p.order_id, p.external_id, p.vs, p.raw->>'originalExternalId' AS orig,
        p.occurred_at >= o.occurred_at AS dated_at_transfer, (p.raw->>'originalOccurredAt') IS NOT NULL AS keeps_original_date
      FROM payments p JOIN payments o ON o.superseded_by_payment_id = p.id WHERE p.id = ${original.superseded_by_payment_id}`);
    expect(moved).toMatchObject({ order_id: target, vs: targetVs, orig: "tx:BANK-TRANSFER-1", dated_at_transfer: true, keeps_original_date: true });
    expect(moved.external_id).toMatch(/^transfer:/);

    expect(await orderRow(id)).toMatchObject({ fulfillment_status: "cancelled", payment_status: "unpaid" });
    expect(await orderRow(target)).toMatchObject({ payment_status: "paid" });
    expect(await money(id)).toBeNull();
    expect(await activity(id, "payment_transferred_out")).toEqual([expect.objectContaining({ amountHal: 75800, toOrderId: target, consent: true })]);
    expect(await activity(target, "payment_transferred_in")).toEqual([expect.objectContaining({ amountHal: 75800, fromOrderId: id })]);
    // cílová objednávka jde běžnou cestou: „Platbu jsme přijali“ (stornovaná nic)
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^\[TEST\] Platbu za objednávku \d+ jsme přijali$/)]);

    // podruhé převést nejde
    expect(await transfer({})).toEqual({ ok: false, error: expect.stringMatching(/nedržíme žádné peníze|už je zaplacená|Není co převést/i) });
  });

  it("dvojklik na „Převést platbu“: platba se převede jen jednou", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    await postCancel(id, "BANK-DOUBLE-1");
    const target = randomUUID();
    await newOrder(target);
    const { payment_vs: targetVs } = await orderRow(target);
    const input = { target: targetVs, consent: true, note: "e-mail", allowDifferentCustomer: false };
    const results = await Promise.all([orders.transferOrderPayment(id, input), orders.transferOrderPayment(id, input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await rows(sql`SELECT id FROM payments WHERE order_id = ${target} AND direction = 'inflow'`)).toHaveLength(1);
    expect(await activity(target, "payment_transferred_in")).toHaveLength(1);
  });

  it("převod na dražší objednávku: jen doplatek (zákaznická stránka i stav); jiný e-mail jen s potvrzením; ne na stornovanou", async () => {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    await postCancel(id, "BANK-TRANSFER-2");

    const cancelledTarget = randomUUID();
    await newOrder(cancelledTarget);
    await orders.updateFulfillmentStatus(cancelledTarget, "cancelled", "new");
    const { payment_vs: cancelledVs } = await orderRow(cancelledTarget);
    expect(await orders.transferOrderPayment(id, { target: cancelledVs, consent: true, note: "tel.", allowDifferentCustomer: false })).toEqual({
      ok: false,
      error: "Cílová objednávka je stornovaná.",
    });

    const target = randomUUID();
    await newOrder(target, { cart: JSON.stringify([{ sku: "kulajda", quantity: 3 }]), email: "jiny@example.cz" });
    const { payment_vs: targetVs } = await orderRow(target);
    expect(await orders.transferOrderPayment(id, { target: targetVs, consent: true, note: "tel.", allowDifferentCustomer: false })).toEqual({
      ok: false,
      error: expect.stringMatching(/jinému e-mailu \(jiny@example.cz\)/),
    });
    const result = await orders.transferOrderPayment(id, { target: targetVs, consent: true, note: "tel. 9. 10.", allowDifferentCustomer: true });
    expect(result).toMatchObject({ ok: true, movedHal: 75800, settled: false });
    expect(await orderRow(target)).toMatchObject({ payment_status: "unpaid" });
    const [balance] = await rows(sql`SELECT net_hal::int AS net, required_hal::int AS required FROM order_payment_balance WHERE order_id = ${target}`);
    expect(balance).toEqual({ net: 75800, required: 113700 });
  });

  it("platba kartou dorazí až po stornu: zapíše se, objednávka zůstává Stornovaná, bez faktury a e-mailu — kontaktovat zákazníka", async () => {
    const id = randomUUID();
    await newOrder(id, { paymentMethodId: "karta" });
    // karta: potvrzení odchází až po zaplacení → storno nezaplacené objednávky
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    mail.sent.length = 0;
    expect(await payByWebhook(id, `evt_${id.slice(0, 8)}`)).toMatchObject({ outcome: "paid-after-cancellation" });
    // opakovaná událost = žádný druhý záznam
    await payByWebhook(id, `evt_${id.slice(0, 8)}`);
    expect(mail.sent).toEqual([]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);
    expect(await orderRow(id)).toMatchObject({ fulfillment_status: "cancelled", payment_status: "unpaid" });
    const [{ total_kc }] = await rows(sql`SELECT total_kc FROM orders WHERE id = ${id}`);
    expect(await activity(id, "payment_after_cancellation")).toEqual([
      expect.objectContaining({ amountHal: Number(total_kc) * 100, provider: "stripe", method: "card" }),
    ]);
    expect(await activity(id, "refund_requested")).toEqual([]);
    expect(await money(id)).toEqual({ stage: "contact", heldHal: Number(total_kc) * 100 });
  });

  // ---------------------------------------------------------------- náhradní objednávka

  /** Stornovaná objednávka (2× Kulajda = 758 Kč) s platbou po stornu. */
  async function cancelledPaid(txId: string) {
    const id = randomUUID();
    await newOrder(id);
    await orders.updateFulfillmentStatus(id, "cancelled", "new");
    await postCancel(id, txId);
    mail.sent.length = 0;
    return id;
  }
  const replace = (
    id: string,
    overrides: Partial<Parameters<typeof orders.createReplacementFromCancelled>[1]> & { lines?: { sku: string; quantity: number }[] } = {}
  ) => {
    const { lines, ...rest } = overrides;
    return orders.createReplacementFromCancelled(id, {
      token: randomUUID(),
      cart: JSON.stringify(lines ?? [{ sku: "kulajda", quantity: 2 }]),
      shippingMethodId: "osobni-odber",
      street: "",
      city: "",
      zip: "",
      ageConfirmed: false,
      consent: true,
      note: "telefon 9. 10.",
      ...rest,
    });
  };
  const decodeQr = (base64: string) => {
    const png = PNG.sync.read(Buffer.from(base64, "base64"));
    return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? "";
  };

  it("náhradní objednávka — stejná částka: vlastní VS, zaplacená, stornovaná zůstává; jediný e-mail bez výzvy k platbě; historie u obou", async () => {
    const id = await cancelledPaid("BANK-REPL-SAME");
    const original = await orderRow(id);
    const [{ terms }] = await rows(sql`SELECT terms_accepted_at AS terms FROM orders WHERE id = ${id}`);

    expect(await replace(id, { consent: false })).toEqual({ ok: false, error: expect.stringMatching(/souhlas/) });
    const result = await replace(id);
    expect(result).toMatchObject({ ok: true, settled: true, alreadyCreated: false, movedHal: 75800, requiredHal: 75800, email: "sent" });
    const newId = (result as { orderId: string }).orderId;

    const created = (await rows(sql`
      SELECT channel, fulfillment_status, payment_status, payment_vs, payment_method_code, terms_accepted_at, contact_email
      FROM orders WHERE id = ${newId}`))[0];
    expect(created).toMatchObject({ channel: "eshop", fulfillment_status: "new", payment_status: "paid", payment_method_code: "prevod" });
    expect(created.payment_vs).toMatch(/^7\d{7}$/);
    expect(created.payment_vs).not.toBe(original.payment_vs);
    expect(created.terms_accepted_at).toEqual(terms);
    expect(await orderRow(id)).toMatchObject({ fulfillment_status: "cancelled", payment_status: "unpaid" });
    expect(await money(id)).toBeNull();
    expect(await money(newId)).toBeNull();

    // platba: původní převedená, nová u náhradní objednávky
    expect(await rows(sql`SELECT status FROM payments WHERE external_id = 'tx:BANK-REPL-SAME'`)).toEqual([{ status: "superseded" }]);
    expect(await rows(sql`SELECT amount_hal::int AS amount, vs FROM payments WHERE order_id = ${newId}`)).toEqual([
      { amount: 75800, vs: created.payment_vs },
    ]);
    // faktura: návrh jen u náhradní (zaplacené) objednávky, u stornované nic
    expect(await rows(sql`SELECT doc_state FROM invoices WHERE order_id = ${newId}`)).toEqual([{ doc_state: "draft" }]);
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${id}`)).toEqual([]);

    // e-mail: jediný, bez platebních údajů a QR, žádné „Přijali jsme…“ ani „Platbu jsme přijali“
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^\[TEST\] Náhradní objednávka \d+ — použili jsme vaši platbu$/)]);
    const [m] = mail.sent;
    expect(m.text).toContain("nic dalšího nehraďte");
    expect(m.text).toMatch(/Použili jsme na ni vaši platbu 758\sKč/);
    expect(m.text).not.toMatch(/Variabilní symbol|Číslo účtu|Zaplaťte/);
    expect(m.inlineImages ?? []).toEqual([]);
    expect(m.key).toBe(`eshop-customer_replacement-${newId}`);

    // historie
    const [out] = await activity(id, "payment_transferred_out");
    expect(out).toMatchObject({ replacement: true, toOrderId: newId, amountHal: 75800, consent: true });
    expect(out.toReference).toMatch(/^\d+$/);
    expect(await activity(newId, "created")).toEqual([expect.objectContaining({ replacementOfOrderId: id })]);
    expect(await activity(newId, "payment_transferred_in")).toEqual([expect.objectContaining({ fromOrderId: id, amountHal: 75800 })]);
    expect(await activity(newId, "email_sent")).toEqual([expect.objectContaining({ template: "customer_replacement" })]);
  });

  it("náhradní objednávka — doplatek: nezaplacená, e-mail i QR jen na zbytek s novým VS; po doplatku běžná cesta", async () => {
    const id = await cancelledPaid("BANK-REPL-MORE");
    const result = await replace(id, { lines: [{ sku: "kulajda", quantity: 3 }] });
    expect(result).toMatchObject({ ok: true, settled: false, movedHal: 75800, requiredHal: 113700 });
    const newId = (result as { orderId: string }).orderId;
    const { payment_vs: vs, payment_status } = await orderRow(newId);
    expect(payment_status).toBe("unpaid");
    expect(await rows(sql`SELECT id FROM invoices WHERE order_id = ${newId}`)).toEqual([]);

    const [m] = mail.sent;
    expect(mail.sent).toHaveLength(1);
    expect(m.text).toMatch(/Zbývá doplatit 379\sKč/);
    expect(m.text).toContain(`Variabilní symbol: ${vs}`);
    expect(m.text).toMatch(/Částka: 379\sKč/);
    expect(m.text).not.toMatch(/Částka: 1\s137/);
    expect(decodeQr(m.inlineImages![0].contentBase64)).toMatch(new RegExp(`\\*AM:379\\.00\\*.*\\*X-VS:${vs}\\*`));

    // zákazník doplatí → Zaplaceno → běžné „Platbu jsme přijali“ + návrh faktury
    mail.sent.length = 0;
    expect(
      await orders.recordOrderPayment(newId, { token: randomUUID(), amountKc: "379", date: today(), method: "bank_transfer", note: "" })
    ).toMatchObject({ ok: true, settled: true });
    expect(mail.sent.map((x) => x.subject)).toEqual([expect.stringMatching(/Platbu za objednávku \d+ jsme přijali$/)]);
    expect(await rows(sql`SELECT doc_state FROM invoices WHERE order_id = ${newId}`)).toEqual([{ doc_state: "draft" }]);
  });

  it("náhradní objednávka — přeplatek: zaplacená, přeplatek evidovaný jako závazek k vrácení (ne vrácené peníze), pak zápis vrácení", async () => {
    const id = await cancelledPaid("BANK-REPL-LESS");
    const result = await replace(id, { lines: [{ sku: "kulajda", quantity: 1 }] });
    expect(result).toMatchObject({ ok: true, settled: true, movedHal: 75800, requiredHal: 37900 });
    const newId = (result as { orderId: string }).orderId;
    expect(await orderRow(newId)).toMatchObject({ payment_status: "paid" });
    expect(await activity(newId, "overpayment_refund_due")).toEqual([{ amountHal: 37900 }]);
    expect(await money(newId)).toEqual({ stage: "overpaid", heldHal: 37900 });
    expect(await rows(sql`SELECT id FROM payments WHERE order_id = ${newId} AND direction = 'outflow'`)).toEqual([]);
    expect(mail.sent[0].text).toMatch(/Přeplatek 379\sKč vám vrátíme/);
    expect(mail.sent[0].text).not.toMatch(/Variabilní symbol/);

    const refund = (txId: string, amountKc: string) =>
      orders.recordOrderRefund(newId, { txId, amountKc, date: today(), method: "bank_transfer", note: "" });
    expect(await refund("VRAT-PREPLATEK", "380")).toEqual({ ok: false, error: expect.stringMatching(/nejvýš 379/) });
    expect(await refund("VRAT-PREPLATEK", "379")).toEqual({ ok: true, recorded: true, remainingHal: 0 });
    expect(await money(newId)).toBeNull();
    const [balance] = await rows(sql`SELECT balance_state FROM order_payment_balance WHERE order_id = ${newId}`);
    expect(balance.balance_state).toBe("paid");
    expect(await orderRow(newId)).toMatchObject({ payment_status: "paid" });
  });

  it("náhradní objednávka — dvojklik (týž formulář) i dva souběžné formuláře: vznikne jediná objednávka, jediný e-mail", async () => {
    const id = await cancelledPaid("BANK-REPL-DOUBLE");
    const token = randomUUID();
    const [a, b] = await Promise.all([replace(id, { token }), replace(id, { token })]);
    expect([a, b].filter((r) => r.ok && !r.alreadyCreated)).toHaveLength(1);
    expect([a, b].every((r) => r.ok)).toBe(true);
    // druhý formulář (jiný token) souběžně / později
    const [c, d] = await Promise.all([replace(id), replace(id)]);
    expect([c, d].every((r) => !r.ok)).toBe(true);
    const replacements = await rows(sql`
      SELECT order_id FROM order_activity WHERE kind = 'created' AND metadata->>'replacementOfOrderId' = ${id}`);
    expect(replacements).toEqual([{ order_id: token }]);
    expect(mail.sent.filter((m) => /Náhradní objednávka/.test(m.subject))).toHaveLength(1);
  });

  it("náhradní objednávka — dva různé formuláře naráz: druhá transakce nenajde co převést a celá se vrátí (žádná objednávka bez peněz)", async () => {
    const id = await cancelledPaid("BANK-REPL-RACE");
    const [t1, t2] = [randomUUID(), randomUUID()];
    const results = await Promise.all([replace(id, { token: t1 }), replace(id, { token: t2 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: expect.stringMatching(/Nic se nezměnilo|nedržíme/) }]);
    const existing = await rows(sql`SELECT id FROM orders WHERE id IN (${t1}, ${t2})`);
    expect(existing).toHaveLength(1);
    expect(await rows(sql`SELECT count(*)::int AS n FROM payments WHERE external_id LIKE 'transfer:%' AND order_id IN (${t1}, ${t2})`)).toEqual([{ n: 1 }]);
    expect(await activity(id, "payment_transferred_out")).toHaveLength(1);
  });

  it("náhradní objednávka — chyba uprostřed transakce: vše se vrátí (žádná objednávka, platba zůstává u stornované)", async () => {
    const id = await cancelledPaid("BANK-REPL-FAIL");
    const token = randomUUID();
    // simulovaná chyba AŽ po založení objednávky v téže transakci (zápis převodu)
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION test_fail_transfer() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulovaná chyba převodu'; END $$ LANGUAGE plpgsql`));
    await db.execute(sql.raw(`
      CREATE TRIGGER test_fail_transfer BEFORE INSERT ON payments FOR EACH ROW
        WHEN (NEW.external_id LIKE 'transfer:%') EXECUTE FUNCTION test_fail_transfer()`));
    try {
      expect(await replace(id, { token })).toEqual({ ok: false, error: expect.stringMatching(/Nic se nezměnilo/) });
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER test_fail_transfer ON payments`));
      await db.execute(sql.raw(`DROP FUNCTION test_fail_transfer()`));
    }
    expect(await rows(sql`SELECT id FROM orders WHERE id = ${token}`)).toEqual([]);
    expect(await rows(sql`SELECT id FROM order_items WHERE order_id = ${token}`)).toEqual([]);
    expect(await rows(sql`SELECT status FROM payments WHERE external_id = 'tx:BANK-REPL-FAIL'`)).toEqual([{ status: "succeeded" }]);
    expect(await activity(id, "payment_transferred_out")).toEqual([]);
    expect(mail.sent).toEqual([]);
    expect(await money(id)).toEqual({ stage: "contact", heldHal: 75800 });
    // po odstranění chyby jde vše normálně
    expect(await replace(id, { token })).toMatchObject({ ok: true, alreadyCreated: false });
  });

  it("náhradní objednávka s alkoholem: bez nového potvrzení věku nevznikne; s ním ano (záznam v historii)", async () => {
    const id = await cancelledPaid("BANK-REPL-18");
    const lines = [{ sku: "svarak-deluxe-500ml", quantity: 1 }];
    expect(await replace(id, { lines })).toEqual({ ok: false, error: expect.stringMatching(/znovu potvrdit, že je starší 18 let/) });
    expect(await money(id)).toEqual({ stage: "contact", heldHal: 75800 });
    const result = await replace(id, { lines, ageConfirmed: true });
    expect(result).toMatchObject({ ok: true });
    const newId = (result as { orderId: string }).orderId;
    expect((await rows(sql`SELECT age_confirmed_at IS NOT NULL AS confirmed FROM orders WHERE id = ${newId}`))[0].confirmed).toBe(true);
    expect(await activity(newId, "created")).toEqual([expect.objectContaining({ ageConfirmedByStaff: true })]);
  });

  it("stornovaná objednávka s vystavenou fakturou: převod ani náhradní objednávka nejdou (jinak dvě faktury za tytéž peníze)", async () => {
    const id = await cancelledPaid("BANK-REPL-INV");
    await db.execute(sql`
      INSERT INTO invoices (order_id, total_kc, document_type, origin, doc_state, invoice_number, issued_at)
      VALUES (${id}, 758, 'invoice', 'eshop', 'issued', '9260099', now())`);
    expect(await replace(id)).toEqual({ ok: false, error: expect.stringMatching(/vystavená faktura 9260099.*dobropis/) });
    const target = randomUUID();
    await newOrder(target);
    const { payment_vs: vs } = await orderRow(target);
    expect(await orders.transferOrderPayment(id, { target: vs, consent: true, note: "tel.", allowDifferentCustomer: false })).toEqual({
      ok: false,
      error: expect.stringMatching(/dobropis/),
    });
    expect(await rows(sql`SELECT status FROM payments WHERE external_id = 'tx:BANK-REPL-INV'`)).toEqual([{ status: "succeeded" }]);
  });

  it("ruční (B2B) objednávka: storno bez e-mailu a bez upozornění (platby se u ní neevidují)", async () => {
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
    expect(result).toMatchObject({ ok: true, changed: true, cancellation: { heldHal: 90000, email: null } });
    expect(mail.sent).toEqual([]);
    expect(await money(id)).toBeNull();
  });
});
