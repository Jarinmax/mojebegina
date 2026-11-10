// ESHOP 1.0 — katalogový skript Čerstvé polévky (docs/eshop-catalog/4x_*)
// nad PGlite se všemi migracemi: přesně ty soubory, které vedení spustí
// v Neon SQL Editoru (Preview, později Production).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { parseDescription } from "../productDescription";
import { expectedCatalogAfterSeed } from "../seedFromCatalog";
import { createMigratedDb } from "./helpers/migratedDb";
import { polevkyRollbackSql, polevkySql } from "../../../scripts/eshop-catalog/build-polevky.mjs";
import { SOUP_SHELF_LIFE, SOUP_STORAGE } from "../soupFoodInfo";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-catalog");
const PUBLIC = path.join(__dirname, "../../../public");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

describe("katalog — Čerstvé polévky: soubory", () => {
  it("41 a 49 = výstup generátoru (scripts/eshop-catalog/build-polevky.mjs)", () => {
    expect(file("41_polevky.sql")).toBe(polevkySql());
    expect(file("49_polevky_rollback.sql")).toBe(polevkyRollbackSql());
  });
});

describe("katalog — Čerstvé polévky", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const soups = async () => (await loadCatalog(db)).products.filter((p) => p.category === "polevky");

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
  });

  it("před: polévky ze základního katalogu", async () => {
    expect(await check(pg, "40_polevky_before.sql")).toBe("3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0");
  });

  it("skript a kontrola po; opakované spuštění nic nezdvojí", async () => {
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("6 | 1 | ano | 3 l | 379 | 12 | 12 | 1 | 379 Kč, 12 porcí | 379 Kč, 12 porcí");
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("6 | 1 | ano | 3 l | 379 | 12 | 12 | 1 | 379 Kč, 12 porcí | 379 Kč, 12 porcí");
  });

  it("e-shop: Dýňová polévka z begina.cz (vláknina, sekce Pro koho, fotka); ostatní polévky beze změny", async () => {
    const list = await soups();
    expect(list.map((p) => p.name)).toEqual(["Dýňová polévka", "Kulajda", "Tomatová polévka", "Rajčatová polévka s červenou řepou", "Gulášová polévka z hlívy ústřičné", "Špenátová polévka"]);
    const dyne = list[0];
    expect(dyne.shortDescription).toBe("Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.");
    expect(dyne.highlights).toEqual(["rostlinná receptura", "z čisté filtrované vody"]);
    expect(dyne.variants).toEqual([
      expect.objectContaining({ sku: "dynova-polevka", label: "3 l", priceKc: 379, servings: 12, volumeMl: 3000 }),
    ]);
    expect(dyne.image).toBe("/eshop/polevky/dynova-polevka-miska.jpg");
    expect(dyne.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/dynova-polevka-miska.jpg", "/eshop/polevky/dynova-polevka-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, dyne.image!))).toBe(true);
    expect(dyne.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 283 kJ / 68 kcal, tuky 4 g (z toho nasycené 2,7 g), sacharidy 7,6 g (z toho cukry 2 g), bílkoviny 1 g, sůl 0,8 g, vláknina 1,1 g"
    );
    expect(dyne.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, dýně 39 %, kokosové mléko 15 %/);
    // právní upozornění už není ve Skladování (samostatný řádek Vrácení a reklamace)
    expect(dyne.foodInfo.storage).not.toMatch(/odstoupení|nelze jej vrátit/);
    // všechny polévky: bez alergenů, trvanlivost 14 dnů (údaje vedení)
    for (const soup of list) {
      expect(soup.foodInfo.allergens, soup.slug).toEqual([]);
      expect(soup.foodInfo.shelfLife, soup.slug).toBe(SOUP_SHELF_LIFE);
      expect(soup.foodInfo.storage, soup.slug).toBe(SOUP_STORAGE);
      expect(soup.foodInfo.preparation, soup.slug).toBe("Stačí ohřát a servírovat.");
      expect(soup.foodInfo.returns?.linkText, soup.slug).toBe("obchodních podmínek");
    }
    const parsed = parseDescription(dyne.description);
    expect(parsed.intro).toHaveLength(3);
    expect(parsed.sections).toEqual([{ title: "Pro koho je vhodná", blocks: [{ type: "ul", items: expect.any(Array) }] }]);
    const category = (await loadCatalog(db)).categories.find((c) => c.slug === "polevky")!;
    expect(category.detailSections[0]).toEqual(expect.objectContaining({ title: "Vhodné také pro gastro provozy a kanceláře" }));
    expect(category.detailSections[0].paragraphs[0]).toBe("Polévky Begina jsou praktické řešení pro:");
    const kulajda = list[1];
    expect(kulajda.variants).toEqual([expect.objectContaining({ sku: "kulajda", label: "3 l", priceKc: 379 })]);
    expect(kulajda.image).toBe("/eshop/polevky/kulajda-miska.jpg");
    expect(kulajda.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/kulajda-miska.jpg", "/eshop/polevky/kulajda-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, kulajda.image!))).toBe(true);
    expect(kulajda.foodInfo.ingredients).toMatch(/žampiony 7 %/);
    expect(kulajda.foodInfo.ingredients).toBe("čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 3,4 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)");
    expect(kulajda.foodInfo.nutritionPer100g).toBe("na 100 ml: energie 219 kJ / 53 kcal, tuky 3,5 g (z toho nasycené 2,4 g), sacharidy 3,9 g (z toho cukry 0,8 g), bílkoviny 1 g, sůl 0,76 g");
    expect(kulajda.foodInfo.nutritionTable?.rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Energetická hodnota: 219\u00a0kJ / 53\u00a0kcal", "Tuky: 3,5\u00a0g", "z toho nasycené mastné kyseliny: 2,4\u00a0g", "Sacharidy: 3,9\u00a0g", "z toho cukry: 0,8\u00a0g", "Bílkoviny: 1,0\u00a0g", "Sůl: 0,76\u00a0g",
    ]);
    const rajce = list[2];
    expect(rajce.variants).toEqual([expect.objectContaining({ sku: "rajcatova-polevka", label: "3 l", priceKc: 379 })]);
    expect(rajce.image).toBe("/eshop/polevky/rajcatova-polevka-miska.jpg");
    expect(rajce.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/rajcatova-polevka-miska.jpg", "/eshop/polevky/rajcatova-polevka-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, rajce.image!))).toBe(true);
    expect(rajce.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, pasírovaná rajčata 27 %/);
    expect(rajce.foodInfo.ingredients).toMatch(/pasírovaná rajčata 27 % \(rajčata 99,9 %, regulátor kyselosti: kyselina citronová\), rajčatový protlak 7 % \(rajčatový protlak, jedlá sůl 1 %\), brambory 7 %, kokosové mléko 6 %/);
    expect(rajce.foodInfo.nutritionPer100g).toBe("na 100 ml: energie 229 kJ / 54 kcal, tuky 2,9 g (z toho nasycené 1,3 g), sacharidy 5,5 g (z toho cukry 4,4 g), bílkoviny 1,2 g, sůl 0,86 g");
    expect(rajce.foodInfo.nutritionTable?.rows).toHaveLength(7);
    // tabulka u všech produktů s úplnými údaji, vláknina zachována
    expect(list[0].foodInfo.nutritionTable?.rows.map((r) => r.label)).toContain("Vláknina");
    const repa = list[3];
    expect(repa.foodInfo.ingredients).toMatch(/červená řepa 9 %/);
    expect(repa.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 189 kJ \/ 45 kcal.*vláknina 0,9 g$/);
    expect(repa.image).toBe("/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg");
    expect(repa.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg", "/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, repa.image!))).toBe(true);
    // Gulášová: nová polévka
    const gulas = list[4];
    expect(gulas.variants).toEqual([expect.objectContaining({ sku: "gulasova-polevka-z-hlivy-ustricne", priceKc: 379, servings: 12 })]);
    expect(gulas.image).toBe("/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg");
    expect(gulas.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg", "/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, gulas.image!))).toBe(true);
    expect(gulas.foodInfo.ingredients).toMatch(/hlíva ústřičná \(Pleurotus ostreatus\) 8 %/);
    expect(gulas.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 149 kJ \/ 36 kcal.*vláknina 1,1 g$/);
    const spenat = list[5];
    expect(spenat.image).toBe("/eshop/polevky/spenatova-polevka-miska.jpg");
    expect(spenat.gallery?.map((ph) => ph.url)).toEqual(["/eshop/polevky/spenatova-polevka-miska.jpg", "/eshop/polevky/spenatova-polevka-sacek.jpg"]);
    expect(existsSync(path.join(PUBLIC, spenat.image!))).toBe(true);
    expect(spenat.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % \(kokosový extrakt 85 %, pitná voda, emulgátor: E 435\), brambory 14 %, cibule 4,3 %, olivový olej/);
    expect(spenat.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 199 kJ / 48 kcal, tuky 3,4 g (z toho nasycené 2,4 g), sacharidy 2,7 g (z toho cukry 0,7 g), bílkoviny 1,1 g, sůl 0,76 g"
    );
    expect(parseDescription(gulas.description).sections[0].blocks[0]).toEqual(expect.objectContaining({ items: expect.arrayContaining(["pro vegany i vegetariány"]) }));
  });

  it("vrácení: Dýňová, Kulajda a Rajčatová přesně jako po migraci 0014; nové spuštění 41 vše vrátí", async () => {
    await pg.exec(file("49_polevky_rollback.sql"));
    expect(await soups()).toEqual(expectedCatalogAfterSeed().products.filter((p) => p.category === "polevky"));
    expect(await check(pg, "40_polevky_before.sql")).toBe("3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0");
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("6 | 1 | ano | 3 l | 379 | 12 | 12 | 1 | 379 Kč, 12 porcí | 379 Kč, 12 porcí");
  });
});
