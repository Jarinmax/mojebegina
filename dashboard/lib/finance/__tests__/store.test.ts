// Finance 1.0 — idempotentní ukládání: opakovaný import nevytvoří
// duplicity, starší verze nepřepíše novější, smazání a obnovení.
import { describe, expect, it } from "vitest";
import { InMemoryFinanceRepository, decideUpsert } from "../store";
import { buildFixtureSnapshot } from "../fixtureSnapshot";
import { normalizeIssuedInvoice } from "../idoklad/normalize";
import { fixtureIssuedInvoices } from "../__fixtures__/idoklad";

const base = fixtureIssuedInvoices.find((invoice) => invoice.Id === 102)!;

function version(changed: string, total: number) {
  return normalizeIssuedInvoice({
    ...base,
    Prices: { ...base.Prices, TotalWithVatHc: total, TotalWithoutVatHc: total },
    Metadata: { DateCreated: base.Metadata?.DateCreated, DateLastChange: changed },
  });
}

describe("upsert dokladů", () => {
  it("opakovaný import celé historie nevytvoří duplicity ani změny", async () => {
    const repo = new InMemoryFinanceRepository();
    const snapshot = buildFixtureSnapshot();
    const first = await repo.upsertDocuments(snapshot.documents);
    const sizeAfterFirst = repo.documents.size;
    const second = await repo.upsertDocuments(snapshot.documents);
    const third = await repo.upsertDocuments([...snapshot.documents].reverse());
    expect(first.inserted).toBe(snapshot.documents.length);
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: snapshot.documents.length, stale: 0, restored: 0 });
    expect(third.unchanged).toBe(snapshot.documents.length);
    expect(repo.documents.size).toBe(sizeAfterFirst);
  });

  it("stejné Id u různých typů dokladů jsou různé záznamy", async () => {
    const repo = new InMemoryFinanceRepository();
    const invoice = version("2026-10-01T09:00:00.000", 1000);
    await repo.upsertDocuments([invoice, { ...invoice, docType: "credit_note" }]);
    expect(repo.documents.size).toBe(2);
  });

  it("novější verze přepíše, starší (přeházená stránka) ne", async () => {
    const repo = new InMemoryFinanceRepository();
    await repo.upsertDocuments([version("2026-10-02T09:00:00.000", 5000)]);
    expect((await repo.upsertDocuments([version("2026-10-03T09:00:00.000", 5500)])).updated).toBe(1);
    expect((await repo.upsertDocuments([version("2026-10-01T09:00:00.000", 4000)])).stale).toBe(1);
    expect([...repo.documents.values()][0].totalWithVat).toBe(550_000);
  });

  it("úhrady: opakovaný import beze změny", async () => {
    const repo = new InMemoryFinanceRepository();
    const { payments } = buildFixtureSnapshot();
    await repo.upsertPayments(payments);
    const again = await repo.upsertPayments(payments);
    expect(again.unchanged).toBe(payments.length);
    expect(repo.payments.size).toBe(payments.length);
  });
});

describe("smazání a obnovení dokladu", () => {
  it("chybějící v úplném průchodu → is_deleted; znovu se objeví → obnoven", async () => {
    const repo = new InMemoryFinanceRepository();
    const { documents } = buildFixtureSnapshot();
    await repo.upsertDocuments(documents);
    const invoiceIds = documents.filter((doc) => doc.docType === "issued_invoice").map((doc) => doc.externalId);

    // Úplný průchod bez faktury 102 (smazaná v iDokladu)
    const seen = new Set(invoiceIds.filter((id) => id !== "102"));
    expect(await repo.markMissingDocuments("issued_invoice", seen, "2026-10-15T10:00:00.000Z")).toBe(1);
    const deleted = repo.documents.get("idoklad|issued_invoice|102")!;
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.deletedAt).toBe("2026-10-15T10:00:00.000Z");
    // Ostatní typy dokladů se nedotkne
    expect(repo.documents.get("idoklad|credit_note|301")!.isDeleted).toBe(false);

    // Obnovení z koše v iDokladu: doklad se znovu objeví
    const original = documents.find((doc) => doc.docType === "issued_invoice" && doc.externalId === "102")!;
    expect((await repo.upsertDocuments([original])).restored).toBe(1);
    expect(repo.documents.get("idoklad|issued_invoice|102")!.isDeleted).toBe(false);
    expect(repo.documents.get("idoklad|issued_invoice|102")!.deletedAt).toBeNull();
  });

  it("rozhodnutí upsertu je čistá funkce (specifikace pro SQL)", () => {
    const a = version("2026-10-02T09:00:00.000", 5000);
    expect(decideUpsert(undefined, a).outcome).toBe("inserted");
    expect(decideUpsert(a, a).outcome).toBe("unchanged");
    expect(decideUpsert({ ...a, isDeleted: true }, a).outcome).toBe("restored");
    expect(decideUpsert(a, version("2026-10-01T09:00:00.000", 1)).outcome).toBe("stale");
    // bez data změny se rozhoduje jen podle obsahu
    expect(decideUpsert({ ...a, externalChangedAt: null }, { ...a, externalChangedAt: null, contentHash: "x" }).outcome).toBe("updated");
  });
});
