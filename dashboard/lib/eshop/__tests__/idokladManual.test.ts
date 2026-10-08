// ESHOP 1.0 — B1 (přepínač off / manual / on) a B2 (preflight s Client
// Credentials) nad skutečnou datovou vrstvou MojeBegina (lib/data/orders.ts,
// ovladač Neonu → PGlite) a napodobeninou iDoklad API v3. Každý požadavek
// mimo testovací DB jde přes směrovač níže — skutečný iDoklad se nevolá
// nikdy, a požadavek na iDoklad bez připravené napodobeniny test shodí.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { EmailMessage } from "../email/resend";
import { createFakeIdoklad, BEGINA_CODEBOOKS } from "./helpers/fakeIdoklad";
import { invoicingMode, invoicingSwitch, liveInvoicingGate } from "../invoicing/mode";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "moje.begina.example", "x-forwarded-proto": "https" }),
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const auth = vi.hoisted(() => ({ userId: "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", role: "ADMIN" as "ADMIN" | "EXECUTIVE" }));
vi.mock("@/lib/data/authContext", () => ({
  getAuthContext: async () => ({
    userId: auth.userId,
    systemRole: auth.role,
    grantedRoles: [auth.role],
    roleSelectionRequired: false,
    name: "Jaroslav Test",
    email: "jaroslav@begina.test",
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

const BASE = {
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  E2E_ORDER_NUMBER_START: "900000",
  RESEND_API_KEY: "re_test_begina",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test",
  ESHOP_BANK_ACCOUNT: "19-2000145399/0800",
  ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399",
  // Production přístupové údaje a řada jsou nastavené VŠUDE — rozhoduje jen
  // prostředí a přepínač.
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "prod-client",
  IDOKLAD_ESHOP_CLIENT_SECRET: "prod-secret",
  IDOKLAD_ESHOP_APPLICATION_ID: "prod-app",
};
const PREVIEW = { ...BASE, VERCEL_ENV: "preview" };
// Production: e-maily naostro — Production je pošle jen s ESHOP_EMAIL_LIVE=on
// A ZÁROVEŇ ESHOP_ORDER_WRITE=on (lib/eshop/email/config.ts)
const PRODUCTION = { ...BASE, VERCEL_ENV: "production", ESHOP_EMAIL_LIVE: "on", ESHOP_ORDER_WRITE: "on" };

// ------------------------------------------------------------------ čisté jednotky

describe("B1 — přepínač IDOKLAD_INVOICING_ENABLED: tři jednoznačné stavy", () => {
  const prod = (value?: string) => ({ ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: value });

  it("chybí / off = jen návrh", () => {
    for (const value of [undefined, "", "off", " off "]) {
      expect(invoicingSwitch(prod(value)).value).toBe("off");
      expect(invoicingMode(prod(value))).toMatchObject({ mode: "dry_run", trigger: "off", automatic: false });
      expect(liveInvoicingGate(prod(value)).open).toBe(false);
    }
  });

  it("manual = ostrý provoz BEZ automatu; on = ostrý provoz s automatem", () => {
    expect(invoicingMode(prod("manual"))).toMatchObject({ mode: "live", trigger: "manual", automatic: false });
    expect(invoicingMode(prod("on"))).toMatchObject({ mode: "live", trigger: "on", automatic: true });
    expect(liveInvoicingGate(prod("manual"))).toMatchObject({ open: true, trigger: "manual", seriesId: "7277293" });
  });

  it("neplatná hodnota (překlep, velká písmena, yes) = off s důvodem", () => {
    for (const value of ["ON", "Manual", "yes", "true", "1", "manuál"]) {
      expect(invoicingMode(prod(value))).toMatchObject({ mode: "dry_run", automatic: false });
      expect(invoicingMode(prod(value)).reason).toMatch(/není platná hodnota/);
    }
  });

  it("Preview je VŽDY jen návrh — i s manual / on a Production přístupovými údaji", () => {
    for (const value of ["manual", "on"]) {
      for (const VERCEL_ENV of ["preview", "development", undefined, "Production"]) {
        const env = { ...PRODUCTION, VERCEL_ENV, IDOKLAD_INVOICING_ENABLED: value };
        expect(invoicingMode(env)).toMatchObject({ mode: "dry_run", automatic: false });
        expect(liveInvoicingGate(env).open).toBe(false);
      }
    }
  });
});

// ------------------------------------------------------------------ datová vrstva + DB

describe("B1 + B2 nad datovou vrstvou MojeBegina (PGlite, napodobenina iDokladu)", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let submitCheckoutAction: typeof import("@/app/eshop/pokladna/actions").submitCheckoutAction;
  let orders: typeof import("@/lib/data/orders");
  let issue: typeof import("../invoicing/issue");
  let preflight: typeof import("../invoicing/preflight");
  const saved = { ...process.env };
  const route = { fake: null as ReturnType<typeof createFakeIdoklad> | null, idoklad: [] as string[] };

  function setEnv(env: Record<string, string | undefined>) {
    for (const key of ["VERCEL_ENV", "IDOKLAD_INVOICING_ENABLED", "ESHOP_EMAIL_LIVE", "ESHOP_ORDER_WRITE"]) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

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
    issue = await import("../invoicing/issue");
    preflight = await import("../invoicing/preflight");
  }, 120_000);

  afterAll(() => {
    process.env = saved;
  });

  beforeEach(() => {
    mail.sent.length = 0;
    route.fake = null;
    route.idoklad.length = 0;
    auth.userId = VINER;
    auth.role = "ADMIN";
    setEnv(PREVIEW);
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

  /** Nová objednávka převodem (vždy v Preview, jako pokladna). */
  async function newOrder() {
    setEnv(PREVIEW);
    const id = randomUUID();
    const fields: Record<string, string> = {
      cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
      name: "Jana Nováková",
      email: `jana-${id.slice(0, 8)}@example.cz`,
      phone: "+420 777 123 456",
      shippingMethodId: "osobni-odber",
      paymentMethodId: "prevod",
      street: "",
      city: "",
      zip: "",
      note: "",
      termsAccepted: "on",
      orderToken: id,
      website: "",
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    await submitCheckoutAction(null, data);
    mail.sent.length = 0;
    return id;
  }

  /** Zapsání platby v MojeBegina (celá částka) v daném prostředí. */
  async function pay(id: string, env: Record<string, string | undefined>) {
    const [{ total_kc }] = await rows(sql`SELECT total_kc FROM orders WHERE id = ${id}`);
    setEnv(env);
    return orders.recordOrderPayment(id, { token: randomUUID(), amountKc: String(total_kc), date: today(), method: "bank_transfer", note: "" });
  }

  const linkState = async (id: string) =>
    (
      await rows(sql`
        SELECT i.doc_state, i.invoice_number, i.pdf_sent_at IS NOT NULL AS pdf_sent, l.state, l.external_id, l.last_error
        FROM invoices i JOIN invoice_provider_links l ON l.invoice_id = i.id AND l.state <> 'void'
        WHERE i.order_id = ${id} AND i.document_type = 'invoice'`)
    )[0];

  // ---------------------------------------------------------------- off

  it("off (Production, přepínač chybí): po platbě jen návrh, žádný požadavek na iDoklad, tlačítko nelze", async () => {
    const id = await newOrder();
    expect(await pay(id, PRODUCTION)).toMatchObject({ settled: true });
    expect(route.idoklad).toEqual([]);
    expect(await linkState(id)).toMatchObject({ doc_state: "draft", state: "dry_run" });
    expect(await orders.getInvoiceIssueAccess()).toMatchObject({ issuer: true, canIssue: false, mode: { mode: "dry_run" } });
    expect(await orders.issueOrderInvoice(id)).toEqual({ ok: false, error: expect.stringMatching(/není zapnuté/) });
    expect(route.idoklad).toEqual([]);
  });

  // ---------------------------------------------------------------- manual

  it("manual (Production): po platbě NIC automaticky; tlačítkem tentýž motor → faktura, uhrazeno, PDF e-mailem", async () => {
    const id = await newOrder();
    const MANUAL = { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" };
    expect(await pay(id, MANUAL)).toMatchObject({ settled: true });
    // žádné automatické vystavení — ani požadavek na token
    expect(route.idoklad).toEqual([]);
    expect(await linkState(id)).toMatchObject({ doc_state: "draft", state: "pending", external_id: null });
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^Platbu za objednávku \d+ jsme přijali$/)]);
    expect(mail.sent[0].attachments ?? []).toEqual([]);
    expect(await orders.getInvoiceIssueAccess()).toMatchObject({ issuer: true, canIssue: true, mode: { trigger: "manual", automatic: false } });

    mail.sent.length = 0;
    route.fake = createFakeIdoklad();
    const next = route.fake.next();
    const result = await orders.issueOrderInvoice(id);
    expect(result).toEqual({ ok: true, message: `Faktura ${next.number} je vystavená a uhrazená a odeslaná zákazníkovi.` });
    // preflight (jen čtení) proběhl celý PŘED prvním zápisem
    const calls = route.fake.apiCalls();
    const firstWrite = calls.findIndex((c) => c.method !== "GET");
    for (const path of ["/Account/CurrentAgenda", "/Currencies", "/Countries", "/PaymentOptions", "/NumericSequences", "/NumericSequences/DocumentNumbers/IssuedInvoice", "/IssuedInvoices/Default"]) {
      const index = calls.findIndex((c) => c.path === path);
      expect(index, path).toBeGreaterThanOrEqual(0);
      expect(index, path).toBeLessThan(firstWrite);
    }
    expect(route.fake.writes()).toEqual(["POST /Contacts", "POST /IssuedInvoices", `PUT /IssuedDocumentPayments/FullyPay/${next.id}`]);
    const post = route.fake.calls.find((c) => c.method === "POST" && c.path === "/IssuedInvoices")!.body as Record<string, unknown>;
    expect(post).toMatchObject({ NumericSequenceId: 7277293, CurrencyId: 1, PaymentOptionId: 1 });
    const contact = route.fake.calls.find((c) => c.method === "POST" && c.path === "/Contacts")!.body as Record<string, unknown>;
    expect(contact.CountryId).toBe(2);
    expect(await linkState(id)).toMatchObject({ doc_state: "issued", invoice_number: next.number, state: "issued", pdf_sent: true });
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^Faktura k objednávce \d+$/)]);
    expect(mail.sent[0].attachments?.[0].filename).toBe(`faktura-${next.number}.pdf`);
    // historie: kdo vystavil a v jakém režimu
    const [activity] = await rows(sql`SELECT author_user_id, metadata->>'trigger' AS trigger FROM order_activity WHERE order_id = ${id} AND kind = 'invoice_issued'`);
    expect(activity).toEqual({ author_user_id: VINER, trigger: "manual" });
  });

  it("manual: dvojklik / opakované kliknutí → jediná faktura, jediný e-mail", async () => {
    const id = await newOrder();
    const MANUAL = { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" };
    await pay(id, MANUAL);
    mail.sent.length = 0;
    route.fake = createFakeIdoklad();
    const [a, b] = await Promise.all([orders.issueOrderInvoice(id), orders.issueOrderInvoice(id)]);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.ok && /je vystavená a uhrazená/.test(o.message))).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toEqual(
      outcomes.filter((o) => !o.ok).map(() => ({ ok: false, error: expect.stringMatching(/právě vystavuje/) }))
    );
    const writesAfterDouble = route.fake.writes().length;
    // třetí kliknutí později
    expect(await orders.issueOrderInvoice(id)).toMatchObject({ ok: true, message: expect.stringMatching(/už je vystavená/) });
    expect(route.fake.writes()).toHaveLength(writesAfterDouble);
    expect(route.fake.invoices).toHaveLength(1);
    expect(route.fake.writes().filter((w) => w === "POST /IssuedInvoices")).toHaveLength(1);
    expect(mail.sent.filter((m) => /Faktura k objednávce/.test(m.subject))).toHaveLength(1);
  });

  it("manual: tlačítko smí jen oprávnění (Viner jako ADMIN, Königsbergová jako EXECUTIVE) — nikdo jiný", async () => {
    const id = await newOrder();
    await pay(id, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" });
    route.fake = createFakeIdoklad();
    for (const [userId, role] of [
      ["jiny-admin", "ADMIN"],
      ["jiny-executive", "EXECUTIVE"],
      [VINER, "EXECUTIVE"],
      [LUCIE, "ADMIN"],
    ] as const) {
      auth.userId = userId;
      auth.role = role;
      expect(await orders.getInvoiceIssueAccess()).toMatchObject({ issuer: false, canIssue: false });
      expect(await orders.issueOrderInvoice(id)).toEqual({ ok: false, error: expect.stringMatching(/smí vystavit jen/) });
      expect(await orders.runEshopIdokladPreflight()).toEqual({ ok: false, error: expect.stringMatching(/smí spustit jen/) });
    }
    expect(route.fake.calls).toEqual([]);
  });

  it("manual: Lucie Königsbergová (finanční ředitelka, EXECUTIVE) zvládne celý postup sama — objednávky, platba, faktura, kontrola iDokladu", async () => {
    const id = await newOrder();
    auth.userId = LUCIE;
    auth.role = "EXECUTIVE";
    // vidí objednávky a detail (včetně návrhu faktury) a zapíše platbu
    expect((await orders.listOrders()).orders.map((o) => o.id)).toContain(id);
    expect(await orders.getOrderDetail(id)).toMatchObject({ order: { id } });
    expect(await pay(id, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" })).toMatchObject({ ok: true, settled: true });
    const [payment] = await rows(sql`SELECT recorded_by_user_id FROM payments WHERE order_id = ${id}`);
    expect(payment).toEqual({ recorded_by_user_id: LUCIE });
    expect(await orders.getInvoiceIssueAccess()).toMatchObject({ issuer: true, canIssue: true });
    route.fake = createFakeIdoklad();
    expect(await orders.runEshopIdokladPreflight()).toMatchObject({ ok: true });
    expect(route.fake.writes()).toEqual([]);
    const next = route.fake.next();
    expect(await orders.issueOrderInvoice(id)).toEqual({ ok: true, message: `Faktura ${next.number} je vystavená a uhrazená a odeslaná zákazníkovi.` });
    const [activity] = await rows(sql`SELECT author_user_id FROM order_activity WHERE order_id = ${id} AND kind = 'invoice_issued'`);
    expect(activity).toEqual({ author_user_id: LUCIE });
  });

  it("manual: stornovanou objednávku (i zaplacenou) nejde vyfakturovat — iDoklad nedostane nic", async () => {
    const id = await newOrder();
    await pay(id, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" });
    expect(await orders.updateFulfillmentStatus(id, "cancelled")).toMatchObject({ ok: true, changed: true, cancellation: { refundHal: expect.any(Number) } });
    route.fake = createFakeIdoklad();
    expect(await orders.issueOrderInvoice(id)).toEqual({ ok: false, error: "Objednávka je stornovaná — faktura se nevystaví." });
    expect(route.fake.calls).toEqual([]);
  });

  // ---------------------------------------------------------------- on

  it("on (Production): po platbě automaticky tentýž motor — faktura i PDF v „Platbu jsme přijali“", async () => {
    const id = await newOrder();
    route.fake = createFakeIdoklad();
    const next = route.fake.next();
    await pay(id, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "on" });
    expect(await linkState(id)).toMatchObject({ doc_state: "issued", invoice_number: next.number, pdf_sent: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toMatch(/jsme přijali$/);
    expect(mail.sent[0].attachments?.[0].filename).toBe(`faktura-${next.number}.pdf`);
    const [activity] = await rows(sql`SELECT metadata->>'trigger' AS trigger FROM order_activity WHERE order_id = ${id} AND kind = 'invoice_issued'`);
    expect(activity.trigger).toBe("on");
  });

  it("kontakt iDokladu už patří jinému zákazníkovi MojeBegina → vystavení přesto projde (vazba je jen zkratka)", async () => {
    const id = await newOrder();
    await pay(id, PRODUCTION);
    const [{ contact_email }] = await rows(sql`SELECT contact_email FROM orders WHERE id = ${id}`);
    route.fake = createFakeIdoklad();
    route.fake.contacts.push({ Id: 5555, Email: contact_email, CompanyName: "Firma se stejným e-mailem", IdentificationNumber: "12345678" });
    const [other] = await rows(sql`
      INSERT INTO invoice_customers (kind, ico, email_normalized, name) VALUES ('company', '12345678', NULL, 'Firma') RETURNING id`);
    await rows(sql`INSERT INTO invoice_customer_refs (customer_id, provider, external_id) VALUES (${other.id}, 'idoklad', '5555')`);
    const result = await issue.issueInvoice(db, id, { env: { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" }, fetchImpl: route.fake.fetchImpl });
    expect(result).toMatchObject({ status: "issued" });
    expect(route.fake.invoices.at(-1)?.PartnerId).toBe(5555);
    expect(route.fake.writes().filter((w) => w === "POST /Contacts")).toEqual([]);
  });

  // ---------------------------------------------------------------- Preview

  for (const value of ["manual", "on"]) {
    it(`Preview + ${value}: žádný požadavek na iDoklad (ani token), tlačítko nelze, akce i motor odmítnou`, async () => {
      const id = await newOrder();
      const env = { ...PREVIEW, IDOKLAD_INVOICING_ENABLED: value };
      expect(await pay(id, env)).toMatchObject({ settled: true });
      expect(await orders.getInvoiceIssueAccess()).toMatchObject({ issuer: true, canIssue: false, mode: { mode: "dry_run" } });
      expect(await orders.issueOrderInvoice(id)).toEqual({ ok: false, error: expect.stringMatching(/Preview/) });
      // i přímé volání motoru s Production údaji v prostředí Preview
      expect(await issue.issueInvoice(db, id, { env })).toMatchObject({ status: "skipped", reason: expect.stringMatching(/Preview/) });
      const { issueAndSendInvoice } = await import("../invoicing/afterPaid");
      expect(await issueAndSendInvoice(db, id, "https://x", { type: "user", userId: VINER, name: "J" }, { env })).toMatchObject({
        status: "skipped",
      });
      expect(route.idoklad).toEqual([]);
      expect(await linkState(id)).toMatchObject({ doc_state: "draft", state: "dry_run", external_id: null });
    });
  }

  // ---------------------------------------------------------------- B2: Client Credentials + preflight

  it("selhání Client Credentials: manual → nic se nezapíše, faktura NENÍ vystavená, důvod v MojeBegina", async () => {
    const id = await newOrder();
    await pay(id, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" });
    route.fake = createFakeIdoklad({ tokenStatus: 401 });
    const result = await orders.issueOrderInvoice(id);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Přihlášení \(Client Credentials\): Přihlášení k iDokladu selhalo \(401: invalid_client/) });
    expect(route.fake.writes()).toEqual([]);
    expect(route.fake.apiCalls()).toEqual([]);
    expect(await linkState(id)).toMatchObject({ doc_state: "draft", state: "failed", external_id: null, last_error: expect.stringMatching(/neprošla/) });
    // ruční kontrola ukáže totéž
    const check = await orders.runEshopIdokladPreflight();
    expect(check.ok && check.result.ok).toBe(false);
    if (check.ok) {
      expect(check.result.checks[0]).toMatchObject({ key: "auth", ok: false });
      expect(check.result.checks.slice(1).every((c) => !c.ok && /Neověřeno/.test(c.detail))).toBe(true);
    }
  });

  it("preflight (ruční kontrola): jen GET + token, všechny kontroly s hodnotami agendy Begina", async () => {
    route.fake = createFakeIdoklad();
    for (const env of [PRODUCTION, { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" }, PREVIEW]) {
      setEnv(env);
      route.fake.calls.length = 0;
      const outcome = await orders.runEshopIdokladPreflight();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.result.ok).toBe(true);
      expect(Object.fromEntries(outcome.result.checks.map((c) => [c.key, c.ok]))).toEqual({
        auth: true, agenda: true, vat: true, currency: true, country: true,
        payment_bank_transfer: true, payment_card: true, payment_cash: true,
        series: true, next_number: true, pricing: true,
      });
      const detail = Object.fromEntries(outcome.result.checks.map((c) => [c.key, c.detail]));
      expect(detail.currency).toBe("ID 1");
      expect(detail.country).toBe("ID 2");
      expect(detail.payment_bank_transfer).toBe("„Bank transfer“ ID 1");
      expect(detail.payment_card).toBe("„Credit card“ ID 2");
      expect(detail.payment_cash).toBe("„Cash“ ID 3 (vyloučeno: „Cash on delivery“ ID 4)");
      expect(detail.pricing).toMatch(/^WithoutVat \(1\)/);
      expect(detail.next_number).toMatch(/^926\d{4} /);
      // jen čtení: kromě žádosti o token nic než GET
      expect(route.fake.calls.filter((c) => c.path !== "TOKEN").every((c) => c.method === "GET")).toBe(true);
      expect(route.fake.writes()).toEqual([]);
      // token request přesně jako oficiální SDK 5.4.0 (ClientCredentialsTokenRequest)
      expect(route.fake.calls.filter((c) => c.path === "TOKEN").map((c) => c.body)).toEqual([
        ["grant_type", "application_id", "client_id", "client_secret", "scope"],
      ]);
    }
  });

  it("regrese 8. 10. 2026: bez IDOKLAD_ESHOP_APPLICATION_ID nic nevolá a řekne, co chybí; brána zůstane zavřená", async () => {
    route.fake = createFakeIdoklad();
    for (const missing of ["", "   ", undefined]) {
      const env = { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual", IDOKLAD_ESHOP_APPLICATION_ID: missing };
      setEnv(env);
      if (missing === undefined) delete process.env.IDOKLAD_ESHOP_APPLICATION_ID;
      const outcome = await orders.runEshopIdokladPreflight();
      expect(outcome).toEqual({ ok: false, error: expect.stringContaining("Chybí přístupové údaje k iDokladu (IDOKLAD_ESHOP_APPLICATION_ID)") });
      expect(route.fake.calls).toEqual([]);
      expect(liveInvoicingGate(env)).toEqual({ open: false, reason: expect.stringContaining("IDOKLAD_ESHOP_APPLICATION_ID") });
      expect(invoicingMode(env)).toMatchObject({ mode: "dry_run", automatic: false });
    }
    process.env.IDOKLAD_ESHOP_APPLICATION_ID = BASE.IDOKLAD_ESHOP_APPLICATION_ID;
  });

  it("identity server bez application_id odmítne (400 invalid_request) — kontrola to ukáže a dál nic nevolá", async () => {
    const { EshopIdokladClient } = await import("../invoicing/idokladHttp");
    const { runIdokladPreflight } = await import("../invoicing/preflight");
    route.fake = createFakeIdoklad();
    // klient se starým tvarem požadavku (bez application_id) — napodobenina SDK serveru ho odmítne
    const legacyFetch: typeof fetch = async (input, init) => {
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (String(input).includes("identity.idoklad.cz")) form.delete("application_id");
      return route.fake!.fetchImpl(input, { ...init, body: String(input).includes("identity.idoklad.cz") ? form.toString() : init?.body });
    };
    const client = new EshopIdokladClient({ clientId: "id", clientSecret: "secret", applicationId: "app", writesAllowed: false, env: PRODUCTION, fetchImpl: legacyFetch });
    const result = await runIdokladPreflight(client, { seriesId: "7277293", day: "2026-10-08" });
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ key: "auth", ok: false });
    expect(result.checks[0].detail).toContain("Přihlášení k iDokladu selhalo (400: invalid_request — iDoklad odmítl tvar požadavku)");
    expect(route.fake.calls.filter((c) => c.path !== "TOKEN")).toEqual([]);
  });

  it("preflight bez přístupových údajů nic nevolá", async () => {
    setEnv({ ...PRODUCTION, IDOKLAD_ESHOP_CLIENT_SECRET: undefined });
    delete process.env.IDOKLAD_ESHOP_CLIENT_SECRET;
    expect(await orders.runEshopIdokladPreflight()).toEqual({ ok: false, error: expect.stringMatching(/Chybí přístupové údaje/) });
    expect(route.idoklad).toEqual([]);
    process.env.IDOKLAD_ESHOP_CLIENT_SECRET = BASE.IDOKLAD_ESHOP_CLIENT_SECRET;
  });

  // Každá kritická kontrola = zákaz vystavení (ne varování).
  const critical: [string, Parameters<typeof createFakeIdoklad>[0], RegExp][] = [
    ["chybí CZK", { currencies: [{ Id: 2, Code: "EUR", Name: "Euro" }] }, /Měna CZK: Nalezeno 0/],
    ["chybí CZ", { countries: [{ Id: 3, Code: "SK", Name: "Slovensko" }] }, /Česká republika \(CZ\): Nalezeno 0/],
    [
      "převod nejednoznačný",
      { paymentOptions: [...BEGINA_CODEBOOKS.paymentOptions, { Id: 9, Name: "Bank transfer EUR", Code: "BE", IsDefault: false }] },
      /převodem \(Bank transfer\): Nalezeno 2/,
    ],
    [
      "jen dobírka, žádná hotovost",
      { paymentOptions: BEGINA_CODEBOOKS.paymentOptions.filter((o) => o.Name !== "Cash") },
      /hotově \(Cash, ne dobírka\): Nalezeno 0.*vyloučeno: „Cash on delivery“/,
    ],
    ["chybí karta (i když objednávka je převodem)", { paymentOptions: BEGINA_CODEBOOKS.paymentOptions.filter((o) => o.Name !== "Credit card") }, /kartou \(Credit card\): Nalezeno 0/],
    ["další číslo ve špatném formátu", { nextNumber: { DocumentNumber: "E2026001", DocumentSerialNumber: 1, NumericSequenceId: 7277293 } }, /neodpovídá formátu/],
    ["další číslo z jiné řady", { nextNumber: { DocumentNumber: "9260001", DocumentSerialNumber: 1, NumericSequenceId: 2032369 } }, /nevrátil další číslo/],
    ["plátce DPH", { vatPayer: true }, /Neplátce DPH: Agenda je vedená jako plátce/],
    ["cizí agenda", { ico: "12345678" }, /není to Begina/],
  ];
  for (const [label, options, message] of critical) {
    it(`kritická kontrola selže → faktura se nevystaví, nic se nezapíše: ${label}`, async () => {
      const id = await newOrder();
      await pay(id, PRODUCTION); // zaplaceno při vypnuté fakturaci
      route.fake = createFakeIdoklad(options);
      const result = await issue.issueInvoice(db, id, { env: { ...PRODUCTION, IDOKLAD_INVOICING_ENABLED: "manual" }, fetchImpl: route.fake.fetchImpl });
      expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(message) });
      expect(route.fake.writes()).toEqual([]);
      expect(await linkState(id)).toMatchObject({ doc_state: "draft", state: "failed", external_id: null });
      // ruční kontrola to vidí stejně (ok = false)
      const direct = await preflight.runPreflightFromEnv({ ...PRODUCTION }, { fetchImpl: route.fake.fetchImpl });
      expect(direct.ok && direct.result.ok).toBe(false);
    });
  }
});
