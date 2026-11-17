import { describe, expect, it } from "vitest";
import { ETIKETY_CATEGORIES, OTHER_SIZE, categorySizes, groupSize, groupTypeLabel, hasSizes } from "../structure";

const cat = (slug: string) => ETIKETY_CATEGORIES.find((c) => c.slug === slug)!;

describe("etikety — nejdřív balení, potom typ", () => {
  it("sirupy mají balení 3 l, 650 ml, 100 ml a ostatní (krabice setu)", () => {
    expect(categorySizes(cat("sirupy")).map((s) => s.label)).toEqual(["3 l", "650 ml", "100 ml", "Ostatní"]);
    expect(categorySizes(cat("alkoholicke-koktejly")).map((s) => s.label)).toEqual(["3 l", "500 ml"]);
  });

  it("pod balením 650 ml nejsou žádné etikety na 3 l", () => {
    const groups = cat("sirupy").groups!.filter((g) => groupSize(g.slug) === "650ml");
    expect(groups.map((g) => g.slug)).toEqual(["650ml", "predni-barevne-650ml", "predni-cervenocerne-650ml", "predni-cernobile-650ml"]);
    expect(groups.map((g) => groupTypeLabel(g))).toEqual(["Složení (zadní)", "Přední – barevné", "Přední – Brother červeno-černé (DK-22251)", "Přední – Brother černobílé (DK-22212)"]);
  });

  it("kategorie s jedním balením krok balení nemají", () => {
    expect(hasSizes(cat("polevky"))).toBe(false);
    expect(hasSizes(cat("sk-sirupy"))).toBe(true);
    expect(groupSize("ochutnavkovy-set")).toBe(OTHER_SIZE);
    expect(groupTypeLabel({ slug: "3l", label: "Zloženie 3 l" }, true)).toBe("Zloženie (zadné)");
  });
});
