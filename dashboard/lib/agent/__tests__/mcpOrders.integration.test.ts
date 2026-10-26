// GPT/MCP — zápis objednávky přes asistenta (prepare_order → create_order)
// nad skutečnou datovou vrstvou (ovladač Neonu → PGlite se všemi migracemi):
// souhlas → token → MCP nástroje pod identitou uživatele. Do testovací DB se
// navíc vloží produkční trigger číslování (číslo objednávky = VS), aby test
// ověřil i vrácené číslo objednávky.
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

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const ISSUER = "https://gpt-pilot.begina.cz";

// testovací firmy (platná IČO s kontrolní číslicí, žádná skutečná zákaznická data)
const ORG_KAVARNA = "00000000-0000-4000-8000-00000000a001";
const ORG_TWIN_A = "00000000-0000-4000-8000-00000000a002";
const ORG_TWIN_B = "00000000-0000-4000-8000-00000000a003";
const ICO_KAVARNA = "12345679";
const ICO_NEW = "76543218";

describe("zápis objednávky přes MCP (ChatGPT) nad DB", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucie: Session;
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

  /** Testovací objednávka „z Gmailu“ pro existující testovací kavárnu. */
  const gmailOrder = (ref: string, extra: Record<string, unknown> = {}) => ({
    source: "gmail",
    external_reference: ref,
    customer_ico: ICO_KAVARNA,
    contact_name: "Test Kontakt",
    contact_email: "test-kontakt@kavarna.test",
    contact_phone: "+420 777 000 111",
    items: [
      { name: "TEST Kulajda 0,5 l", quantity: 6, unit_price_kc: 89 },
      { name: "TEST Sirup bezinka", quantity: 2, unit_price_kc: 145 },
    ],
    shipping_kc: 150,
    shipping_method: "Rozvoz Begina",
    payment_method: "převodem na fakturu",
    payment_status: "unpaid",
    fulfillment_status: "confirmed",
    planned_delivery_at: "2026-12-01",
    delivery_name: "TEST Kavárna — provozovna",
    delivery_address: "Testovací 1, 602 00 Brno",
    note: "TEST — objednávka z testu",
    responsible: "Lucie",
    expected_total_kc: 6 * 89 + 2 * 145 + 150,
    ...extra,
  });

  async function prepareAndCreate(session: Session, args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const prepared = await call(session, "prepare_order", args);
    expect(prepared.isError, prepared.text).toBe(false);
    expect(prepared.data.blocking).toEqual([]);
    const created = await call(session, "create_order", {
      ...args,
      proposal_token: prepared.data.proposal_token,
      confirm: true,
      idempotency_key: randomUUID(),
      ...extra,
    });
    return { prepared, created };
  }

  const ordersOf = async (orgId: string) => rows(sql`SELECT id, total_kc FROM orders WHERE buyer_organization_id = ${orgId}`);

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
      // produkční číslování (Production: orders_assign_number) — číslo objednávky = VS
      `CREATE OR REPLACE FUNCTION orders_assign_number() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.channel <> 'import' THEN
           IF NEW.payment_vs IS NULL THEN NEW.payment_vs := '7' || lpad(nextval('payment_vs_seq')::text, 7, '0'); END IF;
           IF NEW.order_number IS NULL THEN NEW.order_number := NEW.payment_vs::bigint; END IF;
         END IF;
         RETURN NEW;
       END $$`,
      `CREATE TRIGGER orders_assign_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION orders_assign_number()`,
      `INSERT INTO user_roles (user_id, system_role) VALUES ('${VINER}', 'ADMIN'), ('${LUCIE}', 'EXECUTIVE')`,
      `INSERT INTO user_profiles (user_id, name, email) VALUES ('${VINER}', 'Jaroslav Viner', 'jaroslav@begina.cz'), ('${LUCIE}', 'Lucie Königsbergová', 'lucie@begina.cz')`,
      `INSERT INTO organizations (id, ico, name, registered_address) VALUES
         ('${ORG_KAVARNA}', '${ICO_KAVARNA}', 'TEST Kavárna U Testu s.r.o.', 'Testovací 1, Brno'),
         ('${ORG_TWIN_A}', '24680249', 'TEST Bistro Dvojče s.r.o.', 'Praha'),
         ('${ORG_TWIN_B}', '08911088', 'TEST Bistro Dvojče a.s.', 'Ostrava')`,
    ]) {
      await db.execute(sql.raw(statement));
    }
    lucie = await connect(LUCIE, "EXECUTIVE", true);
    viner = await connect(VINER, "ADMIN", true);
    vinerReadOnly = await connect(VINER, "ADMIN", false);
  }, 120_000);

  beforeEach(() => {
    process.env.MCP_OAUTH_CLIENT_SECRET = SECRET;
  });

  it("prepare_order vidí i čtecí připojení; create_order jen připojení se zápisem — a čtecí ho nespustí", async () => {
    expect(listed(lucie)).toEqual(expect.arrayContaining(["prepare_order", "create_order"]));
    expect(listed(vinerReadOnly)).toContain("prepare_order");
    expect(listed(vinerReadOnly)).not.toContain("create_order");
    const args = gmailOrder("GMAIL-RO-1");
    const prepared = await call(vinerReadOnly, "prepare_order", args);
    const created = await call(vinerReadOnly, "create_order", { ...args, proposal_token: prepared.data.proposal_token, confirm: true, idempotency_key: randomUUID() });
    expect(created).toMatchObject({ isError: true, text: expect.stringMatching(/jen pro čtení/) });
    expect(await rows(sql`SELECT 1 FROM order_activity WHERE metadata->>'externalReference' = 'GMAIL-RO-1'`)).toEqual([]);
  });

  it("Lucie: Gmail → návrh (nic nezapíše) → potvrzení → objednávka se vším, číslem, odkazem a auditem", async () => {
    const before = await ordersOf(ORG_KAVARNA);
    const args = gmailOrder("GMAIL-1001");
    const prepared = await call(lucie, "prepare_order", args);
    expect(prepared.data).toMatchObject({
      canCreate: true,
      blocking: [],
      customer: { status: "existing", organizationId: ORG_KAVARNA, ico: ICO_KAVARNA, matchedBy: ["ico"] },
      order: { subtotalKc: 824, shippingKc: 150, totalKc: 974, responsible: { userId: LUCIE, name: "Lucie Königsbergová" } },
      proposal_token: expect.stringMatching(/^o1\./),
    });
    expect(await ordersOf(ORG_KAVARNA)).toEqual(before); // náhled nic nezapsal

    // bez confirm=true nic
    const unconfirmed = await call(lucie, "create_order", { ...args, proposal_token: prepared.data.proposal_token, confirm: false, idempotency_key: randomUUID() });
    expect(unconfirmed).toMatchObject({ isError: true, text: expect.stringMatching(/confirm=true/) });

    const key = randomUUID();
    const createArgs = { ...args, proposal_token: prepared.data.proposal_token, confirm: true, idempotency_key: key };
    const created = await call(lucie, "create_order", createArgs);
    expect(created.isError, created.text).toBe(false);
    const { orderId, orderNumber } = created.data;
    expect(created.data).toMatchObject({
      created: true,
      orderNumber: expect.any(Number),
      url: `${ISSUER}/rizeni-firmy/objednavky/${orderId}`,
      customer: { organizationId: ORG_KAVARNA, created: false },
      totalKc: 974,
    });
    expect(String(orderNumber)).toMatch(/^7\d{7}$/);

    const [order] = await rows(sql`SELECT * FROM orders WHERE id = ${orderId}`);
    expect(order).toMatchObject({
      channel: "manual",
      buyer_organization_id: ORG_KAVARNA,
      contact_name: "Test Kontakt",
      contact_email: "test-kontakt@kavarna.test",
      contact_phone: "+420 777 000 111",
      subtotal_kc: 824,
      shipping_kc: 150,
      total_kc: 974,
      payment_status: "unpaid",
      fulfillment_status: "confirmed",
      shipping_method_label: "Rozvoz Begina",
      payment_method_label: "převodem na fakturu",
      recipient_name: "TEST Kavárna — provozovna",
      recipient_address: "Testovací 1, 602 00 Brno",
      responsible_user_id: LUCIE,
      entered_by_user_id: LUCIE,
      note: "TEST — objednávka z testu",
    });
    expect(new Date(order.planned_delivery_at).toISOString()).toBe("2026-12-01T12:00:00.000Z");
    const items = await rows(sql`SELECT name, quantity, unit_price_kc, line_total_kc FROM order_items WHERE order_id = ${orderId} ORDER BY name`);
    expect(items).toEqual([
      { name: "TEST Kulajda 0,5 l", quantity: 6, unit_price_kc: 89, line_total_kc: 534 },
      { name: "TEST Sirup bezinka", quantity: 2, unit_price_kc: 145, line_total_kc: 290 },
    ]);
    // audit: historie objednávky (kdo, zdroj, externí číslo) + MCP audit (kdo, kdy, nástroj)
    const [activity] = await rows(sql`SELECT author_user_id, author_name, kind, metadata FROM order_activity WHERE order_id = ${orderId}`);
    expect(activity).toMatchObject({
      author_user_id: LUCIE,
      author_name: "Lucie Königsbergová (přes ChatGPT)",
      kind: "created",
      metadata: { via: "mcp", source: "gmail", sourceLabel: "Gmail", externalReference: "GMAIL-1001", newCustomer: false, channel: "mcp:chatgpt", responsibleUserId: LUCIE },
    });
    const audit = await rows(sql`SELECT tool, status, is_write FROM agent_audit_log WHERE user_id = ${LUCIE} AND tool IN ('prepare_order', 'create_order') ORDER BY created_at`);
    expect(audit.filter((a: { tool: string; status: string }) => a.tool === "create_order" && a.status === "ok")).toHaveLength(1);

    // stejný požadavek znovu (stejný klíč) → uložený výsledek, žádná druhá objednávka
    const again = await call(lucie, "create_order", createArgs);
    expect(again.data).toMatchObject({ orderId, alreadySaved: true });
    // nový klíč, stejné externí číslo → stop, vrací existující
    const dup = await call(lucie, "create_order", { ...createArgs, idempotency_key: randomUUID() });
    expect(dup).toMatchObject({ isError: true, text: expect.stringMatching(/GMAIL-1001.*už v MojeBegina je/) });
    expect(dup.text).toContain(orderId);
    // náhled teď hlásí duplicitu a token nedá
    const repeated = await call(lucie, "prepare_order", args);
    expect(repeated.data).toMatchObject({ canCreate: false, duplicates: [{ orderId }] });
    expect(repeated.data.proposal_token).toBeUndefined();
    expect(await ordersOf(ORG_KAVARNA)).toHaveLength(before.length + 1);
    // existující objednávka zůstala beze změny
    const [after] = await rows(sql`SELECT * FROM orders WHERE id = ${orderId}`);
    expect(after).toEqual(order);
  });

  it("souběh: dva požadavky se stejným externím číslem a různými klíči → jediná objednávka", async () => {
    const args = gmailOrder("GMAIL-RACE-7", { items: [{ name: "TEST Kulajda 0,5 l", quantity: 7, unit_price_kc: 89 }], expected_total_kc: 7 * 89 + 150 });
    const prepared = await call(viner, "prepare_order", args);
    const base = { ...args, proposal_token: prepared.data.proposal_token, confirm: true };
    const results = await Promise.all([
      call(viner, "create_order", { ...base, idempotency_key: randomUUID() }),
      call(viner, "create_order", { ...base, idempotency_key: randomUUID() }),
    ]);
    expect(results.filter((r) => !r.isError), results.map((r) => r.text).join(" || ")).toHaveLength(1);
    expect(results.filter((r) => r.isError)[0].text).toMatch(/GMAIL-RACE-7/);
    expect(await rows(sql`SELECT 1 FROM order_activity WHERE metadata->>'externalReference' = 'GMAIL-RACE-7'`)).toHaveLength(1);
  });

  it("změněné údaje po návrhu, cizí token nebo starý token → nic se nezaloží", async () => {
    const args = gmailOrder("GMAIL-CHANGE-1");
    const prepared = await call(lucie, "prepare_order", args);
    const token = prepared.data.proposal_token;
    const changed = await call(lucie, "create_order", { ...args, items: [{ name: "TEST Kulajda 0,5 l", quantity: 60, unit_price_kc: 89 }], expected_total_kc: undefined, proposal_token: token, confirm: true, idempotency_key: randomUUID() });
    expect(changed).toMatchObject({ isError: true, text: expect.stringMatching(/liší/) });
    const foreign = await call(viner, "create_order", { ...args, proposal_token: token, confirm: true, idempotency_key: randomUUID() });
    expect(foreign).toMatchObject({ isError: true, text: expect.stringMatching(/jiný uživatel/) });
    const { verifyProposalToken, signProposalToken } = await import("../mcp/tools/orders");
    const old = signProposalToken({ userId: LUCIE, fingerprint: "f", issuedAt: Date.now() - 31 * 60_000 }, SECRET);
    expect(verifyProposalToken(old, LUCIE, SECRET)).toMatchObject({ ok: false, error: expect.stringMatching(/30 minut/) });
    expect(await rows(sql`SELECT 1 FROM order_activity WHERE metadata->>'externalReference' = 'GMAIL-CHANGE-1'`)).toEqual([]);
  });

  it("nový zákazník podle IČO + název + sídlo; neplatné IČO a chybějící sídlo stop", async () => {
    const base = {
      source: "phone",
      customer_ico: ICO_NEW,
      customer_name: "TEST Nová Firma s.r.o.",
      customer_address: "Nová 5, 110 00 Praha",
      customer_dic: "cz76543218",
      contact_email: "nova@firma.test",
      items: [{ name: "TEST Polévka", quantity: 3, unit_price_kc: 100 }],
    };
    const noAddress = await call(lucie, "prepare_order", { ...base, customer_address: undefined });
    expect(noAddress.data).toMatchObject({ canCreate: false, blocking: [expect.stringMatching(/název firmy a sídlo/)] });
    expect(await call(lucie, "prepare_order", { ...base, customer_ico: "76543219" })).toMatchObject({ isError: true, text: expect.stringMatching(/IČO 76543219 není platné/) });

    const { prepared, created } = await prepareAndCreate(lucie, base);
    expect(prepared.data.customer).toEqual({ status: "new", ico: ICO_NEW, name: "TEST Nová Firma s.r.o.", registeredAddress: "Nová 5, 110 00 Praha", dic: "CZ76543218" });
    expect(created.data).toMatchObject({ created: true, customer: { ico: ICO_NEW, name: "TEST Nová Firma s.r.o.", created: true } });
    const [org] = await rows(sql`SELECT name, registered_address, dic FROM organizations WHERE ico = ${ICO_NEW}`);
    expect(org).toEqual({ name: "TEST Nová Firma s.r.o.", registered_address: "Nová 5, 110 00 Praha", dic: "CZ76543218" });
    // podruhé už existující zákazník (nic se nezakládá znovu)
    const second = await call(lucie, "prepare_order", { ...base, items: [{ name: "TEST Polévka", quantity: 1, unit_price_kc: 100 }] });
    expect(second.data.customer).toMatchObject({ status: "existing", ico: ICO_NEW });
  });

  it("dohledání bez IČO: podle e-mailu z dřívější objednávky přiřadí; víc firem se stejným názvem = výběr uživatele", async () => {
    const byEmail = await call(lucie, "prepare_order", {
      source: "phone",
      contact_email: "TEST-KONTAKT@kavarna.test",
      items: [{ name: "TEST Sirup", quantity: 1, unit_price_kc: 145 }],
    });
    expect(byEmail.data).toMatchObject({ canCreate: true, customer: { status: "existing", organizationId: ORG_KAVARNA, matchedBy: expect.arrayContaining(["email"]) } });
    expect(byEmail.data.warnings.join(" ")).toMatch(/přiřazen podle email/);

    const byPhone = await call(lucie, "prepare_order", { source: "phone", contact_phone: "777000111", items: [{ name: "TEST Sirup", quantity: 1, unit_price_kc: 145 }] });
    expect(byPhone.data.customer).toMatchObject({ status: "existing", organizationId: ORG_KAVARNA });

    const ambiguous = await call(lucie, "prepare_order", { source: "phone", customer_name: "Bistro Dvojče", items: [{ name: "TEST Sirup", quantity: 1, unit_price_kc: 145 }] });
    expect(ambiguous.data).toMatchObject({ canCreate: false, customer: { status: "unresolved" } });
    expect(ambiguous.data.candidates.map((c: { organizationId: string }) => c.organizationId).sort()).toEqual([ORG_TWIN_A, ORG_TWIN_B].sort());
    expect(ambiguous.data.blocking.join(" ")).toMatch(/jednoznačně/);

    const nobody = await call(lucie, "prepare_order", { source: "phone", contact_email: "nikdo@nikde.test", items: [{ name: "X", quantity: 1, unit_price_kc: 1 }] });
    expect(nobody.data.blocking.join(" ")).toMatch(/nebyl nalezen/);
  });

  it("podobná objednávka (stejný zákazník a částka, ±3 dny) jen s confirm_not_duplicate", async () => {
    const args = {
      source: "phone",
      organization_id: ORG_TWIN_A,
      ordered_at: "2026-10-20",
      items: [{ name: "TEST Kulajda", quantity: 10, unit_price_kc: 89 }],
    };
    const first = await prepareAndCreate(viner, args);
    expect(first.created.isError, first.created.text).toBe(false);
    const prepared = await call(viner, "prepare_order", { ...args, ordered_at: "2026-10-22" });
    expect(prepared.data).toMatchObject({ canCreate: true, requiresConfirmNotDuplicate: true, possibleDuplicates: [{ orderId: first.created.data.orderId }] });
    const create = (extra: Record<string, unknown>) =>
      call(viner, "create_order", { ...args, ordered_at: "2026-10-22", proposal_token: prepared.data.proposal_token, confirm: true, idempotency_key: randomUUID(), ...extra });
    expect(await create({})).toMatchObject({ isError: true, text: expect.stringMatching(/confirm_not_duplicate=true/) });
    expect((await ordersOf(ORG_TWIN_A))).toHaveLength(1);
    expect(await create({ confirm_not_duplicate: true })).toMatchObject({ isError: false, data: { created: true } });
    expect((await ordersOf(ORG_TWIN_A))).toHaveLength(2);
  });

  it("kontroly vstupu: součet z podkladu, zdroj, externí číslo u Gmailu, budoucí datum, nejasná odpovědná osoba, neznámý argument", async () => {
    const prep = (args: Record<string, unknown>) => call(lucie, "prepare_order", args);
    expect(await prep(gmailOrder("GMAIL-SUM", { expected_total_kc: 1000 }))).toMatchObject({ isError: true, text: expect.stringMatching(/Celková cena nesedí: .* = 974 Kč, podklad uvádí 1000 Kč/) });
    expect(await prep(gmailOrder("X", { source: "fax" }))).toMatchObject({ isError: true, text: expect.stringMatching(/Zdroj objednávky/) });
    expect(await prep(gmailOrder("", { external_reference: undefined }))).toMatchObject({ isError: true, text: expect.stringMatching(/externí číslo/) });
    expect(await prep(gmailOrder("GMAIL-F", { ordered_at: "2099-01-01" }))).toMatchObject({ isError: true, text: expect.stringMatching(/budoucnosti/) });
    const unclear = await prep(gmailOrder("GMAIL-R", { responsible: "Nikdo Neznámý" }));
    expect(unclear.data.blocking.join(" ")).toMatch(/Odpovědnou osobu/);
    expect(await prep({ ...gmailOrder("GMAIL-U"), order_id: "x" })).toMatchObject({ isError: true, text: expect.stringMatching(/Neznámé argumenty: order_id/) });
  });
});
