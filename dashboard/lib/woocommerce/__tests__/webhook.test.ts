// Webhook WooCommerce → MojeBegina: ověření podpisu (čistá funkce, bez DB)
// a mapování payloadu na importExternalOrder (nad skutečnou datovou vrstvou
// — stejný harness jako lib/data/__tests__/importExternalOrder.integration.test.ts).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";

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

describe("verifyWooCommerceSignature — čistá funkce, bez DB", () => {
  let verifyWooCommerceSignature: typeof import("../webhook").verifyWooCommerceSignature;

  beforeAll(async () => {
    // webhook.ts importuje lib/db/client (DATABASE_URL), i když tahle
    // čistá funkce DB nepotřebuje — appka drží jediný modul, ne dvě kopie.
    process.env.DATABASE_URL ??= "postgresql://u:p@ep-test.neon.tech/neondb";
    ({ verifyWooCommerceSignature } = await import("../webhook"));
  });

  const secret = "wh_secret_begina_123";
  const body = JSON.stringify({ id: 5217, number: "5217" });

  function sign(payload: string, key: string): string {
    return createHmac("sha256", key).update(payload, "utf8").digest("base64");
  }

  it("platný podpis (base64 HMAC-SHA256 těla tajným klíčem) appka přijme", () => {
    expect(verifyWooCommerceSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("podpis jiným klíčem appka odmítne", () => {
    expect(verifyWooCommerceSignature(body, sign(body, "jiny-klic"), secret)).toBe(false);
  });

  it("podpis pro jiné tělo (pozměněný payload) appka odmítne", () => {
    const tampered = JSON.stringify({ id: 5217, number: "99999" });
    expect(verifyWooCommerceSignature(tampered, sign(body, secret), secret)).toBe(false);
  });

  it("chybějící hlavička podpisu appka odmítne", () => {
    expect(verifyWooCommerceSignature(body, null, secret)).toBe(false);
  });
});

describe("handleWooCommerceOrderPayload — mapování a zápis nad skutečnou datovou vrstvou", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let handleWooCommerceOrderPayload: typeof import("../webhook").handleWooCommerceOrderPayload;

  const PERCONTO = "3d7c57e0-510d-4cb3-8883-5662fe592a77";
  const PERCONTO_ICO = "05249937";

  function orderPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 5217,
      number: "5217",
      date_created_gmt: "2026-10-25T21:12:00",
      discount_total: "102.33",
      shipping_total: "491.00",
      total: "3799.67",
      payment_method: "bacs",
      payment_method_title: "Bankovní převod předem",
      customer_note: "",
      billing: {
        first_name: "Jiří",
        last_name: "Průcha",
        company: "Perconto invest s.r.o.",
        email: "jir.prucha@seznam.cz",
        phone: "",
        address_1: "Karla Steinera 1758/12",
        city: "Plzeň",
        postcode: "318 00",
      },
      shipping: {
        first_name: "Jiří",
        last_name: "Průcha",
        address_1: "Karla Steinera 1758/12",
        city: "Plzeň",
        postcode: "318 00",
      },
      line_items: [
        { name: "Dýňová polévka", quantity: 2, total: "758.00" },
        { name: "Gulášová polévka z hlívy", quantity: 2, total: "758.00" },
        { name: "Rajčatová polévka", quantity: 1, total: "379.00" },
        { name: "Kulajda", quantity: 3, total: "1137.00" },
        { name: "Špenátová polévka", quantity: 1, total: "379.00" },
      ],
      meta_data: [{ key: "_billing_ico", value: PERCONTO_ICO }],
      ...overrides,
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb";
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ handleWooCommerceOrderPayload } = await import("../webhook"));

    await db.execute(sql`
      INSERT INTO organizations (id, ico, name, registered_address)
      VALUES (${PERCONTO}, ${PERCONTO_ICO}, 'Perconto invest s.r.o.', 'Ovocný trh 572/11, 110 00 Praha 1')
    `);
  }, 60_000);

  it("objednávka 5217 (reálný tvar payloadu): namapuje se a zapíše k Perconto invest, sleva zaokrouhlená na celé Kč", async () => {
    const result = await handleWooCommerceOrderPayload(orderPayload({ number: "90001" }));
    expect(result).toMatchObject({ outcome: "imported" });
    if (result.outcome !== "imported") return;

    const [row] = (
      await db.execute(sql`
        SELECT buyer_organization_id, subtotal_kc, discount_kc, shipping_kc, total_kc, channel
        FROM orders WHERE id = ${result.orderId}
      `)
    ).rows;
    expect(row).toMatchObject({
      buyer_organization_id: PERCONTO,
      subtotal_kc: 3411,
      discount_kc: 102, // 102,33 Kč zaokrouhleno na celé Kč (orders.discount_kc je integer)
      shipping_kc: 491,
      total_kc: 3800,
      channel: "import",
    });
  });

  it("stejné číslo objednávky doručené podruhé (duplicitní webhook) → already_imported, žádný druhý zápis", async () => {
    const first = await handleWooCommerceOrderPayload(orderPayload({ number: "90002" }));
    expect(first).toMatchObject({ outcome: "imported" });

    const second = await handleWooCommerceOrderPayload(orderPayload({ number: "90002" }));
    expect(second).toMatchObject({ outcome: "already_imported" });

    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '90002'`);
    expect(rows.rows).toHaveLength(1);
  });

  it("bez IČO v meta_data (soukromý zákazník) → needs_review, nic se nezapíše", async () => {
    const result = await handleWooCommerceOrderPayload(orderPayload({ number: "90003", meta_data: [] }));
    expect(result).toMatchObject({ outcome: "needs_review" });
    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '90003'`);
    expect(rows.rows).toHaveLength(0);
  });

  it("IČO neodpovídá žádné organizaci → needs_review, nic se nezapíše", async () => {
    const result = await handleWooCommerceOrderPayload(
      orderPayload({ number: "90004", meta_data: [{ key: "_billing_ico", value: "00000000" }] })
    );
    expect(result).toMatchObject({ outcome: "needs_review" });
    const rows = await db.execute(sql`SELECT id FROM orders WHERE external_woocommerce_id = '90004'`);
    expect(rows.rows).toHaveLength(0);
  });

  it("objednávka bez čísla (number i id chybí) → rejected, appka si číslo nevymýšlí", async () => {
    const result = await handleWooCommerceOrderPayload(orderPayload({ number: "", id: undefined }));
    expect(result).toMatchObject({ outcome: "rejected" });
  });
});
