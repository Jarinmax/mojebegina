// Potvrzení objednávky s PDF obchodních podmínek (§ 1824 OZ) nad skutečným
// kódem pokladny a webhooku Stripe (DB = ovladač Neonu → PGlite, Resend
// a Stripe = napodobeniny): co přesně odejde v příloze, že je to znění
// platné při objednávce, co se zapíše do historie a že výpadek PDF
// objednávku nezastaví.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import type { EmailMessage } from "../email/resend";
import { CURRENT_TERMS, LEGACY_TERMS } from "../content/termsVersions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));

const mail = vi.hoisted(() => ({ sent: [] as (EmailMessage & { key: string })[] }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: EmailMessage, key: string) => {
    mail.sent.push({ ...message, key });
    return { ok: true, id: `msg_${mail.sent.length}` };
  },
}));
vi.mock("@/lib/eshop/stripe/client", async () => {
  const { default: RealStripe } = await vi.importActual<typeof import("stripe")>("stripe");
  const webhooks = new RealStripe("sk_test_begina").webhooks;
  let created = 0;
  return {
    getStripe: () => ({
      webhooks,
      checkout: {
        sessions: {
          create: async () => {
            created += 1;
            return { id: `cs_test_terms_${created}`, url: `https://checkout.stripe.com/c/pay/cs_test_terms_${created}` };
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
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test, jana@example.cz",
  // testovací účet (jako v bankTransfer.test.ts) — potvrzení převodu nese QR
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399",
};

const sha256 = (base64: string) => createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

describe("potvrzení objednávky s PDF obchodních podmínek (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let POST: (request: Request) => Promise<Response>;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let termsPdf: typeof import("../legal/termsPdf").termsPdf;
  let sendOrderEmails: typeof import("../email/orderEmails").sendOrderEmails;
  const saved = { ...process.env };
  const signer = new Stripe("sk_test_begina");

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ POST } = await import("@/app/api/eshop/stripe/webhook/route"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
    ({ termsPdf } = await import("../legal/termsPdf"));
    ({ sendOrderEmails } = await import("../email/orderEmails"));
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
    Object.assign(process.env, ENV);
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const sentRecords = async (id: string) =>
    (await rows(sql`SELECT metadata FROM order_activity WHERE order_id = ${id} AND kind = 'email_sent' ORDER BY created_at`)).map(
      (r: { metadata: Record<string, unknown> }) => r.metadata
    );

  function form(orderToken: string, overrides: Record<string, string> = {}) {
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
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

  async function payByCard(orderId: string, eventId: string) {
    const amount = Number((await rows(sql`SELECT total_kc FROM orders WHERE id = ${orderId}`))[0].total_kc);
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
          amount_total: amount * 100,
          currency: "czk",
          payment_intent: `pi_${eventId}`,
        },
      },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await POST(
      new Request("https://preview.example/api/eshop/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } })
    );
    expect(response.status).toBe(200);
  }

  it("převod: znění se zapíše k objednávce; potvrzení nese PDF právě tohoto znění, interní e-mail nic", async () => {
    const ID = "c1c1c1c1-1111-4111-8111-111111111111";
    expect(await submitCheckoutAction(null, form(ID))).toMatchObject({ savedOrderId: ID, email: "sent" });

    expect(await rows(sql`SELECT metadata->>'termsVersion' AS v FROM order_activity WHERE order_id = ${ID} AND kind = 'created'`)).toEqual([
      { v: CURRENT_TERMS.id },
    ]);

    const [customer, internal] = mail.sent;
    expect(customer.key).toBe(`eshop-customer_confirmation-${ID}`);
    const expected = await termsPdf(CURRENT_TERMS);
    expect(customer.attachments).toEqual([
      { filename: `obchodni-podminky-begina-${CURRENT_TERMS.id}.pdf`, contentBase64: expected.contentBase64, contentType: "application/pdf" },
    ]);
    expect(Buffer.from(customer.attachments![0].contentBase64, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(customer.text).toContain(
      `V příloze posíláme obchodní podmínky ve znění účinném od ${CURRENT_TERMS.effectiveLabel}, se kterými jste při objednávce souhlasili, včetně vzorového formuláře pro odstoupení od smlouvy.`
    );
    expect(customer.text).toContain(`https://preview.example/eshop/obchodni-podminky/${CURRENT_TERMS.id}.pdf`);
    expect(customer.html).toContain(`obchodni-podminky/${CURRENT_TERMS.id}.pdf`);
    // QR platba zůstává vložená do těla (cid), PDF je běžná příloha
    expect(customer.inlineImages?.map((i) => i.contentId)).toEqual(["qr-platba"]);
    expect(internal.attachments ?? []).toEqual([]);

    // historie: znění, název, velikost a otisk PDF, které skutečně odešlo
    const [customerRecord, internalRecord] = await sentRecords(ID);
    expect(customerRecord.attachments).toEqual([
      {
        kind: "terms",
        version: CURRENT_TERMS.id,
        filename: `obchodni-podminky-begina-${CURRENT_TERMS.id}.pdf`,
        bytes: expected.bytes.length,
        sha256: sha256(customer.attachments![0].contentBase64),
      },
    ]);
    expect(customerRecord.attachments).toEqual([expect.objectContaining({ sha256: expected.sha256 })]);
    expect(internalRecord.attachments).toBeUndefined();
  });

  it("karta: PDF až v potvrzení po zaplacení — znění zapsané PŘI OBJEDNÁVCE, i když mezitím platí jiné", async () => {
    const ID = "c2c2c2c2-2222-4222-8222-222222222222";
    const result = await submitCheckoutAction(null, form(ID, { paymentMethodId: "karta" }));
    expect(result).toMatchObject({ orderId: ID, redirectTo: expect.stringContaining("checkout.stripe.com") });
    expect(mail.sent).toHaveLength(0); // kartou: nic, dokud Stripe nepotvrdí platbu

    // objednávka vznikla za 1. znění (např. těsně před nasazením nového)
    await db.execute(sql`
      UPDATE order_activity SET metadata = jsonb_set(metadata, '{termsVersion}', to_jsonb(${LEGACY_TERMS.id}::text))
      WHERE order_id = ${ID} AND kind = 'created'`);
    await payByCard(ID, "evt_terms_card");

    const customer = mail.sent.find((m) => m.key === `eshop-customer_confirmation-${ID}`)!;
    expect(customer.subject).toContain("je zaplacená");
    expect(customer.attachments).toEqual([
      { filename: "obchodni-podminky-begina-2026-09-22.pdf", contentBase64: (await termsPdf(LEGACY_TERMS)).contentBase64, contentType: "application/pdf" },
    ]);
    expect(customer.text).toContain("V příloze posíláme obchodní podmínky ve znění účinném od 22. září 2026, se kterými jste při objednávce souhlasili.");
    expect(customer.text).not.toContain("formuláře pro odstoupení");
    const records = await sentRecords(ID);
    expect(records.find((r: Record<string, unknown>) => r.template === "customer_confirmation")!.attachments).toEqual([
      expect.objectContaining({ kind: "terms", version: "2026-09-22", sha256: (await termsPdf(LEGACY_TERMS)).sha256 }),
    ]);
  });

  it("objednávka z doby před verzováním (bez záznamu znění) dostane 1. znění", async () => {
    const ID = "c3c3c3c3-3333-4333-8333-333333333333";
    await submitCheckoutAction(null, form(ID, { paymentMethodId: "karta" }));
    await db.execute(sql`UPDATE order_activity SET metadata = metadata - 'termsVersion' WHERE order_id = ${ID} AND kind = 'created'`);
    await payByCard(ID, "evt_terms_legacy");
    const customer = mail.sent.find((m) => m.key === `eshop-customer_confirmation-${ID}`)!;
    expect(customer.attachments?.map((a) => a.filename)).toEqual(["obchodni-podminky-begina-2026-09-22.pdf"]);
  });

  it("PDF se nepodaří vytvořit: potvrzení odejde i tak s odkazem ke stažení, historie to zaznamená", async () => {
    const ID = "c4c4c4c4-4444-4444-8444-444444444444";
    // objednávka bez e-mailů (jiný kanál e-mailu vypnutý), pak potvrzení ručně se selhávajícím PDF
    delete process.env.RESEND_API_KEY;
    await submitCheckoutAction(null, form(ID));
    process.env.RESEND_API_KEY = ENV.RESEND_API_KEY;
    expect(mail.sent).toHaveLength(0);

    const outcomes = await sendOrderEmails(db, ID, "order_created", "https://preview.example", {
      termsPdf: async () => {
        throw new Error("pdf-lib spadl");
      },
    });
    expect(outcomes).toEqual([
      { template: "customer_confirmation", status: "sent" },
      { template: "internal_new_order", status: "sent" },
    ]);
    const customer = mail.sent[0];
    expect(customer.attachments ?? []).toEqual([]);
    expect(customer.text).toContain(
      `Ke stažení jsou obchodní podmínky ve znění účinném od ${CURRENT_TERMS.effectiveLabel}, se kterými jste při objednávce souhlasili, včetně vzorového formuláře pro odstoupení od smlouvy: https://preview.example/eshop/obchodni-podminky/${CURRENT_TERMS.id}.pdf`
    );
    const [record] = await sentRecords(ID);
    expect(record).toMatchObject({ template: "customer_confirmation", termsAttachment: "failed" });
    expect(record.attachments).toBeUndefined();
  });

  it("odeslání přes Resend: PDF jde jako příloha s typem application/pdf vedle QR (cid)", async () => {
    const { resendTransport } = await vi.importActual<typeof import("../email/resend")>("../email/resend");
    const pdf = await termsPdf(CURRENT_TERMS);
    let body: Record<string, unknown> = {};
    const transport = resendTransport("re_test", (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }) as unknown as typeof fetch);
    const result = await transport(
      {
        from: "Begina <objednavky@begina.cz>",
        to: ["jana@example.cz"],
        subject: "Přijali jsme vaši objednávku",
        html: "<p>x</p>",
        text: "x",
        inlineImages: [{ filename: "qr-platba.png", contentBase64: "iVBORw0KGgo=", contentId: "qr-platba" }],
        attachments: [{ filename: pdf.filename, contentBase64: pdf.contentBase64, contentType: "application/pdf" }],
      },
      "eshop-customer_confirmation-x"
    );
    expect(result).toEqual({ ok: true, id: "re_1" });
    expect(body.attachments).toEqual([
      { filename: "qr-platba.png", content: "iVBORw0KGgo=", content_id: "qr-platba" },
      { filename: pdf.filename, content: pdf.contentBase64, content_type: "application/pdf" },
    ]);
    // Resend: celý e-mail nejvýš 40 MB — PDF podmínek je zlomek
    expect(JSON.stringify(body).length).toBeLessThan(1_000_000);
  });
});
