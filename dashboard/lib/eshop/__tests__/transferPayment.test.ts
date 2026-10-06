// ESHOP 1.0 — převod + QR Platba + číslování + „Platbu jsme přijali“ nad
// skutečnou pokladnou, webhookem Stripe a datovou vrstvou MojeBegina
// (ovladač Neonu → PGlite se všemi migracemi a se ZAPNUTÝM číslováním od
// 900000 jako na Preview). Resend a Stripe API nahrazují napodobeniny.
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

  it("převod: objednávka dostane číslo 900001 a VS 70000001; potvrzení obsahuje účet, VS, splatnost a QR (vložený obrázek cid:)", async () => {
    const result = await submitCheckoutAction(null, form(TRANSFER));
    expect(result).toMatchObject({ savedOrderId: TRANSFER, orderNumber: 900001, email: "sent" });

    const [customer, internal] = mail.sent;
    expect(customer.subject).toBe("[TEST] Přijali jsme vaši objednávku 900001");
    for (const part of ["Číslo účtu: 19-2000145399/0800", "IBAN: CZ65 0800 0000 1920 0014 5399", "Variabilní symbol: 70000001", "Splatnost: "]) {
      expect(customer.text).toContain(part);
    }
    expect(customer.html).toContain('src="cid:qr-platba"');
    expect(customer.inlineImages).toHaveLength(1);
    const image = customer.inlineImages![0];
    expect(image).toMatchObject({ filename: "qr-platba.png", contentId: "qr-platba" });

    // QR v e-mailu jde naskenovat a obsahuje správnou platbu.
    const png = PNG.sync.read(Buffer.from(image.contentBase64, "base64"));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? "";
    // Datum v QR = den vytvoření objednávky (český čas), ne splatnost.
    const [{ ordered_day }] = (await rows(
      sql`SELECT to_char(ordered_at AT TIME ZONE 'Europe/Prague', 'YYYYMMDD') AS ordered_day FROM orders WHERE id = ${TRANSFER}`
    )) as { ordered_day: string }[];
    expect(decoded).toBe(`SPD*1.0*ACC:${IBAN}*AM:758.00*CC:CZK*DT:${ordered_day}*X-VS:70000001*MSG:BEGINA OBJEDNAVKA 900001`);

    expect(internal.subject).toContain("Nová objednávka 900001");
    expect(internal.text).toContain("Variabilní symbol: 70000001");
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

  // ESHOP 1.0 (platby a fakturace, krok B): u e-shopu se Zaplaceno nepřepíná,
  // zapisuje se platba (payments) a Zaplaceno nastaví přepočet.
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  const payment = (amountKc: string, token: string = randomUUID()) => ({ token, amountKc, date: today, method: "bank_transfer", note: "" });

  it("zapsaná platba převodem: částečná úhrada nic nepošle; doplatek → Zaplaceno a „Platbu jsme přijali“ jen jednou", async () => {
    expect(await orders.updatePaymentStatus(TRANSFER, "paid")).toEqual({
      ok: false,
      error: "U e-shopové objednávky se stav platby nepřepíná — zapište platbu.",
    });
    expect(await orders.recordOrderPayment(TRANSFER, payment("300"))).toEqual({ ok: true, recorded: true, settled: false });
    expect(mail.sent).toHaveLength(0);
    expect((await rows(sql`SELECT payment_status FROM orders WHERE id = ${TRANSFER}`))[0].payment_status).toBe("unpaid");
    expect((await orders.getOrderDetail(TRANSFER))?.payments).toMatchObject({
      balanceState: "partially_paid",
      netHal: 30000,
      remainingHal: 45800,
    });

    const token = randomUUID();
    expect(await orders.recordOrderPayment(TRANSFER, payment("458", token))).toEqual({ ok: true, recorded: true, settled: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("[TEST] Platbu za objednávku 900001 jsme přijali");
    expect(mail.sent[0].to).toEqual(["jaroslav@begina.test", "lucie@begina.test"]);
    expect(mail.sent[0].text).toContain("V ostrém provozu by šel na: jana@example.cz");

    // dvojí odeslání formuláře (stejný token) = žádná druhá platba ani e-mail
    expect(await orders.recordOrderPayment(TRANSFER, payment("458", token))).toEqual({ ok: true, recorded: false, settled: false });
    expect(mail.sent).toHaveLength(1);
    expect(
      await rows(sql`SELECT source, method, direction, status, amount_hal::int AS hal, vs, recorded_by_user_id IS NOT NULL AS kdo
                     FROM payments WHERE order_id = ${TRANSFER} ORDER BY amount_hal`)
    ).toEqual([
      { source: "manual", method: "bank_transfer", direction: "inflow", status: "succeeded", hal: 30000, vs: "70000001", kdo: true },
      { source: "manual", method: "bank_transfer", direction: "inflow", status: "succeeded", hal: 45800, vs: "70000001", kdo: true },
    ]);
    expect(await rows(sql`SELECT payment_status, paid_at IS NOT NULL AS paid_at FROM orders WHERE id = ${TRANSFER}`)).toEqual([
      { payment_status: "paid", paid_at: true },
    ]);
    expect(await emailLog(TRANSFER)).toEqual([
      "email_sent:customer_confirmation:qr",
      "email_sent:internal_new_order",
      "email_sent:customer_payment_received",
    ]);
  });

  it("neplatný zápis platby se odmítne a nic neuloží", async () => {
    const ID = "e5e5e5e5-5555-4555-8555-555555555555";
    await submitCheckoutAction(null, form(ID));
    const before = mail.sent.length;
    expect(await orders.recordOrderPayment(ID, { ...payment("0") })).toMatchObject({ ok: false });
    expect(await orders.recordOrderPayment(ID, { ...payment("abc") })).toMatchObject({ ok: false });
    expect(await orders.recordOrderPayment(ID, { ...payment("100"), date: "2999-01-01" })).toEqual({
      ok: false,
      error: "Datum platby nemůže být v budoucnosti.",
    });
    expect(await orders.recordOrderPayment(ID, { ...payment("100"), method: "card" })).toEqual({ ok: false, error: "Vyberte způsob platby." });
    expect(await orders.recordOrderPayment(ID, { ...payment("100"), token: "x" })).toMatchObject({ ok: false });
    expect(await rows(sql`SELECT count(*)::int AS n FROM payments WHERE order_id = ${ID}`)).toEqual([{ n: 0 }]);
    expect(mail.sent).toHaveLength(before);
  });

  it("kartou zaplacená objednávka: ruční přepínání stavu u e-shopu nejde, nic dalšího se nepošle", async () => {
    expect(await orders.updatePaymentStatus(CARD, "unpaid")).toMatchObject({ ok: false });
    expect((await rows(sql`SELECT payment_status FROM orders WHERE id = ${CARD}`))[0].payment_status).toBe("paid");
    expect(mail.sent).toHaveLength(0);
  });

  it("výpadek e-mailu po zapsané platbě: Zaplaceno se uloží, v historii varování", async () => {
    const ID = "d4d4d4d4-4444-4444-8444-444444444444";
    await submitCheckoutAction(null, form(ID));
    mail.mode = "error";
    expect(await orders.recordOrderPayment(ID, payment("758"))).toEqual({ ok: true, recorded: true, settled: true });
    expect((await rows(sql`SELECT payment_status FROM orders WHERE id = ${ID}`))[0].payment_status).toBe("paid");
    expect((await emailLog(ID)).at(-1)).toBe("email_failed:customer_payment_received");
  });

  // ESHOP 1.0 — návrh faktury po úplném zaplacení (režim návrhu, do iDokladu nic)
  const invoiceState = async (id: string) =>
    rows(sql`SELECT i.origin, i.document_type, i.doc_state, i.total_kc, i.payment_vs, i.customer_id IS NOT NULL AS zakaznik,
                    l.provider, l.state, l.number_series, l.request_payload->'draft'->>'vs' AS draft_vs,
                    jsonb_array_length(l.request_payload->'draft'->'payments') AS platby,
                    l.request_payload->'draft'->>'paymentMethod' AS uhrada,
                    (SELECT count(*)::int FROM jsonb_array_elements(l.request_payload->'problems') p WHERE p->>'severity' = 'error') AS chyby
             FROM invoices i JOIN invoice_provider_links l ON l.invoice_id = i.id
             WHERE i.order_id = ${id} AND l.state <> 'void'`);

  it("návrh faktury: po zapsané úhradě celé částky vznikl jednou, s VS, zákazníkem a vazbou na obě platby", async () => {
    expect(await invoiceState(TRANSFER)).toEqual([
      {
        origin: "eshop",
        document_type: "invoice",
        doc_state: "draft",
        total_kc: 758,
        payment_vs: "70000001",
        zakaznik: true,
        provider: "idoklad",
        state: "dry_run",
        number_series: null,
        draft_vs: "70000001",
        platby: 2,
        uhrada: "bank_transfer",
        chyby: 0,
      },
    ]);
    const detail = await orders.getOrderDetail(TRANSFER);
    expect(detail?.invoice?.link?.payload?.idoklad.duplicateCheck.filter).toBe("VariableSymbol~eq~70000001");
    expect(detail?.invoice?.link?.payload?.draft.lines).toEqual([
      { kind: "item", name: "Kulajda", sku: "kulajda", quantity: 2, unitPriceKc: 379, totalKc: 758 },
    ]);
    expect(
      (await rows(sql`SELECT kind, author_name FROM order_activity WHERE order_id = ${TRANSFER} AND kind LIKE 'invoice%'`))
    ).toEqual([{ kind: "invoice_draft_created", author_name: "Lucie Test" }]);
  });

  it("návrh faktury: kartou zaplacená objednávka (webhook) má návrh se způsobem úhrady kartou; zákazník podle e-mailu jen jednou", async () => {
    expect(await invoiceState(CARD)).toMatchObject([{ state: "dry_run", uhrada: "card", platby: 1, chyby: 0 }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM invoice_customers WHERE email_normalized = 'jana@example.cz'`)).toEqual([{ n: 1 }]);
  });

  it("návrh faktury: opakované vytvoření nic nezdvojí; přegenerovat jde jen návrh", async () => {
    expect(await orders.prepareOrderInvoiceDraft(TRANSFER, false)).toEqual({
      ok: true,
      result: { status: "exists", reason: "Návrh faktury k objednávce už existuje." },
    });
    expect(await orders.prepareOrderInvoiceDraft(TRANSFER, true)).toMatchObject({ ok: true, result: { status: "regenerated" } });
    expect(await rows(sql`SELECT count(*)::int AS n FROM invoices WHERE order_id = ${TRANSFER}`)).toEqual([{ n: 1 }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM invoice_provider_links l JOIN invoices i ON i.id = l.invoice_id WHERE i.order_id = ${TRANSFER}`)).toEqual([{ n: 1 }]);
    // druhá prodejní faktura k téže objednávce nevznikne ani přímo v DB
    await expect(
      rows(sql`INSERT INTO invoices (order_id, origin, total_kc) VALUES (${TRANSFER}, 'eshop', 758)`)
    ).rejects.toThrow();

    // vystavenou fakturu (simulace ostrého stavu) návrh nepřepíše
    await rows(sql`UPDATE invoice_provider_links l SET state = 'issued', external_id = '777', external_number = 'E2026001', issued_at = now()
                   FROM invoices i WHERE l.invoice_id = i.id AND i.order_id = ${TRANSFER}`);
    await rows(sql`UPDATE invoices SET doc_state = 'issued', invoice_number = 'E2026001', issued_at = now() WHERE order_id = ${TRANSFER}`);
    expect(await orders.prepareOrderInvoiceDraft(TRANSFER, true)).toEqual({
      ok: true,
      result: { status: "exists", reason: "Faktura je už vystavená — návrh nejde přepsat (opravuje se dobropisem)." },
    });
  });

  it("návrh faktury: nezaplacená objednávka žádný návrh nemá ani nedostane", async () => {
    const ID = "f6f6f6f6-6666-4666-8666-666666666666";
    await submitCheckoutAction(null, form(ID));
    expect(await orders.prepareOrderInvoiceDraft(ID, false)).toEqual({ ok: false, error: "Návrh faktury vznikne až po úplném zaplacení." });
    expect(await rows(sql`SELECT count(*)::int AS n FROM invoices WHERE order_id = ${ID}`)).toEqual([{ n: 0 }]);
    expect((await orders.getOrderDetail(ID))?.invoice).toBeNull();
  });

  it("do iDokladu ani jinam mimo testovací DB neodešel žádný požadavek", () => {
    expect(outbound.filter((url) => /idoklad/i.test(url))).toEqual([]);
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
