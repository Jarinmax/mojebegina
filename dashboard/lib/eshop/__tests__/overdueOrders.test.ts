import { describe, expect, it } from "vitest";
import { buildOverdueEmail, buildOverdueReport, czechHolidays, isWorkingDay, pragueHour, workingDaysAfter, type OverdueCandidate } from "../overdueOrders";

const order = (over: Partial<OverdueCandidate>): OverdueCandidate => ({
  id: "00000000-0000-0000-0000-000000000001",
  number: "70000014",
  customer: "Cafe LÁSKA",
  channel: "eshop",
  fulfillmentStatus: "new",
  totalKc: 758,
  paidAt: new Date("2026-11-13T11:53:17Z"),
  shippedAt: null,
  carrier: null,
  ...over,
});

describe("pracovní dny", () => {
  it("zná svátky včetně Velikonoc", () => {
    expect(czechHolidays(2026).has("2026-04-03")).toBe(true); // Velký pátek
    expect(czechHolidays(2026).has("2026-04-06")).toBe(true); // Velikonoční pondělí
    expect(czechHolidays(2027).has("2027-03-26")).toBe(true);
    expect(czechHolidays(2027).has("2027-03-29")).toBe(true);
    expect(isWorkingDay("2026-11-17")).toBe(false);
    expect(isWorkingDay("2026-11-21")).toBe(false);
    expect(isWorkingDay("2026-11-18")).toBe(true);
  });

  it("počítá dny po úhradě bez víkendu a 17. 11.", () => {
    expect(workingDaysAfter("2026-11-13", "2026-11-23")).toBe(5);
    expect(workingDaysAfter("2026-11-13", "2026-11-24")).toBe(6);
    expect(workingDaysAfter("2026-11-14", "2026-11-16")).toBe(1); // zaplaceno v sobotu
  });

  it("11 h v Praze v zimě i v létě", () => {
    expect(pragueHour(new Date("2026-11-18T10:01:00Z"))).toBe(11);
    expect(pragueHour(new Date("2026-11-18T09:01:00Z"))).toBe(10);
    expect(pragueHour(new Date("2027-06-15T09:01:00Z"))).toBe(11);
  });
});

describe("kontroly", () => {
  it("zaplacená objednávka: 23. 11. ještě ne, 24. 11. ano", () => {
    expect(buildOverdueReport([order({})], new Date("2026-11-23T10:01:00Z")).unshipped).toHaveLength(0);
    const report = buildOverdueReport([order({})], new Date("2026-11-24T10:01:00Z"));
    expect(report.unshipped).toMatchObject([{ number: "70000014", workingDays: 6, since: "2026-11-13" }]);
  });

  it("doručené, stornované a nezaplacené vynechá", () => {
    const now = new Date("2026-12-10T10:01:00Z");
    const report = buildOverdueReport(
      [order({ fulfillmentStatus: "delivered" }), order({ fulfillmentStatus: "cancelled" }), order({ paidAt: null })],
      now,
    );
    expect(report.unshipped).toHaveLength(0);
    expect(report.undelivered).toHaveLength(0);
  });

  it("odeslaná a neoznačená jde do druhého seznamu, řazení od nejstarší", () => {
    const now = new Date("2026-12-10T10:01:00Z");
    const report = buildOverdueReport(
      [
        order({ id: "a", number: "1", paidAt: new Date("2026-12-01T10:00:00Z") }),
        order({ id: "b", number: "2", paidAt: new Date("2026-11-20T10:00:00Z") }),
        order({ id: "c", number: "3", fulfillmentStatus: "handed_to_carrier", carrier: "CoolBalík", shippedAt: new Date("2026-11-25T10:00:00Z") }),
      ],
      now,
    );
    expect(report.unshipped.map((r) => r.number)).toEqual(["2", "1"]);
    expect(report.undelivered.map((r) => r.number)).toEqual(["3"]);
  });

  it("bez nálezů žádný e-mail", () => {
    expect(buildOverdueEmail({ today: "2026-11-18", unshipped: [], undelivered: [] })).toBeNull();
  });
});
