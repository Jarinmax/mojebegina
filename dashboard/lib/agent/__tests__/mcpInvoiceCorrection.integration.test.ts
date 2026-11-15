// GPT/MCP — oprava EXISTUJÍCÍ faktury z Luciiny řady v iDokladu:
// prepare_invoice_correction → potvrzení → apply_invoice_correction.
// Případ z 15. 11. 2026: faktura 20260212 (Café Kandík, 2 156 Kč) vystavená
// převodem a neuhrazená → hotově, úhrada 2 156 Kč ke 12. 11. 2026, zbývá 0,
// nové PDF bez výzvy k úhradě. Nad skutečnou datovou vrstvou (PGlite)
// a stavovou napodobeninou iDokladu — skutečný iDoklad se nevolá.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { BEGINA_CODEBOOKS } from "@/lib/eshop/__tests__/helpers/fakeIdoklad";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "gpt-pilot.begina.cz", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));
vi.mock("@/lib/eshop/email/resend", () => ({ resendTransport: () => async () => ({ ok: true, id: "msg" }) }));

const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const OTHER = "user-kolega-executive";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const LUCIE_SERIES = 2032369;
const ESHOP_SERIES = 7277293;
const CASH = 3;
const TRANSFER = 1;

const ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: String(ESHOP_SERIES),
  IDOKLAD_B2B_SEQUENCE_ID: String(LUCIE_SERIES),
  IDOKLAD_ESHOP_CLIENT_ID: "cid-0123456789",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret-0123456789",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp-0123456789",
  IDOKLAD_READ_CHANNELS: "mcp:chatgpt",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
};

type Inv = { Id: number; DocumentNumber: string; NumericSequenceId: number; PaymentOptionId: number; DateOfIssue: string; DateOfMaturity: string; DateOfPayment: string | null; total: number; paid: number };
const store = vi.hoisted(() => ({
  invoices: [] as Inv[],
  calls: [] as { method: string; path: string; body: unknown; query: Record<string, string> }[],
  rejectPatch: null as string | null,
  unreadablePdf: false,
}));
const writes = () => store.calls.filter((c) => c.method !== "GET");

function kandik(extra: Partial<Inv> = {}): Inv {
  return { Id: 67802189, DocumentNumber: "20260212", NumericSequenceId: LUCIE_SERIES, PaymentOptionId: TRANSFER, DateOfIssue: "2026-11-14T00:00:00", DateOfMaturity: "2026-11-17T00:00:00", DateOfPayment: null, total: 2156, paid: 0, ...extra };
}

/** PDF jako z iDokladu: neuhrazená převodem = QR a částka k úhradě; uhrazená = 0 Kč. */
async function invoicePdf(inv: Inv): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  if (store.unreadablePdf) return Buffer.from(await doc.save()).toString("base64"); // prázdná stránka
  const remaining = inv.total - inv.paid;
  const method = inv.PaymentOptionId === CASH ? "Hotove" : "Prevodem";
  const lines = [`Faktura ${inv.DocumentNumber}`, `Zpusob uhrady: ${method}`, `Celkem k uhrade ${remaining.toFixed(2).replace(".", ",")} Kc`];
  if (remaining > 0 && inv.PaymentOptionId === TRANSFER) lines.push("QR Platba");
  lines.forEach((t, i) => page.drawText(t, { x: 40, y: 800 - i * 20, size: 11, font }));
  return Buffer.from(await doc.save()).toString("base64");
}

async function fakeIdoklad(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = (init?.method ?? "GET").toUpperCase();
  const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
  const page = (items: unknown[]) => ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
  if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "tok-test-0123456789", expires_in: 3600 }), { status: 200 });
  const path = url.pathname.replace(/^\/v3/, "");
  const query = Object.fromEntries(url.searchParams);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  store.calls.push({ method, path, body, query });
  const eq = (prop: string) => new RegExp(`${prop}~eq~([^()|,]+)`).exec(query.filter ?? "")?.[1] ?? null;
  const view = (i: Inv) => ({
    Id: i.Id,
    DocumentNumber: i.DocumentNumber,
    PaymentOptionId: i.PaymentOptionId,
    PaymentStatus: i.paid <= 0 ? 0 : i.paid >= i.total ? 1 : 2,
    DateOfIssue: i.DateOfIssue,
    DateOfMaturity: i.DateOfMaturity,
    DateOfPayment: i.DateOfPayment ?? "1753-01-01T00:00:00",
    PartnerAddress: { NickName: "Ing. Markéta Šafránková Bejkovská", IdentificationNumber: "07149905" },
    Prices: { TotalWithVat: i.total, TotalPaid: i.paid },
  });
  if (method === "GET" && path === "/PaymentOptions") return page(BEGINA_CODEBOOKS.paymentOptions);
  if (method === "GET" && path === "/IssuedInvoices") {
    return page(
      store.invoices
        .filter((i) => !eq("DocumentNumber") || i.DocumentNumber === eq("DocumentNumber"))
        .filter((i) => !eq("NumericSequenceId") || String(i.NumericSequenceId) === eq("NumericSequenceId"))
        .map(view)
    );
  }
  const one = /^\/IssuedInvoices\/(\d+)$/.exec(path);
  if (method === "GET" && one) {
    const inv = store.invoices.find((i) => i.Id === Number(one[1]));
    return inv ? ok(view(inv)) : new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: "nenalezeno" }), { status: 404 });
  }
  const pdf = /^\/Reports\/IssuedInvoice\/(\d+)\/Pdf$/.exec(path);
  if (method === "GET" && pdf) return ok(await invoicePdf(store.invoices.find((i) => i.Id === Number(pdf[1]))!));
  if (method === "PATCH" && path === "/IssuedInvoices") {
    if (store.rejectPatch) return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 400, Message: store.rejectPatch }), { status: 400 });
    const inv = store.invoices.find((i) => i.Id === body.Id)!;
    inv.PaymentOptionId = body.PaymentOptionId;
    return ok(view(inv));
  }
  const pay = /^\/IssuedDocumentPayments\/FullyPay\/(\d+)$/.exec(path);
  if (method === "PUT" && pay) {
    const inv = store.invoices.find((i) => i.Id === Number(pay[1]))!;
    inv.paid = inv.total;
    inv.DateOfPayment = `${query.dateOfPayment.slice(0, 10)}T00:00:00`;
    return ok(true);
  }
  return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: `nenalezeno ${method} ${path}` }), { status: 404 });
}

describe("oprava faktury v iDokladu přes MCP (Luciina řada)", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let oauth: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucie: Session;
  let lucieRead: Session;
  let other: Session;

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
  const KANDIK = { number: "20260212", payment_method: "cash", payment_amount_kc: 2156, payment_date: "2026-11-12" };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
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
      MCP_ALLOWED_USER_IDS: `${LUCIE},${OTHER}`,
      MCP_ALLOW_WRITE: "on",
      MCP_ALLOW_INVOICING: "on",
    })!;
    const { sql } = await import("drizzle-orm");
    await db.execute(sql.raw(`INSERT INTO user_roles (user_id, system_role) VALUES ('${LUCIE}', 'EXECUTIVE'), ('${OTHER}', 'EXECUTIVE')`));
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES ('${LUCIE}', 'Lucie Königsbergová', 'lucie.konigsbergova@seznam.cz'), ('${OTHER}', 'Kolega', 'kolega@begina.cz')`));
    lucie = await connect(LUCIE, "EXECUTIVE", false, true);
    lucieRead = await connect(LUCIE, "EXECUTIVE", true, false);
    other = await connect(OTHER, "EXECUTIVE", true, true);
  }, 120_000);

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    store.invoices.splice(0, store.invoices.length, kandik(), { ...kandik({ Id: 5001, DocumentNumber: "9260050", NumericSequenceId: ESHOP_SERIES }) });
    store.calls.length = 0;
    store.rejectPatch = null;
    store.unreadablePdf = false;
  });

  it("20260212: převodem → hotově, úhrada 2 156 Kč ke 12. 11., zbývá 0, PDF bez výzvy k úhradě; žádná nová faktura", async () => {
    const prepared = await call(lucie, "prepare_invoice_correction", KANDIK);
    expect(prepared.isError, prepared.text).toBe(false);
    expect(prepared.data).toMatchObject({
      canApply: true,
      cannotApplyReasons: [],
      createsNewInvoice: false,
      invoice: { number: "20260212", customer: "Ing. Markéta Šafránková Bejkovská", totalKc: 2156, paidKc: 0, remainingKc: 2156, paymentStatus: "unpaid", paymentMethod: { id: TRANSFER, name: "Bank transfer" } },
      changes: { paymentMethod: { from: "Bank transfer", to: "hotově", toKey: "cash" }, payment: { amountKc: 2156, date: "2026-11-12" } },
    });
    expect(prepared.data.warnings).toEqual([expect.stringMatching(/2026-11-12 je dřív než datum vystavení 2026-11-14/)]);
    expect(writes()).toEqual([]);

    const applied = await call(lucie, "apply_invoice_correction", { ...KANDIK, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(applied.isError, applied.text).toBe(false);
    expect(applied.data).toMatchObject({
      corrected: true,
      createdNewInvoice: false,
      emailed: false,
      applied: { paymentMethodChanged: true, paymentRecorded: true },
      verified: { paymentMethodOk: true, paidOk: true, remainingKc: 0 },
      invoice: { paymentStatus: "paid", paidKc: 2156, remainingKc: 0, dateOfPayment: "2026-11-12", paymentMethod: { id: CASH, name: "Cash" } },
      pdfCheck: { checked: true, ok: true, paymentRequest: [], overdueNotice: [], amountLines: ["Celkem k uhrade 0,00 Kc"] },
    });
    // přesně dva zápisy: PATCH jen Id + PaymentOptionId, FullyPay s datem; žádné POST faktury
    expect(writes().map((c) => [c.method, c.path, c.body, c.query])).toEqual([
      ["PATCH", "/IssuedInvoices", { Id: 67802189, PaymentOptionId: CASH }, {}],
      ["PUT", "/IssuedDocumentPayments/FullyPay/67802189", null, { dateOfPayment: "2026-11-12 12:00:00.000" }],
    ]);
    expect(store.invoices.filter((i) => i.DocumentNumber === "20260212")).toHaveLength(1);

    // znovu = už uhrazená a hotově → nic dalšího
    const again = await call(lucie, "prepare_invoice_correction", KANDIK);
    expect(again.data).toMatchObject({ canApply: false, cannotApplyReasons: [expect.stringMatching(/už je uhrazená/)] });
  });

  it("pojistky: e-shopová řada, nesedící částka, budoucí datum, změna po náhledu, bez souhlasu k fakturaci, kolega", async () => {
    expect(await call(lucie, "prepare_invoice_correction", { ...KANDIK, number: "9260050" })).toMatchObject({ isError: true, text: expect.stringMatching(/jen faktury z Luciiny řady/) });
    const eshopById = await call(lucie, "prepare_invoice_correction", { id: 5001, payment_method: "cash" });
    expect(eshopById.data).toMatchObject({ canApply: false, cannotApplyReasons: [expect.stringMatching(/není v Luciině řadě/)] });
    const partial = await call(lucie, "prepare_invoice_correction", { ...KANDIK, payment_amount_kc: 1000 });
    expect(partial.data).toMatchObject({ canApply: false, cannotApplyReasons: [expect.stringMatching(/1000 Kč nesedí se zbývající částkou 2156 Kč/)] });
    expect(await call(lucie, "prepare_invoice_correction", { ...KANDIK, payment_date: "2026-11-16" })).toMatchObject({ isError: true, text: expect.stringMatching(/v budoucnosti/) });
    expect(await call(lucie, "prepare_invoice_correction", { number: "20260212", payment_amount_kc: 2156 })).toMatchObject({ isError: true, text: expect.stringMatching(/payment_amount_kc i payment_date/) });

    // mezitím někdo v iDokladu změnil způsob úhrady → nic se nezapíše
    const prepared = await call(lucie, "prepare_invoice_correction", KANDIK);
    store.invoices[0].PaymentOptionId = 2;
    const stale = await call(lucie, "apply_invoice_correction", { ...KANDIK, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(stale).toMatchObject({ isError: true, text: expect.stringMatching(/změnila.*Nic se nezměnilo/) });
    expect(writes()).toEqual([]);

    // jen se souhlasem k fakturaci a jen vystavovatelé faktur
    expect(listed(lucie)).toEqual(expect.arrayContaining(["prepare_invoice_correction", "apply_invoice_correction"]));
    expect(listed(other)).not.toContain("prepare_invoice_correction");
    expect(await call(other, "prepare_invoice_correction", KANDIK)).toMatchObject({ isError: true });
    const noScope = await call(lucieRead, "apply_invoice_correction", { ...KANDIK, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(noScope).toMatchObject({ isError: true, text: expect.stringMatching(/Fakturace není pro tohle propojení povolená/) });
    expect(writes()).toEqual([]);
  });

  it("iDoklad změnu odmítne → přesný důvod, úhrada se nezapíše; mimo Production nic", async () => {
    store.rejectPatch = "PaymentOptionId: neplatná hodnota.";
    const prepared = await call(lucie, "prepare_invoice_correction", KANDIK);
    const rejected = await call(lucie, "apply_invoice_correction", { ...KANDIK, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(rejected).toMatchObject({ isError: true, text: expect.stringMatching(/iDoklad změnu způsobu úhrady faktury 20260212 odmítl: .*PaymentOptionId: neplatná hodnota\. Nic se nezměnilo\./) });
    expect(writes().map((c) => c.method)).toEqual(["PATCH"]);
    expect(store.invoices[0]).toMatchObject({ PaymentOptionId: TRANSFER, paid: 0 });

    process.env.VERCEL_ENV = "preview";
    const preview = await call(lucie, "prepare_invoice_correction", KANDIK);
    expect(preview.data.canApply).toBe(false);
  });

  it("PDF bez čitelného textu → kontrola PDF se označí jako neprovedená (ne „v pořádku“)", async () => {
    store.unreadablePdf = true;
    const prepared = await call(lucie, "prepare_invoice_correction", KANDIK);
    const applied = await call(lucie, "apply_invoice_correction", { ...KANDIK, preview_token: prepared.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(applied.data).toMatchObject({ corrected: true, verified: { remainingKc: 0 }, pdfCheck: { checked: false, reason: expect.stringMatching(/Text PDF se nepodařilo přečíst/) } });
    expect(applied.data.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/zkontrolujte ručně/)]));
  });
});

describe("klient iDokladu — oprava faktury smí jen způsob úhrady", () => {
  it("PATCH jen Id + PaymentOptionId a jen klient pro opravy", async () => {
    const { assertCorrectionBody, EshopIdokladClient } = await import("@/lib/eshop/invoicing/idokladHttp");
    expect(() => assertCorrectionBody({ Id: 1, PaymentOptionId: 3 })).not.toThrow();
    expect(() => assertCorrectionBody({ Id: 1, PaymentOptionId: 3, Items: [] })).toThrow(/jen způsob úhrady/);
    expect(() => assertCorrectionBody({ Id: 1, DateOfMaturity: "2026-01-01" })).toThrow();
    expect(() => assertCorrectionBody({ Id: "1", PaymentOptionId: 3 })).toThrow(/neplatné Id/);
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const plain = new EshopIdokladClient({ clientId: "a", clientSecret: "b", applicationId: "c", writesAllowed: true, fetchImpl });
    await expect(plain.patch("/IssuedInvoices", { Id: 1, PaymentOptionId: 3 })).rejects.toThrow(/jen klientovi pro opravy faktur/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
