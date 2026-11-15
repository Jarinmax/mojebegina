// Výpočet odměn podle Dohody o odměňování prodejce ze dne 14. 11. 2026.
import { describe, expect, it } from "vitest";
import {
  computeJardaRewards,
  monthlyStatements,
  type RewardAssignment,
  type RewardLead,
  type RewardOrder,
} from "../jardaRewardsValidation";

const d = (s: string) => new Date(s);
const lead = (over: Partial<RewardLead> = {}): RewardLead => ({ id: "L", displayName: "Kontakt", convertedOrganizationId: "ORG", jardaCallTimes: [], ...over });
const assign = (over: Partial<RewardAssignment> = {}): RewardAssignment => ({
  leadId: "L", type: "new", basis: "contract", recordedAt: d("2026-11-15T08:00:00Z"), confirmedAt: d("2026-11-15T10:00:00Z"), upsellProductIds: [], note: null, ...over,
});
let n = 0;
const order = (over: Partial<RewardOrder> = {}): RewardOrder => ({
  id: `o${++n}`, orderNumber: null, orderedAt: d("2026-11-20T10:00:00Z"), paidAt: null, buyerOrganizationId: "ORG", sourceLeadId: null,
  subtotalKc: 1000, discountKc: 0, paymentStatus: "paid", fulfillmentStatus: "delivered", items: [], ...over,
});
const calc = (l: RewardLead, a: RewardAssignment | null, os: RewardOrder[]) => computeJardaRewards([l], a ? [a] : [], os);

describe("bod 1 — Nový zákazník", () => {
  it("5 % během 6 měsíců od první objednávky, potom 3 %", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [
      order({ orderedAt: d("2026-11-20T10:00:00Z"), subtotalKc: 2000 }),
      order({ orderedAt: d("2027-05-19T10:00:00Z"), subtotalKc: 1000 }), // ještě v 6 měsících
      order({ orderedAt: d("2027-05-21T10:00:00Z"), subtotalKc: 1000 }), // už po 6 měsících
    ]);
    expect(r.excluded).toEqual([]);
    expect(r.customers[0].lines.map((l) => [l.percent, l.amountKc])).toEqual([[5, 100], [5, 50], [3, 30]]);
    expect(r.customers[0].totalKc).toBe(180);
  });

  it("bonus 1 000 Kč až po dosažení 15 000 Kč zaplaceného zboží do 6 měsíců (počet objednávek nerozhoduje)", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [
      order({ orderedAt: d("2026-11-20T10:00:00Z"), subtotalKc: 10000 }),
      order({ orderedAt: d("2026-12-20T10:00:00Z"), subtotalKc: 4000, paymentStatus: "unpaid" }), // nezaplacené se nepočítá
      order({ orderedAt: d("2027-01-20T10:00:00Z"), subtotalKc: 5000, paidAt: d("2027-02-02T10:00:00Z") }),
    ]);
    const c = r.customers[0];
    expect(c.bonus).toMatchObject({ eligible: true, reached: true, progressKc: 15000 });
    const bonus = c.lines.find((l) => l.kind === "bonus");
    expect(bonus).toMatchObject({ amountKc: 1000, month: "2027-02" });
    expect(c.totalKc).toBe(500 + 250 + 1000);
  });

  it("nákup po 6 měsících se do bonusu nepočítá", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [
      order({ orderedAt: d("2026-11-20T10:00:00Z"), subtotalKc: 10000 }),
      order({ orderedAt: d("2027-06-01T10:00:00Z"), subtotalKc: 10000 }),
    ]);
    expect(r.customers[0].bonus).toMatchObject({ reached: false, progressKc: 10000 });
  });

  it("základ = zboží po slevě bez dopravy; stornované se nepočítá", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [
      order({ subtotalKc: 1000, discountKc: 100 }),
      order({ subtotalKc: 5000, fulfillmentStatus: "cancelled" }),
    ]);
    expect(r.customers[0].lines.map((l) => [l.baseKc, l.amountKc])).toEqual([[900, 45]]);
  });

  it("kdo nakupoval už před oslovením, není nový zákazník", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [order({ orderedAt: d("2026-10-01T10:00:00Z") }), order()]);
    expect(r.customers).toEqual([]);
    expect(r.excluded[0].reason).toBe("bought_before_approach");
  });
});

describe("bod 4 — evidence před oslovením a Jardův hovor", () => {
  it("bez evidence typu odměňování se nic nepočítá", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), null, [order()]);
    expect(r.excluded[0].reason).toBe("no_assignment");
  });

  it("evidence podle dohody: hovor PŘED evidencí nestačí", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-10T09:00:00Z")] }), assign({ recordedAt: d("2026-11-15T08:00:00Z") }), [order()]);
    expect(r.excluded[0].reason).toBe("no_call_after_assignment");
  });

  it("bod 6 — rozpracovaný kontakt potvrzený při podpisu: platí i dřívější hovor a objednávka (VIP Dogs)", () => {
    const r = calc(
      lead({ jardaCallTimes: [d("2026-10-02T13:34:00Z"), d("2026-10-21T08:52:00Z")] }),
      assign({ basis: "confirmed_at_signing", recordedAt: d("2026-11-14T12:00:00Z") }),
      [order({ orderedAt: d("2026-11-10T10:00:00Z"), paidAt: d("2026-11-10T11:00:00Z"), subtotalKc: 1516 })]
    );
    expect(r.customers[0].lines).toEqual([expect.objectContaining({ percent: 5, baseKc: 1516, amountKc: 75.8, month: "2026-11" })]);
  });

  it("návrh prodejce, který vedení nepotvrdilo, se nepočítá — ani když zákazník nakoupí", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ confirmedAt: null }), [
      order({ orderedAt: d("2026-11-20T10:00:00Z"), subtotalKc: 2000 }),
    ]);
    expect(r.customers).toEqual([]);
    expect(r.excluded.map((e) => [e.reason, e.paidGoodsKc])).toEqual([["not_confirmed", 2000]]);
  });

  it("návrh navržený před hovorem a potvrzený až po nákupu se počítá od hovoru (rozhoduje čas návrhu)", () => {
    const r = calc(
      lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }),
      assign({ recordedAt: d("2026-11-15T08:00:00Z"), confirmedAt: d("2026-11-25T08:00:00Z") }),
      [order({ orderedAt: d("2026-11-20T10:00:00Z"), paidAt: d("2026-11-20T10:00:00Z"), subtotalKc: 2000 })]
    );
    expect(r.customers[0].totalKc).toBe(100);
  });

  it("evidovaný bez objednávky zatím nic nemá a není ani vyřazený (čeká na nákup)", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), []);
    expect(r).toEqual({ customers: [], excluded: [] });
  });

  it("objednávka jen před oslovením → Nový zákazník se nepočítá", () => {
    const r = calc(
      lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }),
      assign(),
      [order({ orderedAt: d("2026-11-15T10:00:00Z"), paidAt: d("2026-11-15T11:00:00Z"), subtotalKc: 500 })]
    );
    expect(r.excluded.map((e) => e.reason)).toEqual(["bought_before_approach"]);
  });
});

describe("bod 2 — Obnovený zákazník", () => {
  it("3 % ze všeho od obnovení, bonus do 6 měsíců od obnovení", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ type: "renewed" }), [
      order({ orderedAt: d("2026-07-01T10:00:00Z"), subtotalKc: 9999 }), // před oslovením, ≥ 3 měsíce zpět
      order({ orderedAt: d("2026-11-20T10:00:00Z"), subtotalKc: 16000 }),
    ]);
    const c = r.customers[0];
    expect(c.lines.map((l) => [l.kind, l.amountKc])).toEqual([["commission", 480], ["bonus", 1000]]);
  });

  it("objednal méně než 3 měsíce před oslovením → není obnovený", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ type: "renewed" }), [
      order({ orderedAt: d("2026-09-01T10:00:00Z") }),
      order({ orderedAt: d("2026-11-20T10:00:00Z") }),
    ]);
    expect(r.excluded[0].reason).toBe("not_renewed_gap");
  });

  it("nikdy nenakoupil → není obnovený (je to nový zákazník)", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ type: "renewed" }), [order()]);
    expect(r.excluded[0].reason).toBe("not_renewed_gap");
  });
});

describe("bod 3 — Aktivní zákazník, další produkt", () => {
  const polevka = { productId: "polevka", productName: "Dýňová polévka — 3 l", lineTotalKc: 0 };
  it("3 % jen z nového produktu (podíl po slevě), bez bonusu; polévky se nepočítají", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ type: "upsell", upsellProductIds: ["sirup"] }), [
      order({ orderedAt: d("2026-10-01T10:00:00Z"), items: [{ ...polevka, lineTotalKc: 1000 }], subtotalKc: 1000 }),
      order({
        orderedAt: d("2026-11-20T10:00:00Z"),
        subtotalKc: 20000,
        discountKc: 2000,
        items: [{ ...polevka, lineTotalKc: 4000 }, { productId: "sirup", productName: "Zázvorový sirup — 3 l", lineTotalKc: 16000 }],
      }),
    ]);
    const c = r.customers[0];
    expect(c.bonus.eligible).toBe(false);
    expect(c.lines.map((l) => [l.kind, l.baseKc, l.amountKc])).toEqual([["commission", 14400, 432]]);
    expect(c.upsellProducts).toEqual(["Zázvorový sirup — 3 l"]);
  });

  it("produkt, který zákazník kupoval už předtím (i v jiném balení), se nepočítá", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign({ type: "upsell", upsellProductIds: ["sirup"] }), [
      order({ orderedAt: d("2026-10-01T10:00:00Z"), items: [{ productId: "sirup", productName: "Zázvorový sirup — 750 g", lineTotalKc: 199 }] }),
      order({ items: [{ productId: "sirup", productName: "Zázvorový sirup — 3 l", lineTotalKc: 499 }] }),
    ]);
    expect(r.excluded[0].reason).toBe("product_already_bought");
  });
});

describe("měsíční vyúčtování", () => {
  it("seskupí podle měsíce zaplacení, nejnovější nahoře", () => {
    const r = calc(lead({ jardaCallTimes: [d("2026-11-16T09:00:00Z")] }), assign(), [
      order({ orderedAt: d("2026-11-20T10:00:00Z"), paidAt: d("2026-11-21T10:00:00Z"), subtotalKc: 1000 }),
      order({ orderedAt: d("2026-11-30T22:30:00Z"), paidAt: d("2026-11-30T23:30:00Z"), subtotalKc: 2000 }), // 1. 12. v Praze
    ]);
    expect(monthlyStatements(r.customers).map((m) => [m.month, m.totalKc])).toEqual([["2026-12", 100], ["2026-11", 50]]);
  });
});
