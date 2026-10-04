// Finance 1.0 — první read-only kontrola s OAuth tokenem: jen GET, žádný
// požadavek na token (token už máme), jen počty dokladů, srozumitelné chyby.
import { describe, expect, it } from "vitest";
import { IdokladClient } from "../idoklad/client";
import { IdokladError } from "../idoklad/errors";
import { READ_ONLY_CHECK_COLLECTIONS, runReadOnlyAccountCheck } from "../readOnlyCheck";
import { createFakeIdoklad, type FakeIdokladOptions } from "./fakeIdoklad";
import {
  FIXTURE_COMPANY_ICO,
  FIXTURE_NOW,
  fixtureAgenda,
  fixtureIssuedInvoices,
  fixtureReceivedInvoices,
  fixtureTags,
} from "../__fixtures__/idoklad";

function setup(overrides: Partial<FakeIdokladOptions> = {}) {
  const fake = createFakeIdoklad({
    agenda: { ...fixtureAgenda, Subscription: { Type: 2, IsTrial: false, DateTo: "2027-01-31T00:00:00" } },
    collections: { IssuedInvoices: fixtureIssuedInvoices, ReceivedInvoices: fixtureReceivedInvoices, Tags: fixtureTags },
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
    expect(result.requestCount).toBe(1 + READ_ONLY_CHECK_COLLECTIONS.length);

    expect(fake.calls.every((call) => call.method === "GET")).toBe(true);
    expect(fake.calls.every((call) => call.url.startsWith("https://api.idoklad.cz/v3/"))).toBe(true);
    // Jen počty: každá kolekce s pageSize=1
    const pageSizes = fake.calls
      .filter((call) => !call.url.includes("/Account/"))
      .map((call) => new URL(call.url).searchParams.get("pageSize"));
    expect(new Set(pageSizes)).toEqual(new Set(["1"]));
    // Výsledek neobsahuje token ani obsah dokladů
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("fake-token");
    expect(serialized).not.toContain("Café Alfa");
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
