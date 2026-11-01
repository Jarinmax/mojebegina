import { describe, expect, it } from "vitest";
import { addDays, b2bWarnings, validateB2bInvoice } from "../invoicing/b2bInvoiceValidation";

const TODAY = "2026-11-01";
const base = { ico: "12345679", items: [{ name: "Kulajda", quantity: 2, unitPriceKc: 399 }] };

describe("B2B faktura — kontrola vstupu", () => {
  it("výchozí: převodem, neuhrazená, dnes, splatnost 14 dní; součet na haléře", () => {
    expect(validateB2bInvoice({ ...base, items: [{ name: "A", quantity: 3, unitPriceKc: 99.5 }, { name: "B", quantity: 0.5, unitPriceKc: "10,10" }] }, TODAY)).toMatchObject({
      ok: true,
      value: { ico: "12345679", paymentMethod: "bank_transfer", paid: false, issueDate: TODAY, dueDate: "2026-11-15", totalKc: 303.55, items: [{ unit: "ks", totalKc: 298.5 }, { totalKc: 5.05 }] },
    });
  });

  it("hotově, uhrazená, vlastní splatnost a poznámka", () => {
    expect(validateB2bInvoice({ ...base, paymentMethod: "cash", paid: true, dueDate: "2026-11-01", note: " Děkujeme ", issueDate: "2026-10-30" }, TODAY)).toMatchObject({
      ok: true,
      value: { paymentMethod: "cash", paid: true, dueDate: "2026-11-01", note: "Děkujeme", issueDate: "2026-10-30" },
    });
  });

  it("odmítne: neplatné IČO, žádné položky, nulové množství, haléře navíc, budoucí / starý den, splatnost před vystavením, nesedící součet, neznámý způsob úhrady", () => {
    const err = (raw: Record<string, unknown>) => {
      const r = validateB2bInvoice({ ...base, ...raw } as never, TODAY);
      return r.ok ? null : r.error;
    };
    expect(err({ ico: "12345678" })).toMatch(/IČO/);
    expect(err({ items: [] })).toMatch(/aspoň jednu položku/);
    expect(err({ items: [{ name: "X", quantity: 0, unitPriceKc: 1 }] })).toMatch(/kladné/);
    expect(err({ items: [{ name: "X", quantity: 1, unitPriceKc: 1.234 }] })).toMatch(/haléře/);
    expect(err({ issueDate: "2026-11-02" })).toMatch(/budoucnosti/);
    expect(err({ issueDate: "2026-10-01" })).toMatch(/15 dní/);
    expect(err({ dueDate: "2026-10-31" })).toMatch(/Splatnost/);
    expect(err({ dueDays: 120 })).toMatch(/0–90/);
    expect(err({ expectedTotalKc: 700 })).toMatch(/nesedí/);
    expect(err({ paymentMethod: "dobirka" })).toMatch(/Způsob úhrady/);
  });

  it("varování: poznámka „uhrazena“ u neuhrazené faktury; uhrazeno převodem", () => {
    const value = (raw: Record<string, unknown>) => {
      const r = validateB2bInvoice({ ...base, ...raw } as never, TODAY);
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    expect(b2bWarnings(value({ note: "Faktura je již uhrazena – neplaťte." }))[0]).toMatch(/NEUHRAZENÁ/);
    expect(b2bWarnings(value({ note: "Faktura je již uhrazena – neplaťte.", paid: true, paymentMethod: "cash" }))).toEqual([]);
    expect(b2bWarnings(value({ paid: true }))[0]).toMatch(/převodem/);
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });
});
