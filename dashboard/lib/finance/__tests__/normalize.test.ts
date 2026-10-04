// Finance 1.0 — normalizace odpovědí iDokladu: znaménka, data, haléře.
import { describe, expect, it } from "vitest";
import { toHalere, formatHalere } from "../money";
import {
  contentHash,
  normalizeAgenda,
  normalizeCreditNote,
  normalizeIssuedInvoice,
  normalizeIssuedPayment,
  normalizeProformaInvoice,
  normalizeReceivedPayment,
  normalizeReceivedReceipt,
  normalizeSalesReceipt,
  normalizeSalesReceiptPayments,
  toIsoDate,
} from "../idoklad/normalize";
import {
  fixtureCreditNotes,
  fixtureIssuedInvoices,
  fixtureIssuedPayments,
  fixtureProformaInvoices,
  fixtureReceivedPayments,
  fixtureReceivedReceipts,
  fixtureSalesReceipts,
} from "../__fixtures__/idoklad";
import { IdokladError } from "../idoklad/errors";

const byId = <T extends { Id?: number }>(list: T[], id: number) => list.find((item) => item.Id === id)!;

describe("částky v haléřích", () => {
  it("bez chyb plovoucí čárky", () => {
    expect(toHalere(0.1) + toHalere(0.2)).toBe(30);
    expect(toHalere(9917.36)).toBe(991_736);
    expect(toHalere(-2000)).toBe(-200_000);
    expect(toHalere("12,5")).toBe(1250);
    expect(toHalere(null)).toBe(0);
    expect(toHalere(-0.005)).toBe(-toHalere(0.005));
    expect(() => toHalere("abc")).toThrow();
  });

  it("formát pro zobrazení", () => {
    expect(formatHalere(1_677_000).replace(/\s/g, " ")).toBe("16 770 Kč");
    expect(formatHalere(1050).replace(/\s/g, " ")).toBe("10,50 Kč");
  });
});

describe("data", () => {
  it("prázdné datum iDokladu = null", () => {
    expect(toIsoDate("1753-01-01T00:00:00")).toBeNull();
    expect(toIsoDate("0001-01-01T00:00:00")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });

  it("datum bez zóny = kalendářní den beze změny", () => {
    expect(toIsoDate("2026-10-01T00:00:00")).toBe("2026-10-01");
    expect(toIsoDate("2026-10-01")).toBe("2026-10-01");
  });

  it("datum s UTC zónou se přepočte na den v Praze", () => {
    // půlnoc 1. 11. v Praze (CET) = 31. 10. 23:00 UTC
    expect(toIsoDate("2026-10-31T23:00:00Z")).toBe("2026-11-01");
    expect(toIsoDate("2026-10-01T00:30:00+02:00")).toBe("2026-10-01");
  });
});

describe("vydaná faktura", () => {
  it("běžná faktura: částky z *Hc, tržba = celkem", () => {
    const doc = normalizeIssuedInvoice(byId(fixtureIssuedInvoices, 103));
    expect(doc).toMatchObject({
      docType: "issued_invoice",
      externalId: "103",
      direction: "revenue",
      totalWithVat: 300_000,
      revenueWithVat: 300_000,
      totalPaid: 100_000,
      paymentStatus: "partially_paid",
      dateOfIssue: "2026-10-02",
      dateOfMaturity: "2026-10-16",
      dateOfPayment: null, // 1753-01-01
      partnerName: "Restaurace Beta",
      partnerIco: "55555555",
      tagIds: [1, 7],
    });
  });

  it("konečná faktura po záloze: tržba = prodej před odečtem zálohy, vazba na zálohu", () => {
    const doc = normalizeIssuedInvoice(byId(fixtureIssuedInvoices, 104));
    expect(doc.totalWithVat).toBe(600_000); // doplatek
    expect(doc.revenueWithVat).toBe(1_000_000); // hodnota prodeje
    expect(doc.deductedProformaExternalIds).toEqual(["201"]);
  });

  it("faktura v cizí měně se počítá v Kč (pole *Hc)", () => {
    const doc = normalizeIssuedInvoice(byId(fixtureIssuedInvoices, 109));
    expect(doc.currencyId).toBe(2);
    expect(doc.exchangeRate).toBe(25);
    expect(doc.totalWithVat).toBe(250_000);
  });

  it("výčet jako text i jako číslo dává stejný stav", () => {
    const api = byId(fixtureIssuedInvoices, 103);
    expect(normalizeIssuedInvoice({ ...api, PaymentStatus: "PartialPaid" }).paymentStatus).toBe("partially_paid");
    expect(normalizeIssuedInvoice({ ...api, PaymentStatus: "2" }).paymentStatus).toBe("partially_paid");
  });

  it("doklad bez Id → invalid_response (nic se neuloží s vymyšleným klíčem)", () => {
    expect(() => normalizeIssuedInvoice({ ...byId(fixtureIssuedInvoices, 101), Id: undefined })).toThrow(IdokladError);
  });
});

describe("dobropis — vždy záporný", () => {
  it("kladná částka z API → záporná", () => {
    const doc = normalizeCreditNote(byId(fixtureCreditNotes, 301));
    expect(doc.totalWithVat).toBe(-150_000);
    expect(doc.revenueWithVat).toBe(-150_000);
    expect(doc.creditedExternalId).toBe("105");
  });

  it("záporná částka z API zůstane záporná (žádné dvojí otočení)", () => {
    const doc = normalizeCreditNote(byId(fixtureCreditNotes, 302));
    expect(doc.totalWithVat).toBe(-200_000);
    expect(doc.totalPaid).toBe(-200_000);
    expect(doc.creditedExternalId).toBe("106");
  });
});

describe("záloha — nikdy tržba", () => {
  it("revenue = 0, vazba na konečnou fakturu", () => {
    const doc = normalizeProformaInvoice(byId(fixtureProformaInvoices, 201));
    expect(doc.revenueWithVat).toBe(0);
    expect(doc.totalWithVat).toBe(400_000);
    expect(doc.accountedByInvoiceExternalId).toBe("104");
  });
});

describe("prodejky a účtenky", () => {
  it("prodejka je zaplacená při vystavení, úhrady z dokladu", () => {
    const api = byId(fixtureSalesReceipts, 401);
    expect(normalizeSalesReceipt(api)).toMatchObject({ totalPaid: 45_000, paymentStatus: "paid", dateOfPayment: "2026-10-07" });
    expect(normalizeSalesReceiptPayments(api)).toEqual([
      expect.objectContaining({ externalId: "sr-401-1", documentType: "sales_receipt", documentExternalId: "401", amount: 45_000 }),
    ]);
  });

  it("přijatá účtenka je náklad zaplacený v den vystavení", () => {
    const doc = normalizeReceivedReceipt(byId(fixtureReceivedReceipts, 601));
    expect(doc).toMatchObject({ direction: "cost", totalWithVat: 120_000, totalWithoutVat: 99_174, totalPaid: 120_000 });
    expect(doc.partnerName).toBe("Benzina");
  });
});

describe("úhrady", () => {
  it("úhrada faktury nese vazbu na banku/pokladnu", () => {
    const result = normalizeIssuedPayment(byId(fixtureIssuedPayments, 1001));
    expect(result.payment).toMatchObject({ side: "issued", documentType: "issued_invoice", amount: 113_700, bankStatementExternalId: "9001" });
  });

  it("úhrada zálohy je úhrada zálohy (ne faktury)", () => {
    expect(normalizeIssuedPayment(byId(fixtureIssuedPayments, 1002)).payment?.documentType).toBe("proforma_invoice");
  });

  it("vratka k dobropisu je vždy záporná", () => {
    expect(normalizeIssuedPayment(byId(fixtureIssuedPayments, 1007)).payment?.amount).toBe(-200_000);
    expect(normalizeIssuedPayment({ ...byId(fixtureIssuedPayments, 1007), Prices: { PaymentAmountHc: -2000 } }).payment?.amount).toBe(-200_000);
  });

  it("úhrada prodejky v seznamu úhrad se přeskočí (čte se z prodejky)", () => {
    const result = normalizeIssuedPayment(byId(fixtureIssuedPayments, 1011));
    expect(result.payment).toBeNull();
    expect(result.skipped).toMatch(/prodejk/);
  });

  it("úhrada přijaté faktury s bankovním výpisem", () => {
    expect(normalizeReceivedPayment(byId(fixtureReceivedPayments, 2001))).toMatchObject({
      side: "received",
      documentType: "received_invoice",
      documentExternalId: "501",
      amount: 1_200_000,
      bankStatementExternalId: "9101",
      cashVoucherExternalId: null,
    });
  });
});

describe("agenda a hash", () => {
  it("agenda: IČO bez mezer, režim DPH", () => {
    expect(normalizeAgenda({ Id: 1, Name: "X", VatRegistrationType: 0, Contact: { IdentificationNumber: "123 45 678" } })).toEqual({
      agendaId: "1",
      name: "X",
      ico: "12345678",
      vatMode: "non_payer",
    });
    expect(normalizeAgenda({ Id: 1, VatRegistrationType: 1 }).vatMode).toBe("payer");
    expect(normalizeAgenda({ Id: 1, VatRegistrationType: 2 }).vatMode).toBe("identified_person");
    expect(normalizeAgenda({ Id: 1, VatRegistrationType: 9 }).vatMode).toBeNull();
  });

  it("hash nezávisí na pořadí polí", () => {
    expect(contentHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(contentHash({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});
