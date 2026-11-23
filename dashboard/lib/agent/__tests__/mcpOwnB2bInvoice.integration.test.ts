// GPT/MCP — ruční faktura odběrateli ve VLASTNÍ řadě MojeBegina (Lucie
// 23. 11. 2026, bez iDokladu): prepare_b2b_invoice → potvrzení →
// issue_b2b_invoice. iDoklad se nesmí volat vůbec.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "gpt-pilot.begina.cz", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));
const mail = vi.hoisted(() => ({ sent: [] as unknown[] }));
vi.mock("@/lib/eshop/email/resend", () => ({ resendTransport: () => async (m: unknown) => (mail.sent.push(m), { ok: true, id: "msg" }) }));

const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const ICO_ZNOJMO = "12345679";
const ICO_BEZ_SIDLA = "76543218";
const ICO_NIKDE = "24680249";
const ORG_ZNOJMO = "00000000-0000-4000-8000-00000000c001";
const LEAD_ZNOJMO = "00000000-0000-4000-8000-00000000c0a1";

const ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  IDOKLAD_INVOICING_ENABLED: "manual",
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_LIVE: "on",
  ESHOP_ORDER_WRITE: "on",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
};

describe("ruční faktura ve vlastní řadě přes MCP", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let oauth: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  let lucie: import("../oauthStore").AgentSession;
  const idokladCalls: string[] = [];

  const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows;
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await mcp.callAgentTool(db, lucie, config, name, args);
    if (!result) throw new Error(`nástroj ${name} neexistuje`);
    return { isError: result.isError === true, data: (result.structuredContent ?? {}) as Record<string, any>, text: result.content.map((c) => ("text" in c ? c.text : "")).join("") }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const vzorky = (extra: Record<string, unknown> = {}) => ({
    customer_ico: ICO_ZNOJMO,
    items: [
      { name: "Vzorek – Dýňová polévka", quantity: 1, unit: "l", unit_price_kc: 120 },
      { name: "Chlazená přeprava", quantity: 1, unit_price_kc: 199 },
    ],
    payment_method: "bank_transfer",
    note: "Vzorky dle domluvy.",
    expected_total_kc: 319,
    ...extra,
  });

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    delete process.env.INVOICING_PROVIDER;
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/idoklad\.cz/.test(url)) {
        idokladCalls.push(url);
        throw new Error("iDoklad se nesmí volat");
      }
      return shimFetch(input, init);
    }) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    oauth = await import("../oauthStore");
    mcp = await import("../mcp/server");
    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: "https://gpt-pilot.begina.cz",
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: SECRET,
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: LUCIE,
      MCP_ALLOW_WRITE: "on",
      MCP_ALLOW_INVOICING: "on",
    })!;
    await db.execute(sql.raw(`INSERT INTO user_roles (user_id, system_role) VALUES ('${LUCIE}', 'EXECUTIVE')`));
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES ('${LUCIE}', 'Lucie Königsbergová', 'lucie.konigsbergova@seznam.cz')`));
    await db.execute(sql.raw(`INSERT INTO organizations (id, ico, name, billing_name, registered_address, dic) VALUES
      ('${ORG_ZNOJMO}', '${ICO_ZNOJMO}', 'Kavárna Znojmo', 'TEST Znojmo s.r.o.', 'Obroková 10, 669 02 Znojmo', 'CZ12345679'),
      ('00000000-0000-4000-8000-00000000c002', '${ICO_BEZ_SIDLA}', 'Bez sídla', NULL, '', NULL)`));
    await db.execute(sql.raw(`INSERT INTO leads (id, source, company_name, contact_name, contact_email, city, stage, converted_organization_id) VALUES ('${LEAD_ZNOJMO}', 'akce', 'Kavárna Znojmo', 'Pan Kočka', 'kocka@example.cz', 'Znojmo', 'won', '${ORG_ZNOJMO}')`));
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214) ON CONFLICT (year) DO UPDATE SET last_serial = 214`);
    const code = await oauth.issueAuthorizationCode(db, { userId: LUCIE, systemRole: "EXECUTIVE", clientId: CLIENT, write: false, invoicing: true, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await oauth.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    lucie = (await oauth.resolveAccessToken(db, config, tokens.body.access_token))!;
  }, 120_000);

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
    delete process.env.INVOICING_PROVIDER;
    mail.sent.length = 0;
  });

  it("náhled: vlastní řada, další číslo 20260215, odběratel z karty (fakturační jméno, sídlo, DIČ); nic nezapíše", async () => {
    const p = await call("prepare_b2b_invoice", vzorky());
    expect(p.isError, p.text).toBe(false);
    expect(p.data).toMatchObject({
      canIssue: true,
      series: { name: "MojeBegina 2026xxxx" },
      expectedNumber: "20260215",
      customer: { name: "TEST Znojmo s.r.o.", cardName: "Kavárna Znojmo", street: "Obroková 10", zip: "669 02", city: "Znojmo", dic: "CZ12345679" },
      invoice: { totalKc: 319, paid: false, paymentLabel: "převodem" },
    });
    expect(await rows(sql`SELECT count(*)::int AS n FROM own_invoice_documents`)).toEqual([{ n: 0 }]);
  });

  it("vystavení neuhrazené převodem: číslo 20260215, odkaz na vlastní PDF, VS = číslo, záznam u zákazníka, žádný e-mail ani iDoklad", async () => {
    const p = await call("prepare_b2b_invoice", vzorky());
    const issued = await call("issue_b2b_invoice", { ...vzorky(), preview_token: p.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(issued.isError, issued.text).toBe(false);
    expect(issued.data).toMatchObject({ issued: true, invoiceNumber: "20260215", totalKc: 319, status: "otevřená (neuhrazená)", emailed: false, pdfUrl: expect.stringMatching(/\/rizeni-firmy\/faktury\/vlastni\/20260215\/pdf$/) });
    expect(issued.text).not.toMatch(/iDoklad/);
    const [doc] = await rows(sql`SELECT number, state, customer_ico, total_kc, snapshot FROM own_invoice_documents WHERE number = '20260215'`);
    expect(doc).toMatchObject({ state: "issued", customer_ico: ICO_ZNOJMO, total_kc: 319 });
    expect(doc.snapshot).toMatchObject({ paidDate: null, vs: null, paymentMethod: "bank_transfer", note: "Vzorky dle domluvy.", customer: { name: "TEST Znojmo s.r.o.", contactPerson: "Kavárna Znojmo" } });
    expect(doc.snapshot.lines[0]).toMatchObject({ name: "Vzorek – Dýňová polévka (l)", totalKc: 120 });
    const { ownDocumentPdf, loadOwnDocument } = await import("@/lib/eshop/invoicing/ownIssue");
    const pdf = await ownDocumentPdf(db, (await loadOwnDocument(db, "20260215"))!.id);
    expect((await PDFDocument.load(Buffer.from(pdf!.contentBase64, "base64"))).getPageCount()).toBe(1);
    const [activity] = await rows(sql`SELECT kind, metadata FROM organization_activity WHERE organization_id = ${ORG_ZNOJMO} ORDER BY created_at DESC LIMIT 1`);
    expect(activity).toMatchObject({ kind: "invoice_issued", metadata: { invoiceNumber: "20260215", provider: "begina", paid: false } });
    expect(mail.sent).toEqual([]);
    expect(idokladCalls).toEqual([]);
  });

  it("stejná částka a odběratel do 7 dní → jen s confirm_not_duplicate; uhrazená hotově = další číslo", async () => {
    const p = await call("prepare_b2b_invoice", vzorky({ paid: true, payment_method: "cash" }));
    expect(p.data).toMatchObject({ requiresConfirmNotDuplicate: true, possibleDuplicates: [{ number: "20260215" }] });
    const args = { ...vzorky({ paid: true, payment_method: "cash" }), preview_token: p.data.preview_token, confirm: true };
    expect(await call("issue_b2b_invoice", { ...args, idempotency_key: randomUUID() })).toMatchObject({ isError: true, text: expect.stringMatching(/confirm_not_duplicate=true/) });
    const issued = await call("issue_b2b_invoice", { ...args, confirm_not_duplicate: true, idempotency_key: randomUUID() });
    expect(issued.data).toMatchObject({ invoiceNumber: "20260216", status: "uhrazená" });
    const [doc] = await rows(sql`SELECT snapshot FROM own_invoice_documents WHERE number = '20260216'`);
    expect(doc.snapshot.paidDate).toBe(doc.snapshot.issueDate);
  });

  it("odběratel bez karty nebo bez sídla → nelze vystavit, nic nevznikne; Preview nevystavuje", async () => {
    const nikde = await call("prepare_b2b_invoice", { customer_ico: ICO_NIKDE, items: [{ name: "X", quantity: 1, unit_price_kc: 1 }] });
    expect(nikde.data).toMatchObject({ canIssue: false, cannotIssueReasons: [expect.stringMatching(/není v MojeBegina/)] });
    expect(nikde.data.preview_token).toBeUndefined();
    const bez = await call("prepare_b2b_invoice", { customer_ico: ICO_BEZ_SIDLA, items: [{ name: "X", quantity: 1, unit_price_kc: 1 }] });
    expect(bez.data).toMatchObject({ canIssue: false, cannotIssueReasons: [expect.stringMatching(/nemá v MojeBegina sídlo/)] });
    process.env.VERCEL_ENV = "preview";
    expect((await call("prepare_b2b_invoice", vzorky())).data).toMatchObject({ canIssue: false });
    expect(await rows(sql`SELECT count(*)::int AS n FROM own_invoice_documents`)).toEqual([{ n: 2 }]);
  });
  const change = async (args: Record<string, unknown>) => {
    const p = await call("prepare_invoice_change", args);
    expect(p.isError, p.text).toBe(false);
    return { p, done: p.data.preview_token ? await call("apply_invoice_change", { ...args, preview_token: p.data.preview_token, confirm: true, idempotency_key: randomUUID() }) : null };
  };

  it("úprava: uhrazeno převodem → stejné číslo, verze 2, stará verze archivovaná, na PDF uhrazeno", async () => {
    const { p, done } = await change({ number: "20260215", action: "edit", paid_date: "2026-11-20" });
    expect(p.data).toMatchObject({ canApply: true, invoice: { number: "20260215", paid: false }, changes: [expect.stringMatching(/neuhrazeno → uhrazeno 20\. 11\. 2026/)] });
    expect(done!.data).toMatchObject({ done: true, invoiceNumber: "20260215", version: 2, pdfUrl: expect.stringMatching(/vlastni\/20260215\/pdf$/) });
    const [doc] = await rows(sql`SELECT version, paid_on::text AS paid_on, snapshot FROM own_invoice_documents WHERE number = '20260215'`);
    expect(doc).toMatchObject({ version: 2, paid_on: "2026-11-20" });
    expect(doc.snapshot.paidDate).toBe("2026-11-20");
    expect(await rows(sql`SELECT v.version FROM own_invoice_versions v JOIN own_invoice_documents d ON d.id = v.document_id WHERE d.number = '20260215'`)).toEqual([{ version: 1 }]);
    // stará oprava úhrady přesměruje vlastní fakturu na úpravu
    const corr = await call("prepare_invoice_correction", { number: "20260215", payment_method: "cash" });
    expect(corr.data).toMatchObject({ canApply: true, ownChangeArgs: { number: "20260215", action: "edit", payment_method: "cash" } });
    expect(idokladCalls).toEqual([]);
  });

  it("odeslání PDF odběrateli (e-mail z karty) zapíše odeslání; pak smazat nejde, jen storno", async () => {
    const sent = await call("send_idoklad_invoice_email", { number: "20260216", to: ["kocka@example.cz"], confirm: true, idempotency_key: randomUUID() });
    expect(sent.isError, sent.text).toBe(false);
    expect(sent.data).toMatchObject({ sent: true, invoiceNumber: "20260216", to: ["kocka@example.cz"], idokladId: null });
    expect(mail.sent).toHaveLength(1);
    const m = mail.sent[0] as { attachments: { filename: string }[]; bcc?: string[] };
    expect(m.attachments[0].filename).toBe("Faktura-20260216.pdf");
    const [doc] = await rows(sql`SELECT sent_at FROM own_invoice_documents WHERE number = '20260216'`);
    expect(doc.sent_at).not.toBeNull();
    expect(await call("send_idoklad_invoice_email", { number: "20260216", to: ["cizi@example.cz"], confirm: true, idempotency_key: randomUUID() })).toMatchObject({ isError: true });

    const del = await call("prepare_invoice_change", { number: "20260216", action: "delete" });
    expect(del.data).toMatchObject({ canApply: false, cannotApplyReasons: [expect.stringMatching(/už zákazník dostal/)] });
    expect((await call("prepare_invoice_change", { number: "20260216", action: "cancel" })).data).toMatchObject({ canApply: false, cannotApplyReasons: [expect.stringMatching(/důvod storna/)] });
    const { done } = await change({ number: "20260216", action: "cancel", reason: "Omylem dvakrát" });
    expect(done!.data).toMatchObject({ done: true, invoiceNumber: "20260216", action: "cancel" });
    expect(await rows(sql`SELECT state, cancel_reason FROM own_invoice_documents WHERE number = '20260216'`)).toEqual([{ state: "cancelled", cancel_reason: "Omylem dvakrát" }]);
    expect((await call("send_idoklad_invoice_email", { number: "20260216", to: ["kocka@example.cz"], confirm: true, idempotency_key: randomUUID() })).text).toMatch(/stornovaná/);
    expect((await call("prepare_invoice_change", { number: "20260216", action: "edit", note: "x" })).data.canApply).toBe(false);
  });

  it("smazání poslední neodeslané: číslo se uvolní; předposlední smazat nejde; změna po náhledu zastaví", async () => {
    const p1 = await call("prepare_b2b_invoice", vzorky({ items: [{ name: "Omyl", quantity: 1, unit_price_kc: 50 }], expected_total_kc: 50 }));
    const i1 = await call("issue_b2b_invoice", { ...vzorky({ items: [{ name: "Omyl", quantity: 1, unit_price_kc: 50 }], expected_total_kc: 50 }), preview_token: p1.data.preview_token, confirm: true, idempotency_key: randomUUID() });
    expect(i1.data.invoiceNumber).toBe("20260217");
    expect((await call("prepare_invoice_change", { number: "20260215", action: "delete" })).data.cannotApplyReasons.join()).toMatch(/jen poslední/);

    const args = { number: "20260217", action: "edit", note: "A" };
    const stale = await call("prepare_invoice_change", args);
    await change({ number: "20260217", action: "edit", note: "B" });
    expect(await call("apply_invoice_change", { ...args, preview_token: stale.data.preview_token, confirm: true, idempotency_key: randomUUID() })).toMatchObject({ isError: true });

    const { done } = await change({ number: "20260217", action: "delete" });
    expect(done!.data).toMatchObject({ done: true, action: "delete" });
    expect(await rows(sql`SELECT count(*)::int AS n FROM own_invoice_documents WHERE number = '20260217'`)).toEqual([{ n: 0 }]);
    expect(await rows(sql`SELECT last_serial FROM invoice_number_counters WHERE year = 2026`)).toEqual([{ last_serial: 216 }]);
    expect((await call("prepare_b2b_invoice", vzorky({ items: [{ name: "Další", quantity: 1, unit_price_kc: 70 }], expected_total_kc: 70 }))).data.expectedNumber).toBe("20260217");
  });
});
