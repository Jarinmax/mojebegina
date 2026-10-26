// Katalog Ovocné nápoje (docs/eshop-catalog/7x_*) nad PGlite se všemi
// migracemi a předchozími katalogovými skripty (stav jako v Production).
// Hlídá: produkty vzniknou SKRYTÉ, nejdou objednat, zveřejnění bez
// ověřených alergenů odmítne, opakované spuštění nic nezveřejní ani neskryje.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { createMigratedDb } from "./helpers/migratedDb";
import {
  ALLERGENS,
  DRINKS,
  ovocneNapojeRollbackSql,
  ovocneNapojeSql,
  ovocneNapojeZverejneniSql,
} from "../../../scripts/eshop-catalog/build-ovocne-napoje.mjs";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-catalog");
const PUBLIC = path.join(__dirname, "../../../public");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");
const SLUGS = ["cervankove-nebe", "dum-u-jezera", "malinovy-svarak-nealko"];

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

describe("katalog — Ovocné nápoje: soubory", () => {
  it("71, 73, 79 = výstup generátoru; alergeny zatím neověřené (nic se nevymýšlí)", () => {
    expect(ALLERGENS).toEqual({});
    expect(file("71_ovocne_napoje.sql")).toBe(ovocneNapojeSql());
    expect(file("73_ovocne_napoje_zverejneni.sql")).toBe(ovocneNapojeZverejneniSql());
    expect(file("79_ovocne_napoje_rollback.sql")).toBe(ovocneNapojeRollbackSql());
    expect(ovocneNapojeSql()).not.toMatch(/"allergens"|"shelf_life/);
  });

  it("fotky jsou v kódu (800×800 z begina.cz)", () => {
    for (const slug of SLUGS) expect(existsSync(path.join(PUBLIC, "eshop", `${slug}.jpg`)), slug).toBe(true);
    expect(DRINKS.map((d) => d.slug)).toEqual(SLUGS);
  });
});

describe("katalog — Ovocné nápoje", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const drinks = async () => (await loadCatalog(db)).products.filter((p) => p.category === "ovocne-napoje");
  const order = async (sku: string) =>
    priceCart([{ sku, quantity: 1 }], "osobni-odber", createCatalogIndex(await loadCatalog(db)));

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    // stav Production: sirupy, polévky, čaje a kategorie Zmrzliny
    for (const name of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "61_zmrzliny.sql"]) await pg.exec(file(name));
  });

  it("před, 71, po: produkty vzniknou SKRYTÉ — nejsou na webu a nejdou objednat; opakování nic nezdvojí", async () => {
    expect(await check(pg, "70_ovocne_napoje_before.sql")).toBe("1 | 0 | 0 | 25");
    await pg.exec(file("71_ovocne_napoje.sql"));
    const after = "3 | 0 | 3 | 3 l Rodinná zásoba (bag-in-box), 349 Kč | 399 Kč, 15 nápojů | 3";
    expect(await check(pg, "72_ovocne_napoje_after.sql")).toBe(after);
    await pg.exec(file("71_ovocne_napoje.sql"));
    expect(await check(pg, "72_ovocne_napoje_after.sql")).toBe(after);
    expect(await drinks()).toEqual([]);
    expect(await order("cervankove-nebe-3l")).toMatchObject({ ok: false });
    // kategorie beze změny (žádný text se na webu neobjeví)
    const [cat] = (await pg.query<{ intro: string[] }>(`SELECT "intro" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'`)).rows;
    expect(cat.intro).toEqual([]);
  });

  it("73 bez ověřených alergenů ODMÍTNE a nic nezmění", async () => {
    await expect(pg.exec(file("73_ovocne_napoje_zverejneni.sql"))).rejects.toThrow(/STOP: neověřené alergeny/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, "72_ovocne_napoje_after.sql")).toMatch(/^3 \| 0 \| 3 \|/);
    expect(await drinks()).toEqual([]);
  });

  it("po ověření alergenů (ALLERGENS) 73 zveřejní: na webu s texty z begina.cz, objednatelné; 71 znovu nic neskryje; 79 skryje", async () => {
    const original = { ...ALLERGENS };
    Object.assign(ALLERGENS, { "cervankove-nebe": [], "dum-u-jezera": [], "malinovy-svarak-nealko": [] });
    try {
      await pg.exec(ovocneNapojeZverejneniSql());
    } finally {
      for (const key of Object.keys(ALLERGENS)) delete (ALLERGENS as Record<string, unknown>)[key];
      Object.assign(ALLERGENS, original);
    }
    const [nebe, jezero, svarak] = await drinks(); // pořadí podle sort_order
    expect([nebe.slug, jezero.slug, svarak.slug]).toEqual(SLUGS);
    expect(nebe.name).toBe("Červánkové nebe");
    expect(nebe.image).toBe("/eshop/cervankove-nebe.jpg");
    expect(nebe.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, jablečno-malinová šťáva/);
    expect(nebe.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 86 kJ \/ 20 kcal/);
    expect(nebe.foodInfo.shelfLife).toBeNull(); // begina.cz trvanlivost neuvádí
    expect(svarak.variants).toEqual([expect.objectContaining({ sku: "malinovy-svarak-nealko-3l", priceKc: 399, servings: 15 })]);
    expect(svarak.isAgeRestricted).toBe(false);
    expect(await order("dum-u-jezera-3l")).toMatchObject({ ok: true, value: { totalKc: 349 } });

    await pg.exec(file("71_ovocne_napoje.sql"));
    expect(await drinks()).toHaveLength(3);

    await pg.exec(file("79_ovocne_napoje_rollback.sql"));
    expect(await drinks()).toEqual([]);
  });
});
