// GPT/MCP — fakturace přes asistenta nad skutečnou datovou vrstvou
// (ovladač Neonu → PGlite se všemi migracemi) a napodobeninou iDokladu:
// souhlas → token → MCP nástroje pod identitou uživatele. Vystavuje TÝMŽ
// motorem jako tlačítko v detailu objednávky (issueAndSendInvoice) —
// skutečný iDoklad ani Resend se nevolá nikdy.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { EmailMessage } from "@/lib/eshop/email/resend";
import { createFakeIdoklad } from "@/lib/eshop/__tests__/helpers/fakeIdoklad";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "moje.begina.example", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

const mail = vi.hoisted(() => ({ sent: [] as (EmailMessage & { key: string })[] }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: EmailMessage, key: string) => {
    mail.sent.push({ ...message, key });
    return { ok: true, id: `msg_${mail.sent.length}` };
  },
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const OTHER = "user-kolega-executive";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);

const INVOICING_TOOLS = [
  "idoklad_search_invoices",
  "idoklad_get_invoice",
  "idoklad_list_series",
  "idoklad_numbering_audit",
  "idoklad_unpaid_and_discrepancies",
  "invoice_preview",
  "issue_and_send_invoice",
];

const BASE = {
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  E2E_ORDER_NUMBER_START: "910000",
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test",
  ESHOP_EMAIL_INVOICE_COPY_TO: "faktury@begina.test",
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "prod-client",
  IDOKLAD_ESHOP_CLIENT_SECRET: "prod-secret",
  IDOKLAD_ESHOP_APPLICATION_ID: "prod-app",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
};
const PREVIEW = { ...BASE, VERCEL_ENV: "preview" };
// Production, ruční vystavování (jako faktura 9260001), e-maily naostro
const MANUAL = {
  ...BASE,
  VERCEL_ENV: "production",
  ESHOP_EMAIL_LIVE: "on",
  ESHOP_ORDER_WRITE: "on",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_READ_CHANNELS: "mcp:chatgpt",
};

describe("fakturace přes MCP (ChatGPT) nad DB", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let runAsAgent: typeof import("../context").runAsAgent;
  let orders: typeof import("@/lib/data/orders");
  let afterPaid: typeof import("@/lib/eshop/invoicing/afterPaid");
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  const saved = { ...process.env };
  const route = { fake: null as ReturnType<typeof createFakeIdoklad> | null, idoklad: [] as string[] };

  type Session = import("../oauthStore").AgentSession;

  function setEnv(env: Record<string, string | undefined>) {
    for (const key of ["VERCEL_ENV", "IDOKLAD_INVOICING_ENABLED", "ESHOP_EMAIL_LIVE", "ESHOP_ORDER_WRITE", "IDOKLAD_READ_CHANNELS"]) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write = true): Promise<Session> {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return session;
  }

  const call = async (session: Session, name: string, args: Record<string, unknown> = {}) => {
    const result = await mcp.callAgentTool(db, session, config, name, args);
    if (!result) throw new Error(`nástroj ${name} neexistuje`);
    const data = result.structuredContent as Record<string, unknown> | undefined;
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { isError: result.isError === true, data: data ?? {}, text };
  };
  const listed = (session: Session) => mcp.agentMcpServer(db, session, config).listTools().map((t) => t.name);

  /** Zaplacená objednávka převodem (pokladna v Preview, platbu zapíše Viner v MojeBegina). */
  async function paidOrder(viner: Session) {
    setEnv(PREVIEW);
    const token = randomUUID();
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
      name: "Jana Nováková",
      email: `jana-${token.slice(0, 8)}@example.cz`,
      phone: "+420 777 123 456",
      shippingMethodId: "osobni-odber",
      paymentMethodId: "prevod",
      street: "",
      city: "",
      zip: "",
      note: "",
      termsAccepted: "on",
      orderToken: token,
      website: "",
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    await submitCheckoutAction(null, data);
    const [order] = await rows(sql`SELECT id, total_kc, contact_email, order_number FROM orders WHERE id = ${token}`);
    setEnv(MANUAL);
    const paid = await runAsAgent(viner.ctx, () =>
      orders.recordOrderPayment(order.id, { token: randomUUID(), amountKc: String(order.total_kc), date: today(), method: "bank_transfer", note: "" })
    );
    expect(paid).toMatchObject({ ok: true, settled: true });
    mail.sent.length = 0;
    return order as { id: string; contact_email: string; order_number: number };
  }

  const linkState = async (id: string) =>
    (
      await rows(sql`
        SELECT i.doc_state, i.invoice_number, i.pdf_sent_at IS NOT NULL AS pdf_sent, l.state, l.external_id
        FROM invoices i JOIN invoice_provider_links l ON l.invoice_id = i.id AND l.state <> 'void'
        WHERE i.order_id = ${id} AND i.document_type = 'invoice'`)
    )[0];
  const invoiceMails = () => mail.sent.filter((m) => /^Faktura k objednávce/.test(m.subject));

  let viner: Session;
  let lucie: Session;
  let other: Session;

  beforeAll(async () => {
    setEnv(PREVIEW);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/idoklad\.cz/.test(url)) {
        route.idoklad.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
        if (!route.fake) throw new Error(`Neočekávaný požadavek na iDoklad: ${url}`);
        return route.fake.fetchImpl(input, init);
      }
      return shimFetch(input, init);
    }) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
    orders = await import("@/lib/data/orders");
    afterPaid = await import("@/lib/eshop/invoicing/afterPaid");
    ({ runAsAgent } = await import("../context"));
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");
    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: "https://gpt-pilot.begina.cz",
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: SECRET,
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${VINER},${LUCIE},${OTHER}`,
      MCP_ALLOW_WRITE: "on",
    })!;

    await db.execute(sql.raw(`INSERT INTO user_roles (user_id, system_role) VALUES ('${VINER}', 'ADMIN'), ('${LUCIE}', 'EXECUTIVE'), ('${OTHER}', 'EXECUTIVE')`));
    await db.execute(sql.raw(`
      INSERT INTO user_profiles (user_id, name, email) VALUES
        ('${VINER}', 'Jaroslav Viner', 'jaroslav@begina.cz'),
        ('${LUCIE}', 'Lucie Königsbergová', 'lucie@begina.cz'),
        ('${OTHER}', 'Kolega Obchod', 'kolega@begina.cz')`));
    viner = await connect(VINER, "ADMIN");
    lucie = await connect(LUCIE, "EXECUTIVE");
    other = await connect(OTHER, "EXECUTIVE");
  }, 120_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
    route.fake = null;
    route.idoklad.length = 0;
    setEnv(MANUAL);
  });

  // ---------------------------------------------------------------- kdo co vidí

  it("Jaroslav i Lucie vidí čtení iDokladu, náhled i vystavení; jiný uživatel nic z toho a volání je odmítnuté s auditem", async () => {
    for (const session of [viner, lucie]) expect(listed(session)).toEqual(expect.arrayContaining(INVOICING_TOOLS));
    const others = listed(other);
    for (const name of INVOICING_TOOLS) expect(others).not.toContain(name);
    expect(others).toContain("search_mojebegina");

    for (const [name, args] of [
      ["invoice_preview", { order_number: "1" }],
      ["idoklad_list_series", {}],
      ["issue_and_send_invoice", { order_id: randomUUID(), preview_token: "x", confirm: true, idempotency_key: randomUUID() }],
    ] as const) {
      const result = await call(other, name, args);
      expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/nemá váš účet v MojeBegina oprávnění/) });
    }
    const audit = await rows(sql`SELECT tool, status, error FROM agent_audit_log WHERE user_id = ${OTHER} ORDER BY created_at`);
    expect(audit).toEqual([
      { tool: "invoice_preview", status: "denied", error: "not_permitted" },
      { tool: "idoklad_list_series", status: "denied", error: "not_permitted" },
      { tool: "issue_and_send_invoice", status: "denied", error: "not_permitted" },
    ]);
    expect(route.idoklad).toEqual([]);
  });

  it("připojení jen pro čtení: náhled ano, vystavení se nevypíše a volání neprojde", async () => {
    const readOnly = await connect(VINER, "ADMIN", false);
    expect(listed(readOnly)).toContain("invoice_preview");
    expect(listed(readOnly)).not.toContain("issue_and_send_invoice");
    const order = await paidOrder(viner);
    const preview = await call(readOnly, "invoice_preview", { order_id: order.id });
    expect(preview.data).toMatchObject({ canIssue: true, preview_token: expect.any(String) });
    route.fake = createFakeIdoklad();
    const issued = await call(readOnly, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: preview.data.preview_token,
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(issued).toMatchObject({ isError: true, text: expect.stringMatching(/jen pro čtení/) });
    expect(route.fake.calls).toEqual([]);
    expect(await linkState(order.id)).toMatchObject({ doc_state: "draft", external_id: null });
  });

  // ---------------------------------------------------------------- celý postup

  it("Jaroslav: náhled (nic nezapíše) → potvrzení → jedna faktura v řadě 7277293, uhrazeno, PDF jednou zákazníkovi + Bcc", async () => {
    const order = await paidOrder(viner);
    const before = await linkState(order.id);

    const preview = await call(viner, "invoice_preview", { order_number: String(order.order_number) });
    expect(preview.isError).toBe(false);
    expect(preview.data.cannotIssueReasons).toEqual([]);
    expect(preview.data).toMatchObject({
      orderId: order.id,
      canIssue: true,
      action: "issue_and_send",
      mode: { live: true, trigger: "manual" },
      numberSeries: { id: "7277293", expected: "7277293" },
      orderStatus: { paidForInvoice: true },
      blocking: [],
      email: { enabled: true, to: [order.contact_email], withheld: [], bcc: ["faktury@begina.test"] },
      draft: { customer: { name: "Jana Nováková", email: order.contact_email }, vs: expect.any(String) },
    });
    // náhled je jen čtení: žádný požadavek na iDoklad, žádná změna v DB, žádný e-mail
    expect(route.idoklad).toEqual([]);
    expect(await linkState(order.id)).toEqual(before);
    expect(mail.sent).toEqual([]);

    // bez confirm=true nic
    const unconfirmed = await call(viner, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: preview.data.preview_token,
      confirm: false,
      idempotency_key: randomUUID(),
    });
    expect(unconfirmed).toMatchObject({ isError: true, text: expect.stringMatching(/confirm=true/) });

    route.fake = createFakeIdoklad();
    const next = route.fake.next();
    const key = randomUUID();
    const args = { order_id: order.id, preview_token: preview.data.preview_token, confirm: true, idempotency_key: key };
    const issued = await call(viner, "issue_and_send_invoice", args);
    expect(issued.isError).toBe(false);
    expect(issued.data).toMatchObject({ status: "issued", invoiceNumber: next.number, emailed: true });
    expect(route.fake.writes()).toEqual(["POST /Contacts", "POST /IssuedInvoices", `PUT /IssuedDocumentPayments/FullyPay/${next.id}`]);
    const post = route.fake.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body as Record<string, unknown>;
    expect(post).toMatchObject({ NumericSequenceId: 7277293 });
    expect(await linkState(order.id)).toMatchObject({ doc_state: "issued", invoice_number: next.number, state: "issued", pdf_sent: true });
    expect(invoiceMails()).toHaveLength(1);
    expect(invoiceMails()[0]).toMatchObject({ to: [order.contact_email], bcc: ["faktury@begina.test"] });
    expect(invoiceMails()[0].attachments?.[0].filename).toBe(`faktura-${next.number}.pdf`);

    // stejný požadavek znovu (stejný klíč) → uložený výsledek, nic nového
    const writes = route.fake.writes().length;
    const again = await call(viner, "issue_and_send_invoice", args);
    expect(again.data).toMatchObject({ status: "issued", invoiceNumber: next.number, alreadySaved: true });
    // stejný náhled s novým klíčem → už vystavená, PDF se znovu neposílá
    const third = await call(viner, "issue_and_send_invoice", { ...args, idempotency_key: randomUUID() });
    expect(third.data).toMatchObject({ status: "already_issued", invoiceNumber: next.number, emailed: false, pdfSentBefore: true });
    expect(route.fake.writes()).toHaveLength(writes);
    expect(route.fake.invoices).toHaveLength(1);
    expect(invoiceMails()).toHaveLength(1);
    // náhled teď hlásí hotovo — žádný další token
    const done = await call(viner, "invoice_preview", { order_id: order.id });
    expect(done.data).toMatchObject({ canIssue: false, existing: { docState: "issued", pdfSent: true } });
    expect(done.data.preview_token).toBeUndefined();

    // audit: kdo, co a s jakým výsledkem
    const audit = await rows(sql`
      SELECT tool, status, idempotency_key FROM agent_audit_log
      WHERE user_id = ${VINER} AND tool IN ('invoice_preview', 'issue_and_send_invoice') AND created_at > now() - interval '1 minute'
      ORDER BY created_at`);
    expect(audit.filter((a: { tool: string; status: string }) => a.tool === "issue_and_send_invoice" && a.status === "ok")).toHaveLength(2);
    expect(audit.filter((a: { idempotency_key: string | null }) => a.idempotency_key === key)).toHaveLength(1);
    const activity = await rows(sql`SELECT kind, author_user_id, author_name FROM order_activity WHERE order_id = ${order.id} AND kind = 'invoice_issued'`);
    expect(activity).toEqual([{ kind: "invoice_issued", author_user_id: VINER, author_name: "Jaroslav Viner (přes ChatGPT)" }]);
  });

  it("Lucie: vlastním účtem náhled → vystavení; token jiného uživatele neplatí", async () => {
    const order = await paidOrder(viner);
    const vinerPreview = await call(viner, "invoice_preview", { order_id: order.id });
    route.fake = createFakeIdoklad();
    const foreign = await call(lucie, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: vinerPreview.data.preview_token,
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(foreign).toMatchObject({ isError: true, text: expect.stringMatching(/jiný uživatel/) });
    expect(route.fake.calls).toEqual([]);

    const preview = await call(lucie, "invoice_preview", { order_id: order.id });
    const next = route.fake.next();
    const issued = await call(lucie, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: preview.data.preview_token,
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(issued.data).toMatchObject({ status: "issued", invoiceNumber: next.number, emailed: true });
    expect(invoiceMails()).toHaveLength(1);
    expect(invoiceMails()[0].to).toEqual([order.contact_email]);
    const [activity] = await rows(sql`SELECT author_user_id FROM order_activity WHERE order_id = ${order.id} AND kind = 'invoice_issued'`);
    expect(activity).toEqual({ author_user_id: LUCIE });
  });

  it("souběh: dva požadavky (různé klíče) na stejný náhled → jedna faktura, jeden e-mail", async () => {
    const order = await paidOrder(viner);
    const preview = await call(viner, "invoice_preview", { order_id: order.id });
    route.fake = createFakeIdoklad();
    const args = { order_id: order.id, preview_token: preview.data.preview_token, confirm: true };
    const results = await Promise.all([
      call(viner, "issue_and_send_invoice", { ...args, idempotency_key: randomUUID() }),
      call(lucie, "issue_and_send_invoice", { ...args, idempotency_key: randomUUID() }).then(() =>
        call(viner, "issue_and_send_invoice", { ...args, idempotency_key: randomUUID() })
      ),
    ]);
    expect(results.filter((r) => r.data.status === "issued")).toHaveLength(1);
    expect(route.fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
    expect(route.fake.invoices).toHaveLength(1);
    expect(invoiceMails()).toHaveLength(1);
  });

  it("změna objednávky po náhledu, podvržený token nebo jiná objednávka → stop bez požadavku do iDokladu", async () => {
    const order = await paidOrder(viner);
    const other = await paidOrder(viner);
    const preview = await call(viner, "invoice_preview", { order_id: order.id });
    route.fake = createFakeIdoklad();
    const token = preview.data.preview_token as string;
    const issue = (orderId: string, previewToken: string) =>
      call(viner, "issue_and_send_invoice", { order_id: orderId, preview_token: previewToken, confirm: true, idempotency_key: randomUUID() });

    expect(await issue(other.id, token)).toMatchObject({ isError: true, text: expect.stringMatching(/jiné objednávce/) });
    const [v, body] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), orderId: other.id })).toString("base64url");
    expect(await issue(other.id, `${v}.${forged}.${token.split(".")[2]}`)).toMatchObject({ isError: true, text: expect.stringMatching(/neplatný/) });

    await db.execute(sql`UPDATE orders SET contact_name = 'Jana Nováková-Malá' WHERE id = ${order.id}`);
    expect(await issue(order.id, token)).toMatchObject({ isError: true, text: expect.stringMatching(/změnily/) });
    expect(route.fake.calls).toEqual([]);
    expect(await linkState(order.id)).toMatchObject({ doc_state: "draft", external_id: null });
  });

  it("nejasný stav (doklad v iDokladu po chybě, nedoběhlý pokus) → náhled i vystavení stop k ruční kontrole", async () => {
    const order = await paidOrder(viner);
    const preview = await call(viner, "invoice_preview", { order_id: order.id });
    await db.execute(sql`
      UPDATE invoice_provider_links SET state = 'failed', external_id = '987654', last_error = 'FullyPay selhal'
      WHERE invoice_id IN (SELECT id FROM invoices WHERE order_id = ${order.id})`);
    route.fake = createFakeIdoklad();
    const stopped = await call(viner, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: preview.data.preview_token,
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(stopped).toMatchObject({ isError: true, text: expect.stringMatching(/987654.*ruční kontrola/) });
    expect((await call(viner, "invoice_preview", { order_id: order.id })).data).toMatchObject({ canIssue: false });

    await db.execute(sql`
      UPDATE invoice_provider_links SET state = 'pending', external_id = NULL, attempts = 1
      WHERE invoice_id IN (SELECT id FROM invoices WHERE order_id = ${order.id})`);
    const pending = await call(viner, "issue_and_send_invoice", {
      order_id: order.id,
      preview_token: preview.data.preview_token,
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(pending).toMatchObject({ isError: true, text: expect.stringMatching(/nedoběhl/) });
    expect(route.fake.calls).toEqual([]);
  });

  it("vystavená faktura bez odeslaného PDF: souběžné dorovnání odešle PDF jen jednou", async () => {
    const order = await paidOrder(viner);
    route.fake = createFakeIdoklad();
    // vystavení, při kterém e-mail neodešel (PDF se nepodařilo načíst)
    const issued = await afterPaid.issueAndSendInvoice(db, order.id, "https://moje.begina.example", { type: "system", name: "test" }, {
      email: { transport: async () => ({ ok: false, error: "Resend nedostupný" }) },
    });
    expect(issued).toMatchObject({ status: "issued", emailed: false });
    expect(await linkState(order.id)).toMatchObject({ doc_state: "issued", pdf_sent: false });

    const actor = { type: "system" as const, name: "test" };
    const [a, b] = await Promise.all([
      afterPaid.issueAndSendInvoice(db, order.id, "https://moje.begina.example", actor),
      afterPaid.issueAndSendInvoice(db, order.id, "https://moje.begina.example", actor),
    ]);
    expect([a, b].filter((r) => (r as { emailed?: boolean }).emailed)).toHaveLength(1);
    expect(invoiceMails()).toHaveLength(1);
    expect(await linkState(order.id)).toMatchObject({ pdf_sent: true });
    // a přes MCP už nic dalšího
    const preview = await call(viner, "invoice_preview", { order_id: order.id });
    expect(preview.data).toMatchObject({ canIssue: false, existing: { pdfSent: true } });
    expect(route.fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
  });

  // ---------------------------------------------------------------- čtení iDokladu

  it("čtení iDokladu přes MCP: kanál mcp:chatgpt, audit s uživatelem; bez povoleného kanálu odmítnuto", async () => {
    // jen čtení: odpovědi ve tvaru iDoklad API v3 (agenda Begina, jedna řada, žádné faktury)
    const reads: string[] = [];
    const data = (d: unknown) => new Response(JSON.stringify({ Data: d, IsSuccess: true, StatusCode: 200 }), { status: 200 });
    route.fake = {
      ...createFakeIdoklad(),
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
        const path = url.pathname.replace(/^\/v3/, "");
        reads.push(`${(init?.method ?? "GET").toUpperCase()} ${path}`);
        if (path === "/Account/CurrentAgenda") return data({ Contact: { IdentificationNumber: "74337297" } });
        if (path === "/NumericSequences") return data({ Items: [{ Id: 7277293, Name: "E-shop Begina", DocumentType: 0, NumberFormat: "9{RR}{NNNN}" }], TotalItems: 1, TotalPages: 1 });
        if (path === "/IssuedInvoices") return data({ Items: [], TotalItems: 0, TotalPages: 1 });
        return new Response("{}", { status: 404 });
      }) as typeof fetch,
    };
    const ok = await call(lucie, "idoklad_search_invoices", { number: "9260001" });
    expect(ok).toMatchObject({ isError: false, data: { source: { system: "iDoklad", readOnly: true } } });
    const [log] = await rows(sql`SELECT user_id, channel, tool, status FROM idoklad_read_log WHERE user_id = ${LUCIE} ORDER BY created_at DESC LIMIT 1`);
    expect(log).toMatchObject({ user_id: LUCIE, channel: "mcp:chatgpt", tool: "idoklad_search_invoices", status: "ok" });
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((r) => !r.startsWith("GET "))).toEqual([]);

    setEnv({ ...MANUAL, IDOKLAD_READ_CHANNELS: undefined });
    const denied = await call(viner, "idoklad_search_invoices", { number: "9260001" });
    expect(denied).toMatchObject({ isError: true, text: expect.stringMatching(/mcp:chatgpt nemá povolené čtení/) });
  });
});

describe("preview_token (čisté funkce)", () => {
  it("platí 30 minut, jen pro stejného uživatele a objednávku; podpis jiným klíčem neplatí", async () => {
    const { signPreviewToken, verifyPreviewToken } = await import("../mcp/tools/invoicing");
    const claims = { userId: "u1", orderId: "o1", fingerprint: "f", issuedAt: 1_000_000 };
    const token = signPreviewToken(claims, SECRET);
    expect(verifyPreviewToken(token, { userId: "u1", orderId: "o1" }, SECRET, 1_000_000 + 29 * 60_000)).toEqual({ ok: true, claims });
    expect(verifyPreviewToken(token, { userId: "u1", orderId: "o1" }, SECRET, 1_000_000 + 31 * 60_000)).toMatchObject({ ok: false, error: expect.stringMatching(/starší než 30 minut/) });
    expect(verifyPreviewToken(token, { userId: "u2", orderId: "o1" }, SECRET, 1_000_000)).toMatchObject({ ok: false, error: expect.stringMatching(/jiný uživatel/) });
    expect(verifyPreviewToken(token, { userId: "u1", orderId: "o1" }, "t".repeat(40), 1_000_000)).toMatchObject({ ok: false, error: expect.stringMatching(/neplatný/) });
    expect(verifyPreviewToken("v1.abc", { userId: "u1", orderId: "o1" }, SECRET)).toMatchObject({ ok: false });
  });
});
