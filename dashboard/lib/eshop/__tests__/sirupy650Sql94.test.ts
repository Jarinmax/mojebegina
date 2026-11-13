// Skript 94 (sirupy: malé balení 700 ml → 650 ml) nad PGlite ve stavu
// Production 11. 11. 2026 (malé balení „700 ml“, „Až 35 nápojů“).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { packagingSentence } from "../packaging";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/94_sirupy_650ml_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = (f: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", f), "utf8");
const DESC650 = "650 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.";

describe("94 sirupy 650 ml", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(f));
    await pg.query(`UPDATE product_variants SET label = '700 ml', short_note = 'Až 35 nápojů', volume_ml = 700, servings = 35,
      package_description = '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.' WHERE sku LIKE '%sirup%-750ml'`);
  }, 120_000);

  it("generátor i popis balení mají 650 ml", () => {
    const sql = catalog("31_sirupy.sql");
    expect(sql).not.toMatch(/700 ml|Až 35 nápojů/);
    expect(sql).toContain(DESC650);
    expect(packagingSentence("sirupy", "650 ml")).toBe(DESC650);
    expect(packagingSentence("sirupy", "700 ml")).not.toBeNull(); // přechod do spuštění skriptu
  });

  it("7 sirupů 650 ml; SKU, cena, hmotnost a ostatní balení beze změny; druhé spuštění zastaví", async () => {
    const q = `SELECT sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, weight_g, is_active FROM product_variants ORDER BY sku`;
    const before = (await pg.query<Record<string, unknown>>(q)).rows;
    await pg.exec(script);
    const after = (await pg.query<Record<string, unknown>>(q)).rows;
    expect(after.map((r) => r.sku)).toEqual(before.map((r) => r.sku));
    let changed = 0;
    after.forEach((r, i) => {
      const b = before[i];
      expect([r.price_b2c_kc, r.weight_g, r.is_active]).toEqual([b.price_b2c_kc, b.weight_g, b.is_active]);
      if (String(r.sku).endsWith("-750ml") && String(r.sku).includes("sirup")) {
        changed++;
        expect(r).toMatchObject({ label: "650 ml", short_note: "Až 32 nápojů", package_description: DESC650, volume_ml: 650, servings: 32 });
      } else expect(r).toEqual(b);
    });
    expect(changed).toBe(7);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 7 sirupů/);
    await pg.exec("ROLLBACK");
  });
});
