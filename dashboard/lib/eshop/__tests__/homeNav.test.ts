// Menu a pruh kategorií z návrhu úvodní stránky: jen existující kategorie, správné odkazy a ikony.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { availableHomeCategories, HOME_CATEGORIES, stripCategories } from "../homeNav";

describe("úvodní stránka — kategorie z návrhu", () => {
  it("pořadí a krátké názvy podle návrhu (Polévky, Sirupy, Čaje, Nápoje, Koktejly) + Zmrzliny (8. 10. 2026)", () => {
    expect(HOME_CATEGORIES.map((c) => c.menuLabel)).toEqual(["Polévky", "Sirupy", "Čaje", "Nápoje", "Koktejly", "Zmrzliny"]);
  });

  it("Zmrzliny: v menu, jakmile je kategorie v katalogu; v pruhu ikon až s ikonou", () => {
    const all = availableHomeCategories(["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"]);
    expect(all.map((c) => c.slug)).toContain("zmrzliny");
    expect(stripCategories(all).map((c) => c.slug)).toEqual(["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly"]);
    // bez řádku v DB se nikde neukáže
    expect(availableHomeCategories(["polevky"]).map((c) => c.slug)).toEqual(["polevky"]);
  });

  it("zobrazí jen kategorie, které jsou v katalogu", () => {
    expect(availableHomeCategories(["caje", "polevky", "neexistuje"]).map((c) => c.slug)).toEqual(["polevky", "caje"]);
  });

  it("každá ikona i obrázek ilustrace existuje v public/", () => {
    const pub = path.join(__dirname, "../../../public");
    for (const c of stripCategories(HOME_CATEGORIES)) expect(existsSync(path.join(pub, c.icon)), c.icon).toBe(true);
    for (const f of ["bag-in-box", "kelimek-dynova", "miska-polevka", "dyne", "listky-1", "listky-2", "listky-3", "vetvicka"]) {
      expect(existsSync(path.join(pub, `eshop/hero/${f}.webp`)), f).toBe(true);
    }
  });
});
