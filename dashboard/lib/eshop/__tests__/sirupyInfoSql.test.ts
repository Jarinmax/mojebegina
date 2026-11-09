// Skript 80 (sirupy: balení 3 l / 700 ml, skladování, trvanlivost) nad PGlite
// se stavem jako v Production 9. 11. 2026.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { SYRUP_SHELF_LIFE, SYRUP_STORAGE } from "../syrupFoodInfo";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/80_sirupy_baleni_informace_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = (f: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", f), "utf8");
const OLD_STORAGE =
  "Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v dobře uzavřeném obalu v chladu a temnu a spotřebujte do 3 měsíců. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.";

describe("80 sirupy nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql"]) await pg.exec(catalog(f));
    // stav Production před úpravou
    await pg.query(`UPDATE products p SET storage_instructions = $1, shelf_life_note = NULL,
      description = description || ARRAY['**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']
      FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'sirupy'`, [OLD_STORAGE]);
    await pg.query(`UPDATE product_variants SET label = 'Begina 3 l', weight_g = 3000 WHERE sku LIKE '%sirup%-3l'`);
    await pg.query(`UPDATE product_variants SET label = '750 g', volume_ml = NULL, servings = 37, short_note = 'Až 37 nápojů', weight_g = 750 WHERE sku LIKE '%sirup%-750ml'`);
  }, 120_000);

  it("generátor katalogu už má nové hodnoty", () => {
    const sql = catalog("31_sirupy.sql");
    expect(sql).not.toMatch(/Begina 3 l|750 g|Zlaté pravidlo|20 ml sirupu|25 °C/);
    expect(sql).toContain(SYRUP_STORAGE);
    expect(sql).toContain(SYRUP_SHELF_LIFE);
  });

  it("7 sirupů: 3 l a 700 ml, texty, hmotnosti a ceny beze změny; jiné kategorie beze změny; druhé spuštění zastaví", async () => {
    const teaBefore = (await pg.query(`SELECT p.*, v.label, v.weight_g FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = 'lipovy-caj'`)).rows;
    const pricesBefore = (await pg.query(`SELECT sku, price_b2c_kc, weight_g FROM product_variants WHERE sku LIKE '%sirup%' ORDER BY sku`)).rows;
    await pg.exec(script);
    const vars = (await pg.query<{ sku: string; label: string; short_note: string; volume_ml: number }>(`SELECT sku, label, short_note, volume_ml FROM product_variants WHERE sku LIKE '%sirup%' ORDER BY sku`)).rows;
    expect(vars).toHaveLength(14);
    for (const v of vars) {
      if (v.sku.endsWith("-3l")) expect(v).toMatchObject({ label: "3 l", volume_ml: 3000 });
      else expect(v).toMatchObject({ label: "700 ml", short_note: "Až 35 nápojů", volume_ml: 700 });
    }
    expect((await pg.query(`SELECT sku, price_b2c_kc, weight_g FROM product_variants WHERE sku LIKE '%sirup%' ORDER BY sku`)).rows).toEqual(pricesBefore);
    const prods = (await pg.query<{ s: string; t: string; d: string[] }>(`SELECT storage_instructions s, shelf_life_note t, description d FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'sirupy'`)).rows;
    expect(prods).toHaveLength(7);
    for (const p of prods) {
      expect(p.s).toBe(SYRUP_STORAGE);
      expect(p.t).toBe(SYRUP_SHELF_LIFE);
      expect(p.d.join(" ")).not.toMatch(/Zlaté pravidlo|20 ml sirupu/);
      expect(p.d.join(" ")).toMatch(/## Jak (sirup|jej) používat/);
    }
    expect((await pg.query(`SELECT p.*, v.label, v.weight_g FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = 'lipovy-caj'`)).rows).toEqual(teaBefore);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 7 \+ 7 variant/);
    await pg.exec("ROLLBACK");
  });
});
