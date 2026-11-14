// Druh obalu ve výběru balení (14. 11. 2026): jen zobrazení, název balení zůstává objem.
import { describe, expect, it } from "vitest";
import { packagingKind } from "../packaging";

describe("packagingKind", () => {
  it("3 l = begina s kohoutkem; 650 ml a 500 ml = sáček se šroubovacím uzávěrem", () => {
    expect(packagingKind("3 l")).toBe("begina s kohoutkem");
    expect(packagingKind("650 ml")).toBe("sáček se šroubovacím uzávěrem");
    expect(packagingKind("500 ml")).toBe("sáček se šroubovacím uzávěrem");
    expect(packagingKind(" 3 l ")).toBe("begina s kohoutkem");
  });
  it("neznámé balení nebo bez štítku: nic", () => {
    expect(packagingKind("750 g")).toBeNull();
    expect(packagingKind(null)).toBeNull();
  });
});
