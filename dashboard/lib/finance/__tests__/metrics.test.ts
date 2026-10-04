// Finance 1.0 — finanční ukazatele a pravidla proti dvojímu započtení
// (D1–D6, viz lib/finance/metrics.ts). Očekávané hodnoty jsou spočítané
// ručně (FIXTURE_EXPECTED) — test je porovnává 1:1.
import { describe, expect, it } from "vitest";
import {
  buildFinanceContext,
  cashFlow,
  invoicedRevenue,
  paidRevenue,
  payables,
  receivables,
  recordedCosts,
  suspectedReceiptInvoiceDuplicates,
} from "../metrics";
import { buildFinanceCockpit } from "../cockpit";
import { buildFixtureSnapshot } from "../fixtureSnapshot";
import { monthPeriod } from "../periods";
import { FIXTURE_EXPECTED, FIXTURE_NOW } from "../__fixtures__/idoklad";
import type { FinanceSnapshot } from "../store";
import type { FinDocument, FinPayment } from "../types";

const kc = (value: number) => Math.round(value * 100);
const OCT = monthPeriod(2026, 10);
const SEP = monthPeriod(2026, 9);
const TODAY = "2026-10-15";

function ctxOf(snapshot: FinanceSnapshot = buildFixtureSnapshot(), vatMode: "non_payer" | "payer" = "non_payer") {
  return buildFinanceContext(snapshot, { vatMode });
}

function doc(snapshot: FinanceSnapshot, docType: FinDocument["docType"], id: string): FinDocument {
  return snapshot.documents.find((d) => d.docType === docType && d.externalId === id)!;
}

function withoutLinks(snapshot: FinanceSnapshot): FinanceSnapshot {
  return { ...snapshot, links: snapshot.links.filter((link) => link.kind !== "receipt_in_invoice") };
}

describe("ukazatele nad fixture daty (ručně spočítané hodnoty)", () => {
  const ctx = ctxOf();

  it("fakturovaná tržba podle data vystavení", () => {
    expect(invoicedRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october));
    expect(invoicedRevenue(ctx, SEP).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.september));
  });

  it("fakturovaná tržba podle segmentů — Nezařazeno je vidět", () => {
    const bySegment = invoicedRevenue(ctx, OCT).bySegment;
    for (const [segment, value] of Object.entries(FIXTURE_EXPECTED.invoicedRevenue.octoberBySegment)) {
      expect(bySegment[segment as keyof typeof bySegment]).toBe(kc(value));
    }
  });

  it("uhrazená tržba podle data platby", () => {
    expect(paidRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october));
    expect(paidRevenue(ctx, SEP).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.september));
  });

  it("náklady evidované v iDokladu (neplátce: včetně DPH)", () => {
    expect(recordedCosts(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.costs.october));
    expect(recordedCosts(ctx, SEP).total).toBe(kc(FIXTURE_EXPECTED.costs.september));
  });

  it("cashflow", () => {
    expect(cashFlow(ctx, OCT)).toMatchObject({
      cashIn: kc(FIXTURE_EXPECTED.cash.october.cashIn),
      cashOut: kc(FIXTURE_EXPECTED.cash.october.cashOut),
      net: kc(FIXTURE_EXPECTED.cash.october.net),
    });
    expect(cashFlow(ctx, SEP)).toMatchObject({
      cashIn: kc(FIXTURE_EXPECTED.cash.september.cashIn),
      cashOut: kc(FIXTURE_EXPECTED.cash.september.cashOut),
      net: kc(FIXTURE_EXPECTED.cash.september.net),
    });
  });

  it("pohledávky a po splatnosti", () => {
    const result = receivables(ctx, TODAY);
    expect(result).toMatchObject({
      total: kc(FIXTURE_EXPECTED.receivables.total),
      overdueTotal: kc(FIXTURE_EXPECTED.receivables.overdueTotal),
      count: FIXTURE_EXPECTED.receivables.count,
      overdueCount: FIXTURE_EXPECTED.receivables.overdueCount,
      creditsToRefund: 0,
    });
    // Nejdéle po splatnosti první: faktura 102, splatná 4. 10. → 11 dní
    expect(result.items[0]).toMatchObject({ externalId: "102", open: kc(5000), daysOverdue: 11 });
  });

  it("závazky a po splatnosti", () => {
    const result = payables(ctx, TODAY);
    expect(result).toMatchObject({
      total: kc(FIXTURE_EXPECTED.payables.total),
      overdueTotal: kc(FIXTURE_EXPECTED.payables.overdueTotal),
      count: FIXTURE_EXPECTED.payables.count,
      overdueCount: FIXTURE_EXPECTED.payables.overdueCount,
    });
    expect(result.items[0]).toMatchObject({ externalId: "502", daysOverdue: 5 });
  });

  it("pohledávka k datu v minulosti počítá jen tehdejší úhrady", () => {
    // 1. 10.: faktura 103 ještě nebyla vystavená, 106 už zaplacená
    const result = receivables(ctx, "2026-10-01");
    expect(result.items.map((item) => item.externalId).sort()).toEqual(["102"]);
  });
});

describe("D1 — prodejka zahrnutá do souhrnné faktury", () => {
  it("s vazbou: tržba jen jednou (faktura), prodejka se nepočítá", () => {
    const snapshot = buildFixtureSnapshot();
    const lines = invoicedRevenue(ctxOf(snapshot), OCT).lines;
    expect(lines.some((line) => line.docType === "sales_receipt" && line.externalId === "401")).toBe(false);
    expect(lines.filter((line) => line.docType === "issued_invoice" && line.externalId === "110")).toHaveLength(1);
  });

  it("s vazbou: stejné peníze nejsou dvakrát v příjmech ani dvakrát odečtené z pohledávky", () => {
    const ctx = ctxOf();
    const paid = paidRevenue(ctx, OCT).lines.filter((line) => ["401", "110"].includes(line.externalId));
    expect(paid.reduce((sum, line) => sum + line.amount, 0)).toBe(kc(450));
    expect(receivables(ctx, TODAY).items.find((item) => item.externalId === "110")).toBeUndefined();
    expect(ctx.warnings.map((warning) => warning.code)).toContain("receipt_invoice_payment_overlap");
  });

  it("bez vazby: obojí se počítá, ale cockpit to ukáže jako možnou duplicitu", () => {
    const snapshot = withoutLinks(buildFixtureSnapshot());
    const ctx = ctxOf(snapshot);
    expect(invoicedRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october + 450));
    const duplicates = suspectedReceiptInvoiceDuplicates(ctx);
    expect(duplicates.map((warning) => warning.documents)).toContainEqual(["401", "110"]);
  });

  it("vazba na smazanou fakturu se ignoruje (prodejka se počítá) a hlásí se", () => {
    const snapshot = buildFixtureSnapshot();
    doc(snapshot, "issued_invoice", "110").isDeleted = true;
    const ctx = ctxOf(snapshot);
    expect(invoicedRevenue(ctx, OCT).lines.some((line) => line.externalId === "401")).toBe(true);
    expect(ctx.warnings.map((warning) => warning.code)).toContain("receipt_link_invalid");
  });

  it("podezřelá duplicita bez vazby i mezi měsíci (prodejka 403 v září, faktura 102)", () => {
    const duplicates = suspectedReceiptInvoiceDuplicates(ctxOf());
    expect(duplicates.map((warning) => warning.documents)).toContainEqual(["403", "102"]);
  });
});

describe("D2 — záloha a konečná faktura", () => {
  const ctx = ctxOf();

  it("záloha není tržba; konečná faktura v plné hodnotě prodeje", () => {
    expect(invoicedRevenue(ctx, SEP).lines.some((line) => line.docType === "proforma_invoice")).toBe(false);
    expect(invoicedRevenue(ctx, OCT).lines.find((line) => line.externalId === "104")?.amount).toBe(kc(10_000));
  });

  it("peníze: záloha v září + doplatek v říjnu = hodnota prodeje, nic dvakrát", () => {
    const sep = paidRevenue(ctx, SEP).lines.filter((line) => line.externalId === "201");
    const oct = paidRevenue(ctx, OCT).lines.filter((line) => line.externalId === "104");
    expect(sep.reduce((s, l) => s + l.amount, 0) + oct.reduce((s, l) => s + l.amount, 0)).toBe(kc(10_000));
  });

  it("konečná faktura po záloze nemá falešnou pohledávku", () => {
    expect(receivables(ctx, TODAY).items.find((item) => item.externalId === "104")).toBeUndefined();
  });
});

describe("D3 — spárovaná úhrada a bankovní/pokladní pohyb", () => {
  it("spárovaný pohyb se přeskočí, nespárovaný se počítá", () => {
    const ctx = ctxOf();
    const result = cashFlow(ctx, SEP, [
      // Tentýž příchozí převod jako úhrada 1001 (BankStatementId 9001)
      { source: "idoklad", kind: "bank", externalId: "9001", date: "2026-09-10", amount: kc(1137), isPairedToDocument: true },
      // Tatáž platba zálohy (9002)
      { source: "idoklad", kind: "bank", externalId: "9002", date: "2026-09-30", amount: kc(4000), isPairedToDocument: true },
      // Bankovní poplatek bez dokladu
      { source: "bank", kind: "bank", externalId: "fee-1", date: "2026-09-30", amount: kc(-45), isPairedToDocument: false },
    ]);
    expect(result.skippedPairedMovements).toBe(2);
    expect(result.cashIn).toBe(kc(FIXTURE_EXPECTED.cash.september.cashIn));
    expect(result.cashOut).toBe(kc(FIXTURE_EXPECTED.cash.september.cashOut + 45));
  });

  it("úhrada zaplacená přes pokladnu (CashVoucherId) se počítá jednou", () => {
    const ctx = ctxOf();
    const lines = paidRevenue(ctx, OCT).lines.filter((line) => line.externalId === "103");
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(kc(1000));
  });

  it("přijatá účtenka zaplacená z pokladny je výdaj jednou", () => {
    expect(cashFlow(ctxOf(), OCT).cashOut).toBe(kc(5000 + 1200));
  });
});

describe("D4 — plný a částečný dobropis", () => {
  it("plný dobropis: −1 500 v říjnu, pohledávka faktury zmizí, vazba dohledatelná", () => {
    const snapshot = buildFixtureSnapshot();
    const ctx = ctxOf(snapshot);
    const line = invoicedRevenue(ctx, OCT).lines.find((l) => l.docType === "credit_note" && l.externalId === "301");
    expect(line?.amount).toBe(kc(-1500));
    expect(doc(snapshot, "credit_note", "301").creditedExternalId).toBe("105");
    expect(receivables(ctx, TODAY).items.find((item) => item.externalId === "105")).toBeUndefined();
  });

  it("dobropis snižuje tržbu v období SVÉHO vystavení, ne původní faktury", () => {
    const ctx = ctxOf();
    // Faktura 106 (září) zůstává v září celá, dobropis 302 je v říjnu
    expect(invoicedRevenue(ctx, SEP).lines.find((l) => l.externalId === "106")?.amount).toBe(kc(8000));
    expect(invoicedRevenue(ctx, OCT).lines.find((l) => l.externalId === "302")?.amount).toBe(kc(-2000));
    // a segment převezme z původní faktury (B2B Begina)
    expect(invoicedRevenue(ctx, OCT).lines.find((l) => l.externalId === "302")?.segment).toBe("b2b_begina");
  });

  it("částečný dobropis k uhrazené faktuře s vrácením peněz: vratka snižuje příjmy", () => {
    const ctx = ctxOf();
    expect(paidRevenue(ctx, OCT).lines.find((l) => l.externalId === "302")?.amount).toBe(kc(-2000));
    expect(receivables(ctx, TODAY).items.find((item) => item.externalId === "106")).toBeUndefined();
  });

  it("částečný dobropis k neuhrazené faktuře sníží pohledávku jen o svou částku", () => {
    const snapshot = buildFixtureSnapshot();
    const partial: FinDocument = {
      ...doc(snapshot, "credit_note", "301"),
      externalId: "303",
      creditedExternalId: "102",
      totalWithVat: kc(-1500),
      revenueWithVat: kc(-1500),
      dateOfIssue: "2026-10-13",
      contentHash: "partial",
    };
    snapshot.documents.push(partial);
    const item = receivables(ctxOf(snapshot), TODAY).items.find((i) => i.externalId === "102");
    expect(item?.open).toBe(kc(3500));
  });

  it("dobropis k uhrazené faktuře bez vrácení peněz = peníze k vrácení zákazníkovi", () => {
    const snapshot = buildFixtureSnapshot();
    snapshot.payments = snapshot.payments.filter((p) => p.externalId !== "1007");
    doc(snapshot, "credit_note", "302").totalPaid = 0;
    const result = receivables(ctxOf(snapshot), TODAY);
    expect(result.creditsToRefund).toBe(kc(2000));
    expect(result.items.find((item) => item.externalId === "106")).toBeUndefined();
  });
});

describe("D5 — smazaný a obnovený doklad", () => {
  it("smazaná faktura ani její úhrady se nepočítají; po obnovení zase ano", () => {
    const snapshot = buildFixtureSnapshot();
    const invoice = doc(snapshot, "issued_invoice", "103");
    invoice.isDeleted = true;
    let ctx = ctxOf(snapshot);
    expect(invoicedRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october - 3000));
    expect(paidRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october - 1000));
    expect(receivables(ctx, TODAY).total).toBe(kc(FIXTURE_EXPECTED.receivables.total - 2000));
    // Úhrada smazaného dokladu není „úhrada bez dokladu“ — žádné falešné varování
    expect(ctx.warnings.filter((w) => w.code === "payment_without_document")).toHaveLength(1); // jen 1012

    invoice.isDeleted = false;
    ctx = ctxOf(snapshot);
    expect(invoicedRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.invoicedRevenue.october));
    expect(paidRevenue(ctx, OCT).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october));
  });

  it("smazaná úhrada se nepočítá", () => {
    const snapshot = buildFixtureSnapshot();
    (snapshot.payments.find((p) => p.externalId === "1004") as FinPayment).isDeleted = true;
    expect(paidRevenue(ctxOf(snapshot), OCT).total).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october - 6000));
  });
});

describe("D6 — objednávky se do financí nepočítají", () => {
  it("vazba doklad ↔ objednávka nezmění žádné číslo", () => {
    const snapshot = buildFixtureSnapshot();
    const withoutOrderLinks = { ...snapshot, links: snapshot.links.filter((link) => link.kind !== "order") };
    const a = buildFinanceCockpit(snapshot, { now: FIXTURE_NOW, vatMode: "non_payer" });
    const b = buildFinanceCockpit(withoutOrderLinks, { now: FIXTURE_NOW, vatMode: "non_payer" });
    expect(a).toEqual(b);
  });
});

describe("kontroly a varování", () => {
  it("úhrada k nestaženému dokladu se nezapočítá a je vidět", () => {
    const warning = ctxOf().warnings.find((w) => w.code === "payment_without_document");
    expect(warning?.amount).toBe(kc(777));
  });

  it("nesoulad stažených úhrad s „uhrazeno“ v iDokladu", () => {
    const snapshot = buildFixtureSnapshot();
    doc(snapshot, "issued_invoice", "101").totalPaid = kc(2000);
    expect(ctxOf(snapshot).warnings.map((w) => w.code)).toContain("payment_total_mismatch");
  });

  it("fixture bez úmyslných chyb nemá nesoulad úhrad", () => {
    expect(ctxOf().warnings.map((w) => w.code)).not.toContain("payment_total_mismatch");
  });
});

describe("DPH jako nastavení, ne napevno", () => {
  it("plátce DPH: tržba i náklady bez DPH, peníze vždy skutečné", () => {
    const ctx = ctxOf(buildFixtureSnapshot(), "payer");
    expect(recordedCosts(ctx, SEP).lines.find((l) => l.externalId === "501")?.amount).toBe(kc(9917.36));
    const nonPayer = ctxOf(buildFixtureSnapshot(), "non_payer");
    expect(recordedCosts(nonPayer, SEP).lines.find((l) => l.externalId === "501")?.amount).toBe(kc(12_000));
    expect(cashFlow(ctx, SEP).cashOut).toBe(cashFlow(nonPayer, SEP).cashOut);
  });
});

describe("alternativní účetní pohled podle DUZP", () => {
  it("DUZP je uložené a dá se použít jako základ", () => {
    const snapshot = buildFixtureSnapshot();
    doc(snapshot, "issued_invoice", "102").dateOfTaxing = "2026-10-01";
    const byIssue = invoicedRevenue(buildFinanceContext(snapshot, { vatMode: "non_payer" }), OCT).total;
    const byTaxing = invoicedRevenue(buildFinanceContext(snapshot, { vatMode: "non_payer", dateBasis: "taxing" }), OCT).total;
    expect(byTaxing - byIssue).toBe(kc(5000));
  });
});

describe("segmenty přes štítky", () => {
  it("dva různé segmentové štítky → Nezařazeno (konflikt), nesegmentový štítek se ignoruje", () => {
    const snapshot = buildFixtureSnapshot();
    doc(snapshot, "issued_invoice", "103").tagIds = [1, 2];
    expect(invoicedRevenue(ctxOf(snapshot), OCT).lines.find((l) => l.externalId === "103")?.segment).toBe("nezarazeno");
    doc(snapshot, "issued_invoice", "103").tagIds = [1, 7];
    expect(invoicedRevenue(ctxOf(snapshot), OCT).lines.find((l) => l.externalId === "103")?.segment).toBe("b2b_begina");
  });
});

describe("cockpit", () => {
  const cockpit = buildFinanceCockpit(buildFixtureSnapshot(), { now: FIXTURE_NOW, vatMode: "non_payer" });

  it("dlaždice odpovídají ukazatelům", () => {
    expect(cockpit.asOf).toBe(TODAY);
    expect(cockpit.amountsInclVat).toBe(true);
    expect(cockpit.invoicedRevenue).toEqual({
      today: 0,
      thisMonth: kc(FIXTURE_EXPECTED.invoicedRevenue.october),
      lastMonth: kc(FIXTURE_EXPECTED.invoicedRevenue.september),
    });
    expect(cockpit.paidRevenue.thisMonth).toBe(kc(FIXTURE_EXPECTED.paidRevenue.october));
    expect(cockpit.costs).toEqual({ thisMonth: kc(12_700), lastMonth: kc(12_300) });
    expect(cockpit.cash.thisMonth.net).toBe(kc(2_070));
    expect(cockpit.recordedResult.thisMonth).toBe(kc(16_770 - 12_700));
    expect(cockpit.receivables.overdueTotal).toBe(kc(5000));
    expect(cockpit.payables.overdueTotal).toBe(kc(3500));
  });

  it("Nezařazeno je v rozdělení vždy uvedené", () => {
    expect(cockpit.segmentsThisMonth.map((row) => row.segment)).toContain("nezarazeno");
    expect(cockpit.segmentsThisMonth.find((row) => row.segment === "nezarazeno")?.revenue).toBe(kc(2500));
    // faktura 107 + účtenka 602 bez štítku (dobropis 301 dědí E-shop z faktury)
    expect(cockpit.unassigned).toEqual({ revenueDocuments: 1, costDocuments: 1 });
  });

  it("varování a pokrytí dat jsou součástí výstupu", () => {
    const codes = cockpit.warnings.map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining(["payment_without_document", "receipt_invoice_payment_overlap", "suspected_receipt_invoice_duplicate"])
    );
    expect(cockpit.coverage.notIncluded.join(" ")).toMatch(/Storyous/);
    expect(cockpit.coverage.unverified.length).toBeGreaterThan(0);
  });

  it("„dnes“ se počítá v pražském čase", () => {
    // 14. 10. 23:30 UTC = 15. 10. 1:30 v Praze
    const late = buildFinanceCockpit(buildFixtureSnapshot(), { now: new Date("2026-10-14T23:30:00Z"), vatMode: "non_payer" });
    expect(late.asOf).toBe("2026-10-15");
    const earlier = buildFinanceCockpit(buildFixtureSnapshot(), { now: new Date("2026-10-14T21:30:00Z"), vatMode: "non_payer" });
    expect(earlier.invoicedRevenue.today).toBe(kc(2500 + 320)); // 14. 10.: faktura 107 + prodejka 402
  });
});
