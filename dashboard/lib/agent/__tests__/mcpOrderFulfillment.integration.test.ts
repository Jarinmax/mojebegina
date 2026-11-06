// MCP objednávky 1.1 (plánování rozvozů) — get_order / list_orders /
// update_order_fulfillment nad skutečnou datovou vrstvou (ovladač Neonu →
// PGlite se všemi migracemi): souhlas → token → MCP nástroje pod identitou
// uživatele. Stejný harness jako mcpOrders.integration.test.ts (prepare_order/
// create_order) — samostatný soubor, ať se obě sady testují nezávisle.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "moje.begina.example", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));
const mail = vi.hoisted(() => ({ sent: [] as unknown[] }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: unknown) => {
    mail.sent.push(message);
    return { ok: true, id: "msg" };
  },
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const ISSUER = "https://gpt-pilot.begina.cz";

const ORG_FOOD_FEST = "00000000-0000-4000-8000-0000000b0001";
const ICO_FOOD_FEST = "24680257"; // platné IČO s kontrolní číslicí, testovací data

// Objednávky — stavy pro jednotlivé testy (TESTOVACÍ data, ne reálné 70000004).
const ORDER_READY = "00000000-0000-4000-8000-0000000b1001";
const ORDER_HANDED = "00000000-0000-4000-8000-0000000b1002";
const ORDER_NEW = "00000000-0000-4000-8000-0000000b1003";
const ORDER_PAID = "00000000-0000-4000-8000-0000000b1004";
const ORDER_MISLABELED_DELIVERED = "00000000-0000-4000-8000-0000000b1005";

describe("MCP objednávky 1.1 — get_order / list_orders / update_order_fulfillment", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let viner: Session;
  let vinerReadOnly: Session;

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write: boolean): Promise<Session> {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return session;
  }

  const call = async (session: Session, name: string, args: Record<string, unknown>) => {
    const result = await mcp.callAgentTool(db, session, config, name, args);
    if (!result) throw new Error(`nástroj ${name} neexistuje`);
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { isError: result.isError === true, data: (result.structuredContent ?? {}) as Record<string, any>, text }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const listed = (session: Session) => mcp.agentMcpServer(db, session, config).listTools().map((t) => t.name);

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb";
    process.env.MCP_OAUTH_CLIENT_SECRET = SECRET;
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");
    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: ISSUER,
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: SECRET,
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${VINER},${LUCIE}`,
      MCP_ALLOW_WRITE: "on",
    })!;

    for (const statement of [
      `INSERT INTO user_roles (user_id, system_role) VALUES ('${VINER}', 'ADMIN')`,
      `INSERT INTO user_profiles (user_id, name, email) VALUES ('${VINER}', 'Jaroslav Viner', 'jaroslav@begina.cz')`,
      `INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG_FOOD_FEST}', '${ICO_FOOD_FEST}', 'TEST Food Fest Crew s.r.o.', 'Testovací 2, Praha')`,
      `INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, recipient_address)
       VALUES ('${ORDER_READY}', 'manual', '${ORG_FOOD_FEST}', 'TEST Kontakt Ready', 'ready@test.cz', '+420700000001', 1000, 0, 1000, 'unpaid', 'ready', 'Testovací 2, Praha')`,
      `INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status)
       VALUES ('${ORDER_HANDED}', 'manual', '${ORG_FOOD_FEST}', 'TEST Kontakt Handed', 'handed@test.cz', '+420700000002', 1000, 0, 1000, 'unpaid', 'handed_to_carrier')`,
      `INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status)
       VALUES ('${ORDER_NEW}', 'manual', '${ORG_FOOD_FEST}', 'TEST Kontakt Nova', 'nova@test.cz', '+420700000003', 1000, 0, 1000, 'unpaid', 'new')`,
      `INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status)
       VALUES ('${ORDER_PAID}', 'manual', '${ORG_FOOD_FEST}', 'TEST Kontakt Paid', 'paid@test.cz', '+420700000004', 1000, 0, 1000, 'paid', 'ready')`,
      // Scénář objednávky 70000004 (6. 11. 2026): chybně označeno "delivered",
      // ve skutečnosti jen předáno CoolBalíku — TESTOVACÍ id, ne reálná objednávka.
      `INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status)
       VALUES ('${ORDER_MISLABELED_DELIVERED}', 'manual', '${ORG_FOOD_FEST}', 'TEST Kontakt Herout', 'herout@test.cz', '+420700000005', 1000, 0, 1000, 'paid', 'delivered')`,
    ]) {
      await db.execute(sql.raw(statement));
    }
    viner = await connect(VINER, "ADMIN", true);
    vinerReadOnly = await connect(VINER, "ADMIN", false);
  }, 120_000);

  beforeEach(() => {
    process.env.MCP_OAUTH_CLIENT_SECRET = SECRET;
  });

  it("list_orders najde objednávku podle zákazníka; get_order načte plný detail", async () => {
    const listResult = await call(viner, "list_orders", { customer: "Food Fest Crew" });
    expect(listResult.isError, listResult.text).toBe(false);
    const ids = (listResult.data.orders as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([ORDER_READY, ORDER_HANDED, ORDER_NEW, ORDER_PAID, ORDER_MISLABELED_DELIVERED]));

    const detail = await call(viner, "get_order", { order_id: ORDER_READY });
    expect(detail.isError, detail.text).toBe(false);
    expect(detail.data).toMatchObject({
      customer: { organizationName: "TEST Food Fest Crew s.r.o.", contactName: "TEST Kontakt Ready", contactPhone: "+420700000001" },
      fulfillmentStatus: "ready",
      fulfillmentStatusLabel: "Připravená",
      allowedNextStatuses: expect.arrayContaining(["out_for_delivery", "handed_to_carrier", "cancelled"]),
    });
    expect(detail.data.source).toMatchObject({ environment: expect.any(String) });
  });

  it("ready → handed_to_carrier: zapíše přechod a uloží přepravce/tracking jako aktuální", async () => {
    const result = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_READY,
      target_status: "handed_to_carrier",
      carrier: "CoolBalík",
      tracking_number: "CB123456789",
      idempotency_key: randomUUID(),
    });
    expect(result.isError, result.text).toBe(false);
    expect(result.data).toMatchObject({ changed: true, status: "handed_to_carrier" });

    const [row] = await rows(sql`SELECT fulfillment_status, carrier, tracking_number FROM orders WHERE id = ${ORDER_READY}`);
    expect(row).toMatchObject({ fulfillment_status: "handed_to_carrier", carrier: "CoolBalík", tracking_number: "CB123456789" });
  });

  it("handed_to_carrier → delivered", async () => {
    const result = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_HANDED,
      target_status: "delivered",
      idempotency_key: randomUUID(),
    });
    expect(result.isError, result.text).toBe(false);
    expect(result.data).toMatchObject({ changed: true, status: "delivered" });
    const [row] = await rows(sql`SELECT fulfillment_status FROM orders WHERE id = ${ORDER_HANDED}`);
    expect(row.fulfillment_status).toBe("delivered");
  });

  it("zakázaný přechod (new → delivered, přeskočení kroků) se odmítne a nic nezapíše", async () => {
    const before = await rows(sql`SELECT fulfillment_status FROM orders WHERE id = ${ORDER_NEW}`);
    const result = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_NEW,
      target_status: "delivered",
      idempotency_key: randomUUID(),
    });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/není povolený/);
    const after = await rows(sql`SELECT fulfillment_status FROM orders WHERE id = ${ORDER_NEW}`);
    expect(after).toEqual(before);
    expect(await rows(sql`SELECT 1 FROM order_activity WHERE order_id = ${ORDER_NEW} AND kind = 'fulfillment_status_changed'`)).toEqual([]);
  });

  it("scénář objednávky 70000004: delivered → handed_to_carrier (oprava předčasně označeného doručení) je povolená; delivered → ready není", async () => {
    const wrongFix = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_MISLABELED_DELIVERED,
      target_status: "ready",
      idempotency_key: randomUUID(),
    });
    expect(wrongFix.isError).toBe(true);

    const fix = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_MISLABELED_DELIVERED,
      target_status: "handed_to_carrier",
      carrier: "CoolBalík",
      note: "Oprava: 6. 11. 2026 jen předáno CoolBalíku, zákazník ještě nepřevzal.",
      idempotency_key: randomUUID(),
    });
    expect(fix.isError, fix.text).toBe(false);
    expect(fix.data).toMatchObject({ changed: true, status: "handed_to_carrier" });

    // Ověření zpětným načtením — stejná cesta, jakou čte UI (getOrderDetail).
    const reread = await call(viner, "get_order", { order_id: ORDER_MISLABELED_DELIVERED });
    expect(reread.data).toMatchObject({ fulfillmentStatus: "handed_to_carrier", delivery: expect.objectContaining({ carrier: "CoolBalík" }) });
    // Stav platby zůstal beze změny (byla paid, zůstává paid) — nezávislé na fulfillment.
    expect(reread.data.paymentStatus).toBe("paid");
  });

  it("bez zápisového souhlasu update_order_fulfillment nejde zavolat; čtecí nástroje fungují dál", async () => {
    expect(listed(vinerReadOnly)).toEqual(expect.arrayContaining(["get_order", "list_orders"]));
    expect(listed(vinerReadOnly)).not.toContain("update_order_fulfillment");
    const result = await call(vinerReadOnly, "update_order_fulfillment", {
      order_id: ORDER_PAID,
      target_status: "out_for_delivery",
      idempotency_key: randomUUID(),
    });
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/jen pro čtení/) });
    const [row] = await rows(sql`SELECT fulfillment_status FROM orders WHERE id = ${ORDER_PAID}`);
    expect(row.fulfillment_status).toBe("ready");
  });

  it("idempotentní opakování: stejný idempotency_key podruhé nic nezdvojí (ani pohyb, ani historii)", async () => {
    const key = randomUUID();
    const args = { order_id: ORDER_PAID, target_status: "out_for_delivery", idempotency_key: key };
    const first = await call(viner, "update_order_fulfillment", args);
    expect(first.isError, first.text).toBe(false);
    const second = await call(viner, "update_order_fulfillment", args);
    expect(second.isError, second.text).toBe(false);
    // server.ts (claimWrite/finishWrite) vrátí podruhé STEJNÝ uložený výsledek
    // a navíc označí alreadySaved — execute() se podruhé vůbec nezavolalo.
    expect(second.data).toMatchObject(first.data);
    expect(second.data.alreadySaved).toBe(true);

    const activity = await rows(
      sql`SELECT 1 FROM order_activity WHERE order_id = ${ORDER_PAID} AND kind = 'fulfillment_status_changed' AND metadata->>'to' = 'out_for_delivery'`
    );
    expect(activity).toHaveLength(1);
  });

  it("opakování STEJNÉHO cíle (ne jen stejného idempotency_key) je taky bezpečný no-op — např. 'zákazník převzal' řečeno dvakrát", async () => {
    const activityBefore = await rows(sql`SELECT count(*)::int AS n FROM order_activity WHERE order_id = ${ORDER_PAID}`);
    const again = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_PAID,
      target_status: "out_for_delivery",
      idempotency_key: randomUUID(), // JINÝ klíč, STEJNÝ cílový stav
    });
    expect(again.isError, again.text).toBe(false);
    expect(again.data).toMatchObject({ changed: false, status: "out_for_delivery" });
    const activityAfter = await rows(sql`SELECT count(*)::int AS n FROM order_activity WHERE order_id = ${ORDER_PAID}`);
    expect(activityAfter[0].n).toBe(activityBefore[0].n);
  });

  it("auditní stopa: kdo, kdy, z jakého stavu na jaký a že zápis přišel přes ChatGPT", async () => {
    const result = await call(viner, "update_order_fulfillment", {
      order_id: ORDER_PAID,
      target_status: "delivered",
      carrier: "CoolBalík",
      tracking_number: "CB999",
      note: "Zákazník převzal osobně.",
      idempotency_key: randomUUID(),
    });
    expect(result.isError, result.text).toBe(false);

    const [entry] = await rows(
      sql`SELECT author_name, body, metadata FROM order_activity WHERE order_id = ${ORDER_PAID} AND kind = 'fulfillment_status_changed' AND metadata->>'to' = 'delivered'`
    );
    expect(entry.author_name).toBe("Jaroslav Viner (přes ChatGPT)");
    expect(entry.body).toBe("Zákazník převzal osobně.");
    const metadata = typeof entry.metadata === "string" ? JSON.parse(entry.metadata) : entry.metadata;
    expect(metadata).toMatchObject({ from: "out_for_delivery", to: "delivered", carrier: "CoolBalík", trackingNumber: "CB999" });
  });
});
