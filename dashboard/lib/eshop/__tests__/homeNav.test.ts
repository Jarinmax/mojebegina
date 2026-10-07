// Menu a pruh kategorií z návrhu úvodní stránky: jen existující kategorie, správné odkazy a ikony.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { availableHomeCategories, HOME_CATEGORIES } from "../homeNav";

describe("úvodní stránka — kategorie z návrhu", () => {
  it("pořadí a krátké názvy podle návrhu (Polévky, Sirupy, Čaje, Nápoje, Koktejly)", () => {
    expect(HOME_CATEGORIES.map((c) => c.menuLabel)).toEqual(["Polévky", "Sirupy", "Čaje", "Nápoje", "Koktejly"]);
  });

  it("zobrazí jen kategorie, které jsou v katalogu", () => {
    expect(availableHomeCategories(["caje", "polevky", "neexistuje"]).map((c) => c.slug)).toEqual(["polevky", "caje"]);
  });

  it("každá ikona i obrázek ilustrace existuje v public/", () => {
    const pub = path.join(__dirname, "../../../public");
    for (const c of HOME_CATEGORIES) expect(existsSync(path.join(pub, c.icon)), c.icon).toBe(true);
    for (const f of ["bag-in-box", "kelimek-dynova", "miska-polevka", "dyne", "listky-1", "listky-2", "listky-3", "vetvicka"]) {
      expect(existsSync(path.join(pub, `eshop/hero/${f}.webp`)), f).toBe(true);
    }
  });
});
