import { describe, expect, it } from "vitest";
import {
  customerPartnerStatus,
  invoiceNumberFromLabel,
  mergeCustomerPurchases,
  parseCzechDate,
  type PurchaseInvoiceInput,
  type PurchaseOrderInput,
} from "../customerPurchasesMerge";
import { partnerTiers } from "@/mock/partnerProgram";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const order = (over: Partial<PurchaseOrderInput>): PurchaseOrderInput => ({
  id: "o1",
  orderNumber: "70000004",
  invoiceNumber: null,
  orderedAt: d("2026-10-27"),
  totalKc: 12204,
  goodsKc: 11937,
  channel: "manual",
  ...over,
});
const invoice = (over: Partial<PurchaseInvoiceInput>): PurchaseInvoiceInput => ({
  number: "20260197",
  issuedAt: d("2026-10-26"),
  totalKc: 12203.57,
  goodsKc: 11937,
  paid: true,
  ...over,
});

describe("mergeCustomerPurchases", () => {
  it("faktury bez objednávky jsou samostatné nákupy (Art-n-coffee dřív 0 Kč)", () => {
    const result = mergeCustomerPurchases([], [
      invoice({ number: "20260209", issuedAt: d("2026-11-10"), totalKc: 3032 }),
      invoice({ number: "20260207", issuedAt: d("2026-11-05"), totalKc: 2274 }),
    ]);
    expect(result.count).toBe(2);
    expect(result.totalKc).toBe(5306);
    expect(result.lastAt).toEqual(d("2026-11-10"));
    expect(result.purchases.map((p) => p.source)).toEqual(["invoice", "invoice"]);
  });

  it("objednávka s navázanou fakturou se započte jednou", () => {
    const result = mergeCustomerPurchases(
      [order({ id: "a", invoiceNumber: "9260002", totalKc: 7184, orderedAt: d("2026-11-08"), channel: "eshop" })],
      [invoice({ number: "9260002", totalKc: 7184, issuedAt: d("2026-11-08") })]
    );
    expect(result.count).toBe(1);
    expect(result.purchases[0]).toMatchObject({ orderId: "a", invoiceNumber: "9260002", source: "eshop" });
  });

  it("ruční objednávka bez vazby se spáruje s fakturou podle částky (±1 Kč) a data (≤ 3 dny)", () => {
    const result = mergeCustomerPurchases([order({})], [invoice({})]);
    expect(result.count).toBe(1);
    expect(result.purchases[0].invoiceNumber).toBe("20260197");
    expect(result.totalKc).toBe(12204);
  });

  it("stejná částka, ale daleko od data objednávky = dva různé nákupy", () => {
    const result = mergeCustomerPurchases(
      [order({ totalKc: 758, orderedAt: d("2026-10-30") })],
      [invoice({ totalKc: 758, issuedAt: d("2026-10-22") })]
    );
    expect(result.count).toBe(2);
  });

  it("jedna faktura se nespáruje se dvěma objednávkami", () => {
    const result = mergeCustomerPurchases(
      [order({ id: "a", totalKc: 758, orderedAt: d("2026-10-22") }), order({ id: "b", totalKc: 758, orderedAt: d("2026-10-23") })],
      [invoice({ totalKc: 758, issuedAt: d("2026-10-22") })]
    );
    expect(result.count).toBe(2);
    expect(result.purchases.filter((p) => p.invoiceNumber === "20260197")).toHaveLength(1);
  });
});

describe("pomocné převody", () => {
  it("parseCzechDate a číslo faktury z popisku", () => {
    expect(parseCzechDate("8. 11. 2026")).toEqual(d("2026-11-08"));
    expect(parseCzechDate("nesmysl")).toBeNull();
    expect(invoiceNumberFromLabel("Faktura č. 20260209")).toBe("20260209");
  });
});

describe("customerPartnerStatus", () => {
  const now = new Date("2026-11-18T10:00:00Z");

  it("počítá úroveň na příští měsíc a kolik chybí", () => {
    const status = customerPartnerStatus(
      [
        { paidAt: new Date("2026-11-08T12:00:00Z"), goodsKc: 3000 },
        { paidAt: new Date("2026-10-20T12:00:00Z"), goodsKc: 6000 },
      ],
      partnerTiers,
      now
    );
    expect(status).toMatchObject({
      eligible: true,
      thisMonthGoodsKc: 3000,
      nextMonthTierLabel: "standardní cena",
      nextTierLabel: "sleva 3 %",
      remainingKc: 2001,
      currentTierLabel: "sleva 3 %",
    });
  });

  it("nejvyšší úroveň nemá další", () => {
    const status = customerPartnerStatus([{ paidAt: new Date("2026-11-02T12:00:00Z"), goodsKc: 25000 }], partnerTiers, now);
    expect(status).toMatchObject({ eligible: true, nextTierLabel: null, remainingKc: 0, nextMonthTierLabel: "individuální dohoda" });
  });
});
