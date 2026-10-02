// ESHOP 1.0 — převod + QR Platba + číslování + „Platbu jsme přijali“ nad
// skutečnou pokladnou, webhookem Stripe a datovou vrstvou MojeBegina
// (ovladač Neonu → PGlite se všemi migracemi a se ZAPNUTÝM číslováním od
// 900000 jako na Preview). Resend a Stripe API nahrazují napodobeniny.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const IBAN = "CZ6508000000192000145399";
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

describe("převod + QR + číslování + platba přijata (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let orders: typeof import("@/lib/data/orders");
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
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
  const emailLog = async (id: string) =>
    (
      await rows(sql`SELECT kind, metadata->>'template' AS template, metadata->>'qr' AS qr
                     FROM order_activity WHERE order_id = ${id} AND kind LIKE 'email%' ORDER BY created_at`)
    ).map((r: { kind: string; template: string; qr: string | null }) => `${r.kind}:${r.template}${r.qr ? ":qr" : ""}`);

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

  const TRANSFER = "a1a1a1a1-1111-4111-8111-111111111111";
  const CARD = "b2b2b2b2-2222-4222-8222-222222222222";

  it("převod: objednávka dostane číslo 900001 a potvrzení obsahuje účet, VS, splatnost a QR (vložený obrázek cid:)", async () => {
    const result = await submitCheckoutAction(null, form(TRANSFER));
    expect(result).toMatchObject({ savedOrderId: TRANSFER, orderNumber: 900001, email: "sent" });

    const [customer, internal] = mail.sent;
    expect(customer.subject).toBe("[TEST] Přijali jsme vaši objednávku 900001");
    for (const part of ["Číslo účtu: 19-2000145399/0800", "IBAN: CZ65 0800 0000 1920 0014 5399", "Variabilní symbol: 900001", "Splatnost: "]) {
      expect(customer.text).toContain(part);
    }
    expect(customer.html).toContain('src="cid:qr-platba"');
    expect(customer.inlineImages).toHaveLength(1);
    const image = customer.inlineImages![0];
    expect(image).toMatchObject({ filename: "qr-platba.png", contentId: "qr-platba" });

    // QR v e-mailu jde naskenovat a obsahuje správnou platbu.
    const png = PNG.sync.read(Buffer.from(image.contentBase64, "base64"));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? "";
    expect(decoded).toMatch(new RegExp(`^SPD\\*1\\.0\\*ACC:${IBAN}\\*AM:758\\.00\\*CC:CZK\\*DT:\\d{8}\\*X-VS:900001\\*MSG:BEGINA OBJEDNAVKA 900001$`));

    expect(internal.subject).toContain("Nová objednávka 900001");
    expect(internal.text).toContain("Variabilní symbol: 900001");
    expect(internal.inlineImages ?? []).toHaveLength(0);
    expect(await emailLog(TRANSFER)).toEqual(["email_sent:customer_confirmation:qr", "email_sent:internal_new_order"]);
  });

  it("karta: číslo 900002, potvrzení až po zaplacení a bez QR", async () => {
    const result = await submitCheckoutAction(null, form(CARD, { paymentMethodId: "karta" }));
    expect(result).toEqual({ redirectTo: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) });
    expect(mail.sent).toHaveLength(0);
    expect((await payByWebhook(CARD, "evt_card")).outcome).toBe("paid");
    expect(mail.sent[0].subject).toBe("[TEST] Objednávka 900002 je zaplacená — děkujeme");
    expect(mail.sent[0].inlineImages ?? []).toHaveLength(0);
  });

  it("MojeBegina: nezaplacený převod po 5 dnech „po splatnosti“ (jen označení, nic se neruší)", async () => {
    const OLD = "c3c3c3c3-3333-4333-8333-333333333333";
    await submitCheckoutAction(null, form(OLD));
    await rows(sql`UPDATE orders SET ordered_at = now() - interval '6 days' WHERE id = ${OLD}`);
    const { orders: cards } = await orders.listOrders();
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get(OLD)).toMatchObject({ paymentOverdue: true, fulfillmentStatus: "new", orderNumber: 900003 });
    expect(byId.get(TRANSFER)?.paymentOverdue).toBe(false);
    expect(byId.get(CARD)?.paymentOverdue).toBe(false);
    const detail = await orders.getOrderDetail(OLD);
    expect(detail?.order.transferDueAt).toBeInstanceOf(Date);
    expect((await orders.getOrderDetail(CARD))?.order.transferDueAt).toBeNull();
  });

  it("ruční označení Zaplaceno: zákazník dostane „Platbu jsme přijali“ — jen jednou, i po přepnutí tam a zpět", async () => {
    expect(await orders.updatePaymentStatus(TRANSFER, "paid")).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("[TEST] Platbu za objednávku 900001 jsme přijali");
    expect(mail.sent[0].to).toEqual(["jaroslav@begina.test", "lucie@begina.test"]);
    expect(mail.sent[0].text).toContain("V ostrém provozu by šel na: jana@example.cz");

    await orders.updatePaymentStatus(TRANSFER, "unpaid");
    await orders.updatePaymentStatus(TRANSFER, "paid");
    expect(mail.sent).toHaveLength(1);
    expect(await emailLog(TRANSFER)).toEqual([
      "email_sent:customer_confirmation:qr",
      "email_sent:internal_new_order",
      "email_sent:customer_payment_received",
    ]);
  });

  it("kartou zaplacená objednávka (potvrzení už dostala): ruční Zaplaceno nic dalšího nepošle", async () => {
    await orders.updatePaymentStatus(CARD, "unpaid");
    await orders.updatePaymentStatus(CARD, "paid");
    expect(mail.sent).toHaveLength(0);
  });

  it("výpadek e-mailu při ručním Zaplaceno: stav se uloží, v historii varování", async () => {
    const ID = "d4d4d4d4-4444-4444-8444-444444444444";
    await submitCheckoutAction(null, form(ID));
    mail.mode = "error";
    expect(await orders.updatePaymentStatus(ID, "paid")).toEqual({ ok: true });
    expect((await rows(sql`SELECT payment_status FROM orders WHERE id = ${ID}`))[0].payment_status).toBe("paid");
    expect((await emailLog(ID)).at(-1)).toBe("email_failed:customer_payment_received");
  });

  it("ruční objednávka (ne e-shop): žádný e-mail", async () => {
    const [{ id }] = await rows(sql`
      INSERT INTO organizations (ico, name, registered_address) VALUES ('11935367', 'The Cup s.r.o.', 'Praha') RETURNING id`);
    const [{ id: orderId }] = await rows(sql`
      INSERT INTO orders (buyer_organization_id, contact_email, subtotal_kc, total_kc, payment_status)
      VALUES (${id}, 'firma@example.cz', 500, 500, 'unpaid') RETURNING id`);
    await orders.updatePaymentStatus(orderId, "paid");
    expect(mail.sent).toHaveLength(0);
  });
});
