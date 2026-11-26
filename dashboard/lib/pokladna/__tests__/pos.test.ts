import { describe, expect, it } from "vitest";
import { cartTotal, changeDue, changeQuantity, formatKc, monthlyIncome, parsePriceToHal, posVariableSymbol, receiptNumber, summarizeDay } from "../pos";

const soup = { itemId: "a", name: "Dýňová polévka", unitPriceHal: 8900 };

describe("pokladna – čisté funkce", () => {
  it("přidává a ubírá kusy, na nule položku smaže", () => {
    let lines = changeQuantity([], soup, 1);
    lines = changeQuantity(lines, soup, 1);
    expect(lines).toEqual([{ ...soup, quantity: 2 }]);
    expect(cartTotal(lines)).toBe(17800);
    expect(changeQuantity(lines, soup, -2)).toEqual([]);
  });

  it("vrací peníze a pozná málo hotovosti", () => {
    expect(changeDue(17800, 20000)).toBe(2200);
    expect(changeDue(17800, 10000)).toBeNull();
  });

  it("číslo účtenky a VS", () => {
    expect(receiptNumber(2026, 123)).toBe("2026/000123");
    expect(posVariableSymbol(2027, 45)).toBe("9270000045");
    expect(posVariableSymbol(2027, 45)).toHaveLength(10);
  });

  it("ceny", () => {
    expect(parsePriceToHal("129")).toBe(12900);
    expect(parsePriceToHal("49,50 Kč")).toBe(4950);
    expect(parsePriceToHal("-5")).toBeNull();
    expect(formatKc(125000)).toBe("1 250 Kč");
  });

  it("souhrn dne bez stornovaných", () => {
    expect(
      summarizeDay([
        { paymentMethod: "cash", totalHal: 10000, cancelled: false },
        { paymentMethod: "card", totalHal: 5000, cancelled: false },
        { paymentMethod: "qr", totalHal: 3000, cancelled: false },
        { paymentMethod: "cash", totalHal: 9999, cancelled: true },
      ]),
    ).toEqual({ cashHal: 10000, cardHal: 5000, qrHal: 3000, totalHal: 18000, receiptCount: 3, cancelledCount: 1 });
  });

  it("měsíční řádek do Financí", () => {
    const income = monthlyIncome("2027-03", [
      { businessDate: "2027-03-02", cashHal: 100000, cardHal: 50000, qrHal: 0 },
      { businessDate: "2027-03-01", cashHal: 20000, cardHal: 0, qrHal: 10000 },
      { businessDate: "2027-02-28", cashHal: 99900, cardHal: 0, qrHal: 0 },
    ]);
    expect(income?.amountHal).toBe(180000);
    expect(income?.entryDate).toBe("2027-03-02");
    expect(income?.note).toContain("období 1.–2. 3. 2027");
    expect(monthlyIncome("2027-04", [])).toBeNull();
  });
});
