import { describe, expect, it } from "vitest";
import { countryCode, estimatedDeliveryDate, googleReviewsPayload, GCR_MERCHANT_ID } from "../googleReviews";

describe("Zákaznické recenze Google", () => {
  it("země doručení jako ISO kód", () => {
    expect(countryCode("Česko")).toBe("CZ");
    expect(countryCode("Slovensko")).toBe("SK");
    expect(countryCode(null)).toBe("CZ");
  });

  it("odhad doručení = objednávka + 7 dní, pražské datum YYYY-MM-DD", () => {
    expect(estimatedDeliveryDate(new Date("2026-11-23T23:30:00Z"))).toBe("2026-12-01");
    expect(estimatedDeliveryDate(new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-30");
  });

  it("bez čísla objednávky nebo platného e-mailu nic nenabízí", () => {
    const base = { orderNumber: 4321, email: "jana@example.cz", country: "Česko", orderedAt: new Date("2026-11-23T10:00:00Z") };
    expect(googleReviewsPayload(base)).toEqual({
      merchant_id: GCR_MERCHANT_ID,
      order_id: "4321",
      email: "jana@example.cz",
      delivery_country: "CZ",
      estimated_delivery_date: "2026-11-30",
    });
    expect(googleReviewsPayload({ ...base, orderNumber: null })).toBeNull();
    expect(googleReviewsPayload({ ...base, email: "neplatny" })).toBeNull();
  });
});
