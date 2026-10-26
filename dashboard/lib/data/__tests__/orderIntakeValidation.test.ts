import { describe, expect, it } from "vitest";
import { companyNameKey, isValidIco, phoneKey, validateOrderIntake } from "../orderIntakeValidation";

const TODAY = "2026-10-26";
const base = { source: "gmail", externalReference: "G-1", customerIco: "12345679", items: [{ name: "Kulajda", quantity: 2, unitPriceKc: 89 }] };

describe("příjem objednávky — čistá kontrola vstupu", () => {
  it("IČO s kontrolní číslicí", () => {
    expect(isValidIco("08911088")).toBe(true);
    expect(isValidIco("12345679")).toBe(true);
    expect(isValidIco("12345678")).toBe(false);
    expect(isValidIco("1234567")).toBe(false);
  });

  it("telefon a název firmy pro dohledání", () => {
    expect(phoneKey("+420 777 000 111")).toBe("777000111");
    expect(phoneKey("777-000-111")).toBe("777000111");
    expect(phoneKey("123")).toBeNull();
    expect(companyNameKey("Food Fest Crew s.r.o.")).toBe("food fest crew");
    expect(companyNameKey("Kavárna Ú Lípy, a.s.")).toBe("kavarna u lipy");
    expect(companyNameKey("s.r.o.")).toBeNull();
  });

  it("součty, výchozí stavy a datum", () => {
    const result = validateOrderIntake({ ...base, shippingKc: "150", expectedTotalKc: 328 }, TODAY);
    expect(result).toMatchObject({
      ok: true,
      value: {
        source: "gmail",
        customer: { kind: "ico", ico: "12345679" },
        items: [{ name: "Kulajda", quantity: 2, unitPriceKc: 89, lineTotalKc: 178, sku: null }],
        subtotalKc: 178,
        shippingKc: 150,
        totalKc: 328,
        paymentStatus: "unpaid",
        fulfillmentStatus: "new",
        orderedAt: TODAY,
      },
    });
  });

  it("odmítne: Gmail bez externího čísla, nesedící součet, budoucí datum, storno, neplatný e-mail a DIČ", () => {
    const err = (input: Record<string, unknown>) => {
      const r = validateOrderIntake({ ...base, ...input } as never, TODAY);
      return r.ok ? null : r.error;
    };
    expect(err({ externalReference: null })).toMatch(/externí číslo/);
    expect(err({ expectedTotalKc: 200 })).toMatch(/nesedí/);
    expect(err({ orderedAt: "2026-10-27" })).toMatch(/budoucnosti/);
    expect(err({ orderedAt: "2026-02-30" })).toMatch(/RRRR-MM-DD/);
    expect(err({ fulfillmentStatus: "cancelled" })).toMatch(/Stav objednávky/);
    expect(err({ paymentStatus: "zaplaceno" })).toMatch(/Stav platby/);
    expect(err({ contactEmail: "neni-email" })).toMatch(/E-mail/);
    expect(err({ customerDic: "12" })).toMatch(/DIČ/);
    expect(err({ items: [] })).toMatch(/alespoň jednu položku/);
    expect(err({ items: [{ name: "X", quantity: 0, unitPriceKc: 1 }] })).toMatch(/Množství/);
    expect(err({ source: "telefon" })).toMatch(/Zdroj/);
    // telefon a ruční zadání externí číslo nepotřebují
    expect(err({ source: "phone", externalReference: null })).toBeNull();
  });

  it("kanál podle zdroje: e-shop begina.cz = import (číslo WooCommerce jen číslice), ostatní = manual", () => {
    expect(validateOrderIntake({ ...base, source: "eshop", externalReference: "5217" }, TODAY)).toMatchObject({ ok: true, value: { channel: "import", externalReference: "5217" } });
    expect(validateOrderIntake({ ...base, source: "eshop", externalReference: "WC-5217" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/jen číslice/) });
    for (const source of ["gmail", "phone", "manual"]) {
      expect(validateOrderIntake({ ...base, source }, TODAY)).toMatchObject({ ok: true, value: { channel: "manual" } });
    }
  });

  it("DIČ jen s ověřeným zdrojem, nikdy odvozené; externí faktura a kontrolní součet se drží ve value", () => {
    expect(validateOrderIntake({ ...base, customerDic: "CZ12345679" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/ověřeného podkladu/) });
    expect(validateOrderIntake({ ...base }, TODAY)).toMatchObject({ ok: true, value: { customerDic: null } });
    expect(
      validateOrderIntake({ ...base, customerDic: "cz 12345679", customerDicSource: "invoice", customerDicReference: "faktura 1", externalInvoiceNumber: "20260185", expectedTotalKc: "178" }, TODAY)
    ).toMatchObject({ ok: true, value: { customerDic: { dic: "CZ12345679", source: "invoice", reference: "faktura 1" }, externalInvoiceNumber: "20260185", expectedTotalKc: 178 } });
  });

  it("organization_id má přednost a musí být UUID", () => {
    const ok = validateOrderIntake({ ...base, organizationId: "00000000-0000-4000-8000-00000000A001" }, TODAY);
    expect(ok).toMatchObject({ ok: true, value: { customer: { kind: "id", organizationId: "00000000-0000-4000-8000-00000000a001", ico: "12345679" } } });
    expect(validateOrderIntake({ ...base, organizationId: "firma" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/UUID/) });
  });
});
