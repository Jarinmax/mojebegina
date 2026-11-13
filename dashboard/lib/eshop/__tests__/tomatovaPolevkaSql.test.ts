// Skript 79 (Rajčatová → Tomatová polévka) nad PGlite se stavem jako
// v Production 9. 11. 2026: jen produkt rajcatova-polevka, polévka
// s červenou řepou beze změny, složení/varianty/slug zůstávají.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/79_tomatova_polevka_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = readFileSync(path.join(ROOT, "docs/eshop-catalog/41_polevky.sql"), "utf8");
const snapshot = `SELECT p.slug, p.name, p.description, p.ingredients, p.taste_description, p.short_description, p.is_active,
  (SELECT json_agg(v ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id) AS variants,
  (SELECT json_agg(i.alt) FROM product_images i WHERE i.product_id = p.id) AS alts
  FROM products p WHERE p.slug = $1`;

describe("79 Tomatová polévka nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    await pg.exec(catalog);
    // stav Production před přejmenováním
    // stav Production před přejmenováním (texty z doby skriptu 79; katalog má od 14. 11. 2026 nové texty)
    await pg.query(`UPDATE products SET name = 'Rajčatová polévka', description = ARRAY[
      'Rajčatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.',
      '## Pro koho je vhodná', '- pro milovníky rajčatových polévek']::text[] WHERE slug = 'rajcatova-polevka'`);
    await pg.query(`DELETE FROM product_images WHERE url LIKE '%-sacek.jpg'`); // stav Production před fotkami (skript 85)
    await pg.query(`UPDATE product_images SET alt = 'Rajčatová polévka' WHERE alt = 'Tomatová polévka'`);
  }, 120_000);

  it("generátor katalogu už má nový název a texty, polévka s řepou beze změny", () => {
    expect(catalog).toContain("'rajcatova-polevka', 'Tomatová polévka',");
    expect(catalog).toContain("'rajcatova-polevka-s-cervenou-repou', 'Rajčatová polévka s červenou řepou',");
    expect(catalog).toContain("Jemná rajčatová polévka, které červená řepa dává sladší chuť a sytou barvu.");
  });

  it("přejmenuje jen tento produkt; složení, varianty, slug a polévka s řepou beze změny; druhé spuštění zastaví", async () => {
    const before = (await pg.query<Record<string, unknown>>(snapshot, ["rajcatova-polevka"])).rows[0];
    const repaBefore = (await pg.query(snapshot, ["rajcatova-polevka-s-cervenou-repou"])).rows[0];
    await pg.exec(script);
    const after = (await pg.query<Record<string, unknown>>(snapshot, ["rajcatova-polevka"])).rows[0];
    expect(after.name).toBe("Tomatová polévka");
    expect((after.description as string[])[0]).toBe("Tomatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.");
    expect(after.description).toContain("- pro milovníky tomatových polévek");
    expect(JSON.stringify(after.description)).not.toMatch(/Rajčatov|rajčatových polévek/);
    expect(after.alts).toEqual(["Tomatová polévka"]);
    for (const k of ["ingredients", "taste_description", "short_description", "is_active", "variants"]) expect(after[k], k).toEqual(before[k]);
    expect(after.ingredients).toMatch(/pasírovaná rajčata 27 % \(rajčata 99,9 %, regulátor kyselosti: kyselina citronová\), rajčatový protlak 7 %/);
    expect((await pg.query(snapshot, ["rajcatova-polevka-s-cervenou-repou"])).rows[0]).toEqual(repaBefore);
    await expect(pg.exec(script)).rejects.toThrow(/nenalezen/);
    await pg.exec("ROLLBACK");
  });
});
