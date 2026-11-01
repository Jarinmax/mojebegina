// GPT/MCP — B2B faktura do iDokladu v Luciině řadě (2026xxxx) bez e-shopu:
// prepare_b2b_invoice → potvrzení → issue_b2b_invoice. Nad skutečnou datovou
// vrstvou (PGlite) a stavovou napodobeninou iDokladu — skutečný iDoklad ani
// e-mail se nevolá. Ověřuje i pojistky řad (e-shop dál jen 7277293).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { BEGINA_CODEBOOKS } from "@/lib/eshop/__tests__/helpers/fakeIdoklad";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "gpt-pilot.begina.cz", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));
const mail = vi.hoisted(() => ({ sent: [] as unknown[] }));
vi.mock("@/lib/eshop/email/resend", () => ({ resendTransport: () => async (m: unknown) => (mail.sent.push(m), { ok: true, id: "msg" }) }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const OTHER = "user-kolega-executive";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const LUCIE_SERIES = 2032369;
const ICO_KAVARNA = "12345679"; // v iDokladu i v MojeBegina
const ICO_JEN_MB = "76543218"; // jen zákazník v MojeBegina — kontakt se založí
const ICO_NIKDE = "24680249";
const ORG_KAVARNA = "00000000-0000-4000-8000-00000000b001";

const ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_B2B_SEQUENCE_ID: String(LUCIE_SERIES),
  IDOKLAD_ESHOP_CLIENT_ID: "cid",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp",
  IDOKLAD_READ_CHANNELS: "mcp:chatgpt",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
};

type Inv = { Id: number; DocumentNumber: string; NumericSequenceId: number; PartnerId: number; DateOfIssue: string; PaymentStatus: number; Prices: { TotalWithVat: number }; body: Record<string, unknown> };
const store = vi.hoisted(() => ({
  serial: 202,
  invoices: [] as Inv[],
  contacts: [] as { Id: number; IdentificationNumber: string; CompanyName: string }[],
  calls: [] as { method: string; path: string; body: unknown; query: Record<string, string> }[],
}));
const writes = () => store.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);

async function fakeIdoklad(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = (init?.method ?? "GET").toUpperCase();
  const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
  const page = (items: unknown[]) => ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
  if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
  const path = url.pathname.replace(/^\/v3/, "");
  const query = Object.fromEntries(url.searchParams);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  store.calls.push({ method, path, body, query });
  const filter = query.filter ?? "";
  const eq = (prop: string) => new RegExp(`${prop}~eq~([^()|,]+)`).exec(filter)?.[1] ?? null;
  if (method === "GET" && path === "/Account/CurrentAgenda") return ok({ Contact: { IdentificationNumber: "74337297" }, IsRegisteredForVat: false, PreferredPriceType: 0 });
  if (method === "GET" && path === "/Currencies") return page(BEGINA_CODEBOOKS.currencies.filter((c) => !eq("Code") || c.Code === eq("Code")));
  if (method === "GET" && path === "/Countries") return page(BEGINA_CODEBOOKS.countries.filter((c) => !eq("Code") || c.Code === eq("Code")));
  if (method === "GET" && path === "/PaymentOptions") return page(BEGINA_CODEBOOKS.paymentOptions);
  if (method === "GET" && path === "/NumericSequences") {
    return page([
      { Id: 7277293, Name: "E-shop Begina", DocumentType: 0, IsDefault: false, NumberFormat: "9{RR}{NNNN}" },
      { Id: LUCIE_SERIES, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" },
    ]);
  }
  if (method === "GET" && path === "/NumericSequences/DocumentNumbers/IssuedInvoice") {
    const seq = Number(query.numericSequenceId);
    return ok({ Unique: { NumericSequenceId: seq, DocumentSerialNumber: store.serial + 1, DocumentNumber: `${(query.date ?? "2026").slice(0, 4)}${String(store.serial + 1).padStart(4, "0")}` } });
  }
  if (method === "GET" && path === "/IssuedInvoices/Default") return ok({ AccountNumber: "19-2000145399", BankId: 7, Items: [{ PriceType: 0, VatRateType: 2 }] });
  if (method === "GET" && path === "/IssuedInvoices") {
    const items = store.invoices
      .filter((i) => !eq("DocumentNumber") || i.DocumentNumber === eq("DocumentNumber"))
      .filter((i) => !eq("PartnerId") || String(i.PartnerId) === eq("PartnerId"))
      .map((i) => ({ Id: i.Id, DocumentNumber: i.DocumentNumber, DateOfIssue: i.DateOfIssue, Prices: i.Prices }));
    return page(items);
  }
  const one = /^\/IssuedInvoices\/(\d+)$/.exec(path);
  if (method === "GET" && one) {
    const inv = store.invoices.find((i) => i.Id === Number(one[1]));
    return inv ? ok({ Id: inv.Id, DocumentNumber: inv.DocumentNumber, Prices: inv.Prices, PaymentStatus: inv.PaymentStatus }) : new Response("{}", { status: 404 });
  }
  if (method === "GET" && path === "/Contacts") return page(store.contacts.filter((c) => c.IdentificationNumber === eq("IdentificationNumber")));
  if (method === "POST" && path === "/Contacts") {
    const contact = { Id: 900 + store.contacts.length, IdentificationNumber: body.IdentificationNumber, CompanyName: body.CompanyName };
    store.contacts.push(contact);
    return ok(contact);
  }
  if (method === "POST" && path === "/IssuedInvoices") {
    store.serial = body.DocumentSerialNumber;
    const total = (body.Items as { Amount: number; UnitPrice: number }[]).reduce((s, i) => s + i.Amount * i.UnitPrice, 0);
    const inv: Inv = {
      Id: 5000 + store.invoices.length,
      DocumentNumber: `2026${String(body.DocumentSerialNumber).padStart(4, "0")}`,
      NumericSequenceId: body.NumericSequenceId,
      PartnerId: body.PartnerId,
      DateOfIssue: String(body.DateOfIssue),
      PaymentStatus: 0,
      Prices: { TotalWithVat: Math.round(total * 100) / 100 },
      body,
    };
    store.invoices.push(inv);
    return ok({ Id: inv.Id, DocumentNumber: inv.DocumentNumber, Prices: inv.Prices });
  }
  const pay = /^\/IssuedDocumentPayments\/FullyPay\/(\d+)$/.exec(path);
  if (method === "PUT" && pay) {
    const inv = store.invoices.find((i) => i.Id === Number(pay[1]));
    if (inv) inv.PaymentStatus = 1;
    return ok(true);
  }
  return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: `nenalezeno ${method} ${path}` }), { status: 404 });
}

describe("B2B faktura v Luciině řadě přes MCP", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let oauth: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucie: Session;
  let lucieRead: Session;
  let other: Session;

  const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows;
  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write: boolean, invoicing: boolean): Promise<Session> {
    const code = await oauth.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, invoicing, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await oauth.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    return (await oauth.resolveAccessToken(db, config, tokens.body.access_token))!;
  }
  const call = async (session: Session, name: string, args: Record<string, unknown>) => {
    const result = await mcp.callAgentTool(db, session, config, name, args);
    if (!result) throw new Error(`nástroj ${name} neexistuje`);
    return { isError: result.isError === true, data: (result.structuredContent ?? {}) as Record<string, any>, text: result.content.map((c) => ("text" in c ? c.text : "")).join("") }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const listed = (session: Session) => mcp.agentMcpServer(db, session, config).listTools().map((t) => t.name);

  const kavarna = (extra: Record<string, unknown> = {}) => ({
    customer_ico: ICO_KAVARNA,
    items: [
      { name: "Dýňová polévka", quantity: 2, unit_price_kc: 379 },
      { name: "Rajčatová polévka", quantity: 2, unit_price_kc: 349 },
      { name: "Kulajda", quantity: 1, unit_price_kc: 399 },
      { name: "Gulášová z hlívy", quantity: 1, unit_price_kc: 389 },
    ],
    payment_method: "cash",
    note: "Děkujeme za objednávku.",
    expected_total_kc: 2 * 379 + 2 * 349 + 399 + 389,
    ...extra,
  });
  const issue = async (session: Session, args: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const prepared = await call(session, "prepare_b2b_invoice", args);
    expect(prepared.isError, prepared.text).toBe(false);
    return { prepared, issued: await call(session, "issue_b2b_invoice", { ...args, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID(), ...extra }) };
  };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      /idoklad\.cz/.test(String(input instanceof Request ? input.url : input)) ? fakeIdoklad(input, init) : shimFetch(input, init)) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    oauth = await import("../oauthStore");
    mcp = await import("../mcp/server");
    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: "https://gpt-pilot.begina.cz",
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: SECRET,
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${VINER},${LUCIE},${OTHER}`,
      MCP_ALLOW_WRITE: "on",
      MCP_ALLOW_INVOICING: "on",
    })!;
    await db.execute(sql.raw(`INSERT INTO user_roles (user_id, system_role) VALUES ('${LUCIE}', 'EXECUTIVE'), ('${OTHER}', 'EXECUTIVE')`));
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES ('${LUCIE}', 'Lucie Königsbergová', 'lucie.konigsbergova@seznam.cz'), ('${OTHER}', 'Kolega', 'kolega@begina.cz')`));
    await db.execute(sql.raw(`INSERT INTO organizations (id, ico, name, registered_address) VALUES
      ('${ORG_KAVARNA}', '${ICO_KAVARNA}', 'TEST Kavárna s.r.o.', 'Kavárenská 1, 110 00 Praha 1'),
      ('00000000-0000-4000-8000-00000000b002', '${ICO_JEN_MB}', 'TEST Bistro s.r.o.', 'Bistrová 7, 602 00 Brno')`));
    store.contacts.push({ Id: 777, IdentificationNumber: ICO_KAVARNA, CompanyName: "TEST Kavárna s.r.o." });
    lucie = await connect(LUCIE, "EXECUTIVE", false, true);
    lucieRead = await connect(LUCIE, "EXECUTIVE", true, false);
    other = await connect(OTHER, "EXECUTIVE", true, true);
  }, 120_000);

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    store.calls.length = 0;
    mail.sent.length = 0;
  });

  it("náhled: Luciina řada, další číslo, otevřená faktura hotově s poznámkou; nic nezapíše; rozporná poznámka varuje", async () => {
    const prepared = await call(lucie, "prepare_b2b_invoice", kavarna({ note: "Faktura je již uhrazena – neplaťte." }));
    expect(prepared.data).toMatchObject({
      canIssue: true,
      cannotIssueReasons: [],
      series: { id: String(LUCIE_SERIES) },
      expectedNumber: "20260203",
      customer: { status: "existing", idokladId: 777 },
      invoice: { totalKc: 2244, paymentMethod: "cash", paymentLabel: "hotově", paid: false, status: "otevřená (neuhrazená)", note: "Faktura je již uhrazena – neplaťte." },
      sendsEmail: false,
      preview_token: expect.any(String),
    });
    const { addDays } = await import("@/lib/eshop/invoicing/b2bInvoiceValidation");
    expect(prepared.data.invoice.dueDate).toBe(addDays(prepared.data.invoice.issueDate, 14));
    expect(prepared.data.warnings.join(" ")).toMatch(/tvrdí, že je faktura uhrazená, ale vystaví se jako NEUHRAZENÁ/);
    expect(writes()).toEqual([]);
  });

  it("vystavení: jedna faktura v řadě 2032369, hotově, otevřená (bez FullyPay), splatnost 14 dní, poznámka; odkaz na PDF; audit u zákazníka; žádný e-mail", async () => {
    const { prepared, issued } = await issue(lucie, kavarna());
    expect(issued.isError, issued.text).toBe(false);
    expect(issued.data).toMatchObject({
      issued: true,
      invoiceNumber: "20260203",
      totalKc: 2244,
      status: "otevřená (neuhrazená)",
      dueDate: prepared.data.invoice.dueDate,
      emailed: false,
      pdfUrl: expect.stringMatching(/\/rizeni-firmy\/faktury\/idoklad\/\d+\/pdf$/),
    });
    expect(writes()).toEqual(["POST /IssuedInvoices"]);
    const body = store.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(body).toMatchObject({
      NumericSequenceId: LUCIE_SERIES,
      DocumentSerialNumber: 203,
      VariableSymbol: "20260203",
      PartnerId: 777,
      PaymentOptionId: 3, // Cash (ne dobírka)
      ItemsTextSuffix: "Děkujeme za objednávku.",
      AccountNumber: "19-2000145399",
      DateOfMaturity: `${prepared.data.invoice.dueDate}T12:00:00.000`,
    });
    expect(body.Items).toHaveLength(4);
    expect(body.Items[0]).toMatchObject({ Name: "Dýňová polévka", Amount: 2, Unit: "ks", UnitPrice: 379, PriceType: 0, VatRateType: 2 });
    const [activity] = await rows(sql`SELECT author_user_id, kind, metadata FROM organization_activity WHERE organization_id = ${ORG_KAVARNA} ORDER BY created_at DESC LIMIT 1`);
    expect(activity).toMatchObject({ author_user_id: LUCIE, kind: "invoice_issued", metadata: { invoiceNumber: "20260203", paid: false, paymentMethod: "cash", series: String(LUCIE_SERIES), via: "mcp" } });
    expect(mail.sent).toEqual([]);
  });

  it("podobná faktura (stejný odběratel a částka) jen s confirm_not_duplicate; uhrazená = FullyPay", async () => {
    const prepared = await call(lucie, "prepare_b2b_invoice", kavarna({ paid: true }));
    expect(prepared.data).toMatchObject({ requiresConfirmNotDuplicate: true, possibleDuplicates: [{ number: "20260203" }] });
    const args = { ...kavarna({ paid: true }), preview_token: prepared.data.preview_token, confirm: true };
    expect(await call(lucie, "issue_b2b_invoice", { ...args, idempotency_key: randomUUID() })).toMatchObject({ isError: true, text: expect.stringMatching(/confirm_not_duplicate=true.*20260203/) });
    expect(writes()).toEqual([]);
    const issued = await call(lucie, "issue_b2b_invoice", { ...args, confirm_not_duplicate: true, idempotency_key: randomUUID() });
    expect(issued.data).toMatchObject({ invoiceNumber: "20260204", status: "uhrazená" });
    expect(writes()).toEqual(["POST /IssuedInvoices", expect.stringMatching(/^PUT \/IssuedDocumentPayments\/FullyPay\/\d+$/)]);
  });

  it("odběratel jen v MojeBegina → kontakt se v iDokladu založí; nikde → stop bez zápisu", async () => {
    const { prepared, issued } = await issue(lucie, { customer_ico: ICO_JEN_MB, items: [{ name: "Polévka", quantity: 3, unit_price_kc: 99.5 }], payment_method: "bank_transfer" });
    expect(prepared.data.customer).toMatchObject({ status: "new", name: "TEST Bistro s.r.o.", ico: ICO_JEN_MB, street: "Bistrová 7", zip: "60200", city: "Brno" });
    expect(issued.data).toMatchObject({ issued: true, contactCreated: true, totalKc: 298.5 });
    expect(writes()).toEqual(["POST /Contacts", "POST /IssuedInvoices"]);
    expect(store.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body).toMatchObject({ PaymentOptionId: 1 });

    store.calls.length = 0;
    const nowhere = await call(lucie, "prepare_b2b_invoice", { customer_ico: ICO_NIKDE, items: [{ name: "X", quantity: 1, unit_price_kc: 1 }] });
    expect(nowhere.data).toMatchObject({ canIssue: false, cannotIssueReasons: [expect.stringMatching(/není v iDokladu ani v MojeBegina/)] });
    expect(nowhere.data.preview_token).toBeUndefined();
    expect(writes()).toEqual([]);
  });

  it("souhlasy a oprávnění: náhled jen vystavovatelé; vystavení jen s mojebegina.invoicing; jiný uživatel nic", async () => {
    expect(listed(lucie)).toEqual(expect.arrayContaining(["prepare_b2b_invoice", "issue_b2b_invoice"]));
    expect(listed(lucieRead)).toContain("prepare_b2b_invoice");
    expect(listed(lucieRead)).not.toContain("issue_b2b_invoice");
    expect(listed(other)).not.toContain("prepare_b2b_invoice");
    const prepared = await call(lucieRead, "prepare_b2b_invoice", kavarna({ items: [{ name: "Y", quantity: 1, unit_price_kc: 10 }], expected_total_kc: 10 }));
    const denied = await call(lucieRead, "issue_b2b_invoice", { ...kavarna({ items: [{ name: "Y", quantity: 1, unit_price_kc: 10 }], expected_total_kc: 10 }), preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(denied).toMatchObject({ isError: true, text: expect.stringMatching(/Fakturace není pro tohle propojení povolená/) });
    expect(writes()).toEqual([]);
  });

  it("změna po náhledu, nesedící součet, Preview a chybějící řada → nic se nevystaví", async () => {
    const prepared = await call(lucie, "prepare_b2b_invoice", kavarna({ note: "A" }));
    const changed = await call(lucie, "issue_b2b_invoice", { ...kavarna({ note: "B" }), preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(changed).toMatchObject({ isError: true, text: expect.stringMatching(/se od náhledu změnily/) });
    expect(await call(lucie, "prepare_b2b_invoice", kavarna({ expected_total_kc: 2000 }))).toMatchObject({ isError: true, text: expect.stringMatching(/Celková částka nesedí/) });

    process.env.VERCEL_ENV = "preview";
    const preview = await call(lucie, "prepare_b2b_invoice", kavarna());
    expect(preview.data).toMatchObject({ canIssue: false });
    process.env.VERCEL_ENV = "production";
    delete process.env.IDOKLAD_B2B_SEQUENCE_ID;
    expect(await call(lucie, "prepare_b2b_invoice", kavarna())).toMatchObject({ isError: true, text: expect.stringMatching(/IDOKLAD_B2B_SEQUENCE_ID/) });
    expect(writes()).toEqual([]);
  });
});

describe("pojistky řad v klientovi iDokladu", () => {
  it("B2B klient smí jen svou řadu; e-shopový klient dál jen 7277293", async () => {
    const { assertB2bSeriesBody, assertEshopSeriesBody } = await import("@/lib/eshop/invoicing/idokladHttp");
    expect(() => assertB2bSeriesBody({ NumericSequenceId: LUCIE_SERIES }, String(LUCIE_SERIES))).not.toThrow();
    expect(() => assertB2bSeriesBody({ NumericSequenceId: 7277293 }, String(LUCIE_SERIES))).toThrow(/mimo povolenou řadu/);
    expect(() => assertB2bSeriesBody({ NumericSequenceId: 7277293 }, "7277293")).toThrow(/mimo povolenou řadu/);
    expect(() => assertEshopSeriesBody({ NumericSequenceId: LUCIE_SERIES })).toThrow(/mimo řadu 7277293/);
  });
});
