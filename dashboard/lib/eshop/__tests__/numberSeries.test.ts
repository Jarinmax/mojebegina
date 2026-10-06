// ESHOP 1.0 — e-shopová číselná řada iDokladu: nastavení ID a ověření
// proti seznamu řad z iDokladu (čistě, bez sítě).
import { describe, expect, it } from "vitest";
import { checkEshopSeries, NUMERIC_SEQUENCES_LOOKUP, parseSeriesId, type IdokladNumericSequence } from "../invoicing/numberSeries";
import { buildInvoiceDraft } from "../invoicing/draft";
import { invoiceNumberSeries, invoiceNumberSeriesId } from "../invoicing/mode";

const SEQUENCES: IdokladNumericSequence[] = [
  { Id: 101, Name: "Faktury B2B", NumberFormat: "{RRRR}{CCCC}", DocumentType: 0, IsDefault: true, LastNumber: 153, Year: 2026 },
  { Id: 202, Name: "E-shop", NumberFormat: "E{RRRR}{CCCC}", DocumentType: 0, IsDefault: false, LastNumber: 0, Year: 2026 },
  { Id: 303, Name: "Dobropisy", NumberFormat: "D{RRRR}{CCCC}", DocumentType: 1, IsDefault: false, LastNumber: 2, Year: 2026 },
];

describe("e-shopová číselná řada — nastavení IDOKLAD_ESHOP_SEQUENCE_ID", () => {
  it("chybí / neplatné / platné", () => {
    expect(parseSeriesId(undefined)).toMatchObject({ id: null, problem: { code: "no_number_series", severity: "live" } });
    expect(parseSeriesId("  ")).toMatchObject({ id: null, problem: { code: "no_number_series" } });
    for (const bad of ["abc", "0", "-5", "12.5", "E2026"]) {
      expect(parseSeriesId(bad), bad).toMatchObject({ id: null, problem: { code: "invalid_number_series", severity: "live" } });
    }
    expect(parseSeriesId(" 202 ")).toEqual({ id: "202", problem: null });
    expect(invoiceNumberSeriesId({ IDOKLAD_ESHOP_SEQUENCE_ID: "abc" })).toBeNull();
    expect(invoiceNumberSeries({ IDOKLAD_ESHOP_SEQUENCE_ID: "202" })).toEqual({ id: "202", problem: null });
  });

  it("v návrhu faktury: neplatné ID = problém, platné ID = jen „ověřit v iDokladu“", () => {
    const order = {
      id: "o1", channel: "eshop", orderNumber: 900008, paymentVs: "70000001", contactName: "Jana Nováková",
      contactEmail: "jana@example.cz", contactPhone: null, recipientAddress: null, shippingMethodLabel: null,
      subtotalKc: 379, discountKc: 0, shippingKc: 0, totalKc: 379, paidAt: new Date("2026-10-06T10:00:00Z"),
    };
    const items = [{ name: "Dýňová polévka", quantity: 1, unitPriceKc: 379, lineTotalKc: 379, sku: "dynova-polevka" }];
    const bad = buildInvoiceDraft(order, items, [], { numberSeriesId: null, numberSeriesProblem: parseSeriesId("abc").problem });
    expect(bad.problems.map((p) => p.code)).toContain("invalid_number_series");
    expect(bad.problems.map((p) => p.code)).not.toContain("no_number_series");
    const ok = buildInvoiceDraft(order, items, [], { numberSeriesId: "202" });
    expect(ok.problems.find((p) => p.code === "number_series_unverified")?.message).toMatch(/ID 202/);
    expect(ok.draft.numberSeriesId).toBe("202");
  });
});

describe("e-shopová číselná řada — ověření proti iDokladu", () => {
  it("čtecí dotaz: jen GET řad vydaných faktur", () => {
    expect(NUMERIC_SEQUENCES_LOOKUP).toEqual({ method: "GET", path: "/v3/NumericSequences", query: "filter=DocumentType~eq~0" });
  });

  it("správná řada: vydané faktury, nevýchozí", () => {
    expect(checkEshopSeries("202", SEQUENCES)).toMatchObject({ ok: true, summary: "E-shop, formát E{RRRR}{CCCC}, rok 2026, poslední číslo 0" });
  });

  it("výchozí řada (B2B) se odmítne", () => {
    expect(checkEshopSeries("101", SEQUENCES)).toMatchObject({ ok: false, problems: [{ code: "number_series_is_default" }] });
  });

  it("řada jiného druhu dokladu, neexistující řada, chybějící ID", () => {
    expect(checkEshopSeries("303", SEQUENCES)).toMatchObject({ ok: false, problems: [{ code: "number_series_wrong_type" }] });
    expect(checkEshopSeries("999", SEQUENCES)).toMatchObject({ ok: false, problems: [{ code: "number_series_not_found" }] });
    expect(checkEshopSeries(null, SEQUENCES)).toMatchObject({ ok: false, problems: [{ code: "no_number_series" }] });
  });
});
