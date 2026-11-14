// „Vrácení a reklamace“: u všeho chlazeného (polévky, čaje, ovocné nápoje, koktejly)
// stejná věta o tom, že nelze odstoupit bez udání důvodu; sirupy ji nemají.
import { describe, expect, it } from "vitest";
import { categoryFoodExtras } from "../categoryFoodInfo";
import { SOUP_RETURNS_BEFORE } from "../soupFoodInfo";

describe("categoryFoodExtras – vrácení", () => {
  it("koktejly od 14. 11. 2026 jako polévky", () => {
    for (const slug of ["svarak-deluxe", "lady-carneval", "granatovy-bond", "kosmopolitan"]) {
      expect(categoryFoodExtras("koktejly", slug).returns?.before).toBe(SOUP_RETURNS_BEFORE);
    }
  });
  it("polévky, čaje a ovocné nápoje beze změny; sirupy mají vlastní text", () => {
    expect(categoryFoodExtras("polevky", "dynova-polevka").returns?.before).toBe(SOUP_RETURNS_BEFORE);
    expect(categoryFoodExtras("caje", "lipovy-caj").returns?.before).toBe(SOUP_RETURNS_BEFORE);
    expect(categoryFoodExtras("ovocne-napoje", "dum-u-jezera").returns?.before).toBe(SOUP_RETURNS_BEFORE);
    expect(categoryFoodExtras("sirupy", "lipovy-sirup").returns?.before).not.toBe(SOUP_RETURNS_BEFORE);
  });
});
