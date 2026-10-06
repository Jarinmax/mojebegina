// Finance 1.0 — první read-only kontrola s OAuth tokenem: jen GET, žádný
// požadavek na token (token už máme), jen počty dokladů, srozumitelné chyby.
import { describe, expect, it } from "vitest";
import { IdokladClient } from "../idoklad/client";
import { IdokladError } from "../idoklad/errors";
import {
  MAX_SEQUENCES,
  READ_ONLY_CHECK_COLLECTIONS,
  runReadOnlyAccountCheck,
  sequenceDocumentTypeLabel,
  splitResultForCookies,
  unpackSequences,
} from "../readOnlyCheck";
import { signPayload } from "../idoklad/oauth";
import { createFakeIdoklad, type FakeIdokladOptions } from "./fakeIdoklad";
import {
  FIXTURE_COMPANY_ICO,
  FIXTURE_NOW,
  fixtureAgenda,
  fixtureIssuedInvoices,
  fixtureReceivedInvoices,
  fixtureTags,
} from "../__fixtures__/idoklad";

// Číselné řady agendy (tvar odpovědi GET /NumericSequences).
const SEQUENCES = [
  { Id: 12, Name: "Dobropisy", NumberFormat: "D{RRRR}{CCCC}", DocumentType: 3, IsDefault: true, LastNumber: 2, Year: 2026 },
  { Id: 7, Name: "Faktury", NumberFormat: "{RRRR}{CCCC}", DocumentType: 0, IsDefault: true, LastNumber: 153, Year: 2026 },
  { Id: 9, Name: "E-shop", NumberFormat: "E{RRRR}{CCCC}", DocumentType: 0, IsDefault: false, LastNumber: 0, Year: 2026 },
];

function setup(overrides: Partial<FakeIdokladOptions> = {}) {
  const fake = createFakeIdoklad({
    agenda: { ...fixtureAgenda, Subscription: { Type: 2, IsTrial: false, DateTo: "2027-01-31T00:00:00" } },
    collections: {
      IssuedInvoices: fixtureIssuedInvoices,
      ReceivedInvoices: fixtureReceivedInvoices,
      Tags: fixtureTags,
      NumericSequences: SEQUENCES,
    },
    ...overrides,
  });
  // Token z OAuth — falešný iDoklad přijímá „fake-token-…“.
  const client = new IdokladClient({ accessToken: "fake-token-oauth", fetchImpl: fake.fetchImpl, requestBudget: 30 });
  return { fake, client };
}

describe("runReadOnlyAccountCheck", () => {
  it("přečte agendu a jen počty dokladů; jen GET, žádný token endpoint", async () => {
    const { fake, client } = setup();
    const result = await runReadOnlyAccountCheck({ client, companyIco: null, vatModeConfigured: "non_payer", now: FIXTURE_NOW });
    expect(result.agenda).toEqual({
      name: "Testovací agenda Begina",
      ico: "87654321",
      vatMode: "non_payer",
      subscription: "Standard",
      subscriptionTrial: false,
      subscriptionTo: "2027-01-31",
    });
    expect(result.vatMatches).toBe(true);
    expect(result.isBeginaAgenda).toBeNull();
    expect(result.counts).toHaveLength(READ_ONLY_CHECK_COLLECTIONS.length);
    expect(result.counts.find((row) => row.collection === "IssuedInvoices")?.total).toBe(fixtureIssuedInvoices.length);
    expect(result.counts.find((row) => row.collection === "BankStatements")?.total).toBe(0);
    expect(result.requestCount).toBe(1 + READ_ONLY_CHECK_COLLECTIONS.length + 1);

    expect(fake.calls.every((call) => call.method === "GET")).toBe(true);
    expect(fake.calls.every((call) => call.url.startsWith("https://api.idoklad.cz/v3/"))).toBe(true);
    // Jen počty: každá kolekce s pageSize=1
    const pageSizes = fake.calls
      .filter((call) => !call.url.includes("/Account/") && !call.url.includes("/NumericSequences"))
      .map((call) => new URL(call.url).searchParams.get("pageSize"));
    expect(new Set(pageSizes)).toEqual(new Set(["1"]));
    // Výsledek neobsahuje token ani obsah dokladů
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("fake-token");
    expect(serialized).not.toContain("Café Alfa");
  });

  it("číselné řady: ID, název, formát, typ dokladu, výchozí — jen GET, seřazené podle ID", async () => {
    const { fake, client } = setup();
    const result = await runReadOnlyAccountCheck({ client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW });
    expect(result.numericSequencesError).toBeNull();
    expect(result.numericSequences).toEqual([
      { id: 7, name: "Faktury", numberFormat: "{RRRR}{CCCC}", documentType: "0", isDefault: true, lastNumber: 153, year: 2026 },
      { id: 9, name: "E-shop", numberFormat: "E{RRRR}{CCCC}", documentType: "0", isDefault: false, lastNumber: 0, year: 2026 },
      { id: 12, name: "Dobropisy", numberFormat: "D{RRRR}{CCCC}", documentType: "3", isDefault: true, lastNumber: 2, year: 2026 },
    ]);
    expect(result.numericSequences!.map((row) => sequenceDocumentTypeLabel(row.documentType))).toEqual([
      "Vydané faktury",
      "Vydané faktury",
      "typ 3",
    ]);
    const seqCalls = fake.calls.filter((call) => call.url.includes("/NumericSequences"));
    expect(seqCalls).toHaveLength(1);
    expect(seqCalls[0].method).toBe("GET");
    expect(fake.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("číselné řady: nepřístupné → jen hláška u výpisu, zbytek testu pokračuje; výsledek se vejde do cookie", async () => {
    const failing = setup({ failCollections: { NumericSequences: 403 } });
    const result = await runReadOnlyAccountCheck({ client: failing.client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW });
    expect(result.numericSequences).toBeNull();
    expect(result.numericSequencesError).toMatch(/oprávnění/);
    expect(result.counts).toHaveLength(READ_ONLY_CHECK_COLLECTIONS.length);

    // hodně řad s dlouhými názvy: výpis se omezí a podepsaný výsledek zůstane pod limitem cookie (~4 kB)
    const many = Array.from({ length: 40 }, (_, i) => ({
      Id: 1000 + i,
      Name: `Číselná řada s dlouhým názvem ${i}`,
      NumberFormat: "PREFIX-{RRRR}-{CCCCCC}",
      DocumentType: i % 5,
      IsDefault: i % 5 === 0,
      LastNumber: 123456,
      Year: 2026,
    }));
    const big = setup({ collections: { NumericSequences: many } });
    const bigResult = await runReadOnlyAccountCheck({ client: big.client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW });
    expect(bigResult.numericSequences).toHaveLength(MAX_SEQUENCES);
    const { main, sequences } = splitResultForCookies(bigResult);
    const secret = "x".repeat(32);
    const user = "user-id-0123456789abcdef";
    expect(signPayload({ v: 1, u: user, r: main }, secret).length).toBeLessThan(3800);
    expect(signPayload({ v: 1, u: user, ...sequences }, secret).length).toBeLessThan(3800);
    expect(main).not.toHaveProperty("numericSequences");
    // zhuštěný tvar jde zpět beze ztráty (krátké názvy se nemění)
    const { sequences: small } = splitResultForCookies(await runReadOnlyAccountCheck({ client: setup().client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW }));
    expect(unpackSequences(small.s!).map((r) => [r.id, r.name, r.isDefault])).toEqual([
      [7, "Faktury", true],
      [9, "E-shop", false],
      [12, "Dobropisy", true],
    ]);
  });

  it("pozná agendu Beginy podle IČO a nesoulad DPH", async () => {
    const { client } = setup({ agenda: { ...fixtureAgenda, Contact: { IdentificationNumber: FIXTURE_COMPANY_ICO }, VatRegistrationType: 1 } });
    const result = await runReadOnlyAccountCheck({
      client,
      companyIco: FIXTURE_COMPANY_ICO,
      vatModeConfigured: "non_payer",
      now: FIXTURE_NOW,
    });
    expect(result.isBeginaAgenda).toBe(true);
    expect(result.vatMatches).toBe(false);
  });

  it("nepřístupná kolekce se ukáže u řádku, ostatní pokračují", async () => {
    const { client } = setup({ failCollections: { BankStatements: 403 } });
    const result = await runReadOnlyAccountCheck({ client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW });
    const row = result.counts.find((r) => r.collection === "BankStatements");
    expect(row?.total).toBeNull();
    expect(row?.error).toMatch(/oprávnění/);
    expect(result.counts.find((r) => r.collection === "CashVouchers")?.total).toBe(0);
  });

  it("limit API nebo neplatný token kontrolu ukončí srozumitelnou chybou", async () => {
    const limited = setup({ rateLimitAfter: 3 });
    await expect(
      runReadOnlyAccountCheck({ client: limited.client, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW })
    ).rejects.toMatchObject({ code: "rate_limited" });

    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: {} });
    const badToken = new IdokladClient({ accessToken: "expired", fetchImpl: fake.fetchImpl });
    const error = (await runReadOnlyAccountCheck({ client: badToken, companyIco: null, vatModeConfigured: null, now: FIXTURE_NOW }).catch(
      (e: unknown) => e
    )) as IdokladError;
    expect(error.code).toBe("auth_failed");
    // klient s OAuth tokenem si sám nový token nevyžádá
    expect(fake.calls.some((call) => call.method === "POST")).toBe(false);
  });
});
