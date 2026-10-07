// ESHOP 1.0 — katalogový skript Čaje (docs/eshop-catalog/5x_*) nad PGlite
// se všemi migracemi a předchozími katalogovými skripty (jako na Preview).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createMigratedDb } from "./helpers/migratedDb";
import { cajeRollbackSql, cajeSql } from "../../../scripts/eshop-catalog/build-caje.mjs";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-catalog");
const PUBLIC = path.join(__dirname, "../../../public");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

describe("katalog — Čaje: soubory", () => {
  it("51 a 59 = výstup generátoru (scripts/eshop-catalog/build-caje.mjs)", () => {
    expect(file("51_caje.sql")).toBe(cajeSql());
    expect(file("59_caje_rollback.sql")).toBe(cajeRollbackSql());
  });
});

describe("katalog — Čaje", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const teas = async () => (await loadCatalog(db)).products.filter((p) => p.category === "caje");

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    // stav Preview: sirupy a polévky už spuštěné
    await pg.exec(file("31_sirupy.sql"));
    await pg.exec(file("41_polevky.sql"));
  });

  it("před, skript, po; opakované spuštění nic nezdvojí", async () => {
    expect(await check(pg, "50_caje_before.sql")).toBe("1 | 0 | 0 | 17");
    await pg.exec(file("51_caje.sql"));
    expect(await check(pg, "52_caje_after.sql")).toBe("8 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 8 | 249 Kč, 12 nápojů");
    await pg.exec(file("51_caje.sql"));
    expect(await check(pg, "52_caje_after.sql")).toBe("8 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 8 | 249 Kč, 12 nápojů");
  });

  it("e-shop: Bylinný čaj Šaman z begina.cz", async () => {
    const [saman, zazvor] = await teas();
    expect(zazvor.name).toBe("Zázvorový čaj");
    expect(zazvor.shortDescription).toBe("Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.");
    expect(zazvor.variants).toEqual([expect.objectContaining({ sku: "zazvorovy-caj-3l", priceKc: 249, servings: 12 })]);
    expect(zazvor.image).toBe("/eshop/zazvorovy-caj.jpg");
    expect(existsSync(path.join(PUBLIC, zazvor.image!))).toBe(true);
    expect(zazvor.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 94 kJ \/ 22 kcal/);
    expect(zazvor.warnings).toEqual([]);
    const lipa = (await teas())[2];
    expect([lipa.name, lipa.variants[0].priceKc, lipa.image]).toEqual(["Lipový čaj", 259, "/eshop/lipovy-caj.jpg"]);
    expect(lipa.foodInfo.ingredients).toMatch(/lipový květ \(Tiliae flos\)/);
    const hermanek = (await teas())[3];
    expect([hermanek.name, hermanek.variants[0].priceKc, hermanek.image]).toEqual(["Heřmánkový čaj", 249, "/eshop/hermankovy-caj.jpg"]);
    expect(existsSync(path.join(PUBLIC, hermanek.image!))).toBe(true);
    expect(hermanek.foodInfo.ingredients).toMatch(/květ heřmánku \(Matricaria chamomilla\)/);
    expect(hermanek.warnings).toEqual([]);
    const nepal = (await teas())[4];
    expect([nepal.name, nepal.variants[0].priceKc, nepal.image]).toEqual(["Černý čaj Golden Nepal", 269, "/eshop/cerny-caj-golden-nepal.jpg"]);
    expect(existsSync(path.join(PUBLIC, nepal.image!))).toBe(true);
    expect(nepal.shortDescription).toBe("Až 12 nápojů (22,40 Kč za nápoj). Jeden nápoj = 250 ml.");
    expect(nepal.warnings).toEqual(["Obsahuje kofein – není vhodné pro děti, těhotné a kojící ženy."]);
    const jasmin = (await teas())[5];
    expect([jasmin.name, jasmin.variants[0].priceKc, jasmin.image]).toEqual(["Jasmínový zelený čaj", 269, "/eshop/jasminovy-zeleny-caj.jpg"]);
    expect(existsSync(path.join(PUBLIC, jasmin.image!))).toBe(true);
    expect(jasmin.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 95 kJ \/ 23 kcal/);
    expect(jasmin.warnings).toEqual(nepal.warnings);
    const ibisek = (await teas())[6];
    expect([ibisek.name, ibisek.variants[0].priceKc, ibisek.image]).toEqual(["Ibiškový čaj", 249, "/eshop/ibiskovy-caj.jpg"]);
    expect(existsSync(path.join(PUBLIC, ibisek.image!))).toBe(true);
    expect(ibisek.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 113 kJ \/ 27 kcal, .*sacharidy 6,7 g/);
    expect(ibisek.warnings).toEqual([]);
    const medunka = (await teas())[7];
    expect([medunka.name, medunka.variants[0].priceKc, medunka.image]).toEqual(["Meduňkový čaj s levandulí", 249, "/eshop/medunkovy-caj-s-levanduli.jpg"]);
    expect(existsSync(path.join(PUBLIC, medunka.image!))).toBe(true);
    expect(medunka.foodInfo.ingredients).toMatch(/květ levandule \(Lavandula angustifolia\)/);
    expect(medunka.warnings).toEqual([]);
    expect(saman.name).toBe("Bylinný čaj Šaman");
    expect(saman.shortDescription).toBe("Až 12 nápojů (24,10 Kč za nápoj). Jeden nápoj = 250 ml.");
    expect(saman.variants).toEqual([
      expect.objectContaining({ sku: "bylinny-caj-saman-3l", priceKc: 289, servings: 12, detail: "Ideální pro sdílení nebo více příležitostí." }),
    ]);
    expect(saman.image).toBe("/eshop/bylinny-caj-saman.jpg");
    expect(existsSync(path.join(PUBLIC, saman.image!))).toBe(true);
    expect(saman.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 98 kJ / 23 kcal, tuky 0 g (z toho nasycené 0 g), sacharidy 5,7 g (z toho cukry 5,7 g), bílkoviny 0 g, sůl 0 g"
    );
    expect(saman.warnings).toEqual(["Není vhodné pro děti do 3 let, těhotné a kojící ženy."]);
    // všechny čaje: bez alergenů, trvanlivost 2 měsíce (údaje vedení 5. 10. 2026)
    for (const tea of await teas()) {
      expect(tea.foodInfo.allergens, tea.slug).toEqual([]);
      expect(tea.foodInfo.shelfLife, tea.slug).toBe("Do 2 měsíců při skladování v lednici do 4 °C.");
    }
    const category = (await loadCatalog(db)).categories.find((c) => c.slug === "caje")!;
    expect(category.detailSections[0].paragraphs[0]).toBe("Čaje Begina jsou praktické řešení pro:");
    expect(category.intro).toHaveLength(2);
    expect(category.intro[0]).toMatch(/^Čaje Begina jsou hotové nápoje/);
  });

  it("vrácení čaje skryje, nic nesmaže; nové spuštění 51 je vrátí", async () => {
    await pg.exec(file("59_caje_rollback.sql"));
    expect(await teas()).toEqual([]);
    expect(await check(pg, "50_caje_before.sql")).toBe("1 | 0 | 0 | 25");
    await pg.exec(file("51_caje.sql"));
    expect(await teas()).toHaveLength(8);
  });
});
