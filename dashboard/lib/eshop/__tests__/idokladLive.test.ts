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
};
// Prostředí ostrého provozu — předává se výslovně jen do vystavení.
const LIVE = { ...ENV, VERCEL_ENV: "production", IDOKLAD_ESHOP_CLIENT_ID: "cid", IDOKLAD_ESHOP_CLIENT_SECRET: "csecret" };
const ACTOR = { type: "user" as const, userId: "admin-1", name: "Lucie Test" };

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
    expect(mail.sent[0].attachments).toEqual([{ filename: `faktura-${next.number}.pdf`, contentBase64: expect.any(String) }]);
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
        Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 758 }, body: {},
      });
    }
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/víc vydaných faktur/) });
    expect(fake.writes()).toEqual([]);
  });

  it("faktura s VS existuje v jiné řadě → nepřipojí se, stop k ruční kontrole", async () => {
    const { id, vs } = await order();
    const fake = createFakeIdoklad();
    fake.invoices.push({ Id: 300, DocumentNumber: "20260177", VariableSymbol: vs, NumericSequenceId: 2032369, PartnerId: 1, PaymentStatus: 0, Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 0 }, body: {} });
    expect(await issue.issueInvoice(db, id, { env: LIVE, fetchImpl: fake.fetchImpl })).toMatchObject({ status: "failed", error: expect.stringMatching(/není z řady E-shop Begina/) });
    expect(fake.writes()).toEqual([]);
    expect(await state(id)).toMatchObject({ external_id: null, doc_state: "draft" });
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
});

describe("pojistka HTTP klienta iDokladu (bez sítě)", () => {
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
      writesAllowed: true,
      env: { VERCEL_ENV: "preview", IDOKLAD_INVOICING_ENABLED: "on", IDOKLAD_ESHOP_SEQUENCE_ID: "7277293", IDOKLAD_ESHOP_CLIENT_ID: "a", IDOKLAD_ESHOP_CLIENT_SECRET: "b" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.post("/IssuedInvoices", {})).rejects.toThrow(/mimo ostrý provoz/);
    await expect(client.post("/Contacts", {})).rejects.toThrow(/mimo ostrý provoz/);
    await expect(client.put("/IssuedDocumentPayments/FullyPay/1")).rejects.toThrow(/mimo ostrý provoz/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
