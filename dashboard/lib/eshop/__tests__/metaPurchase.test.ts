// Meta „Purchase“ = dokončený nákup: ze serveru až po úplném zaplacení,
// jen se souhlasem z pokladny, nejvýš jednou (i souběžně), nikdy za
// vytvořenou, nezaplacenou ani stornovanou objednávku. Skutečná pokladna,
// zápis platby a „po zaplacení“ přes ovladač Neonu nad PGlite; Meta API
// nahrazuje napodobenina (nic neodchází ven).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const PIXEL = "2509610956071494";
const ENV = {
  ESHOP_MARKETING: "on",
  ESHOP_COOKIEYES_ID: "5f3760f1f9ac1d11074e41aade2c6467",
  ESHOP_META_PIXEL_ID: PIXEL,
  ESHOP_META_CAPI_TOKEN: "EAAtesttoken0123456789abcdefABCDEF",
};
const FBP = "fb.1.1728561234567.1234567890";
const UA = "Mozilla/5.0 (test)";

type Call = { url: string; body: Record<string, unknown> };

describe("Meta Purchase po zaplacení (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let mod: typeof import("../metaPurchase");
  let afterPaid: typeof import("../invoicing/afterPaid");
  let payments: typeof import("../payments");
  let saveOrder: (consent: boolean) => Promise<{ id: string; vs: string }>;
  const calls: Call[] = [];
  let failNext = false;
  const metaFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    if (failNext) {
      failNext = false;
      return new Response("Service Unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as unknown as typeof fetch;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    mod = await import("../metaPurchase");
    afterPaid = await import("../invoicing/afterPaid");
    payments = await import("../payments");
    const { validateCheckoutInput } = await import("../checkout");
    const { saveEshopOrder } = await import("../orderWrite");
    const { catalogIndex } = await import("./helpers/catalogFixture");
    saveOrder = async (consent) => {
      const checkout = validateCheckoutInput(
        {
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
          termsAccepted: true,
          ageConfirmed: false,
        },
        catalogIndex
      );
      if (!checkout.ok) throw new Error(checkout.error);
      const metaConsent = mod.metaConsentFromCheckout(
        { adConsent: consent ? "1" : "0", fbp: FBP, fbc: "", userAgent: UA },
        new Date("2026-10-10T10:00:00Z"),
        ENV
      );
      const id = randomUUID();
      const saved = await saveEshopOrder(db, id, checkout.value, { metaConsent });
      if (!saved.ok) throw new Error(saved.error);
      return { id, vs: saved.paymentVs! };
    };
  }, 60_000);

  const pay = async (orderId: string, vs: string, amountKc = 758) => {
    const result = await payments.recordManualPayment(db, {
      orderId,
      token: randomUUID(),
      method: "bank_transfer",
      amountHal: amountKc * 100,
      occurredAt: new Date(),
      note: null,
      vs,
      user: { userId: "admin-1", name: "Lucie Test" },
    });
    if (result.settled) await afterPaid.invoiceAndNotifyPaid(db, orderId, "payment_marked_paid", "https://begina.cz", undefined, { env: ENV, metaFetchImpl: metaFetch });
    return result;
  };
  const activity = async (orderId: string) =>
    (await db.execute(sql`SELECT metadata FROM order_activity WHERE order_id = ${orderId} AND kind = 'meta_purchase'`)).rows;

  it("souhlas z pokladny: jen se zapnutým pixelem, souhlasem a identifikátorem prohlížeče; nic jiného", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const ok = { adConsent: "1", fbp: FBP, fbc: "", userAgent: UA };
    expect(mod.metaConsentFromCheckout(ok, now, ENV)).toEqual({ at: now.toISOString(), fbp: FBP, fbc: null, userAgent: UA });
    expect(mod.metaConsentFromCheckout(ok, now, {})).toBeNull(); // přepínač vypnutý
    expect(mod.metaConsentFromCheckout({ ...ok, adConsent: "0" }, now, ENV)).toBeNull();
    expect(mod.metaConsentFromCheckout({ ...ok, fbp: "<script>" }, now, ENV)).toBeNull();
    expect(mod.metaCapiConfig({ ...ENV, ESHOP_META_CAPI_TOKEN: "" })).toBeNull();
    expect(mod.metaCapiConfig({ ...ENV, ESHOP_MARKETING: "off" })).toBeNull();
  });

  it("vytvořená a částečně zaplacená objednávka Purchase neposílá; po úplném zaplacení jednou", async () => {
    const { id, vs } = await saveOrder(true);
    expect(await mod.sendMetaPurchase(db, id, { env: ENV, fetchImpl: metaFetch })).toEqual({ status: "skipped", reason: "není uhrazená celá" });
    await pay(id, vs, 100); // část
    expect(calls).toHaveLength(0);
    await pay(id, vs, 658); // zbytek → uhrazená celá
    expect(calls).toHaveLength(1);
    const [event] = calls[0].body.data as Record<string, unknown>[];
    expect(calls[0].url).toBe(`https://graph.facebook.com/v21.0/${PIXEL}/events`);
    expect(event).toMatchObject({
      event_name: "Purchase",
      event_id: `objednavka-${vs}`,
      action_source: "website",
      event_source_url: "https://begina.cz/pokladna",
      user_data: { fbp: FBP, client_user_agent: UA },
      custom_data: { currency: "CZK", value: 758, content_ids: ["kulajda"], num_items: 2, order_id: vs },
    });
    expect(JSON.stringify(calls[0].body)).not.toMatch(/jana|Nováková|777|objednavka\/|[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(await activity(id)).toEqual([{ metadata: { eventId: `objednavka-${vs}`, status: "sent" } }]);

    // opakování (druhý webhook, znovu „po zaplacení“) = nic
    expect(await mod.sendMetaPurchase(db, id, { env: ENV, fetchImpl: metaFetch })).toEqual({ status: "skipped", reason: "už odesláno" });
    await afterPaid.invoiceAndNotifyPaid(db, id, "payment_confirmed", "https://begina.cz", undefined, { env: ENV, metaFetchImpl: metaFetch });
    expect(calls).toHaveLength(1);
  });

  it("souběžně dvakrát „po zaplacení“ → jedna událost", async () => {
    calls.length = 0;
    const { id, vs } = await saveOrder(true);
    await payments.recordManualPayment(db, {
      orderId: id, token: randomUUID(), method: "cash", amountHal: 75800, occurredAt: new Date(), note: null, vs,
      user: { userId: "admin-1", name: "Lucie Test" },
    });
    const results = await Promise.all([
      mod.sendMetaPurchase(db, id, { env: ENV, fetchImpl: metaFetch }),
      mod.sendMetaPurchase(db, id, { env: ENV, fetchImpl: metaFetch }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(calls).toHaveLength(1);
  });

  it("bez souhlasu, s vypnutým přepínačem nebo stornovaná: nic", async () => {
    calls.length = 0;
    const noConsent = await saveOrder(false);
    await pay(noConsent.id, noConsent.vs);
    expect(calls).toHaveLength(0);

    const off = await saveOrder(true);
    await payments.recordManualPayment(db, {
      orderId: off.id, token: randomUUID(), method: "bank_transfer", amountHal: 75800, occurredAt: new Date(), note: null, vs: off.vs,
      user: { userId: "admin-1", name: "Lucie Test" },
    });
    await afterPaid.invoiceAndNotifyPaid(db, off.id, "payment_marked_paid", "https://begina.cz", undefined, { env: {}, metaFetchImpl: metaFetch });
    expect(calls).toHaveLength(0);

    const cancelled = await saveOrder(true);
    await db.execute(sql`UPDATE orders SET payment_status = 'paid', fulfillment_status = 'cancelled' WHERE id = ${cancelled.id}`);
    expect(await mod.sendMetaPurchase(db, cancelled.id, { env: ENV, fetchImpl: metaFetch })).toEqual({ status: "skipped", reason: "stornovaná" });
    expect(calls).toHaveLength(0);
  });

  it("chyba Meta: zapíše se do historie, objednávka ani platba se nezmění, znovu se neposílá", async () => {
    calls.length = 0;
    failNext = true;
    const { id, vs } = await saveOrder(true);
    await pay(id, vs);
    expect(calls).toHaveLength(1);
    expect(await activity(id)).toEqual([
      { metadata: { eventId: `objednavka-${vs}`, status: "failed", error: "Meta 503: Service Unavailable" } },
    ]);
    const [order] = (await db.execute(sql`SELECT payment_status FROM orders WHERE id = ${id}`)).rows;
    expect(order.payment_status).toBe("paid");
  });

  it("náhradní objednávka: souhlas z původní; jen jednou za obě", async () => {
    calls.length = 0;
    const original = await saveOrder(true);
    const replacement = await saveOrder(false);
    await db.execute(sql`
      UPDATE order_activity SET metadata = metadata || ${JSON.stringify({ replacementOfOrderId: original.id })}::jsonb
      WHERE order_id = ${replacement.id} AND kind = 'created'`);
    await db.execute(sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${replacement.id}`);
    expect(await mod.sendMetaPurchase(db, replacement.id, { env: ENV, fetchImpl: metaFetch })).toMatchObject({ status: "sent" });
    expect((calls[0].body.data as { user_data: unknown }[])[0].user_data).toEqual({ fbp: FBP, client_user_agent: UA });

    // původní už nákup poslala → náhradní nic
    const paidOriginal = await saveOrder(true);
    await pay(paidOriginal.id, paidOriginal.vs);
    const second = await saveOrder(true);
    await db.execute(sql`
      UPDATE order_activity SET metadata = metadata || ${JSON.stringify({ replacementOfOrderId: paidOriginal.id })}::jsonb
      WHERE order_id = ${second.id} AND kind = 'created'`);
    await db.execute(sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${second.id}`);
    expect(await mod.sendMetaPurchase(db, second.id, { env: ENV, fetchImpl: metaFetch })).toEqual({
      status: "skipped",
      reason: "započteno u původní objednávky",
    });
  });
});
