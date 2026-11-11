// Menu a pruh kategorií z návrhu úvodní stránky: jen existující kategorie, správné odkazy a ikony.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { availableHomeCategories, HOME_CATEGORIES, mainMenu, stripCategories, MOJE_BEGINA_LINK } from "../homeNav";

describe("úvodní stránka — kategorie z návrhu", () => {
  it("plné názvy kategorií podle zadání Lucie (6. 11. 2026)", () => {
    expect(HOME_CATEGORIES.map((c) => c.menuLabel)).toEqual([
      "Čerstvé polévky",
      "Bylinné sirupy",
      "Čaje",
      "Ovocné nápoje",
      "Alkoholické koktejly",
      "Zmrzliny",
    ]);
  });

  it("pruh pod hero: všech šest kategorií včetně Zmrzlin s ilustrací", () => {
    const all = availableHomeCategories(["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"]);
    expect(stripCategories(all).map((c) => c.stripLabel)).toEqual([
      "Čerstvé polévky",
      "Bylinné sirupy",
      "Čaje",
      "Ovocné nápoje",
      "Alkoholické koktejly",
      "Zmrzliny",
    ]);
    // bez řádku v DB se nikde neukáže
    expect(availableHomeCategories(["polevky"]).map((c) => c.slug)).toEqual(["polevky"]);
  });

  it("horní menu: Nápoje jako rozbalovací položka s Čaji, Ovocnými nápoji a Alkoholickými koktejly", () => {
    const menu = mainMenu(
      availableHomeCategories(["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"]),
      [
        { kind: "link", href: "/o-nas", label: "O nás" },
        { kind: "link", href: "/o-vode", label: "O vodě" },
        MOJE_BEGINA_LINK,
      ]
    );
    // pořadí podle zadání majitele 9. 11. 2026 (MojeBegina = zákaznická část aplikace)
    expect(menu.map((e) => e.label)).toEqual(["Čerstvé polévky", "Bylinné sirupy", "Nápoje", "Zmrzliny", "O nás", "O vodě", "MojeBegina"]);
    expect(menu[6]).toEqual({ kind: "link", href: "https://moje.begina.cz/", label: "MojeBegina", external: true });
    const drinks = menu[2];
    expect(drinks.kind).toBe("group");
    if (drinks.kind !== "group") return;
    expect(drinks.items).toEqual([
      { kind: "link", href: "/kategorie/caje", label: "Čaje" },
      { kind: "link", href: "/kategorie/ovocne-napoje", label: "Ovocné nápoje" },
      { kind: "link", href: "/kategorie/koktejly", label: "Alkoholické koktejly" },
    ]);
  });

  it("bez nápojových kategorií v katalogu se Nápoje nezobrazí", () => {
    expect(mainMenu(availableHomeCategories(["polevky", "zmrzliny"])).map((e) => e.label)).toEqual([
      "Čerstvé polévky",
      "Zmrzliny",
    ]);
  });

  it("zobrazí jen kategorie, které jsou v katalogu", () => {
    expect(availableHomeCategories(["caje", "polevky", "neexistuje"]).map((c) => c.slug)).toEqual(["polevky", "caje"]);
  });

  it("každá ikona i fotografie úvodu existuje v public/", () => {
    const pub = path.join(__dirname, "../../../public");
    for (const c of stripCategories(HOME_CATEGORIES)) expect(existsSync(path.join(pub, c.icon)), c.icon).toBe(true);
    // úvod od 8. 11. 2026: jedna skutečná fotografie (bez krabice)
    for (const f of ["polevka-begina-caj-limonada-v3"]) {
      expect(existsSync(path.join(pub, `eshop/hero/${f}.webp`)), f).toBe(true);
    }
  });
});
