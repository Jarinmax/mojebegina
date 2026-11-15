import { describe, expect, it } from "vitest";
import { attributeJardaCustomers, type RewardLeadRow, type RewardOrderRow } from "../jardaRewardsValidation";

const d = (s: string) => new Date(s);
const lead = (over: Partial<RewardLeadRow>): RewardLeadRow => ({ id: "L", displayName: "Kontakt", convertedOrganizationId: null, firstJardaCallAt: null, ...over });
const order = (over: Partial<RewardOrderRow>): RewardOrderRow => ({
  id: "O",
  orderNumber: "70000001",
  orderedAt: d("2026-11-10T10:00:00Z"),
  buyerOrganizationId: null,
  sourceLeadId: null,
  subtotalKc: 1000,
  discountKc: 0,
  paymentStatus: "paid",
  fulfillmentStatus: "delivered",
  ...over,
});

describe("Jardův zákazník — hovor v MojeBegina před první objednávkou", () => {
  it("firma přes převedený kontakt: Jardův hovor před objednávkou = jeho zákazník (VIP Dogs)", () => {
    const { customers, excluded } = attributeJardaCustomers(
      [lead({ id: "tatiana", displayName: "Tatiana Lisichkina", convertedOrganizationId: "vip", firstJardaCallAt: d("2026-10-02T13:34:00Z") })],
      [order({ id: "o1", buyerOrganizationId: "vip", subtotalKc: 1516 })]
    );
    expect(excluded).toEqual([]);
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ leadId: "tatiana", organizationId: "vip", paidGoodsKc: 1516 });
  });

  it("soukromá osoba přes source_lead_id (Monika Chuda)", () => {
    const { customers } = attributeJardaCustomers(
      [lead({ id: "monika", firstJardaCallAt: d("2026-11-06T08:41:00Z") })],
      [order({ id: "o2", sourceLeadId: "monika", subtotalKc: 199, orderedAt: d("2026-11-13T09:00:00Z") })]
    );
    expect(customers.map((c) => [c.leadId, c.paidGoodsKc])).toEqual([["monika", 199]]);
  });

  it("kontakt z Jardovy tabulky bez jeho hovoru = NEzapočítá se (Food Fest Crew)", () => {
    const { customers, excluded } = attributeJardaCustomers(
      [lead({ id: "herout", convertedOrganizationId: "ffc", firstJardaCallAt: null })],
      [order({ buyerOrganizationId: "ffc", subtotalKc: 11370, orderedAt: d("2026-10-19T00:00:00Z") })]
    );
    expect(customers).toEqual([]);
    expect(excluded).toEqual([expect.objectContaining({ leadId: "herout", reason: "no_call_before_first_order", paidGoodsKc: 11370 })]);
  });

  it("hovor až PO první objednávce nestačí, ani na pozdější objednávky", () => {
    const { customers, excluded } = attributeJardaCustomers(
      [lead({ id: "x", convertedOrganizationId: "org", firstJardaCallAt: d("2026-11-01T10:00:00Z") })],
      [
        order({ id: "a", buyerOrganizationId: "org", orderedAt: d("2026-10-20T10:00:00Z") }),
        order({ id: "b", buyerOrganizationId: "org", orderedAt: d("2026-11-05T10:00:00Z") }),
      ]
    );
    expect(customers).toEqual([]);
    expect(excluded).toHaveLength(1);
  });

  it("do zaplaceného zboží jen zaplacené a nestornované, bez dopravy, po slevě; stornovaná se nepočítá ani jako první", () => {
    const { customers } = attributeJardaCustomers(
      [lead({ id: "x", convertedOrganizationId: "org", firstJardaCallAt: d("2026-10-05T10:00:00Z") })],
      [
        order({ id: "storno", buyerOrganizationId: "org", orderedAt: d("2026-10-01T10:00:00Z"), fulfillmentStatus: "cancelled" }),
        order({ id: "zaplaceno", buyerOrganizationId: "org", orderedAt: d("2026-10-10T10:00:00Z"), subtotalKc: 2000, discountKc: 200 }),
        order({ id: "nezaplaceno", buyerOrganizationId: "org", orderedAt: d("2026-10-12T10:00:00Z"), paymentStatus: "unpaid", subtotalKc: 5000 }),
      ]
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].paidGoodsKc).toBe(1800);
    expect(customers[0].orders.map((o) => [o.id, o.paid])).toEqual([["zaplaceno", true], ["nezaplaceno", false]]);
    expect(customers[0].firstOrderAt.toISOString()).toBe("2026-10-10T10:00:00.000Z");
  });

  it("kontakt bez objednávek se neobjeví nikde (Café Kandík)", () => {
    const r = attributeJardaCustomers([lead({ id: "kandik", convertedOrganizationId: "k", firstJardaCallAt: null })], []);
    expect(r).toEqual({ customers: [], excluded: [] });
  });

  it("cizí objednávky (jiná firma, bez vazby) se nepřiřadí", () => {
    const r = attributeJardaCustomers(
      [lead({ id: "x", convertedOrganizationId: "org", firstJardaCallAt: d("2026-10-01T00:00:00Z") })],
      [order({ buyerOrganizationId: "jina" }), order({ sourceLeadId: "jiny-lead" })]
    );
    expect(r).toEqual({ customers: [], excluded: [] });
  });
});
