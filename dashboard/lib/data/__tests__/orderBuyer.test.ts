import { describe, expect, it } from "vitest";
import {
  PRIVATE_CUSTOMER_LABEL,
  buyerDisplayName,
  distinctOrganizationIds,
  formatOrderNumber,
} from "../orderBuyer";

describe("orderBuyer — objednávka bez organizace (ESHOP 1.0, krok 7)", () => {
  it("distinctOrganizationIds vynechá soukromé zákazníky (NULL) a duplicity", () => {
    expect(
      distinctOrganizationIds([
        { buyerOrganizationId: "a" },
        { buyerOrganizationId: null },
        { buyerOrganizationId: "a" },
        { buyerOrganizationId: "b" },
      ])
    ).toEqual(["a", "b"]);
    expect(distinctOrganizationIds([{ buyerOrganizationId: null }])).toEqual([]);
  });

  it("buyerDisplayName: organizace, soukromý zákazník, nebo smazaná organizace", () => {
    const names = new Map([["a", "The Cup s.r.o."]]);
    expect(buyerDisplayName("a", names)).toBe("The Cup s.r.o.");
    expect(buyerDisplayName(null, names)).toBe(PRIVATE_CUSTOMER_LABEL);
    expect(buyerDisplayName("x", names)).toBe("Neznámá organizace");
  });

  it("formatOrderNumber: číslo jen když existuje (před krokem 6b vždy NULL)", () => {
    expect(formatOrderNumber(5094)).toBe("č. 5094");
    expect(formatOrderNumber(null)).toBeNull();
  });
});
