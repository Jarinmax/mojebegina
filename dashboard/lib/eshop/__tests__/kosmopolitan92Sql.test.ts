// Skript 92 (odblokování Kosmopolitanu) nad PGlite ve stavu po skriptu 84.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { loadCatalog } from "../catalogDb";
import { isOrderable } from "../productRules";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/92_kosmopolitan_odblokovani_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const OLD =
  "čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma";

describe("92 Kosmopolitan odblokování", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    await pg.query(`UPDATE products SET allergens = '{}' WHERE allergens IS NULL`);
    await pg.query(`UPDATE products SET ingredients = $1, allergens = NULL WHERE slug = 'kosmopolitan'`, [OLD]);
  }, 120_000);

  it("odblokuje jen Kosmopolitan a opraví název aromatu", async () => {
    const before = (await loadCatalog(db)).products;
    const k0 = before.find((p) => p.slug === "kosmopolitan")!;
    expect(isOrderable(k0)).toBe(false);
    const others = (await pg.query(`SELECT slug, ingredients, allergens, nutrition, is_active FROM products WHERE slug <> 'kosmopolitan' ORDER BY slug`)).rows;
    await pg.exec(script);
    const k = (await loadCatalog(db)).products.find((p) => p.slug === "kosmopolitan")!;
    expect(isOrderable(k)).toBe(true);
    expect(k.foodInfo?.allergens).toEqual([]);
    expect(k.foodInfo?.ingredients).toBe(OLD.replace("přírodní aroma", "přírodní grapefruitové aroma"));
    expect((await pg.query(`SELECT slug, ingredients, allergens, nutrition, is_active FROM products WHERE slug <> 'kosmopolitan' ORDER BY slug`)).rows).toEqual(others);
  });

  it("druhé spuštění nic nezmění", async () => {
    await expect(pg.exec(script)).rejects.toThrow(/není ve stavu po skriptu 84/);
    await pg.exec("ROLLBACK");
  });
});
