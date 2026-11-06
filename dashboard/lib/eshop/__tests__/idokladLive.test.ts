// ESHOP 1.0 — OSTRÉ vystavení faktury v iDokladu (lib/eshop/invoicing/issue.ts)
// nad skutečnou DB (ovladač Neonu → PGlite se všemi migracemi) a nad
// napodobeninou iDoklad API v3 (helpers/fakeIdoklad.ts). Skutečný iDoklad
// test nikdy nevolá — každý požadavek mimo testovací DB se zaznamená.
//
// Ověřuje schválené pojistky: Preview nic nezapíše, jen zaplacená
// objednávka, jen řada 7277293 (vydané faktury, ne výchozí, název), jen
// agenda Begina (neplátce), VS = VS objednávky, kontrola duplicity v iDokladu,
// idempotence (opakování i souběh), kontakt (nalezení / založení), uhrazeno,
// uložení ID / čísla / PDF, PDF v e-mailu MojeBegina, žádný e-mail z iDokladu,
// žádný falešný stav „vystaveno“ při chybě.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { EmailMessage } from "../email/resend";
import { createFakeIdoklad } from "./helpers/fakeIdoklad";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));
vi.mock("@/lib/data/authContext", () => ({
  getAuthContext: async () => ({
    userId: "admin-1",
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Lucie Test",
    email: "lucie@begina.test",
  }),
}));
vi.mock("@/lib/data/userProfiles", () => ({
  getUserProfile: async () => null,
  getUserProfiles: async () => new Map(),
}));

const mail = vi.hoisted(() => ({ sent: [] as (EmailMessage & { key: string })[] }));
vi.mock("@/lib/eshop/email/resend", () => ({
  resendTransport: () => async (message: EmailMessage, key: string) => {
    mail.sent.push({ ...message, key });
    return { ok: true, id: `msg_${mail.sent.length}` };
  },
}));

// Aplikace běží jako Preview (stejně jako na Vercelu).
const ENV = {
  VERCEL_ENV: "preview",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  E2E_ORDER_NUMBER_START: "900000",
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test",
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399",
  // i na Preview nastavené přepínače a údaje NESMÍ nic otevřít
  IDOKLAD_INVOICING_ENABLED: "on",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "preview-client",
  IDOKLAD_ESHOP_CLIENT_SECRET: "preview-secret",
  IDOKLAD_ESHOP_APPLICATION_ID: "preview-app",
};
// Prostředí ostrého provozu — předává se výslovně jen do vystavení.
const LIVE = { ...ENV, VERCEL_ENV: "production", IDOKLAD_ESHOP_CLIENT_ID: "cid", IDOKLAD_ESHOP_CLIENT_SECRET: "csecret", IDOKLAD_ESHOP_APPLICATION_ID: "capp" };
const ACTOR = { type: "user" as const, userId: "admin-1", name: "Lucie Test" };
/** Den úhrady objednávek v testu (platby se zapisují „teď“), v Praze. */
const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
const daysBefore = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

describe("ostré vystavení faktury v iDokladu (napodobenina API, PGlite)", { timeout: 90_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let orders: typeof import("@/lib/data/orders");
  let issue: typeof import("../invoicing/issue");
  let afterPaid: typeof import("../invoicing/afterPaid");
  let payments: typeof import("../payments");
  const saved = { ...process.env };
  const outbound: string[] = [];

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const shimFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!/neon\.tech\/sql$/.test(url)) outbound.push(url);
      return shimFetch(input, init);
    }) as typeof fetch;
    ({ db } = await import("@/lib/db/client"));
    ({ submitCheckoutAction } = await import("@/app/eshop/pokladna/actions"));
    orders = await import("@/lib/data/orders");
    issue = await import("../invoicing/issue");
    afterPaid = await import("../invoicing/afterPaid");
    payments = await import("../payments");
  }, 90_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  function form(orderToken: string, email = "jana@example.cz") {
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
      name: "Jana Nováková",
      email,
      phone: "+420 777 123 456",
      shippingMethodId: "osobni-odber",
      paymentMethodId: "prevod",
      street: "",
      city: "",
      zip: "",
      note: "",
      termsAccepted: "on",
      orderToken,
      website: "",
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  /** Objednávka převodem; s `paidKc` i zapsaná platba (bez vedlejších účinků). */
  async function order(paidKc: number | null = 758, email?: string) {
    const id = randomUUID();
    await submitCheckoutAction(null, form(id, email));
    const [{ payment_vs }] = await rows(sql`SELECT payment_vs FROM orders WHERE id = ${id}`);
    if (paidKc !== null) {
      await payments.recordManualPayment(db, {
        orderId: id,
        token: randomUUID(),
        method: "bank_transfer",
        amountHal: paidKc * 100,
        occurredAt: new Date(),
        note: null,
        vs: payment_vs,
        user: { userId: "admin-1", name: "Lucie Test" },
      });
    }
    mail.sent.length = 0;
    return { id, vs: payment_vs as string };
  }

  const state = async (id: string) =>
    (
      await rows(sql`
        SELECT i.doc_state, i.invoice_number, i.issued_at IS NOT NULL AS issued_at, i.pdf_sent_at IS NOT NULL AS pdf_sent,
               l.state, l.external_id, l.external_number, l.number_series, l.attempts, l.last_error,
               l.pdf_sha256 IS NOT NULL AS pdf, l.next_attempt_at IS NOT NULL AS locked
        FROM invoices i JOIN invoice_provider_links l ON l.invoice_id = i.id AND l.state <> 'void'
        WHERE i.order_id = ${id} AND i.document_type = 'invoice'`)
    )[0];
  const activity = async (id: string) =>
    (await rows(sql`SELECT kind FROM order_activity WHERE order_id = ${id} AND kind LIKE 'invoice%' ORDER BY created_at, id`)).map(
      (r: { kind: string }) => r.kind
    );

  // ------------------------------------------------------------------ Preview

  it("Preview: zapsaná platba → jen návrh, na iDoklad neodejde ani jeden požadavek", async () => {
    const id = randomUUID();
    await submitCheckoutAction(null, form(id));
    const before = outbound.length;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
    expect(await orders.recordOrderPayment(id, { token: randomUUID(), amountKc: "758", date: today, method: "bank_transfer", note: "" })).toMatchObject({
      settled: true,
    });
    expect(outbound.slice(before).filter((u) => /idoklad/.test(u))).toEqual([]);
    expect(await state(id)).toMatchObject({ doc_state: "draft", state: "dry_run", external_id: null });
    // přihlášený (admin-1) není oprávněný vystavovat; Preview + oprávněný: idokladManual.test.ts
    expect(await orders.issueOrderInvoice(id)).toEqual({ ok: false, error: expect.stringMatching(/smí vystavit jen/) });
  });

  it("Preview: vystavení se ani nespustí — žádný požadavek, ani na token", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad();
    const spy = vi.fn(fake.fetchImpl);
    expect(await issue.issueInvoice(db, id, { env: ENV, fetchImpl: spy as typeof fetch })).toEqual({
      status: "skipped",
      reason: expect.stringMatching(/Preview/),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ ostrý tok

  it("ostře: kontakt založen, faktura v řadě 7277293 s VS objednávky, uhrazena, PDF v e-mailu MojeBegina", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    const next = fake.next();
    const result = await afterPaid.invoiceAndNotifyPaid(db, id, "payment_marked_paid", "https://moje.begina.cz", ACTOR, {
      env: LIVE,
      fetchImpl: fake.fetchImpl,
    });
    expect(result.invoice).toMatchObject({ status: "issued", invoiceNumber: next.number, adopted: false });
    expect(next.number).toMatch(/^926\d{4}$/); // 9{RR}{NNNN}

    // jen tři povolené zápisy, nic jiného (žádné /Mails, DELETE, PATCH)
    expect(fake.writes()).toEqual(["POST /Contacts", "POST /IssuedInvoices", `PUT /IssuedDocumentPayments/FullyPay/${next.id}`]);
    expect(fake.calls.some((c) => /Mails/.test(c.path))).toBe(false);
    // regrese 7. 10. 2026: nový kontakt hledá zemi podle "CZ" (ISO ALPHA-2),
    // nikdy podle dřív chybného "CZE" — jinak by založení kontaktu vždy spadlo.
    const countriesCall = fake.calls.find((c) => c.path === "/Countries")!;
    expect(countriesCall.query.filter).toBe("Code~eq~CZ");
    const post = fake.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body as Record<string, unknown>;
    expect(post).toMatchObject({
      NumericSequenceId: 7277293,
      DocumentSerialNumber: Number(next.number.slice(3)),
      VariableSymbol: vs,
      CurrencyId: 1, // CZK (agenda Beginy)
      PaymentOptionId: 1, // Bank transfer / převodem
      PartnerId: 900,
      IsEet: false,
      IsIncomeTax: true,
      ReportLanguage: 1,
      AccountNumber: "19-2000145399", // z výchozí faktury agendy
    });
    expect(vs).toMatch(/^7\d{7}$/);
    expect(post.Items).toEqual([
      { Name: "Kulajda", Code: "kulajda", Amount: 2, Unit: "ks", UnitPrice: 379, PriceType: 1, VatRateType: 2, DiscountPercentage: 0, IsTaxMovement: false, ItemType: 0 },
    ]);
    expect(String(post.DateOfIssue)).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00\.000$/);
    const contact = fake.calls.find((c) => c.method === "POST" && c.path === "/Contacts")!.body;
    expect(contact).toMatchObject({ CompanyName: "Jana Nováková", Email: "jana@example.cz", CountryId: 2 });
    // pořadí: kontroly agendy a řady PŘED prvním zápisem
    const firstWrite = fake.calls.findIndex((c) => c.method !== "GET" && c.path !== "TOKEN");
    const order_ = fake.calls.map((c) => c.path);
    expect(order_.indexOf("/Account/CurrentAgenda")).toBeLessThan(firstWrite);
    expect(order_.indexOf("/NumericSequences")).toBeLessThan(firstWrite);
    expect(order_.indexOf("/IssuedInvoices")).toBeLessThan(firstWrite); // hledání podle VS

    expect(await state(id)).toEqual({
      doc_state: "issued",
      invoice_number: next.number,
      issued_at: true,
      pdf_sent: true,
      state: "issued",
      external_id: String(next.id),
      external_number: next.number,
      number_series: "7277293",
      attempts: 1,
      last_error: null,
      pdf: true,
      locked: false,
    });
    expect(await rows(sql`SELECT provider, external_id FROM invoice_customer_refs r JOIN invoices i ON i.customer_id = r.customer_id WHERE i.order_id = ${id}`)).toEqual([
      { provider: "idoklad", external_id: "900" },
    ]);
    expect(await activity(id)).toEqual(["invoice_draft_created", "invoice_issued"]);

    // e-mail „Platbu jsme přijali“ z MojeBegina s PDF faktury v příloze
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("[TEST] Platbu za objednávku " + (await rows(sql`SELECT order_number FROM orders WHERE id = ${id}`))[0].order_number + " jsme přijali");
    expect(mail.sent[0].text).toContain(`V příloze posíláme fakturu č. ${next.number}.`);
    expect(mail.sent[0].attachments).toEqual([{ filename: `faktura-${next.number}.pdf`, contentBase64: expect.any(String), contentType: "application/pdf" }]);
    expect(Buffer.from(mail.sent[0].attachments![0].contentBase64, "base64").toString("latin1")).toMatch(/^%PDF-/);
  });

  it("idempotence: opakované vystavení (webhook / dvojklik) nic nezapíše a nic nepošle", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad();
    const next = fake.next();
    await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl, actor: ACTOR });
    const writes = fake.writes().length;
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toEqual({ status: "already_issued", invoiceNumber: next.number });
    expect(await afterPaid.invoiceAndNotifyPaid(db, id, "payment_marked_paid", "https://x", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
      invoice: { status: "already_issued" },
    });
    expect(fake.writes()).toHaveLength(writes);
    expect(fake.invoices).toHaveLength(1);
  });

  it("souběh: dvě vystavení současně → v iDokladu vznikne jediná faktura", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad();
    const results = await Promise.all([
      issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl }),
      issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["issued", "skipped"]);
    expect(fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
    expect(fake.invoices).toHaveLength(1);
  });

  it("ztracená odpověď po vytvoření faktury: stav „failed“, další pokus fakturu najde podle VS a jen dokončí", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad({ failOnce: { "POST /IssuedInvoices": { status: 502, message: "Bad gateway", afterEffect: true } } });
    const next = fake.next();
    const first = await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(first).toMatchObject({ status: "failed", externalId: null });
    expect(await state(id)).toMatchObject({ doc_state: "draft", invoice_number: null, state: "failed", last_error: expect.stringMatching(/502/), locked: false });
    expect(fake.invoices).toHaveLength(1); // v iDokladu ale vznikla

    const second = await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(second).toMatchObject({ status: "issued", adopted: true, invoiceNumber: next.number });
    expect(fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1); // žádná druhá faktura
    expect(fake.invoices[0].PaymentStatus).toBe(1);
    expect(await activity(id)).toEqual(["invoice_draft_created", "invoice_issue_failed", "invoice_issued"]);
  });

  it("chyba při „uhrazeno“: faktura NENÍ vedená jako vystavená; opakování ji dokončí podle uloženého ID", async () => {
    const { id } = await order();
    const next = createFakeIdoklad().next();
    const fake = createFakeIdoklad({ failOnce: { [`PUT /IssuedDocumentPayments/FullyPay/${next.id}`]: { status: 500, message: "Chyba serveru" } } });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", externalId: String(next.id) });
    expect(await state(id)).toMatchObject({ doc_state: "draft", invoice_number: null, state: "failed", external_id: String(next.id), pdf_sent: false });
    // UI/akce: zkusit znovu → GET podle ID, uhrazeno, PDF, „Faktura k objednávce“
    const retried = await afterPaid.issueAndSendInvoice(db, id, "https://x", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(retried).toMatchObject({ status: "issued", adopted: true, emailed: true });
    expect(fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^\[TEST\] Faktura k objednávce \d+$/)]);
    expect(mail.sent[0].attachments?.[0].filename).toBe(`faktura-${next.number}.pdf`);
    expect(await state(id)).toMatchObject({ doc_state: "issued", pdf_sent: true });
  });

  it("částka v iDokladu nesedí → neoznačí se uhrazeno, nevede se jako vystavená, nutná ruční kontrola", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad({ priceFactor: 2 });
    const next = fake.next();
    const result = await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/nesedí|ruční kontrola|celkem/) });
    expect(fake.writes().some((w) => w.startsWith("PUT"))).toBe(false);
    expect(await state(id)).toMatchObject({ doc_state: "draft", state: "failed", external_id: String(next.id) });
  });

  // ------------------------------------------------------------------ pojistky před zápisem

  const blocked: [string, Parameters<typeof createFakeIdoklad>[0], RegExp][] = [
    ["řada 7277293 je výchozí", { sequences: [{ Id: 7277293, Name: "E-shop Begina", DocumentType: 0, IsDefault: true, NumberFormat: "9{RR}{NNNN}" }] }, /výchozí/],
    ["řada 7277293 neexistuje", { sequences: [{ Id: 2032369, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" }] }, /neexistuje/],
    ["řada se jmenuje jinak", { sequences: [{ Id: 7277293, Name: "Velkoobchod", DocumentType: 0, IsDefault: false, NumberFormat: "9{RR}{NNNN}" }] }, /jmenuje/],
    ["jiná agenda (IČO)", { ico: "12345678" }, /není to Begina/],
    ["agenda je plátce DPH", { vatPayer: true }, /plátce DPH/],
  ];
  for (const [label, options, message] of blocked) {
    it(`stop bez zápisu: ${label}`, async () => {
      const { id } = await order();
      const fake = createFakeIdoklad(options);
      expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
        status: "failed",
        error: expect.stringMatching(message),
      });
      expect(fake.writes()).toEqual([]);
      expect(await state(id)).toMatchObject({ doc_state: "draft", state: "failed", external_id: null });
    });
  }

  it("v iDokladu už jsou dvě faktury s tímto VS → stop, nic nového", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    for (const n of [1, 2]) {
      fake.invoices.push({
        Id: 100 + n, DocumentNumber: `926000${n}`, VariableSymbol: vs, NumericSequenceId: 7277293, PartnerId: 1, PaymentStatus: 1,
        Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 758 }, body: { DateOfIssue: TODAY },
      });
    }
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/víc vydaných faktur/) });
    expect(fake.writes()).toEqual([]);
  });

  it("faktura s VS existuje v jiné řadě → nepřipojí se, stop k ruční kontrole", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    fake.invoices.push({ Id: 300, DocumentNumber: "20260177", VariableSymbol: vs, NumericSequenceId: 2032369, PartnerId: 1, PaymentStatus: 0, Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 0 }, body: { DateOfIssue: TODAY } });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/není z řady E-shop Begina/) });
    expect(fake.writes()).toEqual([]);
    expect(await state(id)).toMatchObject({ external_id: null, doc_state: "draft" });
  });

  // --------------------------------- řada vrácené faktury: chybějící NumericSequenceId nikdy neprojde

  it("iDoklad fakturu založí mimo řadu 7277293 a řadu v odpovědi neuvede → potvrzení nenajde → STOP, neuhrazeno, žádný e-mail", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad({ storeInSequence: 2032369 });
    const next = fake.next();
    const result = await afterPaid.issueAndSendInvoice(db, id, "https://moje.begina.cz", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/není potvrzeně v řadě E-shop Begina \(7277293\)/) });
    expect(fake.writes()).toEqual(["POST /Contacts", "POST /IssuedInvoices"]); // žádné „uhrazeno“
    expect(mail.sent).toEqual([]);
    // ID je uložené (další pokus nezaloží druhou fakturu), stav ale není „vystaveno“
    expect(await state(id)).toMatchObject({ doc_state: "draft", state: "failed", external_id: String(next.id) });
    // ani opakování ji nepřevezme — řada se znovu neověří
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed" });
    expect(fake.invoices).toHaveLength(1);
    expect(await state(id)).toMatchObject({ doc_state: "draft", state: "failed" });
  });

  it("odpověď uvádí jinou řadu → STOP bez potvrzovacího dotazu", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad({ storeInSequence: 2032369, sequenceInView: true });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/není z řady E-shop Begina \(7277293\), ale z řady 2032369/),
    });
    // řada v odpovědi → bez ověřovacího dotazu po vytvoření faktury
    const afterPost = fake.calls.slice(fake.calls.findIndex((c) => c.method === "POST" && c.path === "/IssuedInvoices") + 1);
    expect(afterPost.some((c) => (c.query.filter ?? "").startsWith("NumericSequenceId~eq~"))).toBe(false);
  });

  it("potvrzovací dotaz na řadu selže → STOP (nic se nepředpokládá)", async () => {
    const { id } = await order();
    const fake = createFakeIdoklad({ failSequenceConfirmation: { status: 503, message: "Service Unavailable" } });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/Řadu faktury 926\d{4} v iDokladu nejde ověřit/),
    });
    expect(fake.writes().filter((w) => w.startsWith("PUT"))).toEqual([]);
  });

  // --------------------------------- regrese 20. 10. 2026: iDoklad nefiltruje podle VariableSymbol (400)

  it("iDoklad podle VS filtrovat neumí (400) — kontrola duplicit se ptá jen podporovanými sloupci", async () => {
    const fake = createFakeIdoklad();
    // napodobenina odpovídá jako skutečný iDoklad 20. 10. 2026
    const { EshopIdokladClient, eqFilter, issuedInvoiceFilter } = await import("../invoicing/idokladHttp");
    const client = new EshopIdokladClient({ clientId: "test-client-id", clientSecret: "test-client-secret", applicationId: "test-application", writesAllowed: false, env: LIVE, fetchImpl: fake.fetchImpl });
    await expect(client.list("/IssuedInvoices", eqFilter("VariableSymbol", "5215"), 5)).rejects.toThrow(
      /400 Filtering by this column is not supported/
    );
    expect(() => issuedInvoiceFilter(eqFilter("VariableSymbol", "5215"))).toThrow(/nefiltruje podle VariableSymbol/);

    const { id } = await order();
    const before = fake.calls.length;
    const next = fake.next();
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "issued" });
    const filters = fake.calls.slice(before).filter((c) => c.method === "GET" && c.path === "/IssuedInvoices").map((c) => c.query.filter);
    // kontrola řady (preflight), pak faktury od 31 dní před úhradou (VS se porovná u nás)
    expect(filters).toEqual([
      "NumericSequenceId~eq~7277293",
      `DocumentNumber~eq~${next.number}`,
      `DateOfIssue~gte~${daysBefore(TODAY, 31)}`,
      "NumericSequenceId~eq~7277293", // řada nové faktury (odpověď ji neuvádí) — mezi doklady řady
    ]);
  });

  it("faktura s VS (jiná řada, jiný odběratel) až na 2. straně výpisu → stop, nic nového", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    for (let n = 0; n < 150; n += 1) {
      fake.invoices.push({ Id: 1000 + n, DocumentNumber: `2026${String(n).padStart(4, "0")}`, VariableSymbol: `8${n}`, NumericSequenceId: 2032369, PartnerId: 9, PaymentStatus: 1, Prices: { TotalWithVat: 100, TotalVat: 0, TotalPaid: 100 }, body: { DateOfIssue: TODAY } });
    }
    fake.invoices.push({ Id: 2000, DocumentNumber: "20260999", VariableSymbol: vs, NumericSequenceId: 2032369, PartnerId: 77, PaymentStatus: 0, Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 0 }, body: { DateOfIssue: TODAY } });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/není z řady E-shop Begina/) });
    expect(fake.writes()).toEqual([]);
    expect(
      fake.calls.filter((c) => c.path === "/IssuedInvoices" && c.method === "GET" && c.query.filter?.startsWith("DateOfIssue")).map((c) => c.query.page)
    ).toEqual(["1", "2"]);
  });

  it("faktura se stejným VS starší než 31 dní před úhradou (jiná, dávná objednávka) → nevadí, vystaví se jednou", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    fake.invoices.push({ Id: 3000, DocumentNumber: "20250001", VariableSymbol: vs, NumericSequenceId: 2032369, PartnerId: 9, PaymentStatus: 1, Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 758 }, body: { DateOfIssue: daysBefore(TODAY, 32) } });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "issued" });
    expect(fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
  });

  it("nezaplacená / částečně zaplacená objednávka: nic se nevolá", async () => {
    const fake = createFakeIdoklad();
    const unpaid = await order(null);
    expect(await issue.issueInvoice(db, unpaid.id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "skipped", reason: expect.stringMatching(/není uhrazená/) });
    const partial = await order(300);
    expect(await issue.issueInvoice(db, partial.id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "skipped" });
    expect(fake.calls).toEqual([]);
  });

  it("kontakt: existující podle e-mailu se použije; podruhé už podle uložené vazby — bez zakládání", async () => {
    const fake = createFakeIdoklad();
    fake.contacts.push({ Id: 777, Email: "stala@zakaznice.cz", CompanyName: "Stálá Zákaznice", IdentificationNumber: null });
    const first = await order(758, "stala@zakaznice.cz");
    await issue.issueInvoice(db, first.id, { env: LIVE, fetchImpl: fake.fetchImpl });
    const second = await order(758, "Stala@Zakaznice.cz");
    await issue.issueInvoice(db, second.id, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(fake.writes().filter((w) => w === "POST /Contacts")).toEqual([]);
    expect(fake.invoices.map((i) => i.PartnerId)).toEqual([777, 777]);
    expect(fake.calls.filter((c) => c.path === "/Contacts/777")).toHaveLength(1); // 2. objednávka: podle vazby
  });

  // ------------------------------------------------- firma: WooCommerce #5215 (pilot Food Fest Crew)

  const script = (name: string) =>
    readFileSync(path.join(__dirname, "../../../docs/eshop-production", name), "utf8").replace(/--[^\n]*\n/g, "\n");

  it("WooCommerce #5215 Food Fest Crew: import skriptem → firemní faktura (IČO, DIČ, sídlo), kontakt podle IČO, VS 5215, jednou", async () => {
    // firma z převodu leadu Tomáše Herouta (Obchod → Převést na zákazníka)
    await rows(sql`INSERT INTO organizations (ico, name, registered_address)
      VALUES ('08911088', 'Food Fest Crew s.r.o.', 'Pasohlávky 251, 691 22 Pasohlávky')`);
    const line = async (name: string) => Object.values((await rows(sql.raw(script(name))))[0]).map(String).join(" | ");
    expect(await line("61_food_fest_5215_before.sql")).toBe("1 | 0 | ano | 0 | 0"); // lead tu není (test)
    await rows(sql.raw(script("62_food_fest_5215.sql")));
    // druhé spuštění nic nezdvojí
    await expect(rows(sql.raw(script("62_food_fest_5215.sql")))).rejects.toThrow(/už v MojeBegina je/);
    expect(await line("63_food_fest_5215_after.sql")).toBe("1 | CZ08911088 | 12647 | 1 | paid | 0");
    const [{ id }] = await rows(sql`SELECT id FROM orders WHERE external_woocommerce_id = '5215'`);

    // detail v MojeBegina: platby i faktura se vedou (import z WooCommerce)
    const detail = (await orders.getOrderDetail(id))!;
    expect(detail.order).toMatchObject({ invoiceable: true, externalWooCommerceId: "5215", paymentStatus: "paid" });
    expect(detail.payments).toMatchObject({ balanceState: "paid", netHal: 1264700 });
    // ruční přepnutí „Zaplaceno“ nejde (počítá se z plateb)
    expect(await orders.updatePaymentStatus(id, "unpaid")).toMatchObject({ ok: false });

    // kontakt firmy už v iDokladu je (z dřívější ruční faktury 20260184) — jiný e-mail, stejné IČO
    const fake = createFakeIdoklad({
      contacts: [{ Id: 4242, Email: "info@foodfest.example", CompanyName: "Food Fest Crew s.r.o.", IdentificationNumber: "08911088" }],
    });
    const next = fake.next();
    // skrytá kopie e-mailu s fakturou Begině (v testu jen adresy z testovacího seznamu)
    const savedEnv = { to: process.env.ESHOP_EMAIL_TEST_RECIPIENTS, copy: process.env.ESHOP_EMAIL_INVOICE_COPY_TO };
    process.env.ESHOP_EMAIL_TEST_RECIPIENTS = "jaroslav@begina.test, tom.herout@seznam.cz, lucie@begina.test";
    process.env.ESHOP_EMAIL_INVOICE_COPY_TO = "Jaroslav@Begina.test; lucie@begina.test, mimo-test@example.cz";

    // dodací adresa z importu („251, 691 22 Pasohlávky“ — bez ulice/obce) není ověřená → STOP
    // ještě před iDokladem; z poznámky zákazníka („dovoz do Drnholce“) se nic neodvozuje
    const blocked = await afterPaid.issueAndSendInvoice(db, id, "https://moje.begina.cz", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(blocked).toMatchObject({ status: "failed", error: expect.stringMatching(/Dodací adresa „251, 691 22 Pasohlávky“ nemá před číslem ulici ani obec — opravit u objednávky/) });
    expect(fake.calls).toEqual([]);
    expect(mail.sent).toEqual([]);
    // oprava dodací adresy v explicitním poli objednávky (v testu přímo)
    await rows(sql`UPDATE orders SET recipient_address = 'Pasohlávky 251, 691 22 Pasohlávky' WHERE id = ${id}`);

    const result = await afterPaid.issueAndSendInvoice(db, id, "https://moje.begina.cz", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(result).toMatchObject({ status: "issued", invoiceNumber: next.number, adopted: false, emailed: true });
    expect(fake.writes()).toEqual(["POST /IssuedInvoices", `PUT /IssuedDocumentPayments/FullyPay/${next.id}`]); // žádný nový kontakt
    expect(fake.calls.find((c) => c.path === "/Contacts")!.query.filter).toBe("IdentificationNumber~eq~08911088");
    const invoiceLookups = fake.calls.filter((c) => c.path === "/IssuedInvoices" && c.method === "GET").map((c) => c.query.filter);
    // VS 5215 (jakákoli řada) a faktury firmy od dne úhrady (jakákoli řada, jakýkoli VS)
    // iDoklad podle VS filtrovat neumí: faktury od 18. 9. (31 dní před úhradou), VS se porovná u nás
    expect(invoiceLookups).toEqual([
      "NumericSequenceId~eq~7277293", // kontrola řady E-shop Begina (preflight)
      `DocumentNumber~eq~${next.number}`,
      "DateOfIssue~gte~2026-09-18",
      "PartnerId~eq~4242",
      "NumericSequenceId~eq~7277293", // potvrzení řady nové faktury — mezi doklady řady
    ]);
    const post = fake.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body as Record<string, unknown>;
    expect(post).toMatchObject({
      PartnerId: 4242,
      NumericSequenceId: 7277293,
      VariableSymbol: "5215",
      OrderNumber: "5215",
      PaymentOptionId: 2, // Credit card
      CurrencyId: 1,
      // vystaveno a splatné dnes (den vystavení), uhrazeno 19. 10. (den platby kartou);
      // DUZP zatím den úhrady (čeká na rozhodnutí)
      DateOfIssue: `${TODAY}T12:00:00.000`,
      DateOfTaxing: "2026-10-19T12:00:00.000",
      DateOfMaturity: `${TODAY}T12:00:00.000`,
      Description: "Objednávka 5215 (begina.cz)",
      // celý text za položkami je náš (text agendy se nepřipojí)
      ItemsTextSuffix: "Faktura je již uhrazena – neplaťte.\nDodací adresa: Tomáš Herout, Pasohlávky 251, 691 22 Pasohlávky",
    });
    expect(fake.calls.find((c) => c.method === "PUT")!.query).toEqual({ dateOfPayment: "2026-10-19 12:00:00.000" });
    expect(post.Items).toEqual([
      { Name: "Dýňová polévka", Code: null, Amount: 30, Unit: "ks", UnitPrice: 379, PriceType: 1, VatRateType: 2, DiscountPercentage: 0, IsTaxMovement: false, ItemType: 0 },
      { Name: "Chlazená přeprava", Code: null, Amount: 1, Unit: null, UnitPrice: 1277, PriceType: 1, VatRateType: 2, DiscountPercentage: 0, IsTaxMovement: false, ItemType: 0 },
    ]);
    expect(fake.invoices[0].Prices.TotalPaid).toBe(12647);

    // faktura u objednávky, zákazník = firma podle IČO navázaná na organizaci
    expect(await rows(sql`
      SELECT i.origin, i.payment_vs, i.invoice_number, c.kind, c.ico, c.name, c.organization_id IS NOT NULL AS org
      FROM invoices i JOIN invoice_customers c ON c.id = i.customer_id WHERE i.order_id = ${id}`)).toEqual([
      { origin: "import", payment_vs: "5215", invoice_number: next.number, kind: "company", ico: "08911088", name: "Food Fest Crew s.r.o.", org: true },
    ]);
    expect(await rows(sql`SELECT external_id FROM invoice_customer_refs r JOIN invoice_customers c ON c.id = r.customer_id WHERE c.ico = '08911088'`)).toEqual([
      { external_id: "4242" },
    ]);

    // zákazník dostane jen „Faktura k objednávce 5215“ s PDF, bez odkazu na stav objednávky v novém e-shopu
    process.env.ESHOP_EMAIL_TEST_RECIPIENTS = savedEnv.to;
    if (savedEnv.copy === undefined) delete process.env.ESHOP_EMAIL_INVOICE_COPY_TO;
    else process.env.ESHOP_EMAIL_INVOICE_COPY_TO = savedEnv.copy;
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toEqual(["tom.herout@seznam.cz"]);
    expect(mail.sent[0].bcc).toEqual(["jaroslav@begina.test", "lucie@begina.test"]); // adresa mimo testovací seznam vynechána
    expect(
      await rows(sql`SELECT metadata->'bcc' AS bcc FROM order_activity WHERE order_id = ${id} AND kind = 'email_sent'`)
    ).toEqual([{ bcc: ["jaroslav@begina.test", "lucie@begina.test"] }]);
    expect(mail.sent[0].subject).toBe("[TEST] Faktura k objednávce 5215");
    expect(mail.sent[0].text).toContain(`V příloze posíláme fakturu č. ${next.number}.`);
    expect(mail.sent[0].text).not.toContain("Stav objednávky");
    expect(mail.sent[0].attachments).toEqual([{ filename: `faktura-${next.number}.pdf`, contentBase64: expect.any(String), contentType: "application/pdf" }]);

    // druhé kliknutí: nic nového v iDokladu ani v e-mailu
    mail.sent.length = 0;
    const again = await afterPaid.issueAndSendInvoice(db, id, "https://moje.begina.cz", ACTOR, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(again).toMatchObject({ status: "already_issued", invoiceNumber: next.number });
    expect(fake.invoices).toHaveLength(1);
    expect(mail.sent).toEqual([]);
    // vystavenou fakturu návrat importu nesmaže
    await expect(rows(sql.raw(script("69_food_fest_5215_rollback.sql")))).rejects.toThrow(/faktura v iDokladu/);
  });

  it("duplicita mimo MojeBegina: stop jen u skutečné nebo nejasné duplicity, další objednávky firmy se neblokují", async () => {
    const [{ id: org }] = await rows(sql`SELECT id FROM organizations WHERE ico = '08911088'`);
    /** Další zaplacená objednávka Food Fest Crew z WooCommerce (21. 10.). */
    const wooOrder = async (wooId: string, kc: number) => {
      const [{ id }] = await rows(sql`
        INSERT INTO orders (channel, external_woocommerce_id, buyer_organization_id, contact_name, contact_email,
          recipient_name, recipient_address, subtotal_kc, shipping_kc, total_kc, payment_status, paid_at)
        VALUES ('import', ${wooId}, ${org}, 'Tomáš Herout', 'tom.herout@seznam.cz', 'Tomáš Herout', 'Pasohlávky 251, 691 22 Pasohlávky',
          ${kc}, 0, ${kc}, 'paid', '2026-10-21 10:00+02')
        RETURNING id`);
      await rows(sql`INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES (${id}, 'Kulajda', ${kc / 379}, 379, ${kc})`);
      await rows(sql`INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, recorded_by_user_id)
        VALUES (${id}, 'manual', ${"woocommerce:" + wooId}, 'card', 'inflow', 'succeeded', ${kc * 100}, ${wooId}, '2026-10-21 10:00+02', 'import:woocommerce')`);
      return id as string;
    };
    const manual = (Id: number, number: string, day: string, kc: number, extra: Record<string, unknown> = {}) => ({
      Id,
      DocumentNumber: number,
      VariableSymbol: number,
      NumericSequenceId: 2032369, // výchozí řada (ruční faktury Lucie)
      PartnerId: 4243,
      PaymentStatus: 1,
      Prices: { TotalWithVat: kc, TotalVat: 0, TotalPaid: kc },
      body: { DateOfIssue: `${day}T12:00:00.000`, ...extra },
    });
    const fake = createFakeIdoklad({
      contacts: [{ Id: 4243, Email: null, CompanyName: "Food Fest Crew s.r.o.", IdentificationNumber: "08911088" }],
    });
    await rows(sql`DELETE FROM invoice_customer_refs WHERE customer_id IN (SELECT id FROM invoice_customers WHERE ico = '08911088')`);
    fake.invoices.push(
      manual(410, "20260184", "2026-10-13", 9864.75), // starší ruční faktura — před dnem úhrady, nevadí
      manual(411, "20260191", "2026-10-21", 1516, { Description: "Polévky pro Food Fest" }) // ruční faktura k jiné objednávce
    );

    // 1. jiná částka, žádný odkaz na objednávku → jiná objednávka, vystaví se
    const a = await wooOrder("5302", 758);
    expect(await issue.issueInvoice(db, a, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "issued" });

    // 2. další objednávka téže firmy: faktura 5302 z MojeBegina (stejný den) ji neblokuje
    const b = await wooOrder("5303", 1137);
    expect(await issue.issueInvoice(db, b, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "issued" });

    // 3. ruční faktura odkazuje na objednávku (číslo objednávky / popis) → duplicita, stop
    const c = await wooOrder("5304", 379);
    fake.invoices.push(manual(412, "20260192", "2026-10-21", 400, { OrderNumber: "5304" }));
    const before = fake.writes().length;
    expect(await issue.issueInvoice(db, c, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/faktura 20260192 k této objednávce \(5304\)/),
    });
    const d = await wooOrder("5305", 1895);
    fake.invoices.push(manual(413, "20260193", "2026-10-22", 1, { Description: "Objednávka č. 5305, polévky" }));
    expect(await issue.issueInvoice(db, d, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/20260193 k této objednávce/) });

    // 4. ruční faktura se stejnou částkou bez odkazu → nejasné, stop jen u této objednávky
    const e = await wooOrder("5306", 1516);
    expect(await issue.issueInvoice(db, e, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/20260191 této firmě ze dne 2026-10-21 se stejnou částkou 1516 Kč/),
    });
    expect(fake.writes().length).toBe(before); // u 3 a 4 se nic nezapsalo
    expect(fake.invoices.filter((i) => i.NumericSequenceId === 7277293).map((i) => i.VariableSymbol)).toEqual(["5302", "5303"]);
  });

  it("dva kontakty se stejným IČO v iDokladu → stop bez zápisu (nutná ruční kontrola)", async () => {
    const [{ id: org }] = await rows(sql`SELECT id FROM organizations WHERE ico = '08911088'`);
    const [{ id }] = await rows(sql`
      INSERT INTO orders (channel, external_woocommerce_id, buyer_organization_id, contact_name, contact_email,
        recipient_name, recipient_address, subtotal_kc, shipping_kc, total_kc, payment_status, paid_at)
      VALUES ('import', '5301', ${org}, 'Tomáš Herout', 'tom.herout@seznam.cz', 'Tomáš Herout', 'Pasohlávky 251, 691 22 Pasohlávky',
        379, 0, 379, 'paid', now())
      RETURNING id`);
    await rows(sql`INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES (${id}, 'Kulajda', 1, 379, 379)`);
    await rows(sql`INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, recorded_by_user_id)
      VALUES (${id}, 'manual', 'woocommerce:5301', 'card', 'inflow', 'succeeded', 37900, '5301', now(), 'import:woocommerce')`);
    // vazbu na kontakt z faktury 5215 zrušit, ať se hledá podle IČO
    await rows(sql`DELETE FROM invoice_customer_refs WHERE customer_id IN (SELECT id FROM invoice_customers WHERE ico = '08911088')`);
    const fake = createFakeIdoklad({
      contacts: [
        { Id: 5001, Email: null, CompanyName: "Food Fest Crew s.r.o.", IdentificationNumber: "08911088" },
        { Id: 5002, Email: null, CompanyName: "Food Fest Crew", IdentificationNumber: "08911088" },
      ],
    });
    const result = await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl });
    expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/víc kontaktů s IČO 08911088/) });
    expect(fake.writes()).toEqual([]);
  });

  it("firma bez kontaktu v iDokladu: nový kontakt s IČO, DIČ, sídlem a kontaktní osobou; starší importy bez čísla z WooCommerce fakturu nedostanou", async () => {
    const { contactPostBody } = await import("../invoicing/idoklad");
    const { buildInvoiceDraft } = await import("../invoicing/draft");
    const { draft, problems } = buildInvoiceDraft(
      {
        id: randomUUID(),
        channel: "import",
        externalWooCommerceId: "5300",
        company: { name: "Food Fest Crew s.r.o.", ico: "08911088", dic: "CZ08911088", registeredAddress: "Pasohlávky 251, 691 22 Pasohlávky" },
        orderNumber: null,
        paymentVs: null,
        contactName: "Tomáš Herout",
        contactEmail: "Tom.Herout@seznam.cz",
        contactPhone: "+420723141743",
        recipientName: "Tomáš Herout",
        recipientAddress: "Drnholec 1, 691 83 Drnholec",
        shippingMethodLabel: null,
        subtotalKc: 379,
        discountKc: 0,
        shippingKc: 0,
        totalKc: 379,
        paidAt: null,
      },
      [{ name: "Dýňová polévka", quantity: 1, unitPriceKc: 379, lineTotalKc: 379, sku: null }],
      [{ id: "p1", source: "manual", externalId: "woocommerce:5300", method: "card", direction: "inflow", status: "succeeded", amountHal: 37900, occurredAt: new Date("2026-10-20T08:00:00Z") }],
      { numberSeriesId: "7277293", live: true }
    );
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(draft).toMatchObject({ vs: "5300", orderReference: "5300" });
    expect(contactPostBody(draft, { countryId: 2 })).toEqual({
      CompanyName: "Food Fest Crew s.r.o.",
      Firstname: "Tomáš",
      Surname: "Herout",
      IdentificationNumber: "08911088",
      VatIdentificationNumber: "CZ08911088",
      Email: "tom.herout@seznam.cz",
      Phone: "+420723141743",
      Street: "Pasohlávky 251",
      City: "Pasohlávky",
      PostalCode: "69122",
      CountryId: 2,
    });
    // starší import bez čísla z WooCommerce (The Cup) fakturu nedostane
    const { isInvoiceableOrder } = await import("../invoicing/draft");
    expect(isInvoiceableOrder({ channel: "import", externalWooCommerceId: null })).toBe(false);
    expect(isInvoiceableOrder({ channel: "manual", externalWooCommerceId: "5215" })).toBe(false);
  });
});

describe("pojistka HTTP klienta iDokladu (bez sítě)", () => {
  it("odmítnuté přihlášení: kontrola ukáže kód chyby z iDokladu, nikdy přístupové údaje", async () => {
    const { runPreflightFromEnv } = await import("../invoicing/preflight");
    const env = { VERCEL_ENV: "production", IDOKLAD_ESHOP_SEQUENCE_ID: "7277293", IDOKLAD_ESHOP_CLIENT_ID: "tajne-id-123", IDOKLAD_ESHOP_CLIENT_SECRET: "tajny-secret-456", IDOKLAD_ESHOP_APPLICATION_ID: "tajna-app-789" };
    const reply = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    const firstCheck = async (fetchImpl: typeof fetch) => {
      const out = await runPreflightFromEnv(env, { fetchImpl });
      if (!out.ok) throw new Error(out.error);
      expect(out.result.ok).toBe(false);
      return out.result.checks[0];
    };
    const invalid = await firstCheck(
      reply(400, JSON.stringify({ error: "invalid_client", error_description: "client tajne-id-123 / tajny-secret-456 unknown" }))
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.detail).toContain("Přihlášení k iDokladu selhalo (400: invalid_client, client *** / *** unknown — neplatné Client ID nebo Client Secret");
    expect(invalid.detail).not.toMatch(/tajne-id-123|tajny-secret-456/);
    // bez JSON těla / s neznámým tvarem kódu jen stav
    expect((await firstCheck(reply(400, "Bad Request"))).detail).toContain("Přihlášení k iDokladu selhalo (400).");
    expect((await firstCheck(reply(400, JSON.stringify({ error: "<script>" })))).detail).toContain("selhalo (400).");
  });

  it("zakázané operace se zablokují ještě před odesláním", async () => {
    const { assertEshopIdokladRequest } = await import("../invoicing/idokladHttp");
    const base = "https://api.idoklad.cz/v3";
    const deny: [string, string][] = [
      ["DELETE", `${base}/IssuedInvoices/1`],
      ["PATCH", `${base}/IssuedInvoices`],
      ["POST", `${base}/Mails/IssuedInvoice/Send`],
      ["POST", `${base}/NumericSequences`],
      ["PATCH", `${base}/NumericSequences`],
      ["POST", `${base}/CreditNotes`],
      ["GET", `${base}/Webhooks`],
      ["PUT", `${base}/IssuedDocumentPayments/FullyUnpay/1`],
      ["POST", `${base}/IssuedInvoices?x=1`],
      ["GET", `${base}/Contacts/../Webhooks`],
      ["GET", "http://api.idoklad.cz/v3/Contacts"],
      ["GET", "https://evil.example/v3/Contacts"],
      ["POST", "https://identity.idoklad.cz/server/connect/authorize"],
    ];
    for (const [method, url] of deny) {
      expect(() => assertEshopIdokladRequest(method, url, true), `${method} ${url}`).toThrow(/zablokován/);
    }
    // povolené zápisy jen s otevřenou bránou
    expect(() => assertEshopIdokladRequest("POST", `${base}/IssuedInvoices`, false)).toThrow(/mimo ostrý provoz/);
    expect(() => assertEshopIdokladRequest("POST", `${base}/IssuedInvoices`, true)).not.toThrow();
    expect(() => assertEshopIdokladRequest("PUT", `${base}/IssuedDocumentPayments/FullyPay/5?dateOfPayment=2026-10-07+12%3A00%3A00.000`, true)).not.toThrow();
    expect(() => assertEshopIdokladRequest("GET", `${base}/Reports/IssuedInvoice/5/Pdf`, false)).not.toThrow();
  });

  it("klient s writesAllowed:true na Preview zápis stejně zablokuje — fetch se nezavolá", async () => {
    const { EshopIdokladClient } = await import("../invoicing/idokladHttp");
    const fetchImpl = vi.fn();
    const client = new EshopIdokladClient({
      clientId: "a",
      clientSecret: "b",
      applicationId: "c",
      writesAllowed: true,
      env: { VERCEL_ENV: "preview", IDOKLAD_INVOICING_ENABLED: "on", IDOKLAD_ESHOP_SEQUENCE_ID: "7277293", IDOKLAD_ESHOP_CLIENT_ID: "a", IDOKLAD_ESHOP_CLIENT_SECRET: "b", IDOKLAD_ESHOP_APPLICATION_ID: "c" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.post("/IssuedInvoices", {})).rejects.toThrow(/mimo ostrý provoz/);
    await expect(client.post("/Contacts", {})).rejects.toThrow(/mimo ostrý provoz/);
    await expect(client.put("/IssuedDocumentPayments/FullyPay/1")).rejects.toThrow(/mimo ostrý provoz/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
