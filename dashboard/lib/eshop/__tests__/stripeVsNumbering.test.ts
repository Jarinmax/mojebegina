// Platba kartou (Stripe) nad číslováním jako v Production: číslo objednávky
// = VS z řady payment_vs_seq (docs/eshop-production/31_cislovani_vs.sql).
// Skutečná pokladna, zahájení platby, route webhooku s ověřením podpisu
// a evidence plateb nad ovladačem Neonu → PGlite. Stripe API nahrazuje
// napodobenina (bez sítě); podpisy událostí jsou skutečné.
//
// Ověřuje: číslo i VS vzniknou jednou při uložení objednávky a platba
// (ani opakovaná, zrušená nebo duplicitní) je nezmění; každý pokus nese
// VS objednávky; duplicitní webhooky nezaloží druhou platbu ani objednávku;
// řada pokračuje bez děr způsobených platbou kartou.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { saveEshopOrder } from "../orderWrite";
import { startCardPayment, type CheckoutSessionsApi } from "../stripe/payment";
import { catalogIndex } from "./helpers/catalogFixture";

vi.mock("server-only", () => ({}));

const WEBHOOK_SECRET = "whsec_test_begina_vs";
const PREVIEW_ENV = {
  VERCEL_ENV: "preview",
  STRIPE_SECRET_KEY: "sk_test_begina",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  E2E_ORDER_NUMBERING: "vs",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
};

function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "osobni-odber",
    paymentMethodId: "karta",
    street: "",
    city: "",
    zip: "",
    note: "",
    termsAccepted: true,
    ageConfirmed: false,
    ...overrides,
  };
}

function checkout(overrides: Partial<CheckoutInput> = {}) {
  const result = validateCheckoutInput(input(overrides), catalogIndex, { cardPaymentAvailable: true });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

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
      const session = { id: `cs_test_vs_${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_vs_${n}` };
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

describe("Stripe + číslo objednávky = VS (stav Production)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");
  const stripe = fakeSessions();

  beforeAll(async () => {
    Object.assign(process.env, PREVIEW_ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ POST } = await import("@/app/api/eshop/stripe/webhook/route"));
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const order = async (id: string) =>
    (
      await rows(sql`SELECT order_number::text AS n, payment_vs AS vs, payment_status AS st, total_kc AS total
                     FROM orders WHERE id = ${id}`)
    )[0];
  const payments = async (id: string) =>
    rows(sql`SELECT external_id, status, amount_hal::int AS hal, vs FROM payments WHERE order_id = ${id} ORDER BY external_id`);

  async function webhook(type: string, orderId: string, session: Partial<Stripe.Checkout.Session>, eventId: string) {
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type,
      data: {
        object: {
          object: "checkout.session",
          client_reference_id: orderId,
          metadata: { orderId, source: "mojebegina-eshop" },
          payment_status: "paid",
          currency: "czk",
          ...session,
        },
      },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await POST(
      new Request("http://localhost/api/eshop/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } })
    );
    return (await response.json()).outcome as string;
  }

  const A = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f1";
  const B = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f2";
  const C = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f3";

  it("objednávka kartou dostane číslo = VS hned při uložení (70000001), nezaplacená", async () => {
    expect(await saveEshopOrder(db, A, checkout())).toMatchObject({ ok: true, orderNumber: 70000001, paymentVs: "70000001" });
    expect(await order(A)).toEqual({ n: "70000001", vs: "70000001", st: "unpaid", total: 758 });
  });

  it("platební stránka: spojení přes id objednávky, pokus v payments nese VS objednávky", async () => {
    const started = await startCardPayment(db, stripe.api, A, "https://preview.example");
    expect(started).toMatchObject({ ok: true, reused: false });
    expect(stripe.created[0]).toMatchObject({ client_reference_id: A, metadata: { orderId: A, source: "mojebegina-eshop" } });
    expect(stripe.created[0].line_items?.reduce((s, l) => s + (l.price_data?.unit_amount ?? 0) * (l.quantity ?? 1), 0)).toBe(75800);
    expect(await payments(A)).toEqual([{ external_id: "cs_test_vs_1", status: "pending", hal: 75800, vs: "70000001" }]);
  });

  it("úspěšná platba: Zaplaceno, číslo ani VS se nezmění; duplicitní webhooky nic nezaloží", async () => {
    const paid = { id: "cs_test_vs_1", amount_total: 75800, payment_intent: "pi_vs_1" };
    expect(await webhook("checkout.session.completed", A, paid, "evt_vs_1")).toBe("paid");
    expect(await webhook("checkout.session.completed", A, paid, "evt_vs_1")).toBe("already-paid");
    expect(await webhook("checkout.session.completed", A, paid, "evt_vs_1_retry")).toBe("already-paid");
    expect(await webhook("checkout.session.async_payment_succeeded", A, paid, "evt_vs_1_async")).toBe("already-paid");
    expect(await order(A)).toEqual({ n: "70000001", vs: "70000001", st: "paid", total: 758 });
    expect(await payments(A)).toEqual([{ external_id: "cs_test_vs_1", status: "succeeded", hal: 75800, vs: "70000001" }]);
    const [{ n }] = await rows(sql`SELECT count(*)::int AS n FROM orders WHERE contact_email = 'jana@example.cz'`);
    expect(n).toBe(1);
    const [{ k }] = await rows(sql`SELECT count(*)::int AS k FROM order_activity WHERE order_id = ${A} AND kind = 'payment_status_changed'`);
    expect(k).toBe(1);
  });

  it("další objednávka (převodem) pokračuje v řadě: 70000002 — platba kartou žádné číslo nespotřebovala", async () => {
    expect(await saveEshopOrder(db, B, checkout({ paymentMethodId: "prevod" }))).toMatchObject({ orderNumber: 70000002, paymentVs: "70000002" });
  });

  it("zamítnutá / zrušená platba a nový pokus: stejná objednávka, stejné číslo i VS, platby se nesčítají", async () => {
    expect(await saveEshopOrder(db, C, checkout({ cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]) }))).toMatchObject({
      orderNumber: 70000003,
      paymentVs: "70000003",
    });
    const first = await startCardPayment(db, stripe.api, C, "https://preview.example");
    expect(first).toMatchObject({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_vs_2" });
    // zákazník platbu zrušil / karta zamítnuta → Stripe stránku nechá vypršet
    expect(await webhook("checkout.session.expired", C, { id: "cs_test_vs_2", payment_status: "unpaid", amount_total: 37900 }, "evt_vs_exp")).toBe("no-change");
    stripe.status.set("cs_test_vs_2", "expired");
    expect(await order(C)).toEqual({ n: "70000003", vs: "70000003", st: "unpaid", total: 379 });
    // „Zaplatit znovu“ → nový pokus, nová platební stránka
    const second = await startCardPayment(db, stripe.api, C, "https://preview.example");
    expect(second).toMatchObject({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_vs_3", reused: false });
    expect(await webhook("checkout.session.completed", C, { id: "cs_test_vs_3", amount_total: 37900, payment_intent: "pi_vs_3" }, "evt_vs_3")).toBe("paid");
    expect(await order(C)).toEqual({ n: "70000003", vs: "70000003", st: "paid", total: 379 });
    expect(await payments(C)).toEqual([
      { external_id: "cs_test_vs_2", status: "cancelled", hal: 37900, vs: "70000003" },
      { external_id: "cs_test_vs_3", status: "succeeded", hal: 37900, vs: "70000003" },
    ]);
    const [{ balance }] = await rows(sql`SELECT balance_state AS balance FROM order_payment_balance WHERE order_id = ${C}`);
    expect(balance).toBe("paid");
  });

  it("v celé řadě není žádné číslo ani VS dvakrát a každá objednávka má číslo = VS", async () => {
    const all = await rows(sql`SELECT order_number::text AS n, payment_vs AS vs FROM orders WHERE channel = 'eshop' ORDER BY order_number`);
    expect(all).toEqual([
      { n: "70000001", vs: "70000001" },
      { n: "70000002", vs: "70000002" },
      { n: "70000003", vs: "70000003" },
    ]);
  });
});
