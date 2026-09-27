import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { expectedCatalogAfterSeed } from "../seedFromCatalog";
import { generateSeedSql } from "../../../scripts/eshop-seed/generate-seed-sql";
import { applyMigration, createMigratedDb, migrationSql } from "./helpers/migratedDb";

const SEED = "0012_eshop_1_0_products_seed";
// Každá testovací DB = PGlite + všechny migrace (~2–3 s).
const DB_TEST = { timeout: 30_000 };

async function counts(pg: PGlite) {
  const { rows } = await pg.query<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM product_categories) AS categories,
    (SELECT count(*)::int FROM products) AS products,
    (SELECT count(*)::int FROM product_variants) AS variants,
    (SELECT count(*)::int FROM product_images) AS images`);
  return rows[0];
}

// Sloupce a omezení všech tabulek MIMO produktové — musí být po 0011/0012
// přesně stejné jako po 0010 (Produkty 1.0 nesmí sáhnout na objednávky,
// CRM, autentizaci ani Řízení firmy).
async function existingSchemaSnapshot(pg: PGlite) {
  const { rows } = await pg.query(`
    SELECT 'col' AS kind, table_name, column_name AS name, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS detail
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name NOT LIKE 'product%'
    UNION ALL
    SELECT 'con', tc.table_name, tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc WHERE tc.table_schema = 'public' AND tc.table_name NOT LIKE 'product%'
    ORDER BY 1, 2, 3`);
  return rows;
}

describe("Produkty 1.0 — migrace 0011 + 0012 na PGlite", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
  }, DB_TEST.timeout);

  it("naplní 5 kategorií, 7 produktů, 11 balení a 4 fotky", async () => {
    expect(await counts(pg)).toEqual({ categories: 5, products: 7, variants: 11, images: 4 });
  });

  it("DB vrací přesně katalog z catalog.ts (jediný zdroj pravdy po naplnění)", async () => {
    expect(await loadCatalog(db)).toEqual(expectedCatalogAfterSeed());
  });

  it("opakované naplnění nic nezduplikuje", async () => {
    await applyMigration(pg, SEED);
    expect(await counts(pg)).toEqual({ categories: 5, products: 7, variants: 11, images: 4 });
    expect(await loadCatalog(db)).toEqual(expectedCatalogAfterSeed());
  });

  it("migrace 0012 odpovídá aktuálnímu catalog.ts (jinak spustit generátor)", () => {
    expect(migrationSql(SEED)).toBe(generateSeedSql());
  });

  it("databáze odmítne alkohol bez 18+, neznámý alergen a duplicitní SKU", async () => {
    await expect(pg.exec(`UPDATE products SET is_age_restricted = false WHERE slug = 'svarak-deluxe'`)).rejects.toThrow(
      /products_alcohol_requires_age_restriction/
    );
    await expect(pg.exec(`UPDATE products SET allergens = ARRAY['lepek'] WHERE slug = 'kulajda'`)).rejects.toThrow(
      /products_allergens_known/
    );
    await expect(
      pg.exec(`INSERT INTO product_variants (product_id, sku, price_b2c_kc)
               SELECT id, 'kulajda', 1 FROM products WHERE slug = 'kulajda'`)
    ).rejects.toThrow(/unique/);
  });
});

describe("Produkty 1.0 — zbytek schématu beze změny", DB_TEST, () => {
  it("objednávky, CRM, uživatelé a Řízení firmy mají po 0011/0012 stejné sloupce i omezení", async () => {
    // Jen 0011 + 0012; kroky 3–5 (0013–0015) testuje ordersSchema.test.ts.
    const before = await createMigratedDb("0010_phase_16_1_leads_company_name_nullable");
    const after = await createMigratedDb(SEED);
    expect(await existingSchemaSnapshot(after.pg)).toEqual(await existingSchemaSnapshot(before.pg));
  });
});

describe("loadCatalog — co e-shop ukáže", DB_TEST, () => {
  it("skryje neaktivní balení, produkt bez aktivního balení i neaktivní kategorii", async () => {
    const { pg, db } = await createMigratedDb();
    await pg.exec(`UPDATE product_variants SET is_active = false WHERE sku = 'svarak-deluxe-500ml'`);
    await pg.exec(`UPDATE product_variants SET is_active = false WHERE sku = 'kulajda'`);
    await pg.exec(`UPDATE product_categories SET is_active = false WHERE slug = 'caje'`);
    const catalog = await loadCatalog(db);
    expect(catalog.products.find((p) => p.slug === "svarak-deluxe")?.variants.map((v) => v.sku)).toEqual([
      "svarak-deluxe-3l",
    ]);
    expect(catalog.products.some((p) => p.slug === "kulajda")).toBe(false);
    expect(catalog.categories.some((c) => c.slug === "caje")).toBe(false);
  });

  it("převede kódy alergenů na české názvy a výživové hodnoty na text", async () => {
    const { pg, db } = await createMigratedDb();
    await pg.exec(`UPDATE products SET allergens = ARRAY['sulphites'],
      nutrition = '{"energy_kj":250,"energy_kcal":60,"fat":0,"saturates":0,"carbohydrate":12.5,"sugars":11,"protein":0.2,"salt":0.01}',
      nutrition_basis = '100ml' WHERE slug = 'svarak-deluxe'`);
    await pg.exec(`UPDATE products SET allergens = '{}' WHERE slug = 'kulajda'`);
    const catalog = await loadCatalog(db);
    const svarak = catalog.products.find((p) => p.slug === "svarak-deluxe")!;
    expect(svarak.foodInfo.allergens).toEqual(["oxid siřičitý a siřičitany"]);
    expect(svarak.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 250 kJ \/ 60 kcal/);
    expect(catalog.products.find((p) => p.slug === "kulajda")!.foodInfo.allergens).toEqual([]);
  });

  it("18+ kategorie se odvozuje z produktů", async () => {
    const { db } = await createMigratedDb();
    const catalog = await loadCatalog(db);
    expect(catalog.categories.filter((c) => c.ageRestricted).map((c) => c.slug)).toEqual(["koktejly"]);
  });
});

describe("jeden katalog — běžící e-shop nečte catalog.ts", () => {
  const root = path.join(__dirname, "../../..");
  const runtimeDirs = ["app/eshop", "components/eshop", "lib/eshop"];
  const allowed = new Set(["lib/eshop/catalog.ts", "lib/eshop/seedFromCatalog.ts"]);

  function files(dir: string): string[] {
    return readdirSync(path.join(root, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (name === "__tests__") return [];
      return statSync(path.join(root, rel)).isDirectory() ? files(rel) : [rel];
    });
  }

  it("catalog.ts importuje jen generátor prvního naplnění", () => {
    const offenders = runtimeDirs
      .flatMap(files)
      .filter((file) => !allowed.has(file))
      .filter((file) => /from ["'](\.\/catalog|@\/lib\/eshop\/catalog)["']/.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
