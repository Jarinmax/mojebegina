// Opakované objednávání z MojeBegina (8. 11. 2026): podepsaný pas, převod
// položek staré objednávky do košíku a pokladna nad DB (neon-http → PGlite).
// Karta se k objednávce přiřadí s pasem člena karty, nebo podle e-mailu
// člena (právě jedné) karty — samotné IČO nikdy. Fakturační údaje jsou
// vždy ty z formuláře (zákazník je může opravit).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  HANDOFF_TTL_MS,
  reorderLines,
  signHandoff,
  splitRegisteredAddress,
  verifyHandoff,
} from "../customerHandoff";
import { catalogIndex } from "./helpers/catalogFixture";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async () => ({ ok: true, id: "msg_1" }),
}));

const SECRET = "a".repeat(64);
const ORG = "bd1e09a1-ed86-4327-ab56-163e5e7486f5";
const OTHER_ORG = "cd1e09a1-ed86-4327-ab56-163e5e7486f6";
const OLD_ORDER = "7a2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";

describe("pas MojeBegina → e-shop", () => {
  const now = Date.UTC(2026, 10, 8, 12);

  it("podpis a platnost", () => {
    const token = signHandoff({ userId: "u-1", organizationId: ORG, reorderOrderId: OLD_ORDER }, SECRET, now);
    expect(verifyHandoff(token, SECRET, now + 1000)).toMatchObject({ u: "u-1", o: ORG, r: OLD_ORDER });
    expect(verifyHandoff(token, SECRET, now + HANDOFF_TTL_MS + 1)).toBeNull();
    expect(verifyHandoff(token, "b".repeat(64), now)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), o: OTHER_ORG })).toString("base64url");
    expect(verifyHandoff(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifyHandoff("nesmysl", SECRET, now)).toBeNull();
    expect(verifyHandoff(undefined, SECRET, now)).toBeNull();
  });

  it("sídlo z karty se rozdělí, jinak nic nedohadujeme", () => {
    expect(splitRegisteredAddress("Dlouhá 113, 254 01 Radlík-Jílové")).toEqual({ street: "Dlouhá 113", zip: "254 01", city: "Radlík-Jílové" });
    expect(splitRegisteredAddress("Praha")).toBeNull();
    expect(splitRegisteredAddress(null)).toBeNull();
  });

  it("položky staré objednávky → dnešní košík (bez hádání balení)", () => {
    const result = reorderLines(
      [
        { name: "Dýňová polévka", quantity: 31, unitPriceKc: 499, sku: null },
        { name: "Kulajda — 3 l Rodinná zásoba (bag-in-box)", quantity: 3, unitPriceKc: 499, sku: "kulajda" },
        { name: "Svařák Deluxe – 3 l Rodinná zásoba", quantity: 2, unitPriceKc: 499, sku: null },
        { name: "Svařák Deluxe", quantity: 1, unitPriceKc: 499, sku: null },
        { name: "Partnerská sleva 7 %", quantity: 1, unitPriceKc: -300, sku: null },
        { name: "Polévka dne", quantity: 1, unitPriceKc: 99, sku: null },
      ],
      catalogIndex
    );
    expect(result.lines).toEqual([
      { sku: "dynova-polevka", quantity: 31 },
      { sku: "kulajda", quantity: 3 },
      { sku: "svarak-deluxe-3l", quantity: 2 },
    ]);
    // svařák bez balení má 2 balení → nehádáme; neznámá položka → vypíše se
    expect(result.skipped).toEqual(["Svařák Deluxe", "Polévka dne"]);
  });
});

describe("pokladna s pasem nad DB", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let acceptHandoffAction: typeof import("@/app/eshop/kosik/handoffActions").acceptHandoffAction;
  let handoffPrefillAction: typeof import("@/app/eshop/kosik/handoffActions").handoffPrefillAction;
  const saved = { ...process.env };
  const ENV = {
    VERCEL_ENV: "preview",
    DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
    NEON_AUTH_COOKIE_SECRET: "test-cookie-secret",
  };

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
    ({ acceptHandoffAction, handoffPrefillAction } = await import("@/app/eshop/kosik/handoffActions"));
    await db.execute(sql`
      INSERT INTO organizations (id, ico, name, registered_address, status, dic) VALUES
        (${ORG}, '74797921', 'Cukrárna Kavárna Adélka (Lenka Odrazilová)', 'Dlouhá 113, 254 01 Radlík-Jílové', 'Zákazník Begina', 'CZ7557210705'),
        (${OTHER_ORG}, '27082440', 'Cizí s.r.o.', 'Na Poříčí 1, 110 00 Praha', 'Zákazník Begina', NULL)`);
    await db.execute(sql`INSERT INTO user_profiles (user_id, name, email) VALUES ('u-adelka', 'Lenka Odrazilová', 'kavarna@example.cz')`);
    await db.execute(sql`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('u-adelka', ${ORG}, 'owner')`);
    await db.execute(sql`INSERT INTO locations (organization_id, label, street, city, zip, contact_name, contact_phone, is_default_delivery)
                         VALUES (${ORG}, 'Cukrárna Kavárna Adélka – Praha 4', 'Matúškova 831/1', 'Praha 4-Háje', '149 00', 'Tomáš Z.', '+420608309579', true)`);
    await db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
                         VALUES (${OLD_ORDER}, 'manual', ${ORG}, 1497, 0, 0, 1497, 'paid', 'delivered', '2026-10-27T14:51:59Z')`);
    await db.execute(sql`INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
                         (${OLD_ORDER}, 'Dýňová polévka', 2, 499, 998), (${OLD_ORDER}, 'Kulajda', 1, 499, 499)`);
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  const token = (userId: string, organizationId: string, reorder: string | null = OLD_ORDER) => {
    // stejný klíč jako server (odvozený z NEON_AUTH_COOKIE_SECRET)
    return import("../customerHandoff").then(({ handoffSecret }) => signHandoff({ userId, organizationId, reorderOrderId: reorder }, handoffSecret()!));
  };

  function form(orderToken: string, overrides: Record<string, string> = {}) {
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "dynova-polevka", quantity: 2 }, { sku: "kulajda", quantity: 1 }]),
      name: "Lenka Odrazilová",
      email: "kavarna@example.cz",
      phone: "+420 608 309 579",
      shippingMethodId: "rozvoz",
      paymentMethodId: "prevod",
      billingStreet: "Dlouhá 113",
      billingCity: "Radlík-Jílové",
      billingZip: "25401",
      billingCountry: "Česká republika",
      recipientName: "Tomáš Z.",
      recipientCompany: "Cukrárna Kavárna Adélka – Praha 4",
      recipientPhone: "+420608309579",
      street: "Matúškova 831/1",
      city: "Praha 4-Háje",
      zip: "14900",
      termsAccepted: "on",
      orderToken,
      website: "",
      ...overrides,
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }
  const order = async (id: string) => (await db.execute(sql`SELECT buyer_organization_id, billing_company, billing_ico, billing_dic FROM orders WHERE id = ${id}`)).rows[0];

  it("košík z objednávky a předvyplnění z karty", async () => {
    const t = await token("u-adelka", ORG);
    expect(await acceptHandoffAction(t)).toEqual({
      ok: true,
      organizationName: "Cukrárna Kavárna Adélka (Lenka Odrazilová)",
      lines: [
        { sku: "dynova-polevka", quantity: 2 },
        { sku: "kulajda", quantity: 1 },
      ],
      skipped: [],
      reorder: true,
    });
    const prefill = await handoffPrefillAction(t);
    expect(prefill).toMatchObject({
      ok: true,
      prefill: {
        company: { name: "Cukrárna Kavárna Adélka (Lenka Odrazilová)", ico: "74797921", dic: "CZ7557210705" },
        registered: { street: "Dlouhá 113", zip: "254 01", city: "Radlík-Jílové" },
        contact: { name: "Lenka Odrazilová", email: "kavarna@example.cz" },
        locations: [{ label: "Cukrárna Kavárna Adélka – Praha 4", street: "Matúškova 831/1", isDefault: true }],
      },
    });
  });

  it("objednávka s pasem: karta přiřazená, fakturační údaje podle formuláře (zákazník je opravil)", async () => {
    const ID = "b1b1b1b1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(
      null,
      form(ID, { handoff: await token("u-adelka", ORG), email: "jina@example.cz", companyPurchase: "on", billingCompany: "Lenka Odrazilová", billingIco: "74797921", billingDic: "CZ7557210705" })
    );
    expect(result).toMatchObject({ savedOrderId: ID });
    expect(await order(ID)).toEqual({ buyer_organization_id: ORG, billing_company: "Lenka Odrazilová", billing_ico: "74797921", billing_dic: "CZ7557210705" });
  });

  it("bez pasu, z jiného počítače: e-mail člena karty → zapíše se ke kartě", async () => {
    const ID = "e1e1e1e1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(null, form(ID, { email: "Kavarna@Example.cz" }));
    expect(result).toMatchObject({ savedOrderId: ID });
    expect((await order(ID)).buyer_organization_id).toBe(ORG);
  });

  it("bez pasu: samotné IČO karty ani neznámý e-mail kartu nepřiřadí", async () => {
    const ID = "c1c1c1c1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(null, form(ID, { email: "nekdo@example.cz", companyPurchase: "on", billingCompany: "Adélka", billingIco: "74797921" }));
    expect(result).toMatchObject({ savedOrderId: ID });
    expect((await order(ID)).buyer_organization_id).toBeNull();
  });

  it("e-mail člena dvou karet → nehádáme, bez karty", async () => {
    await db.execute(sql`INSERT INTO user_profiles (user_id, name, email) VALUES ('u-dva', 'Dvojí', 'dva@example.cz')`);
    await db.execute(sql`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('u-dva', ${ORG}, 'owner'), ('u-dva', ${OTHER_ORG}, 'owner')`);
    const ID = "f1f1f1f1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(null, form(ID, { email: "dva@example.cz" }));
    expect(result).toMatchObject({ savedOrderId: ID });
    expect((await order(ID)).buyer_organization_id).toBeNull();
  });

  it("pas na cizí kartu, podvržený pas nebo odebraný člen → nic", async () => {
    expect((await acceptHandoffAction(await token("u-adelka", OTHER_ORG))).ok).toBe(false);
    expect((await acceptHandoffAction(await token("u-adelka", ORG, "9a2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b"))).ok).toBe(false);
    expect((await acceptHandoffAction("x.y")).ok).toBe(false);
    const ID = "d1d1d1d1-1111-4111-8111-111111111111";
    const result = await submitCheckoutAction(null, form(ID, { handoff: await token("u-adelka", OTHER_ORG) }));
    expect(result).toMatchObject({ error: expect.stringContaining("Odkaz z MojeBegina už neplatí") });
    await db.execute(sql`DELETE FROM organization_memberships WHERE user_id = 'u-adelka'`);
    expect((await handoffPrefillAction(await token("u-adelka", ORG))).ok).toBe(false);
  });
});
