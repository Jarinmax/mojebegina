// Import objednávky z WooCommerce (importExternalOrder, orders.ts) nad
// skutečnou datovou vrstvou (ovladač Neonu → PGlite se všemi migracemi) —
// stejné jádro volá webhook (lib/woocommerce/webhook.ts) i MCP
// nástroj (lib/agent/mcp/tools/orders.ts). Nikdy se nepřipojuje k Neonu.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { ImportOrderInput } from "../orderValidation";

// orders.ts přes svůj široký import graf (afterPaid, cancellation, email…)
// vleče "server-only" a next/headers — stejné odstínění jako v precedentu
// (lib/agent/__tests__/mcpInvoicing.integration.test.ts), appka ho tu jen
// NEPOUŽÍVÁ (importExternalOrder žádnou z těch větví nevolá).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "moje.begina.example", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async () => ({ ok: true, id: "msg_test" }),
}));

const PERCONTO = "3d7c57e0-510d-4cb3-8883-5662fe592a77";
const PERCONTO_ICO = "05249937";
const FOOD_FEST = "a9a6f90b-dcd7-46a4-aae3-c0f0e9255a48";
const FOOD_FEST_ICO = "08911088";

describe("importExternalOrder — duplicita, propojení zákazníka, zápis položek", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let importExternalOrder: typeof import("../orders").importExternalOrder;

  const baseInput = (overrides: Partial<ImportOrderInput> = {}): ImportOrderInput => ({
    externalWooCommerceId: "5217",
    buyerOrganizationId: PERCONTO,
    expectedIco: PERCONTO_ICO,
    contactName: "Jiří Průcha",
    contactPhone: "",
    contactEmail: "jir.prucha@seznam.cz",
    recipientName: "Jiří Průcha",
    recipientAddress: "Karla Steinera 1758/12, 318 00 Plzeň",
    recipientPhone: "",
    customerNote: "",
    note: "Import z WooCommerce #5217.",
    shippingMethodLabel: "Chlazená přeprava",
    paymentMethodCode: "bacs",
    paymentMethodLabel: "Bankovní převod předem",
    shippingKc: "491",
    discountKc: "102",
    orderedAt: "2026-10-25T21:12:00.000Z",
    items: [
      { name: "Dýňová polévka", quantity: "2", unitPriceKc: "379" },
      { name: "Gulášová polévka z hlívy", quantity: "2", unitPriceKc: "379" },
      { name: "Rajčatová polévka", quantity: "1", unitPriceKc: "379" },
      { name: "Kulajda", quantity: "3", unitPriceKc: "379" },
      { name: "Špenátová polévka", quantity: "1", unitPriceKc: "379" },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb";
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));

    const ordersModule = await import("../orders");
    importExternalOrder = ordersModule.importExternalOrder;

    await db.execute(sql`
      INSERT INTO organizations (id, ico, name, registered_address)
      VALUES (${PERCONTO}, ${PERCONTO_ICO}, 'Perconto invest s.r.o.', 'Ovocný trh 572/11, 110 00 Praha 1')
    `);
    await db.execute(sql`
      INSERT INTO organizations (id, ico, name, registered_address)
      VALUES (${FOOD_FEST}, ${FOOD_FEST_ICO}, 'Food Fest Crew s.r.o.', 'Pasohlávky 251, 691 22 Pasohlávky')
    `);
  }, 60_000);

  it("objednávka 5217: zapíše se s channel='import', správnou organizací, částkami a datem", async () => {
    const result = await importExternalOrder(baseInput(), { type: "system", name: "WooCommerce (begina.cz)" });
    expect(result).toMatchObject({ ok: true, alreadyExisted: false });
    if (!result.ok) return;

    const [row] = (
      await db.execute(sql`
        SELECT channel, external_woocommerce_id, buyer_organization_id, subtotal_kc, discount_kc, shipping_kc, total_kc,
               payment_status, fulfillment_status, ordered_at, recipient_address
        FROM orders WHERE id = ${result.id}
      `)
    ).rows;
    expect(row).toMatchObject({
      channel: "import",
      external_woocommerce_id: "5217",
      buyer_organization_id: PERCONTO,
      subtotal_kc: 3411,
      discount_kc: 102,
      shipping_kc: 491,
      total_kc: 3800,
      payment_status: "unpaid", // appka stav platby nikdy nepřevezme automaticky
      fulfillment_status: "new",
      recipient_address: "Karla Steinera 1758/12, 318 00 Plzeň",
    });
    expect(new Date(row.ordered_at).toISOString()).toBe("2026-10-25T21:12:00.000Z");
  });

  it("zápis položek: pět řádků, přesná množství a jednotkové ceny", async () => {
    const result = await importExternalOrder(baseInput({ externalWooCommerceId: "52172" }), {
      type: "system",
      name: "WooCommerce (begina.cz)",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const items = (
      await db.execute(sql`SELECT name, quantity, unit_price_kc, line_total_kc FROM order_items WHERE order_id = ${result.id} ORDER BY name`)
    ).rows;
    expect(items).toEqual([
      { name: "Dýňová polévka", quantity: 2, unit_price_kc: 379, line_total_kc: 758 },
      { name: "Gulášová polévka z hlívy", quantity: 2, unit_price_kc: 379, line_total_kc: 758 },
      { name: "Kulajda", quantity: 3, unit_price_kc: 379, line_total_kc: 1137 },
      { name: "Rajčatová polévka", quantity: 1, unit_price_kc: 379, line_total_kc: 379 },
      { name: "Špenátová polévka", quantity: 1, unit_price_kc: 379, line_total_kc: 379 },
    ]);
  });

  it("duplicitní import (stejné external_woocommerce_id) NEVYTVOŘÍ druhou objednávku", async () => {
    const input = baseInput({ externalWooCommerceId: "52173" });
    const first = await importExternalOrder(input, { type: "system", name: "WooCommerce (begina.cz)" });
    expect(first).toMatchObject({ ok: true, alreadyExisted: false });

    const second = await importExternalOrder(input, { type: "system", name: "WooCommerce (begina.cz)" });
    expect(second).toMatchObject({ ok: true, alreadyExisted: true, id: first.ok ? first.id : undefined });

    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '52173'`);
    expect(rows.rows).toHaveLength(1);
  });

  it("souběžný dvojitý import (stejný klíč, souběžně) — unique index zachytí souběh, výsledek je jedna objednávka", async () => {
    const input = baseInput({ externalWooCommerceId: "52174" });
    const [a, b] = await Promise.all([
      importExternalOrder(input, { type: "system", name: "WooCommerce (begina.cz)" }),
      importExternalOrder(input, { type: "system", name: "WooCommerce (begina.cz)" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.id).toBe(b.id);
      expect([a.alreadyExisted, b.alreadyExisted].filter((x) => x === false)).toHaveLength(1);
    }
    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '52174'`);
    expect(rows.rows).toHaveLength(1);
  });

  it("propojení zákazníka: IČO v payloadu nesouhlasí s IČO organizace → zastaví se, nic se nezapíše", async () => {
    const result = await importExternalOrder(
      baseInput({ externalWooCommerceId: "52175", buyerOrganizationId: PERCONTO, expectedIco: FOOD_FEST_ICO }),
      { type: "system", name: "WooCommerce (begina.cz)" }
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/IČO/) });
    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '52175'`);
    expect(rows.rows).toHaveLength(0);
  });

  it("propojení zákazníka: neexistující organizace → zastaví se, nic se nezapíše", async () => {
    const result = await importExternalOrder(
      baseInput({ externalWooCommerceId: "52176", buyerOrganizationId: "00000000-0000-4000-8000-000000000999" }),
      { type: "system", name: "WooCommerce (begina.cz)" }
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/nebyla nalezena/) });
  });

  it("actor 'system' zapíše order_activity s actor_type='system' a bez author_user_id; actor 'user' s ním", async () => {
    const systemResult = await importExternalOrder(baseInput({ externalWooCommerceId: "52177" }), {
      type: "system",
      name: "WooCommerce (begina.cz)",
    });
    expect(systemResult.ok).toBe(true);
    if (systemResult.ok) {
      const [activity] = (await db.execute(sql`SELECT actor_type, author_user_id, author_name FROM order_activity WHERE order_id = ${systemResult.id}`)).rows;
      expect(activity).toMatchObject({ actor_type: "system", author_user_id: null, author_name: "WooCommerce (begina.cz)" });
    }

    const userResult = await importExternalOrder(baseInput({ externalWooCommerceId: "52178" }), {
      type: "user",
      userId: "admin-1",
      name: "Test Admin",
    });
    expect(userResult.ok).toBe(true);
    if (userResult.ok) {
      const [activity] = (await db.execute(sql`SELECT actor_type, author_user_id, author_name FROM order_activity WHERE order_id = ${userResult.id}`)).rows;
      expect(activity).toMatchObject({ actor_type: "user", author_user_id: "admin-1", author_name: "Test Admin" });
    }
  });
});
