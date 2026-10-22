// Jarda – volání a provize, část 2 — čistý výpočet 3% provize a
// akvizičního bonusu (lib/data/commission.ts), bez DB.
import { describe, expect, it } from "vitest";
import {
  computeCommissionAndBonus,
  ACQUISITION_BONUS_THRESHOLD_KC,
  ACQUISITION_BONUS_WINDOW_DAYS,
  type CommissionOrderRow,
} from "../commission";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACQUIRER = "jarda";

function order(subtotalKc: number, discountKc: number, orderedAt: string): CommissionOrderRow {
  return { subtotalKc, discountKc, orderedAt: new Date(orderedAt) };
}

describe("computeCommissionAndBonus — provize 3 %", () => {
  it("počítá 3 % ze zaplaceného zboží bez dopravy, po slevách, od currentOwnerSince", () => {
    const result = computeCommissionAndBonus({
      orders: [order(1000, 100, "2026-01-10"), order(2000, 0, "2026-02-10")],
      currentOwnerSince: new Date("2026-02-01"),
      acquiredByUserId: null,
      acquiredAt: null,
      bonusPaidAt: null,
      now: new Date("2026-03-01"),
    });
    // Jen druhá objednávka je po currentOwnerSince — "nový správce nedostává
    // provizi zpětně ze starých objednávek".
    expect(result.commissionBaseKc).toBe(2000);
    expect(result.commissionKc).toBe(60);
  });

  it("currentOwnerSince = null (chybí otevřené období v organization_owner_history) počítá provizi ze VŠECH zaplacených objednávek", () => {
    const result = computeCommissionAndBonus({
      orders: [order(1000, 100, "2020-01-10"), order(2000, 0, "2026-02-10")],
      currentOwnerSince: null,
      acquiredByUserId: null,
      acquiredAt: null,
      bonusPaidAt: null,
      now: new Date("2026-03-01"),
    });
    expect(result.commissionBaseKc).toBe(900 + 2000);
    expect(result.commissionSince).toBeNull();
  });
});

describe("computeCommissionAndBonus — akviziční bonus", () => {
  it("bez acquiredByUserId/acquiredAt je bonus 'unknown' (nedá se doložit)", () => {
    const result = computeCommissionAndBonus({
      orders: [],
      currentOwnerSince: null,
      acquiredByUserId: null,
      acquiredAt: null,
      bonusPaidAt: null,
      now: new Date("2026-03-01"),
    });
    expect(result.bonusStatus).toBe("unknown");
    expect(result.bonusEligible).toBe(false);
  });

  it("zákazník, který nakupoval PŘED acquiredAt, nemá nárok (rule 2: přidělení už nakupujícího nezakládá bonus)", () => {
    const acquiredAt = new Date("2026-02-01");
    const result = computeCommissionAndBonus({
      orders: [order(20000, 0, "2025-06-01"), order(5000, 0, "2026-02-05")],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: null,
      now: new Date("2026-03-01"),
    });
    expect(result.bonusEligible).toBe(false);
    expect(result.bonusStatus).toBe("not_eligible");
  });

  it("'running' dokud neběží lhůta a hranice není dosažena", () => {
    const acquiredAt = new Date("2026-02-01");
    const result = computeCommissionAndBonus({
      orders: [order(10000, 0, "2026-02-10")],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: null,
      now: new Date("2026-02-15"),
    });
    expect(result.bonusEligible).toBe(true);
    expect(result.bonusStatus).toBe("running");
    expect(result.bonusProgressKc).toBe(10000);
    expect(result.bonusRemainingKc).toBe(5000);
  });

  it("'reached' po dosažení 15 000 Kč uvnitř šestiměsíční lhůty", () => {
    const acquiredAt = new Date("2026-02-01");
    const result = computeCommissionAndBonus({
      orders: [order(10000, 0, "2026-02-10"), order(6000, 500, "2026-03-01")],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: null,
      now: new Date("2026-03-05"),
    });
    expect(result.bonusProgressKc).toBe(10000 + 5500);
    expect(result.bonusStatus).toBe("reached");
    expect(result.bonusRemainingKc).toBe(0);
  });

  it("'not_eligible' když lhůta vypršela bez dosažení hranice (ani pozdější nákupy ji nezachrání)", () => {
    const acquiredAt = new Date("2026-01-01");
    const afterDeadline = new Date(acquiredAt.getTime() + (ACQUISITION_BONUS_WINDOW_DAYS + 1) * DAY_MS);
    const result = computeCommissionAndBonus({
      orders: [order(5000, 0, "2026-01-10"), order(20000, 0, afterDeadline.toISOString())],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: null,
      now: afterDeadline,
    });
    expect(result.bonusProgressKc).toBe(5000); // pozdější objednávka je mimo okno, nezapočítá se
    expect(result.bonusStatus).toBe("not_eligible");
  });

  it("'paid' má prioritu, i když je status jinak 'reached'", () => {
    const acquiredAt = new Date("2026-01-01");
    const result = computeCommissionAndBonus({
      orders: [order(ACQUISITION_BONUS_THRESHOLD_KC, 0, "2026-01-10")],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: new Date("2026-01-20"),
      now: new Date("2026-02-01"),
    });
    expect(result.bonusStatus).toBe("paid");
  });

  it("bonusDaysLeft se počítá z `now`, ne Date.now() (React purity v komponentě)", () => {
    const acquiredAt = new Date("2026-01-01");
    const result = computeCommissionAndBonus({
      orders: [],
      currentOwnerSince: null,
      acquiredByUserId: ACQUIRER,
      acquiredAt,
      bonusPaidAt: null,
      now: new Date(acquiredAt.getTime() + 10 * DAY_MS),
    });
    expect(result.bonusDaysLeft).toBe(ACQUISITION_BONUS_WINDOW_DAYS - 10);
  });
});
