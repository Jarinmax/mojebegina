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
    expect(await check(pg, "52_caje_after.sql")).toBe("2 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 2 | 249 Kč, 12 nápojů");
    await pg.exec(file("51_caje.sql"));
    expect(await check(pg, "52_caje_after.sql")).toBe("2 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 2 | 249 Kč, 12 nápojů");
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
    expect(await check(pg, "50_caje_before.sql")).toBe("1 | 0 | 0 | 19");
    await pg.exec(file("51_caje.sql"));
    expect(await teas()).toHaveLength(2);
  });
});
