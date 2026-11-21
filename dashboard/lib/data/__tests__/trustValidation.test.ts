import { describe, expect, it } from "vitest";
import { addMonths, computeTrust, type TrustEntry, type TrustPlan } from "../trustValidation";

// Smyšlená data (ne skutečné částky): vklad 12 300 Kč, platba 1 000 Kč každý 10. od 2030-02.
const DEPOSIT: TrustEntry = { id: "d1", entryDate: "2030-01-05", kind: "deposit", amountKc: 12300, description: "Vklad" };
const PLAN: TrustPlan = { id: "p1", label: "Platba", amountKc: 1000, dayOfMonth: 10, startMonth: "2030-02", endMonth: null, note: null };

describe("svěřené peníze — výpočet", () => {
  it("před první splatností: zůstatek = vklad, výhled na 12 plateb, zbude 300", () => {
    const r = computeTrust([DEPOSIT], [PLAN], "2030-01-20");
    expect(r.balanceKc).toBe(12300);
    expect(r.lines).toEqual([{ date: "2030-01-05", kind: "deposit", label: "Vklad", amountKc: 12300, balanceKc: 12300, entryId: "d1", planId: null }]);
    expect(r.forecast).toEqual({
      nextDue: { date: "2030-02-10", label: "Platba – únor 2030", amountKc: 1000 },
      coveredCount: 12,
      lastCoveredDate: "2031-01-10",
      firstUncoveredDate: "2031-02-10",
      remainderKc: 300,
    });
  });

  it("platba se odečte až v den splatnosti", () => {
    expect(computeTrust([DEPOSIT], [PLAN], "2030-02-09").balanceKc).toBe(12300);
    const r = computeTrust([DEPOSIT], [PLAN], "2030-02-10");
    expect(r.balanceKc).toBe(11300);
    expect(r.lines.at(-1)).toMatchObject({ kind: "recurring", label: "Platba – únor 2030", amountKc: -1000, balanceKc: 11300 });
  });

  it("jednorázová platba a další vklad; ve stejný den vklad před platbou", () => {
    const r = computeTrust(
      [DEPOSIT, { id: "w1", entryDate: "2030-03-01", kind: "withdrawal", amountKc: 200, description: "Výdaj" }, { id: "d2", entryDate: "2030-03-01", kind: "deposit", amountKc: 500, description: "Další vklad" }],
      [PLAN],
      "2030-04-01"
    );
    expect(r.lines.map((l) => [l.date, l.amountKc, l.balanceKc])).toEqual([
      ["2030-01-05", 12300, 12300],
      ["2030-02-10", -1000, 11300],
      ["2030-03-01", 500, 11800],
      ["2030-03-01", -200, 11600],
      ["2030-03-10", -1000, 10600],
    ]);
    expect(r).toMatchObject({ depositedKc: 12800, spentKc: 2200 });
  });

  it("změna výše: staré pravidlo končí, nové platí od dalšího měsíce", () => {
    const old = { ...PLAN, endMonth: "2030-03" };
    const next: TrustPlan = { ...PLAN, id: "p2", amountKc: 1100, startMonth: "2030-04" };
    const r = computeTrust([DEPOSIT], [old, next], "2030-05-15");
    expect(r.lines.filter((l) => l.kind === "recurring").map((l) => [l.date, l.amountKc])).toEqual([
      ["2030-02-10", -1000],
      ["2030-03-10", -1000],
      ["2030-04-10", -1100],
      ["2030-05-10", -1100],
    ]);
    expect(r.balanceKc).toBe(8100);
  });

  it("když peníze nestačí, zůstatek jde do mínusu a výhled hlásí nepokrytou platbu", () => {
    const r = computeTrust([DEPOSIT], [PLAN], "2031-02-15");
    expect(r.balanceKc).toBe(-700);
    expect(r.forecast).toMatchObject({ coveredCount: 0, firstUncoveredDate: "2031-03-10" });
  });

  it("addMonths přes přelom roku", () => {
    expect(addMonths("2030-12", 1)).toBe("2031-01");
    expect(addMonths("2031-01", -1)).toBe("2030-12");
  });
});
