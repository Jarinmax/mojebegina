// Čtení iDokladu přes MojeBegina (lib/idoklad-read) — společné jádro pro UI,
// ChatGPT (Lucy) i Claude. Nad skutečnou DB (ovladač Neonu → PGlite se
// všemi migracemi) a nad napodobeninou iDoklad API v3 (jen GET).
// Cílový test: oba asistenti nezávisle načtou fakturu 9260001 a audit
// číslování 2026; každé volání má auditní záznam; nic se nezapisuje.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: async () => auth.ctx }));

const JAROSLAV = { userId: "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "j@begina.test" };
const LUCIE = { userId: "f9f93f03-92b0-4724-becd-c0a3576b5275", systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Lucie Königsbergová", email: "l@begina.test" };
const SALES = { ...LUCIE, userId: "11111111-2222-4333-8444-555555555555", name: "Obchodník" };

const ENV = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-test.neon.tech/neondb",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "cid-secret-value",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret-secret-value",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp-secret-value",
  IDOKLAD_READ_CHANNELS: "mcp:chatgpt, mcp:claude",
};
const NOW = new Date("2026-10-23T08:00:00Z");
const LUCIE_SERIES = 2032369;
const ESHOP_SERIES = 7277293;

type Inv = Record<string, unknown> & { Id: number; DocumentNumber: string; seq: number };
const company = (name: string, ico: string, dic: string | null, street: string, city: string, zip: string) => ({
  NickName: name, IdentificationNumber: ico, VatIdentificationNumber: dic, Street: street, City: city, PostalCode: zip,
  Email: "fakturace@firma.example", Phone: "+420 600 000 000", AccountNumber: "123456789/0100",
});
const person = (first: string, last: string, street: string, city: string) => ({
  Firstname: first, Surname: last, NickName: null, IdentificationNumber: null, Street: street, City: city, PostalCode: "11000",
  Email: "soukrome@email.example", Phone: "+420 777 000 000",
});
const INVOICES: Inv[] = [
  {
    seq: ESHOP_SERIES, Id: 67077149, DocumentNumber: "9260001", VariableSymbol: "5215", OrderNumber: "5215", Description: "Objednávka 5215 (begina.cz)",
    DateOfIssue: "2026-10-19T00:00:00", DateOfTaxing: "2026-10-19T00:00:00", DateOfMaturity: "2026-10-19T00:00:00", DateOfPayment: "2026-10-19T00:00:00",
    PaymentStatus: 1, Prices: { TotalWithVat: 12647, TotalPaid: 12647 },
    PartnerAddress: company("Food Fest Crew s.r.o.", "08911088", "CZ08911088", "Pasohlávky 251", "Pasohlávky", "69122"),
    Items: [
      { Name: "Dýňová polévka", Amount: 30, Unit: "ks", UnitPrice: 379, Prices: { TotalWithVat: 11370 } },
      { Name: "Doprava: Chlazená přeprava", Amount: 1, Unit: null, UnitPrice: 1277, Prices: { TotalWithVat: 1277 } },
    ],
    Metadata: { DateCreated: "2026-10-20T10:13:30.687", DateLastChange: "2026-10-20T10:13:32.100" },
  },
  {
    seq: LUCIE_SERIES, Id: 1190, DocumentNumber: "20260190", VariableSymbol: "20260190",
    DateOfIssue: "2026-10-16T00:00:00", DateOfTaxing: "2026-10-16T00:00:00", DateOfMaturity: "2026-10-19T00:00:00", DateOfPayment: "2026-10-18T00:00:00",
    PaymentStatus: 1, Prices: { TotalWithVat: 1348, TotalPaid: 1348 }, PartnerAddress: company("Logistic areal Kralupy EU, s.r.o.", "12345678", null, "Průmyslová 1", "Kralupy", "27801"),
    Metadata: { DateCreated: "2026-10-16T20:25:39.777", DateLastChange: "2026-10-18T08:00:00" },
  },
  {
    seq: LUCIE_SERIES, Id: 1191, DocumentNumber: "20260191", VariableSymbol: "20260191",
    DateOfIssue: "2026-10-15T00:00:00", DateOfTaxing: "2026-10-15T00:00:00", DateOfMaturity: "2026-10-15T00:00:00", DateOfPayment: "2026-10-15T00:00:00",
    PaymentStatus: 1, Prices: { TotalWithVat: 1400, TotalPaid: 1400 }, PartnerAddress: person("Karolína", "Pospíšilová", "Tajná 12", "Praha"),
    Metadata: { DateCreated: "2026-10-20T09:14:51.193", DateLastChange: "2026-10-20T09:14:51.193" },
  },
  {
    seq: LUCIE_SERIES, Id: 1192, DocumentNumber: "20260192", VariableSymbol: "20260192",
    DateOfIssue: "2026-10-22T00:00:00", DateOfTaxing: "2026-10-22T00:00:00", DateOfMaturity: "2026-11-05T00:00:00", DateOfPayment: "1753-01-01T00:00:00",
    PaymentStatus: 0, Prices: { TotalWithVat: 2274, TotalPaid: 0 }, PartnerAddress: person("Milan", "Kašpárek", "Domácí 5", "Brno"),
    Metadata: { DateCreated: "2026-10-21T22:36:52.227", DateLastChange: "2026-10-21T22:36:52.227" },
  },
  {
    seq: LUCIE_SERIES, Id: 1150, DocumentNumber: "20260150", VariableSymbol: "20260150",
    DateOfIssue: "2026-09-20T00:00:00", DateOfTaxing: "2026-09-20T00:00:00", DateOfMaturity: "2026-10-01T00:00:00", DateOfPayment: "1753-01-01T00:00:00",
    PaymentStatus: 0, Prices: { TotalWithVat: 990, TotalPaid: 0 }, PartnerAddress: company("Kavárna u Lípy s.r.o.", "87654321", null, "Lipová 3", "Kolín", "28002"),
    Metadata: { DateCreated: "2026-09-20T07:00:00", DateLastChange: "2026-09-20T07:00:00" },
  },
];

function fakeIdoklad() {
  const calls: { method: string; path: string; filter: string | null }[] = [];
  const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
  // jako skutečné API: bez NumericSequenceId
  const view = (inv: Inv) => Object.fromEntries(Object.entries(inv).filter(([key]) => key !== "seq"));
  const value = (filter: string, prop: string) => new RegExp(`(?:^|\\()${prop}~eq~([^()]+?)(?:\\)|$)`).exec(filter)?.[1] ?? null;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "token-xyz", expires_in: 3600 }), { status: 200 });
    const path = url.pathname.replace(/^\/v3/, "");
    const filter = url.searchParams.get("filter") ?? "";
    calls.push({ method, path, filter: filter || null });
    if (method !== "GET") return new Response("{}", { status: 405 });
    if (path === "/Account/CurrentAgenda") return ok({ Contact: { IdentificationNumber: "74337297" } });
    if (path === "/NumericSequences") {
      return ok({
        Items: [
          { Id: LUCIE_SERIES, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" },
          { Id: ESHOP_SERIES, Name: "E-shop Begina", DocumentType: 0, IsDefault: false, NumberFormat: "9{RR}{NNNN}" },
        ],
        TotalItems: 2,
        TotalPages: 1,
      });
    }
    if (path === "/Contacts") {
      const ico = value(filter, "IdentificationNumber");
      const items = ico === "08911088" ? [{ Id: 4242, IdentificationNumber: "08911088" }] : [];
      return ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
    }
    if (path === "/IssuedInvoices") {
      const since = /DateOfIssue~gte~(\d{4}-\d{2}-\d{2})/.exec(filter)?.[1] ?? null;
      const number = value(filter, "DocumentNumber");
      const id = value(filter, "Id");
      const seq = value(filter, "NumericSequenceId");
      const partner = value(filter, "PartnerId");
      const items = INVOICES.filter((i) => !number || i.DocumentNumber === number)
        .filter((i) => !id || String(i.Id) === id)
        .filter((i) => !seq || String(i.seq) === seq)
        .filter((i) => !partner || (partner === "4242" && i.DocumentNumber === "9260001"))
        .filter((i) => !since || String(i.DateOfIssue).slice(0, 10) >= since)
        .map(view);
      return ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
    }
    const m = /^\/IssuedInvoices\/(\d+)$/.exec(path);
    if (m) {
      const inv = INVOICES.find((i) => String(i.Id) === m[1]);
      return inv ? ok(view(inv)) : new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: "Not found" }), { status: 404 });
    }
    return new Response("{}", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("čtení iDokladu přes MojeBegina (ChatGPT / Claude / UI)", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let read: typeof import("../tools");
  const saved = { ...process.env };
  const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows;
  const logRows = () => rows(sql`SELECT user_id, channel, tool, args, status, result_count, idoklad_requests, error FROM idoklad_read_log ORDER BY created_at, id`);

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    read = await import("../tools");
  }, 120_000);
  afterAll(() => {
    process.env = saved;
  });
  beforeEach(async () => {
    auth.ctx = LUCIE;
    await rows(sql`DELETE FROM idoklad_read_log`);
  });

  const run = (tool: string, args: unknown, channel: "ui" | `mcp:${string}`, fetchImpl: typeof fetch, env = ENV) =>
    read.runIdokladRead(tool, args, channel, { db, env, fetchImpl, now: NOW });

  it("cílový test: Lucy (ChatGPT) i Claude nezávisle načtou fakturu 9260001 — řada, data, položky, vytvoření v pražském čase", async () => {
    for (const [channel, who] of [["mcp:chatgpt", LUCIE], ["mcp:claude", JAROSLAV]] as const) {
      auth.ctx = who;
      const { fetchImpl, calls } = fakeIdoklad();
      const out = await run("idoklad_get_invoice", { number: "9260001" }, channel, fetchImpl);
      if (!out.ok) throw new Error(out.error);
      const invoice = (out.data as { invoice: Record<string, unknown> }).invoice;
      expect(invoice).toMatchObject({
        id: 67077149,
        number: "9260001",
        series: { id: ESHOP_SERIES, name: "E-shop Begina", resolvedBy: "idoklad" },
        variableSymbol: "5215",
        orderNumber: "5215",
        partner: { kind: "company", name: "Food Fest Crew s.r.o.", ico: "08911088", city: "Pasohlávky" },
        partnerAddress: { street: "Pasohlávky 251", postalCode: "69122", city: "Pasohlávky", dic: "CZ08911088" },
        totalKc: 12647,
        paidKc: 12647,
        payment: "paid",
        dateOfIssue: "2026-10-19",
        dateOfTaxing: "2026-10-19",
        dateOfMaturity: "2026-10-19",
        dateOfPayment: "2026-10-19",
        createdPrague: "2026-10-20 12:13:30",
        createdUtc: "2026-10-20T10:13:30.687Z",
        createdDaysAfterIssue: 1,
        lastChangePrague: "2026-10-20 12:13:32",
      });
      expect(invoice.items).toEqual([
        { name: "Dýňová polévka", amount: 30, unit: "ks", unitPriceKc: 379, totalKc: 11370 },
        { name: "Doprava: Chlazená přeprava", amount: 1, unit: null, unitPriceKc: 1277, totalKc: 1277 },
      ]);
      // ochrana údajů a tajemství: bez e-mailu, telefonu, účtu, tokenu a přístupových údajů
      expect(JSON.stringify(out)).not.toMatch(/fakturace@|\+420|123456789|token-xyz|secret-value/);
      // jen čtení
      expect(calls.every((c) => c.method === "GET")).toBe(true);
    }
    expect(await logRows()).toEqual([
      { user_id: LUCIE.userId, channel: "mcp:chatgpt", tool: "idoklad_get_invoice", args: { number: "9260001" }, status: "ok", result_count: 1, idoklad_requests: expect.any(Number), error: null },
      { user_id: JAROSLAV.userId, channel: "mcp:claude", tool: "idoklad_get_invoice", args: { number: "9260001" }, status: "ok", result_count: 1, idoklad_requests: expect.any(Number), error: null },
    ]);
  });

  it("cílový test: audit číslování 2026 — strukturovaný výsledek, pražský čas, 1753-01-01 = bez úhrady", async () => {
    for (const channel of ["mcp:chatgpt", "mcp:claude", "ui"] as const) {
      const { fetchImpl } = fakeIdoklad();
      const out = await run("idoklad_numbering_audit", { year: "2026", numbers: ["9260001", "20260191", "20260192"] }, channel, fetchImpl);
      if (!out.ok) throw new Error(out.error);
      const data = out.data as { series: { id: number; count: number }[]; findings: { level: string; message: string }[]; focus: { number: string; document: Record<string, unknown> }[] };
      expect(data.series.map((s) => [s.id, s.count])).toEqual([[LUCIE_SERIES, 4], [ESHOP_SERIES, 1]]);
      expect(data.findings.map((f) => f.message)).toEqual(
        expect.arrayContaining([
          "20260191: datum vystavení 2026-10-15, ale v iDokladu vznikl až 2026-10-20 11:14:51 pražského času (o 5 dní později).",
          "9260001: datum vystavení 2026-10-19, ale v iDokladu vznikl až 2026-10-20 12:13:30 pražského času (o 1 den později).",
        ])
      );
      expect(data.findings.some((f) => f.message.startsWith("20260192"))).toBe(false); // 0:36 v Praze = týž den
      expect(data.focus.find((f) => f.number === "20260192")!.document).toMatchObject({ dateOfPayment: null, paid: false });
      expect(out.summary).toMatchObject({ errors: 0 });
      expect("requests" in data).toBe(false);
    }
    expect((await logRows()).map((r: { channel: string; status: string }) => `${r.channel} ${r.status}`)).toEqual(["mcp:chatgpt ok", "mcp:claude ok", "ui ok"]);
  });

  it("hledání: číslo, IČO, zákazník v období (bez diakritiky), jen neuhrazené; jméno zákazníka se do auditu neukládá", async () => {
    const { fetchImpl } = fakeIdoklad();
    const byIco = await run("idoklad_search_invoices", { ico: "08911088" }, "mcp:chatgpt", fetchImpl);
    if (!byIco.ok) throw new Error(byIco.error);
    expect((byIco.data.invoices as { number: string; series: unknown }[]).map((i) => [i.number, i.series])).toEqual([
      ["9260001", { id: ESHOP_SERIES, name: "E-shop Begina", resolvedBy: "format" }],
    ]);

    // VS / zákazník bez období = neplatné, do iDokladu nic
    const noPeriod = await run("idoklad_search_invoices", { customer: "kasparek" }, "mcp:chatgpt", fetchImpl);
    expect(noPeriod).toMatchObject({ ok: false, status: "error", error: expect.stringMatching(/potřebuje období/) });

    const byName = await run("idoklad_search_invoices", { customer: "kasparek", date_from: "2026-10-01", unpaid_only: true }, "mcp:chatgpt", fetchImpl);
    if (!byName.ok) throw new Error(byName.error);
    expect(byName.data.invoices).toEqual([
      expect.objectContaining({
        number: "20260192",
        partner: { kind: "person", name: "Milan Kašpárek", ico: null, city: "Brno" },
        payment: "unpaid",
        dateOfPayment: null,
        createdPrague: "2026-10-22 00:36:52",
        createdDaysAfterIssue: 0,
      }),
    ]);
    // u soukromé osoby žádná ulice ani kontakt
    expect(JSON.stringify(byName.data)).not.toMatch(/Domácí|soukrome@|\+420/);

    const byVs = await run("idoklad_search_invoices", { variable_symbol: "5215", date_from: "2026-10-01" }, "mcp:claude", fetchImpl);
    if (!byVs.ok) throw new Error(byVs.error);
    expect((byVs.data.invoices as { number: string }[]).map((i) => i.number)).toEqual(["9260001"]);

    const log = await logRows();
    expect(log.map((r: { status: string }) => r.status)).toEqual(["ok", "error", "ok", "ok"]);
    expect(log[2].args).toEqual({ customer_length: 8, date_from: "2026-10-01", unpaid_only: true });
    expect(JSON.stringify(log)).not.toMatch(/kasparek/i);
  });

  it("neuhrazené a nesrovnalosti: po splatnosti první, zpětně vystavené v pražském čase, nesoulad s MojeBegina", async () => {
    const { fetchImpl } = fakeIdoklad();
    const out = await run("idoklad_unpaid_and_discrepancies", { date_from: "2026-09-01" }, "mcp:claude", fetchImpl);
    if (!out.ok) throw new Error(out.error);
    const data = out.data as { unpaid: { number: string; overdueDays: number | null }[]; discrepancies: { kind: string; number: string }[] };
    expect(data.unpaid.map((u) => [u.number, u.overdueDays])).toEqual([["20260150", 22], ["20260192", null]]);
    expect(data.discrepancies.map((d) => `${d.kind} ${d.number}`)).toEqual(["backdated 9260001", "backdated 20260191"]);

    // nesoulad s fakturami vystavenými z MojeBegina (čistá funkce)
    const { unpaidAndDiscrepancies } = await import("../service");
    const reader = new (await import("@/lib/eshop/invoicing/idokladHttp")).EshopIdokladClient({
      clientId: "a", clientSecret: "b", applicationId: "c", writesAllowed: false, env: ENV, fetchImpl: fakeIdoklad().fetchImpl,
    });
    const mismatch = await unpaidAndDiscrepancies(
      reader,
      { dateFrom: "2026-09-01", mojeBegina: [{ number: "9260001", totalKc: 12000, paid: true, orderUrlPath: null }, { number: "9260002", totalKc: 100, paid: true, orderUrlPath: null }] },
      NOW
    );
    expect(mismatch.discrepancies.filter((d) => d.kind !== "backdated").map((d) => d.message)).toEqual([
      "9260001: MojeBegina 12000 Kč, iDoklad 12647 Kč.",
      "9260002: vystavená z MojeBegina, v iDokladu od 2026-09-01 nenalezena.",
    ]);
  });

  it("číselné řady: seznam, počty a kontrola číslování (bez datování)", async () => {
    const { fetchImpl } = fakeIdoklad();
    const out = await run("idoklad_list_series", { year: "2026" }, "mcp:chatgpt", fetchImpl);
    if (!out.ok) throw new Error(out.error);
    const data = out.data as { series: { name: string; first: string; last: string }[]; numbering: { message: string }[] };
    expect(data.series.map((s) => `${s.name} ${s.first}–${s.last}`)).toEqual(["Výchozí 20260150–20260192", "E-shop Begina 9260001–9260001"]);
    // ukázková data mají mezeru 20260150 → 20260190; zpětné datování sem nepatří
    expect(data.numbering.map((f) => f.message)).toEqual(["Mezi 20260150 a 20260190 chybí 39 čísel (smazaný nebo nevystavený doklad?)."]);
  });

  it("přístup: nepovolený kanál, cizí osoba, nepřihlášený → odmítnuto, do iDokladu nic, zapsáno v auditu", async () => {
    const { fetchImpl, calls } = fakeIdoklad();
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "mcp:jiny", fetchImpl)).toMatchObject({ ok: false, status: "denied" });
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "mcp:claude", fetchImpl, { ...ENV, IDOKLAD_READ_CHANNELS: "mcp:chatgpt" })).toMatchObject({ ok: false, status: "denied" });
    auth.ctx = SALES;
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "ui", fetchImpl)).toMatchObject({ ok: false, status: "denied", error: expect.stringMatching(/jen Jaroslav Viner a Lucie/) });
    auth.ctx = { ...LUCIE, systemRole: "CUSTOMER" }; // Lucie bez aktivní role vedení
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "ui", fetchImpl)).toMatchObject({ ok: false, status: "denied" });
    auth.ctx = null;
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "mcp:chatgpt", fetchImpl)).toMatchObject({ ok: false, status: "denied" });
    expect(calls).toEqual([]);
    expect((await logRows()).map((r: { user_id: string; status: string }) => `${r.status} ${r.user_id === "anonymous" ? "anonymous" : "user"}`)).toEqual([
      "denied user", "denied user", "denied user", "denied user", "denied anonymous",
    ]);
  });

  it("neplatné argumenty a neznámý nástroj → invalid; žádný nástroj pro zápis neexistuje", async () => {
    const { fetchImpl, calls } = fakeIdoklad();
    expect(await run("idoklad_get_invoice", { number: "9260001", PaymentStatus: 1 }, "ui", fetchImpl)).toMatchObject({ ok: false, status: "invalid", error: expect.stringMatching(/Neznámé parametry: PaymentStatus/) });
    expect(await run("idoklad_search_invoices", { ico: "123" }, "ui", fetchImpl)).toMatchObject({ ok: false, status: "invalid" });
    expect(await run("idoklad_issue_invoice", {}, "ui", fetchImpl)).toMatchObject({ ok: false, status: "invalid", error: "Neznámý nástroj idoklad_issue_invoice." });
    expect(calls).toEqual([]);
    expect(read.IDOKLAD_READ_TOOLS.map((t) => t.name)).toEqual([
      "idoklad_search_invoices", "idoklad_get_invoice", "idoklad_list_series", "idoklad_numbering_audit", "idoklad_unpaid_and_discrepancies",
    ]);
  });

  it("limit: po 20 voláních za minutu → rate_limited bez dotazu do iDokladu", async () => {
    await rows(sql`INSERT INTO idoklad_read_log (user_id, channel, tool, args, status, created_at)
      SELECT ${LUCIE.userId}, 'mcp:chatgpt', 'idoklad_get_invoice', '{}'::jsonb, 'ok', ${NOW.toISOString()}::timestamptz - interval '10 seconds' FROM generate_series(1, 20)`);
    const { fetchImpl, calls } = fakeIdoklad();
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "mcp:chatgpt", fetchImpl)).toMatchObject({ ok: false, status: "rate_limited" });
    expect(calls).toEqual([]);
  });

  it("bez auditního záznamu se nečte; bez přístupových údajů nic nevolá", async () => {
    const { fetchImpl, calls } = fakeIdoklad();
    const brokenDb = { select: () => { throw new Error("db down"); }, insert: () => ({ values: () => ({ returning: async () => { throw new Error("db down"); } }) }) };
    expect(await read.runIdokladRead("idoklad_get_invoice", { number: "9260001" }, "ui", { db: brokenDb as never, env: ENV, fetchImpl, now: NOW })).toMatchObject({
      ok: false,
      status: "unavailable",
      error: expect.stringMatching(/Auditní záznam/),
    });
    const noCreds = { ...ENV, IDOKLAD_ESHOP_CLIENT_SECRET: "" };
    expect(await run("idoklad_get_invoice", { number: "9260001" }, "ui", fetchImpl, noCreds)).toMatchObject({ ok: false, status: "unavailable" });
    expect(calls).toEqual([]);
  });
});
