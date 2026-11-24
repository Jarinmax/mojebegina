import { describe, expect, it } from "vitest";
import { isAutoDeliveredDue } from "../autoDelivered";

describe("isAutoDeliveredDue", () => {
  const shippedMon = new Date("2026-11-23T20:00:00Z"); // po 23. 11. večer
  it("v úterý ještě ne", () => expect(isAutoDeliveredDue(shippedMon, new Date("2026-11-24T18:00:00Z"))).toBe(false));
  it("ve středu ano (2 pracovní dny)", () => expect(isAutoDeliveredDue(shippedMon, new Date("2026-11-25T18:00:00Z"))).toBe(true));
  it("odesláno v pátek → až v úterý", () => {
    const fri = new Date("2026-11-20T10:00:00Z");
    expect(isAutoDeliveredDue(fri, new Date("2026-11-23T18:00:00Z"))).toBe(false);
    expect(isAutoDeliveredDue(fri, new Date("2026-11-24T18:00:00Z"))).toBe(true);
  });
});
