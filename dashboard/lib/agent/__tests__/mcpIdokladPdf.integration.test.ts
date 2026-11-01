// GPT/MCP — PDF existující faktury z iDokladu (i z ruční řady 2026xxxx):
// odkaz na stažení v MojeBegina a odeslání e-mailem jen povoleným příjemcům.
// Nad skutečnou datovou vrstvou (ovladač Neonu → PGlite) a napodobeninou
// iDokladu (jen čtení) a e-mailu — skutečný iDoklad ani Resend se nevolá.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { EmailMessage } from "@/lib/eshop/email/resend";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "gpt-pilot.begina.cz", "x-forwarded-proto": "https" }),
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
const PDF_BASE64 = Buffer.from("%PDF-1.4 faktura 20260202").toString("base64");
const INVOICE_ID = 1202;

const ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_LIVE: "on",
  ESHOP_ORDER_WRITE: "on",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "cid",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp",
  IDOKLAD_READ_CHANNELS: "mcp:chatgpt",
  IDOKLAD_INVOICE_EMAIL_ALLOWED: "lucie.konigsbergova@gmail.com",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
};

/** iDoklad jen ke čtení: agenda Begina, ruční řada, faktura 20260202 a její PDF. Zápis = chyba testu. */
const idoklad = vi.hoisted(() => ({ calls: [] as string[] }));
function fakeIdoklad(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
  if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
  const path = url.pathname.replace(/^\/v3/, "");
  idoklad.calls.push(`${method} ${path}`);
  if (method !== "GET") throw new Error(`iDoklad: zápis ${method} ${path} je v testu zakázaný`);
  const filter = url.searchParams.get("filter") ?? "";
  const invoice = {
    Id: INVOICE_ID,
    DocumentNumber: "20260202",
    VariableSymbol: "20260202",
    DateOfIssue: "2026-10-30T00:00:00",
    DateOfMaturity: "2026-11-13T00:00:00",
    DateOfPayment: "1753-01-01T00:00:00",
    PaymentStatus: 0,
    Prices: { TotalWithVat: 4980, TotalPaid: 0 },
    PartnerAddress: { NickName: "Test Odběratel s.r.o.", IdentificationNumber: "12345679", Street: "Testovací 1", City: "Praha", PostalCode: "11000", Email: "Fakturace@Firma.example" },
    Metadata: { DateCreated: "2026-10-30T10:00:00", DateLastChange: "2026-10-30T10:00:00" },
  };
  if (path === "/Account/CurrentAgenda") return ok({ Contact: { IdentificationNumber: "74337297" } });
  if (path === "/NumericSequences") return ok({ Items: [{ Id: 2032369, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" }], TotalItems: 1, TotalPages: 1 });
  if (path === "/IssuedInvoices") {
    const items = /DocumentNumber~eq~20260202/.test(filter) ? [invoice] : [];
    return ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
  }
  if (path === `/IssuedInvoices/${INVOICE_ID}`) return ok(invoice);
  if (path === `/Reports/IssuedInvoice/${INVOICE_ID}/Pdf`) return ok(PDF_BASE64);
  return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: "Not found" }), { status: 404 });
}

describe("PDF faktury z iDokladu přes MCP (ChatGPT) a MojeBegina", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let runAsAgent: typeof import("../context").runAsAgent;
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucieRead: Session;
  let lucieInvoicing: Session;
  let other: Session;

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write: boolean, invoicing: boolean): Promise<Session> {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, invoicing, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return session;
  }
  const call = async (session: Session, name: string, args: Record<string, unknown>) => {
    const result = await mcp.callAgentTool(db, session, config, name, args);
    if (!result) return null;
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { isError: result.isError === true, data: (result.structuredContent ?? {}) as Record<string, any>, text }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const listed = (session: Session) => mcp.agentMcpServer(db, session, config).listTools().map((t) => t.name);

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      /idoklad\.cz/.test(String(input instanceof Request ? input.url : input)) ? fakeIdoklad(input, init) : shimFetch(input, init)) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");
    ({ runAsAgent } = await import("../context"));
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
    lucieRead = await connect(LUCIE, "EXECUTIVE", true, false);
    lucieInvoicing = await connect(LUCIE, "EXECUTIVE", false, true);
    other = await connect(OTHER, "EXECUTIVE", true, true);
  }, 120_000);

  beforeEach(() => {
    mail.sent.length = 0;
    idoklad.calls.length = 0;
  });

  it("idoklad_invoice_pdf: odkaz na PDF v MojeBegina, bez obsahu PDF a s maskovaným e-mailem; audit; interní nástroj se nenabízí", async () => {
    expect(listed(lucieRead)).toContain("idoklad_invoice_pdf");
    expect(listed(lucieRead)).not.toContain("idoklad_invoice_pdf_file");
    expect(await call(lucieRead, "idoklad_invoice_pdf_file", { number: "20260202" })).toBeNull();

    const result = await call(lucieRead, "idoklad_invoice_pdf", { number: "20260202" });
    expect(result?.isError, result?.text).toBe(false);
    expect(result!.data).toMatchObject({
      found: true,
      invoice: { id: INVOICE_ID, number: "20260202", totalKc: 4980 },
      pdfUrl: `https://moje.begina.cz/rizeni-firmy/faktury/idoklad/${INVOICE_ID}/pdf`,
      filename: "faktura-20260202.pdf",
      customerEmailOnInvoice: "f***@firma.example",
    });
    expect(result!.text).not.toContain(PDF_BASE64);
    expect(result!.text).not.toContain("fakturace@firma.example");
    expect(idoklad.calls.every((c) => c.startsWith("GET "))).toBe(true);
    const [log] = await rows(sql`SELECT user_id, channel, tool, status FROM idoklad_read_log WHERE tool = 'idoklad_invoice_pdf' ORDER BY created_at DESC LIMIT 1`);
    expect(log).toEqual({ user_id: LUCIE, channel: "mcp:chatgpt", tool: "idoklad_invoice_pdf", status: "ok" });
    // jiný uživatel nástroj nevidí
    expect(listed(other)).not.toContain("idoklad_invoice_pdf");
  });

  it("stažení PDF v MojeBegina: jen přihlášený vystavovatel faktur, audit kanálu ui", async () => {
    const { GET } = await import("@/app/rizeni-firmy/faktury/idoklad/[id]/pdf/route");
    const request = new Request(`https://moje.begina.cz/rizeni-firmy/faktury/idoklad/${INVOICE_ID}/pdf`);
    const params = { params: Promise.resolve({ id: String(INVOICE_ID) }) } as never;
    const response = await runAsAgent(lucieRead.ctx, () => GET(request, params));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("faktura-20260202.pdf");
    expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(PDF_BASE64);
    const [log] = await rows(sql`SELECT user_id, channel, tool, status FROM idoklad_read_log WHERE channel = 'ui' ORDER BY created_at DESC LIMIT 1`);
    expect(log).toEqual({ user_id: LUCIE, channel: "ui", tool: "idoklad_invoice_pdf_file", status: "ok" });

    expect((await GET(request, params)).status).toBe(307); // nepřihlášený → přihlášení
    expect((await runAsAgent(other.ctx, () => GET(request, params))).status).toBe(403);
  });

  it("send_idoklad_invoice_email: jen se souhlasem k fakturaci, jen povoleným příjemcům, PDF v příloze, výsledek v auditu", async () => {
    // bez souhlasu k fakturaci se nenabízí a neprojde
    expect(listed(lucieRead)).not.toContain("send_idoklad_invoice_email");
    const noScope = await call(lucieRead, "send_idoklad_invoice_email", { number: "20260202", to: ["info@begina.cz"], confirm: true, idempotency_key: randomUUID() });
    expect(noScope).toMatchObject({ isError: true, text: expect.stringMatching(/Fakturace není pro tohle propojení povolená/) });
    expect(listed(lucieInvoicing)).toContain("send_idoklad_invoice_email");

    // bez confirm nic
    expect(await call(lucieInvoicing, "send_idoklad_invoice_email", { number: "20260202", to: ["info@begina.cz"], confirm: false, idempotency_key: randomUUID() })).toMatchObject({ isError: true });
    // cizí adresa = nic se neodešle nikomu
    const refused = await call(lucieInvoicing, "send_idoklad_invoice_email", {
      number: "20260202",
      to: ["info@begina.cz", "utocnik@evil.example"],
      confirm: true,
      idempotency_key: randomUUID(),
    });
    expect(refused).toMatchObject({ isError: true, text: expect.stringMatching(/utocnik@evil.example/) });
    expect(mail.sent).toEqual([]);

    // Lucie sobě (povolený gmail) + kopie info@begina.cz
    const key = randomUUID();
    const sent = await call(lucieInvoicing, "send_idoklad_invoice_email", {
      number: "20260202",
      to: ["lucie.konigsbergova@gmail.com", "info@begina.cz"],
      message: "Posílám fakturu.",
      confirm: true,
      idempotency_key: key,
    });
    expect(sent?.isError, sent?.text).toBe(false);
    expect(sent!.data).toMatchObject({
      sent: true,
      invoiceNumber: "20260202",
      to: ["lucie.konigsbergova@gmail.com", "info@begina.cz"],
      recipientKinds: { "lucie.konigsbergova@gmail.com": "allowed", "info@begina.cz": "begina" },
      messageId: "msg_1",
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      from: "Begina <objednavky@begina.cz>",
      to: ["lucie.konigsbergova@gmail.com", "info@begina.cz"],
      subject: "Faktura 20260202 – Begina",
      attachments: [{ filename: "faktura-20260202.pdf", contentBase64: PDF_BASE64, contentType: "application/pdf" }],
    });
    expect(mail.sent[0].text).toContain("Posílám fakturu.");
    // stejný požadavek znovu → uložený výsledek, druhý e-mail neodejde
    const again = await call(lucieInvoicing, "send_idoklad_invoice_email", {
      number: "20260202",
      to: ["lucie.konigsbergova@gmail.com", "info@begina.cz"],
      message: "Posílám fakturu.",
      confirm: true,
      idempotency_key: key,
    });
    expect(again!.data).toMatchObject({ alreadySaved: true, messageId: "msg_1" });
    expect(mail.sent).toHaveLength(1);
    // odběratel z faktury (e-mail z iDokladu) je povolený
    const customer = await call(lucieInvoicing, "send_idoklad_invoice_email", { number: "20260202", to: ["fakturace@firma.example"], confirm: true, idempotency_key: randomUUID() });
    expect(customer!.data).toMatchObject({ sent: true, recipientKinds: { "fakturace@firma.example": "customer" } });
    expect(idoklad.calls.every((c) => c.startsWith("GET "))).toBe(true);

    const audit = await rows(sql`SELECT user_id, status, result FROM agent_audit_log WHERE tool = 'send_idoklad_invoice_email' AND status = 'ok' ORDER BY created_at`);
    expect(audit[0]).toMatchObject({ user_id: LUCIE, result: { to: ["lucie.konigsbergova@gmail.com", "info@begina.cz"], invoiceNumber: "20260202", messageId: "msg_1" } });
  });
});
