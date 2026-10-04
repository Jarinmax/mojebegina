// Finance 1.0 — synchronizace end-to-end nad falešným iDokladem:
// počáteční import celé historie, idempotence, navázání po limitu,
// smazání/obnovení, pojistky agendy a DPH, a že do iDokladu nikdy neodejde
// nic jiného než GET (a POST na token).
import { describe, expect, it } from "vitest";
import { resolveFinanceConfig } from "../config";
import { IdokladClient } from "../idoklad/client";
import { IDOKLAD_TOKEN_URL } from "../idoklad/endpoints";
import { InMemoryFinanceRepository } from "../store";
import { runFinanceSync, SYNC_ENTITIES } from "../sync";
import { buildFinanceContext, invoicedRevenue, paidRevenue } from "../metrics";
import { monthPeriod } from "../periods";
import { createFakeIdoklad, type FakeIdokladOptions } from "./fakeIdoklad";
import {
  FIXTURE_COMPANY_ICO,
  FIXTURE_EXPECTED,
  fixtureAgenda,
  fixtureCreditNotes,
  fixtureIssuedInvoices,
  fixtureIssuedPayments,
  fixtureProformaInvoices,
  fixtureReceivedInvoices,
  fixtureReceivedPayments,
  fixtureReceivedReceipts,
  fixtureSalesReceipts,
  fixtureTags,
} from "../__fixtures__/idoklad";
import { FIXTURE_LINKS } from "../fixtureSnapshot";

const credentials = { clientId: "cid-test-0001", clientSecret: "csecret-test-0001" };
const config = resolveFinanceConfig({
  VERCEL_ENV: "preview",
  IDOKLAD_CLIENT_ID: credentials.clientId,
  IDOKLAD_CLIENT_SECRET: credentials.clientSecret,
  IDOKLAD_AGENDA_KIND: "test",
  FINANCE_COMPANY_ICO: FIXTURE_COMPANY_ICO,
  FINANCE_VAT_MODE: "non_payer",
});

function collections(): Record<string, unknown[]> {
  return {
    Tags: structuredClone(fixtureTags),
    IssuedInvoices: structuredClone(fixtureIssuedInvoices),
    CreditNotes: structuredClone(fixtureCreditNotes),
    ProformaInvoices: structuredClone(fixtureProformaInvoices),
    SalesReceipts: structuredClone(fixtureSalesReceipts),
    ReceivedInvoices: structuredClone(fixtureReceivedInvoices),
    ReceivedReceipts: structuredClone(fixtureReceivedReceipts),
    IssuedDocumentPayments: structuredClone(fixtureIssuedPayments),
    ReceivedDocumentPayments: structuredClone(fixtureReceivedPayments),
  };
}

function setup(overrides: Partial<FakeIdokladOptions> = {}) {
  // `data` je živý obsah falešného iDokladu — testy ho mezi běhy mění.
  const data = collections();
  const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: data, ...overrides });
  const repo = new InMemoryFinanceRepository();
  repo.links.push(...FIXTURE_LINKS);
  const run = (mode: "incremental" | "full" = "incremental", requestBudget = 500, now = new Date("2026-10-15T10:00:00Z")) =>
    runFinanceSync({
      client: new IdokladClient({ credentials, fetchImpl: fake.fetchImpl, requestBudget }),
      repo,
      config,
      mode,
      now: () => now,
    });
  return { fake, repo, run, data };
}

const kc = (value: number) => Math.round(value * 100);

describe("počáteční import celé historie", () => {
  it("stáhne všechny typy dokladů a úhrad a čísla sedí s ručním výpočtem", async () => {
    const { repo, run } = setup();
    const report = await run();
    expect(report.status).toBe("success");
    expect(report.error).toBeNull();
    expect(report.entities.map((entity) => entity.key)).toEqual(SYNC_ENTITIES.map((spec) => spec.key));
    expect(report.entities.every((entity) => entity.completed && entity.pass === "full")).toBe(true);

    const ctx = buildFinanceContext(repo.snapshot(), { vatMode: "non_payer" });
    expect(invoicedRevenue(ctx, monthPeriod(2026, 10)).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october));
    expect(paidRevenue(ctx, monthPeriod(2026, 10)).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october));
    // Úhrada prodejky ze seznamu úhrad byla přeskočena (a je to v reportu)
    expect(report.entities.find((entity) => entity.key === "issued_payments")?.skippedItems.join(" ")).toMatch(/prodejk/);
  });

  it("do iDokladu odchází jen GET a jediný druh POST (token)", async () => {
    const { fake, run } = setup();
    await run("full");
    const nonGet = fake.calls.filter((call) => call.method !== "GET");
    expect(nonGet.length).toBeGreaterThan(0);
    expect(nonGet.every((call) => call.method === "POST" && call.url === IDOKLAD_TOKEN_URL)).toBe(true);
    expect(fake.calls.every((call) => call.url.startsWith("https://api.idoklad.cz/v3/") || call.url === IDOKLAD_TOKEN_URL)).toBe(true);
  });

  it("report běhu neobsahuje přístupové údaje ani token", async () => {
    const { run } = setup();
    const serialized = JSON.stringify(await run());
    expect(serialized).not.toContain(credentials.clientSecret);
    expect(serialized).not.toContain(credentials.clientId);
    expect(serialized).not.toContain("fake-token");
  });
});

describe("idempotence", () => {
  it("druhý a třetí běh nevytvoří duplicity ani změny", async () => {
    const { repo, run } = setup();
    await run();
    const docs = repo.documents.size;
    const payments = repo.payments.size;
    const second = await run("incremental");
    const third = await run("full");
    expect(repo.documents.size).toBe(docs);
    expect(repo.payments.size).toBe(payments);
    for (const report of [second, third]) {
      for (const entity of report.entities) {
        expect(entity.documents.inserted + entity.documents.updated + entity.payments.inserted + entity.payments.updated).toBe(0);
        expect(entity.markedDeleted).toBe(0);
      }
    }
  });

  it("přírůstkový běh posílá filtr podle data změny (přijaté faktury s názvem DateLastChanged)", async () => {
    const { fake, run } = setup();
    await run();
    fake.calls.length = 0;
    await run("incremental");
    const filters = fake.calls.map((call) => new URL(call.url).searchParams.get("filter")).filter(Boolean) as string[];
    expect(filters.some((filter) => filter.startsWith("(DateLastChange~gte~2026-10-15 07:00:00"))).toBe(true);
    expect(filters.some((filter) => filter.startsWith("(DateLastChanged~gte~"))).toBe(true);
    expect(filters.some((filter) => filter.startsWith("(DateOfPayment~gte~2026-07-17"))).toBe(true);
    expect(filters.some((filter) => filter.startsWith("(DateOfIssue~gte~2026-08-16"))).toBe(true);
  });
});

describe("limit API — navázání bez ztráty a bez duplicit", () => {
  it("počáteční import přes víc běhů skončí stejně jako jeden běh", async () => {
    // 250 dalších úhrad → víc stránek (pageSize 100), aby se navazovalo
    // i uprostřed jednoho typu.
    const extra = Array.from({ length: 250 }, (_, index) => ({
      Id: 3000 + index,
      InvoiceId: 503,
      DateOfPayment: "2026-10-06T00:00:00",
      Prices: { PaymentAmountHc: 1 },
    }));
    const inOne = setup();
    inOne.data.ReceivedDocumentPayments.push(...extra);
    await inOne.run();

    const inParts = setup();
    inParts.data.ReceivedDocumentPayments.push(...structuredClone(extra));
    const reports = [];
    // Velmi malý rozpočet (3 = agenda + štítky + 1 stránka): běh se přeruší,
    // příští naváže. Opakovat, dokud všechny typy nemají úplný import.
    for (let i = 0; i < 40; i += 1) {
      reports.push(await inParts.run("incremental", 3));
      const cursors = await Promise.all(SYNC_ENTITIES.map((spec) => inParts.repo.getCursor(spec.key)));
      if (cursors.every((cursor) => cursor?.lastFullPassAt && cursor.resumePage === null)) break;
    }
    expect(reports[0].status).toBe("partial");
    expect(reports[0].error?.code).toBe("budget_exhausted");
    expect(reports.length).toBeLessThan(40);
    expect(reports.some((report) => report.entities.some((entity) => entity.pass === "resumed_full"))).toBe(true);
    expect([...inParts.repo.documents.keys()].sort()).toEqual([...inOne.repo.documents.keys()].sort());
    expect([...inParts.repo.payments.keys()].sort()).toEqual([...inOne.repo.payments.keys()].sort());
    expect(inParts.repo.payments.size).toBe(inOne.repo.payments.size);

    // S běžným limitem pak běh doběhne a nic nového nevznikne.
    const final = await inParts.run("incremental", 500);
    expect(final.status).toBe("success");
    expect(final.entities.every((entity) => entity.documents.inserted === 0 && entity.payments.inserted === 0)).toBe(true);
  });

  it("dokončené typy nezablokují rozpracovaný import (pořadí v běhu)", async () => {
    const { repo, run } = setup();
    await run();
    await repo.saveCursor("received_payments", {
      highWatermark: null,
      lastFullPassAt: null,
      lastSuccessAt: null,
      resumePage: null,
      fullPassStartedAt: null,
    });
    const report = await run("incremental", 3);
    expect(report.entities[0].key).toBe("received_payments");
  });

  it("429 z iDokladu = partial s českou zprávou, nic se nesmaže", async () => {
    const { repo, run } = setup({ rateLimitAfter: 4 });
    const report = await run();
    expect(report.status).toBe("partial");
    expect(report.error?.code).toBe("rate_limited");
    expect(report.error?.userMessage).toMatch(/limit/i);
    expect([...repo.documents.values()].some((doc) => doc.isDeleted)).toBe(false);
    expect(report.entities.some((entity) => entity.pass === "skipped")).toBe(true);
  });
});

describe("smazání a obnovení v iDokladu", () => {
  const OCT = monthPeriod(2026, 10);
  const revenueOct = (repo: InMemoryFinanceRepository) =>
    invoicedRevenue(buildFinanceContext(repo.snapshot(), { vatMode: "non_payer" }), OCT).total;
  const paidOct = (repo: InMemoryFinanceRepository) =>
    paidRevenue(buildFinanceContext(repo.snapshot(), { vatMode: "non_payer" }), OCT).total;

  it("úplný průchod označí smazaný doklad i jeho úhradu; po obnovení se vrátí", async () => {
    const { repo, run, data } = setup();
    await run();
    const invoice103 = data.IssuedInvoices.find((item) => (item as { Id: number }).Id === 103);
    const payment1003 = data.IssuedDocumentPayments.find((item) => (item as { Id: number }).Id === 1003);

    // Smazání v iDokladu (doklad zmizí ze seznamů)
    data.IssuedInvoices = data.IssuedInvoices.filter((item) => item !== invoice103);
    data.IssuedDocumentPayments = data.IssuedDocumentPayments.filter((item) => item !== payment1003);

    // Přírůstkový běh smazání nepozná — nic se neoznačí (žádné falešné mazání)
    await run("incremental", 500, new Date("2026-10-15T11:00:00Z"));
    expect(repo.documents.get("idoklad|issued_invoice|103")?.isDeleted).toBe(false);

    const full = await run("full", 500, new Date("2026-10-15T12:00:00Z"));
    expect(full.entities.find((entity) => entity.key === "issued_invoices")?.markedDeleted).toBe(1);
    expect(full.entities.find((entity) => entity.key === "issued_payments")?.markedDeleted).toBe(1);
    expect(repo.documents.get("idoklad|issued_invoice|103")?.isDeleted).toBe(true);
    expect(revenueOct(repo)).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october - 3000));
    expect(paidOct(repo)).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october - 1000));

    // Obnovení z koše: doklad se vrátí (s novým datem změny)
    data.IssuedInvoices.push({
      ...(invoice103 as object),
      Metadata: { DateCreated: "2026-10-02T09:00:00.000", DateLastChange: "2026-10-15T12:30:00.000" },
    });
    data.IssuedDocumentPayments.push(payment1003);
    const restored = await run("incremental", 500, new Date("2026-10-15T13:00:00Z"));
    expect(restored.entities.find((entity) => entity.key === "issued_invoices")?.documents.restored).toBe(1);
    expect(repo.documents.get("idoklad|issued_invoice|103")?.isDeleted).toBe(false);
    expect(revenueOct(repo)).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october));
    expect(paidOct(repo)).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october));
  });

  it("úprava dokladu v iDokladu se přírůstkově promítne jako update, ne nový řádek", async () => {
    const { repo, run, data } = setup();
    await run();
    const size = repo.documents.size;
    const invoice = data.IssuedInvoices.find((item) => (item as { Id: number }).Id === 107) as Record<string, unknown>;
    invoice.Prices = { TotalWithoutVatHc: 2700, TotalVatHc: 0, TotalWithVatHc: 2700, TotalPaidHc: 0 };
    invoice.Metadata = { DateCreated: "2026-10-14T09:00:00.000", DateLastChange: "2026-10-15T10:30:00.000" };
    const report = await run("incremental", 500, new Date("2026-10-15T11:00:00Z"));
    expect(report.entities.find((entity) => entity.key === "issued_invoices")?.documents.updated).toBe(1);
    expect(repo.documents.size).toBe(size);
    expect(revenueOct(repo)).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october + 200));
  });
});

describe("pojistky před stažením dat", () => {
  it("živá agenda Beginy v Preview: nic se nestáhne ani neuloží", async () => {
    const { fake, repo, run } = setup({ agenda: { ...fixtureAgenda, Contact: { IdentificationNumber: FIXTURE_COMPANY_ICO } } });
    const report = await run();
    expect(report.status).toBe("error");
    expect(report.error?.code).toBe("agenda_mismatch");
    expect(repo.documents.size).toBe(0);
    expect(fake.calls.filter((call) => call.url.includes("/IssuedInvoices"))).toHaveLength(0);
  });

  it("neshoda DPH: nic se nestáhne", async () => {
    const { repo, run } = setup({ agenda: { ...fixtureAgenda, VatRegistrationType: 1 } });
    const report = await run();
    expect(report.error?.code).toBe("vat_mismatch");
    expect(repo.documents.size).toBe(0);
  });

  it("odmítnuté přihlášení: srozumitelná chyba", async () => {
    const { run } = setup({ tokenStatus: 400 });
    const report = await run();
    expect(report.status).toBe("error");
    expect(report.error?.code).toBe("auth_failed");
  });
});
