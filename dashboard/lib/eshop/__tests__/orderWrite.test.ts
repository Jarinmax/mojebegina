// ESHOP 1.0 — uložení objednávky z pokladny.
// 1) čisté funkce (sestavení řádků, povolení zápisu, token)
// 2) skutečný zápis přes ovladač Neonu (neon-http, db.batch = transakce)
//    napojený na PGlite se všemi migracemi — stejná cesta jako v Preview,
//    jen bez sítě. Nikdy se nepřipojuje k Neonu.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { validateCheckoutInput, type CheckoutInput, type CheckoutValue } from "../checkout";
import { buildEshopOrderRows, isOrderWriteEnabled, parseOrderToken, saveEshopOrder } from "../orderWrite";
import { catalogIndex } from "./helpers/catalogFixture";

function checkoutValue(overrides: Partial<CheckoutInput> = {}): CheckoutValue {
  const result = validateCheckoutInput(
    {
      cart: JSON.stringify([
        { sku: "svarak-deluxe-3l", quantity: 2 },
        { sku: "kulajda", quantity: 1 },
      ]),
      name: "Jana Nováková",
      email: "jana@example.cz",
      phone: "+420 777 123 456",
      shippingMethodId: "rozvoz",
      paymentMethodId: "prevod",
      street: "Prvního pluku 14",
      city: "Praha",
      zip: "18600",
      note: "Zvonit dvakrát",
      termsAccepted: true,
      ageConfirmed: true,
      ...overrides,
    },
    catalogIndex
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const ORDER_ID = "0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11";

describe("orderWrite — čisté funkce", () => {
  it("zápis je povolen mimo Vercel Production, v Production jen s ESHOP_ORDER_WRITE=on", () => {
    expect(isOrderWriteEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isOrderWriteEnabled({})).toBe(true); // lokální vývoj
    expect(isOrderWriteEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(isOrderWriteEnabled({ VERCEL_ENV: "production", ESHOP_ORDER_WRITE: "1" })).toBe(false);
    expect(isOrderWriteEnabled({ VERCEL_ENV: "production", ESHOP_ORDER_WRITE: "on" })).toBe(true);
  });

  it("token objednávky musí být UUID", () => {
    expect(parseOrderToken(` ${ORDER_ID.toUpperCase()} `)).toBe(ORDER_ID);
    expect(parseOrderToken("")).toBeNull();
    expect(parseOrderToken("1; DROP TABLE orders")).toBeNull();
  });

  it("sestaví objednávku soukromého zákazníka, položky se snapshoty a systémový záznam", () => {
    const now = new Date("2026-09-28T10:00:00Z");
    const variants = new Map([
      ["svarak-deluxe-3l", { id: "v-svarak", priceKc: 499 }],
      ["kulajda", { id: "v-kulajda", priceKc: 379 }],
    ]);
    const built = buildEshopOrderRows(ORDER_ID, checkoutValue(), variants, now);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows.order).toMatchObject({
      id: ORDER_ID,
      channel: "eshop",
      buyerOrganizationId: null,
      contactEmail: "jana@example.cz",
      recipientAddress: "Prvního pluku 14, 186 00 Praha",
      subtotalKc: 2 * 499 + 379,
      discountKc: 0,
      shippingKc: 99,
      totalKc: 2 * 499 + 379 + 99,
      paymentStatus: "unpaid",
      fulfillmentStatus: "new",
      customerNote: "Zvonit dvakrát",
      shippingMethodCode: "rozvoz",
      paymentMethodCode: "prevod",
      ageConfirmedAt: now,
      termsAcceptedAt: now,
    });
    expect(built.rows.order).not.toHaveProperty("orderNumber");
    expect(built.rows.items).toEqual([
      {
        orderId: ORDER_ID,
        productVariantId: "v-svarak",
        skuSnapshot: "svarak-deluxe-3l",
        name: "Svařák Deluxe — 3 l Rodinná zásoba (bag-in-box)",
        quantity: 2,
        unitPriceKc: 499,
        lineTotalKc: 998,
      },
      {
        orderId: ORDER_ID,
        productVariantId: "v-kulajda",
        skuSnapshot: "kulajda",
        name: "Kulajda",
        quantity: 1,
        unitPriceKc: 379,
        lineTotalKc: 379,
      },
    ]);
    expect(built.rows.activity).toMatchObject({
      actorType: "system",
      authorUserId: null,
      authorName: "E-shop",
      kind: "created",
    });
  });

  it("bez alkoholu se potvrzení věku neukládá; osobní odběr nemá adresu", () => {
    const value = checkoutValue({
      cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
      shippingMethodId: "osobni-odber",
      ageConfirmed: false,
    });
    const built = buildEshopOrderRows(ORDER_ID, value, new Map([["kulajda", { id: "v", priceKc: 379 }]]), new Date());
    expect(built.ok && built.rows.order).toMatchObject({ ageConfirmedAt: null, recipientAddress: null, shippingKc: 0 });
  });

  it("odmítne neznámé balení i změněnou cenu", () => {
    expect(buildEshopOrderRows(ORDER_ID, checkoutValue(), new Map(), new Date()).ok).toBe(false);
    const changed = new Map([
      ["svarak-deluxe-3l", { id: "v-svarak", priceKc: 549 }],
      ["kulajda", { id: "v-kulajda", priceKc: 379 }],
    ]);
    const built = buildEshopOrderRows(ORDER_ID, checkoutValue(), changed, new Date());
    expect(built).toEqual({ ok: false, error: expect.stringContaining("změnila cena") });
  });
});

describe("orderWrite — skutečný zápis přes neon-http (db.batch) nad PGlite", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    // Preload přesměruje HTTP dotazy ovladače Neonu na PGlite se všemi migracemi.
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
  }, 60_000);

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  it("uloží objednávku, položky napojené na balení a systémový záznam v jedné transakci", async () => {
    const result = await saveEshopOrder(db, ORDER_ID, checkoutValue());
    expect(result).toEqual({ ok: true, orderId: ORDER_ID, orderNumber: null, alreadySaved: false });

    expect(
      await rows(sql`SELECT channel, buyer_organization_id, contact_email, subtotal_kc, discount_kc, shipping_kc,
                            total_kc, payment_status, fulfillment_status, order_number, customer_note,
                            shipping_method_code, payment_method_code, age_confirmed_at IS NOT NULL AS vek,
                            terms_accepted_at IS NOT NULL AS op
                     FROM orders WHERE id = ${ORDER_ID}`)
    ).toEqual([
      {
        channel: "eshop",
        buyer_organization_id: null,
        contact_email: "jana@example.cz",
        subtotal_kc: 1377,
        discount_kc: 0,
        shipping_kc: 99,
        total_kc: 1476,
        payment_status: "unpaid",
        fulfillment_status: "new",
        order_number: null,
        customer_note: "Zvonit dvakrát",
        shipping_method_code: "rozvoz",
        payment_method_code: "prevod",
        vek: true,
        op: true,
      },
    ]);

    expect(
      await rows(sql`SELECT i.sku_snapshot, v.sku, i.name, i.quantity, i.unit_price_kc, i.line_total_kc
                     FROM order_items i JOIN product_variants v ON v.id = i.product_variant_id
                     WHERE i.order_id = ${ORDER_ID} ORDER BY i.sku_snapshot`)
    ).toEqual([
      { sku_snapshot: "kulajda", sku: "kulajda", name: "Kulajda", quantity: 1, unit_price_kc: 379, line_total_kc: 379 },
      {
        sku_snapshot: "svarak-deluxe-3l",
        sku: "svarak-deluxe-3l",
        name: "Svařák Deluxe — 3 l Rodinná zásoba (bag-in-box)",
        quantity: 2,
        unit_price_kc: 499,
        line_total_kc: 998,
      },
    ]);

    expect(
      await rows(sql`SELECT actor_type, author_user_id, author_name, kind FROM order_activity WHERE order_id = ${ORDER_ID}`)
    ).toEqual([{ actor_type: "system", author_user_id: null, author_name: "E-shop", kind: "created" }]);
  });

  it("dvojí odeslání se stejným tokenem nevytvoří druhou objednávku", async () => {
    expect(await saveEshopOrder(db, ORDER_ID, checkoutValue())).toEqual({
      ok: true,
      orderId: ORDER_ID,
      orderNumber: null,
      alreadySaved: true,
    });
    expect(await rows(sql`SELECT count(*)::int AS n FROM orders WHERE id = ${ORDER_ID}`)).toEqual([{ n: 1 }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${ORDER_ID}`)).toEqual([{ n: 2 }]);
  });

  it("změněná cena v DB = nic se neuloží", async () => {
    const otherId = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    await db.execute(sql`UPDATE product_variants SET price_b2c_kc = 549 WHERE sku = 'svarak-deluxe-3l'`);
    const result = await saveEshopOrder(db, otherId, checkoutValue());
    await db.execute(sql`UPDATE product_variants SET price_b2c_kc = 499 WHERE sku = 'svarak-deluxe-3l'`);
    expect(result.ok).toBe(false);
    expect(await rows(sql`SELECT count(*)::int AS n FROM orders WHERE id = ${otherId}`)).toEqual([{ n: 0 }]);
  });

  it("selhání uprostřed zápisu vrátí celou transakci (žádná objednávka bez položek)", async () => {
    const brokenId = "2c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    const value = checkoutValue();
    // Nesedící řádek porušuje CHECK order_items_line_total_consistent.
    const broken: CheckoutValue = {
      ...value,
      pricedCart: {
        ...value.pricedCart,
        lines: value.pricedCart.lines.map((l, i) => (i === 0 ? { ...l, lineTotalKc: l.lineTotalKc + 1 } : l)),
      },
    };
    await expect(saveEshopOrder(db, brokenId, broken)).rejects.toThrow();
    expect(await rows(sql`SELECT count(*)::int AS n FROM orders WHERE id = ${brokenId}`)).toEqual([{ n: 0 }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM order_activity WHERE order_id = ${brokenId}`)).toEqual([
      { n: 0 },
    ]);
  });
});
