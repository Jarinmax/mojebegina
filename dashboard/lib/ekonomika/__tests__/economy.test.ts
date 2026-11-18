import { describe, expect, it } from "vitest";
import { formatCzDate, formatKc, isMissingInvoice, missingInvoiceSummary, newestFirst, parseAmountToHal, parseEntryDate, summarizeYear, type EconomyRow } from "../economy";

describe("ekonomika – výpočty", () => {
  it("částky převádí na haléře a odmítá nesmysly", () => {
    expect(parseAmountToHal("1 250")).toBe(125000);
    expect(parseAmountToHal("349,90 Kč")).toBe(34990);
    expect(parseAmountToHal("0")).toBeNull();
    expect(parseAmountToHal("-5")).toBeNull();
    expect(parseAmountToHal("abc")).toBeNull();
    expect(parseAmountToHal("1,234")).toBeNull();
  });

  it("datum přijme v českém i ISO tvaru", () => {
    expect(parseEntryDate("15. 11. 2026")).toBe("2026-11-15");
    expect(parseEntryDate("1.2.2026")).toBe("2026-02-01");
    expect(parseEntryDate("2026-11-15")).toBe("2026-11-15");
    expect(parseEntryDate("31.2.2026")).toBeNull();
    expect(parseEntryDate("zítra")).toBeNull();
  });

  it("sečte měsíce a rozdíl, cizí rok ignoruje", () => {
    const months = summarizeYear(
      [
        { kind: "income", entryDate: "2026-11-13", amountHal: 75800 },
        { kind: "income", entryDate: "2026-11-13", amountHal: 46600 },
        { kind: "cost", entryDate: "2026-11-02", amountHal: 100000 },
        { kind: "cost", entryDate: "2025-11-02", amountHal: 999900 },
      ],
      2026,
    );
    expect(months).toHaveLength(12);
    expect(months[10]).toEqual({ month: 11, incomeHal: 122400, costHal: 100000, differenceHal: 22400, incomeCount: 2, costCount: 1 });
    expect(months[0].incomeHal).toBe(0);
  });

  it("formátuje částky a data česky", () => {
    expect(formatKc(125000).replace(/\s/g, " ")).toBe("1 250 Kč");
    expect(formatKc(34990).replace(/\s/g, " ")).toBe("349,90 Kč");
    expect(formatCzDate("2026-11-05")).toBe("5. 11. 2026");
  });
});

describe("bez faktury a řazení (18. 11. 2026)", () => {
  const row = (id: string, entryDate: string, note: string | null, amountHal = 100) =>
    ({ id, kind: "cost", entryDate, title: id, counterparty: null, amountHal, amountNoShippingHal: null, paymentForm: null, invoiceNumber: null, note, source: "x" }) as EconomyRow;
  it("pozná „není faktura“ bez ohledu na velikost písmen", () => {
    expect(isMissingInvoice("NENÍ FAKTURA – urgovat")).toBe(true);
    expect(isMissingInvoice("Není faktura")).toBe(true);
    expect(isMissingInvoice("faktura je")).toBe(false);
    expect(isMissingInvoice(null)).toBe(false);
  });
  it("sečte položky bez faktury", () => {
    expect(missingInvoiceSummary([row("a", "2026-11-01", "není faktura", 42000), row("b", "2026-11-02", null), row("c", "2026-11-03", "Není faktura", 51800)])).toEqual({ count: 2, amountHal: 93800 });
  });
  it("nejnovější nahoře, u stejného data naposledy zapsaný", () => {
    expect(newestFirst([row("a", "2026-11-01", null), row("b", "2026-11-05", null), row("c", "2026-11-05", null)]).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
